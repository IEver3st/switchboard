using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Switchboard.CaptureHost;

internal sealed class WindowsCaptureSources
{
    // ReplayEngine calls detection once per second only while automatic capture is waiting.
    // Background inventory is capped further because process metadata can be expensive to read.
    private static readonly TimeSpan BackgroundGameScanInterval = TimeSpan.FromSeconds(5);

    private readonly Func<bool> isWindows;
    private readonly Func<nint> getForegroundWindow;
    private readonly Func<nint, bool, WindowInfo?> getWindowInfo;
    private readonly Func<bool, IReadOnlyList<WindowInfo>> enumerateWindows;

    private static readonly HashSet<string> DeniedExecutables = new(StringComparer.OrdinalIgnoreCase)
    {
        "applicationframehost", "chrome", "msedge", "firefox", "brave", "opera",
        "1password", "keepass", "bitwarden", "discord", "slack", "teams", "telegram",
        "explorer", "searchhost", "startmenuexperiencehost", "textinputhost", "dwm",
        "switchboard", "electron", "code", "devenv", "powershell", "windowsterminal",
    };

    private static readonly string[] KnownGamePathMarkers =
    {
        "\\steamapps\\common\\", "\\epic games\\", "\\xboxgames\\", "\\gog games\\",
        "\\riot games\\", "\\ea games\\", "\\ubisoft\\", "\\rockstar games\\",
    };

    private static readonly string[] KnownGameWindowClasses =
    {
        "UnityWndClass", "UnrealWindow", "SDL_app", "GLFW30", "CryENGINE", "grcWindow",
    };

    private nint currentGameWindow;
    private nint candidateWindow;
    private DateTimeOffset candidateSince;
    private DateTimeOffset? lastBackgroundScanAt;

    public WindowsCaptureSources()
        : this(OperatingSystem.IsWindows, GetForegroundWindow, GetWindowInfo, EnumerateWindows)
    {
    }

    internal WindowsCaptureSources(
        Func<bool> isWindows,
        Func<nint> getForegroundWindow,
        Func<nint, bool, WindowInfo?> getWindowInfo,
        Func<bool, IReadOnlyList<WindowInfo>> enumerateWindows)
    {
        this.isWindows = isWindows;
        this.getForegroundWindow = getForegroundWindow;
        this.getWindowInfo = getWindowInfo;
        this.enumerateWindows = enumerateWindows;
    }

    public IReadOnlyList<CaptureSource> ListSources()
    {
        if (!isWindows()) return [];
        var sources = new List<CaptureSource>
        {
            new("automatic-game", "automatic-game", "Automatic game", null, null, null, true),
        };

        var displays = EnumerateDisplays();
        for (var index = 0; index < displays.Count; index++)
        {
            var display = displays[index];
            sources.Add(new CaptureSource(
                $"display:{index}", "display", $"Display {index + 1}", null, null, index.ToString(), true,
                DisplayHandle: display.Handle.ToInt64()));
        }

        foreach (var window in enumerateWindows(false))
        {
            sources.Add(new CaptureSource(
                $"window:{window.Handle}", "window", window.Title, window.ProcessId,
                window.Handle.ToString(), null, true));
        }
        return sources;
    }

    public CaptureSource? ResolveExplicit(CaptureSettings settings)
    {
        if (settings.Source == "display")
        {
            var displays = EnumerateDisplays();
            if (settings.DisplayIndex >= displays.Count)
            {
                return new CaptureSource(
                    $"display:{settings.DisplayIndex}", "display", $"Display {settings.DisplayIndex + 1}",
                    null, null, settings.DisplayIndex.ToString(), false);
            }
            var display = displays[settings.DisplayIndex];
            return new CaptureSource(
                $"display:{settings.DisplayIndex}", "display", $"Display {settings.DisplayIndex + 1}",
                null, null, settings.DisplayIndex.ToString(), true, DisplayHandle: display.Handle.ToInt64());
        }

        if (settings.Source != "window" || string.IsNullOrWhiteSpace(settings.SourceId)) return null;
        var handleText = settings.SourceId.StartsWith("window:", StringComparison.OrdinalIgnoreCase)
            ? settings.SourceId["window:".Length..]
            : settings.SourceId;
        if (!long.TryParse(handleText, out var rawHandle)) return null;
        var handle = (nint)rawHandle;
        var window = getWindowInfo(handle, false);
        return window is null
            ? new CaptureSource(settings.SourceId, "window", "Window unavailable", null, handleText, null, false)
            : new CaptureSource(settings.SourceId, "window", window.Title, window.ProcessId, handleText, null, true);
    }

