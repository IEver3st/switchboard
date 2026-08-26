using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Switchboard.CaptureHost;

internal sealed class WindowsCaptureSources
{
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

    public IReadOnlyList<CaptureSource> ListSources()
    {
        if (!OperatingSystem.IsWindows()) return [];
        var sources = new List<CaptureSource>
        {
            new("automatic-game", "automatic-game", "Automatic game", null, null, null, true),
        };

        var displayCount = GetSystemMetrics(80); // SM_CMONITORS
        for (var index = 0; index < Math.Max(1, displayCount); index++)
        {
            sources.Add(new CaptureSource(
                $"display:{index}", "display", $"Display {index + 1}", null, null, index.ToString(), true));
        }

        foreach (var window in EnumerateWindows())
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
            return new CaptureSource(
                $"display:{settings.DisplayIndex}", "display", $"Display {settings.DisplayIndex + 1}",
                null, null, settings.DisplayIndex.ToString(), true);
        }

        if (settings.Source != "window" || string.IsNullOrWhiteSpace(settings.SourceId)) return null;
        var handleText = settings.SourceId.StartsWith("window:", StringComparison.OrdinalIgnoreCase)
            ? settings.SourceId["window:".Length..]
            : settings.SourceId;
        if (!long.TryParse(handleText, out var rawHandle)) return null;
        var handle = (nint)rawHandle;
            var window = GetWindowInfo(handle, includeGameSignals: false);
        return window is null
            ? new CaptureSource(settings.SourceId, "window", "Window unavailable", null, handleText, null, false)
            : new CaptureSource(settings.SourceId, "window", window.Title, window.ProcessId, handleText, null, true);
    }

    public CaptureSource? DetectAutomaticGame(DateTimeOffset now)
    {
        if (!OperatingSystem.IsWindows()) return null;

        if (currentGameWindow != 0)
        {
            var current = GetWindowInfo(currentGameWindow, includeGameSignals: true);
            if (current is not null)
            {
                return ToAutomaticSource(current);
            }
            currentGameWindow = 0;
        }

        var foreground = GetForegroundWindow();
        var candidate = GetWindowInfo(foreground, includeGameSignals: true);
        if (candidate is null || !IsLikelyGame(candidate))
        {
            candidateWindow = 0;
            return null;
        }

        if (candidateWindow != foreground)
        {
            candidateWindow = foreground;
            candidateSince = now;
            return null;
        }

        if (now - candidateSince < TimeSpan.FromSeconds(2)) return null;
        currentGameWindow = foreground;
        candidateWindow = 0;
        return ToAutomaticSource(candidate);
    }

    public bool IsAvailable(CaptureSource source)
    {
        if (source.WindowHandle is null) return true;
        return long.TryParse(source.WindowHandle, out var handle) && GetWindowInfo((nint)handle, includeGameSignals: false) is not null;
    }

    private static CaptureSource ToAutomaticSource(WindowInfo window) => new(
        $"automatic-game:{window.ProcessId}:{window.Handle}",
        "automatic-game",
        window.ProductName,
        window.ProcessId,
        window.Handle.ToString(),
        null,
        true);

    private static bool IsLikelyGame(WindowInfo window)
    {
        if (DeniedExecutables.Contains(window.ExecutableName)) return false;
        if (KnownGameWindowClasses.Any(marker => window.ClassName.Contains(marker, StringComparison.OrdinalIgnoreCase)))
            return true;
        if (KnownGamePathMarkers.Any(marker => window.ExecutablePath.Contains(marker, StringComparison.OrdinalIgnoreCase)))
            return true;
        return window.CoversMostOfMonitor && window.HasGpuStyle;
    }

    private static IReadOnlyList<WindowInfo> EnumerateWindows()
    {
        var windows = new List<WindowInfo>();
        EnumWindows((handle, _) =>
        {
            var info = GetWindowInfo(handle, includeGameSignals: false);
            if (info is not null) windows.Add(info);
            return true;
        }, 0);
        return windows.OrderBy(window => window.Title, StringComparer.CurrentCultureIgnoreCase).ToArray();
    }

    private static WindowInfo? GetWindowInfo(nint handle, bool includeGameSignals)
    {
        if (handle == 0 || !IsWindow(handle) || !IsWindowVisible(handle) || IsIconic(handle)) return null;
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
            var monitorInfo = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
            GetMonitorInfo(monitor, ref monitorInfo);
            var windowArea = Math.Max(0, rect.Right - rect.Left) * (long)Math.Max(0, rect.Bottom - rect.Top);
            var monitorArea = Math.Max(1, monitorInfo.Monitor.Right - monitorInfo.Monitor.Left)
                              * (long)Math.Max(1, monitorInfo.Monitor.Bottom - monitorInfo.Monitor.Top);
            var hasGpuStyle = false;
            try
            {
                hasGpuStyle = includeGameSignals && process.Modules.Cast<ProcessModule>().Any(module =>
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
                windowArea >= monitorArea * 0.82, hasGpuStyle);
        }
        catch
        {
            return null;
        }
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

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo { public int Size; public Rect Monitor; public Rect Work; public uint Flags; }

    private delegate bool EnumWindowsProc(nint handle, nint parameter);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, nint parameter);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint handle);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint handle);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint handle, StringBuilder text, int maximum);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(nint handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint handle, StringBuilder className, int maximum);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint handle, out uint processId);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint handle, out Rect rect);
    [DllImport("user32.dll")] private static extern nint MonitorFromWindow(nint handle, uint flags);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
}
