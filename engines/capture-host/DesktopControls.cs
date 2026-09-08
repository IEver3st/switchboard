using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Switchboard.CaptureHost;

/// <summary>Optional policy helper. No recorder, media device, encoder, or window is created.</summary>
internal static class DesktopControls
{
    private const uint WmHotkey = 0x0312, WmTimer = 0x0113, WmQuit = 0x0012;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static TimeSpan previousCpu;
    private static long previousSample = Stopwatch.GetTimestamp();
    private sealed record Configuration(bool QuickControlsEnabled, string QuickShortcut, string[] Executables);

    public static int Run()
    {
        if (!OperatingSystem.IsWindows()) return 1;
        var line = Console.ReadLine();
        if (line is null || line.Length > 16_384) return 1;
        Configuration config;
        try
        {
            config = JsonSerializer.Deserialize<Configuration>(line, JsonOptions) ?? throw new Exception("Missing configuration.");
            if (config.Executables is null || config.Executables.Length > 32 || config.Executables.Any(exe =>
                exe.Length > 120 || !exe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || exe.IndexOfAny(['/', '\\', ':']) >= 0))
                throw new Exception("Invalid application list.");
            if (config.QuickShortcut is not ("Control+Alt+Space" or "Control+Shift+Space" or "Alt+Space"))
                throw new Exception("Invalid quick shortcut.");
        }
        catch (Exception error) { Emit(new { type = "error", message = error.Message }); return 1; }

        PeekMessage(out _, 0, 0, 0, 0); // Create the thread message queue before the EOF watcher can post.
        var thread = GetCurrentThreadId();
        _ = Task.Run(() => { string? request; while ((request = Console.ReadLine()) is not null) {
            if (request == "metrics") PostThreadMessage(thread, 0x8001, 0, 0);
        } PostThreadMessage(thread, WmQuit, 0, 0); });
        var modifiers = config.QuickShortcut == "Control+Alt+Space" ? 0x0003u : config.QuickShortcut == "Control+Shift+Space" ? 0x0006u : 0x0001u;
        var registered = false;
        nuint releaseTimer = 0, applicationsTimer = 0;
        try
        {
            if (config.QuickControlsEnabled)
            {
                registered = RegisterHotKey(0, 1, modifiers | 0x4000, 0x20); // MOD_NOREPEAT
                if (!registered) throw new InvalidOperationException("The quick shortcut is already in use. Choose another shortcut.");
            }
            if (config.Executables.Length > 0) applicationsTimer = SetTimer(0, 0, 2_000, 0);
            if (config.Executables.Length > 0 && applicationsTimer == 0) throw new InvalidOperationException("Application watching could not start.");
            Emit(new { type = "ready" });
            EmitMetrics();
            if (config.Executables.Length > 0) EmitApplications(config.Executables);
            while (GetMessage(out var message, 0, 0, 0) > 0)
            {
                if (message.Message == 0x8001) EmitMetrics();
                else if (message.Message == WmHotkey && releaseTimer == 0)
                {
                    releaseTimer = SetTimer(0, 0, 16, 0);
                    if (releaseTimer == 0) throw new InvalidOperationException("Shortcut release tracking could not start.");
                    Emit(new { type = "quick", open = true });
                }
                else if (message.Message == WmTimer && message.WParam == releaseTimer && releaseTimer != 0)
                {
                    // Query only this shortcut, only while held. No general key stream is collected.
                    var down = IsDown(0x20) && ((modifiers & 1) == 0 || IsDown(0x12))
                        && ((modifiers & 2) == 0 || IsDown(0x11)) && ((modifiers & 4) == 0 || IsDown(0x10));
                    if (!down) { KillTimer(0, releaseTimer); releaseTimer = 0; Emit(new { type = "quick", open = false }); }
                }
                else if (message.Message == WmTimer && message.WParam == applicationsTimer)
                    EmitApplications(config.Executables);
            }
            return 0;
        }
        catch (Exception error) { Emit(new { type = "error", message = error.Message }); return 1; }
        finally
        {
            if (registered) UnregisterHotKey(0, 1);
            if (releaseTimer != 0) KillTimer(0, releaseTimer);
            if (applicationsTimer != 0) KillTimer(0, applicationsTimer);
        }
    }

    private static bool IsDown(int key) => (GetAsyncKeyState(key) & 0x8000) != 0;
    private static void EmitMetrics()
    {
        using var process = Process.GetCurrentProcess();
        var cpu = process.TotalProcessorTime;
        var now = Stopwatch.GetTimestamp();
        var elapsed = (now - previousSample) / (double)Stopwatch.Frequency;
        var percent = elapsed > 0 ? Math.Clamp((cpu - previousCpu).TotalSeconds / elapsed / Environment.ProcessorCount * 100, 0, 100) : 0;
        previousCpu = cpu; previousSample = now;
        Emit(new { type = "metrics", pid = Environment.ProcessId, privateMemoryMb = process.PrivateMemorySize64 / 1048576d,
            workingSetMb = process.WorkingSet64 / 1048576d, cpuPercent = percent });
    }
    private static void EmitApplications(string[] allowed)
    {
        var running = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try { var name = process.ProcessName + ".exe"; if (allowed.Contains(name, StringComparer.OrdinalIgnoreCase)) running.Add(name); }
                catch (InvalidOperationException) { } catch (System.ComponentModel.Win32Exception) { }
            }
        }
        Emit(new { type = "applications", executables = running.Order().ToArray() });
    }
    private static void Emit(object value) => Console.WriteLine(JsonSerializer.Serialize(value, JsonOptions));
    [StructLayout(LayoutKind.Sequential)] private struct NativeMessage { public nint HWnd; public uint Message; public nuint WParam; public nint LParam; public uint Time; public int X; public int Y; public uint Private; }
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(nint hwnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(nint hwnd, int id);
    [DllImport("user32.dll")] private static extern int GetMessage(out NativeMessage message, nint hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out NativeMessage message, nint hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint id, uint message, nuint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern nuint SetTimer(nint hwnd, nuint id, uint interval, nint callback);
    [DllImport("user32.dll")] private static extern bool KillTimer(nint hwnd, nuint id);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
}