    public CaptureSource? DetectAutomaticGame(DateTimeOffset now)
    {
        if (!isWindows()) return null;

        if (currentGameWindow != 0)
        {
            var current = getWindowInfo(currentGameWindow, true);
            if (current is not null)
            {
                return ToAutomaticSource(current);
            }
            currentGameWindow = 0;
        }

        if (candidateWindow != 0)
        {
            var stableCandidate = getWindowInfo(candidateWindow, true);
            if (stableCandidate is not null && IsLikelyGame(stableCandidate))
                return AdvanceCandidate(stableCandidate, now);
            candidateWindow = 0;
        }

        var foreground = getForegroundWindow();
        var candidate = getWindowInfo(foreground, true);
        if (candidate is not null && IsLikelyGame(candidate)) return AdvanceCandidate(candidate, now);

        if (lastBackgroundScanAt is { } lastScan && now - lastScan < BackgroundGameScanInterval) return null;
        lastBackgroundScanAt = now;
        var backgroundGames = enumerateWindows(true)
            .Where(window => window.Handle != foreground && HasStrongGameIdentity(window))
            .GroupBy(window => window.ProcessId)
            .Select(group => group
                .OrderByDescending(window => window.CoversMostOfMonitor)
                .ThenBy(window => window.Handle.ToInt64())
                .First())
            .Take(2)
            .ToArray();
        if (backgroundGames.Length != 1) return null;
        return AdvanceCandidate(backgroundGames[0], now);
    }

    private CaptureSource? AdvanceCandidate(WindowInfo candidate, DateTimeOffset now)
    {
        if (candidateWindow != candidate.Handle)
        {
            candidateWindow = candidate.Handle;
            candidateSince = now;
            return null;
        }

        if (now - candidateSince < TimeSpan.FromSeconds(2)) return null;
        currentGameWindow = candidate.Handle;
        candidateWindow = 0;
        return ToAutomaticSource(candidate);
    }

    public bool IsAvailable(CaptureSource source)
    {
        if (source.DisplayHandle is { } displayHandle)
            return EnumerateDisplays().Any(display => display.Handle.ToInt64() == displayHandle);
        if (source.WindowHandle is null) return true;
        return long.TryParse(source.WindowHandle, out var handle) && getWindowInfo((nint)handle, false) is not null;
    }

    private static CaptureSource ToAutomaticSource(WindowInfo window) => new(
        $"automatic-game:{window.ProcessId}:{window.Handle}",
        "automatic-game",
        window.ProductName,
        window.ProcessId,
        window.Handle.ToString(),
        null,
        true);

    private static IReadOnlyList<DisplayMonitor> EnumerateDisplays()
    {
        var displays = new List<DisplayMonitor>();
        EnumDisplayMonitors(0, 0, (nint handle, nint hdc, ref Rect bounds, nint parameter) =>
        {
            var info = new NativeMonitorInfo { Size = Marshal.SizeOf<NativeMonitorInfo>() };
            if (GetMonitorInfo(handle, ref info))
                displays.Add(new DisplayMonitor(handle, bounds, (info.Flags & 1) != 0));
            return true;
        }, 0);
        return displays
            .OrderByDescending(display => display.Primary)
            .ThenBy(display => display.Bounds.Left)
            .ThenBy(display => display.Bounds.Top)
            .ToArray();
    }

    private static bool IsLikelyGame(WindowInfo window)
    {
        if (DeniedExecutables.Contains(window.ExecutableName)) return false;
        if (HasStrongGameIdentity(window)) return true;
        return window.CoversMostOfMonitor && window.HasGpuStyle;
    }

    private static bool HasStrongGameIdentity(WindowInfo window) =>
        !DeniedExecutables.Contains(window.ExecutableName)
        && (KnownGameWindowClasses.Any(marker => window.ClassName.Contains(marker, StringComparison.OrdinalIgnoreCase))
            || KnownGamePathMarkers.Any(marker => window.ExecutablePath.Contains(marker, StringComparison.OrdinalIgnoreCase)));

    private static IReadOnlyList<WindowInfo> EnumerateWindows(bool includeGameSignals)
    {
        var windows = new List<WindowInfo>();
        EnumWindows((handle, _) =>
        {
            var info = GetWindowInfo(handle, includeGameSignals);
            if (info is not null) windows.Add(info);
            return true;
        }, 0);
        return windows.OrderBy(window => window.Title, StringComparer.CurrentCultureIgnoreCase).ToArray();
    }

    private static WindowInfo? GetWindowInfo(nint handle, bool includeGameSignals)
    {
        if (!IsDesktopApplicationWindow(handle)) return null;
        var titleLength = GetWindowTextLength(handle);
        if (titleLength <= 0) return null;
        var titleBuilder = new StringBuilder(Math.Min(titleLength + 1, 512));
        GetWindowText(handle, titleBuilder, titleBuilder.Capacity);
        var title = titleBuilder.ToString().Trim();
        if (title.Length == 0) return null;

        _ = GetWindowThreadProcessId(handle, out var processId);
        if (processId == 0 || processId == Environment.ProcessId) return null;
        try
        {
            using var process = Process.GetProcessById((int)processId);
            var executablePath = process.MainModule?.FileName ?? string.Empty;
            var executableName = Path.GetFileNameWithoutExtension(executablePath);
            var productName = string.IsNullOrWhiteSpace(executablePath)
                ? executableName
                : FileVersionInfo.GetVersionInfo(executablePath).ProductName;
            if (string.IsNullOrWhiteSpace(productName)) productName = executableName;

            var classBuilder = new StringBuilder(256);
            GetClassName(handle, classBuilder, classBuilder.Capacity);
            GetWindowRect(handle, out var rect);
            var monitor = MonitorFromWindow(handle, 2); // MONITOR_DEFAULTTONEAREST
            var monitorInfo = new NativeMonitorInfo { Size = Marshal.SizeOf<NativeMonitorInfo>() };
            GetMonitorInfo(monitor, ref monitorInfo);
            var windowArea = Math.Max(0, rect.Right - rect.Left) * (long)Math.Max(0, rect.Bottom - rect.Top);
            var monitorArea = Math.Max(1, monitorInfo.Monitor.Right - monitorInfo.Monitor.Left)
                              * (long)Math.Max(1, monitorInfo.Monitor.Bottom - monitorInfo.Monitor.Top);
            var coversMostOfMonitor = windowArea >= monitorArea * 0.82;
            var hasGpuStyle = false;
            try
            {
                var hasStrongGameSignal = KnownGameWindowClasses.Any(marker => classBuilder.ToString().Contains(marker, StringComparison.OrdinalIgnoreCase))
                                          || KnownGamePathMarkers.Any(marker => executablePath.Contains(marker, StringComparison.OrdinalIgnoreCase));
                hasGpuStyle = includeGameSignals
                              && coversMostOfMonitor
                              && !hasStrongGameSignal
                              && !DeniedExecutables.Contains(executableName)
                              && process.Modules.Cast<ProcessModule>().Any(module =>
                {
                    var name = module.ModuleName;
                    return name.Equals("dxgi.dll", StringComparison.OrdinalIgnoreCase)
                           || name.Equals("d3d11.dll", StringComparison.OrdinalIgnoreCase)
                           || name.Equals("d3d12.dll", StringComparison.OrdinalIgnoreCase)
                           || name.Equals("vulkan-1.dll", StringComparison.OrdinalIgnoreCase);
                });
            }
            catch
            {
                // Access to another process's module list may be denied. Path/class signals remain usable.
            }

            return new WindowInfo(
                handle, (int)processId, title, executablePath, executableName, productName!, classBuilder.ToString(),
                coversMostOfMonitor, hasGpuStyle);
        }
        catch
        {
            return null;
        }
    }

    private static bool IsDesktopApplicationWindow(nint handle)
    {
        if (handle == 0 || handle == GetShellWindow() || !IsWindow(handle) || !IsWindowVisible(handle) || IsIconic(handle))
            return false;

        if (DwmGetWindowAttribute(handle, 14, out var cloaked, Marshal.SizeOf<uint>()) == 0 && cloaked != 0)
            return false;

        var extendedStyle = GetWindowLongPtr(handle, -20).ToInt64(); // GWL_EXSTYLE
        const long wsExToolWindow = 0x00000080L;
        const long wsExAppWindow = 0x00040000L;
        const long wsExNoActivate = 0x08000000L;
        if ((extendedStyle & wsExNoActivate) != 0
            || ((extendedStyle & wsExToolWindow) != 0 && (extendedStyle & wsExAppWindow) == 0))
            return false;

        var classBuilder = new StringBuilder(256);
        GetClassName(handle, classBuilder, classBuilder.Capacity);
        if (classBuilder.ToString() is "Progman" or "WorkerW") return false;

        return GetWindowRect(handle, out var rect) && rect.Right > rect.Left && rect.Bottom > rect.Top;
    }

    internal sealed record WindowInfo(
        nint Handle,
        int ProcessId,
        string Title,
        string ExecutablePath,
        string ExecutableName,
        string ProductName,
        string ClassName,
        bool CoversMostOfMonitor,
        bool HasGpuStyle);

    private sealed record DisplayMonitor(nint Handle, Rect Bounds, bool Primary);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeMonitorInfo { public int Size; public Rect Monitor; public Rect Work; public uint Flags; }

    private delegate bool EnumWindowsProc(nint handle, nint parameter);
    private delegate bool EnumDisplayMonitorsProc(nint monitor, nint hdc, ref Rect bounds, nint parameter);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, nint parameter);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint handle);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint handle);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint handle);
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern nint GetWindowLongPtr(nint handle, int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint handle, StringBuilder text, int maximum);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(nint handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint handle, StringBuilder className, int maximum);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint handle, out uint processId);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint handle, out Rect rect);
    [DllImport("user32.dll")] private static extern nint MonitorFromWindow(nint handle, uint flags);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(nint monitor, ref NativeMonitorInfo info);
    [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(nint hdc, nint clip, EnumDisplayMonitorsProc callback, nint parameter);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(nint handle, int attribute, out uint value, int size);
}
