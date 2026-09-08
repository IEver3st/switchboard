using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Switchboard.CaptureHost;

/// <summary>Optional policy helper. No recorder, media device, encoder, or window is created.</summary>
internal static class DesktopControls
{
    private const uint WmTimer = 0x0113, WmQuit = 0x0012;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static TimeSpan previousCpu;
    private static long previousSample = Stopwatch.GetTimestamp();
    private sealed record Configuration(string[] Executables);

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
        }
        catch (Exception error) { Emit(new { type = "error", message = error.Message }); return 1; }

        PeekMessage(out _, 0, 0, 0, 0); // Create the thread message queue before the EOF watcher can post.
        var thread = GetCurrentThreadId();
        _ = Task.Run(() => { string? request; while ((request = Console.ReadLine()) is not null) {
            if (request == "metrics") PostThreadMessage(thread, 0x8001, 0, 0);
        } PostThreadMessage(thread, WmQuit, 0, 0); });
        nuint applicationsTimer = 0;
        try
        {
            if (config.Executables.Length > 0) applicationsTimer = SetTimer(0, 0, 2_000, 0);
            if (config.Executables.Length > 0 && applicationsTimer == 0) throw new InvalidOperationException("Application watching could not start.");
            Emit(new { type = "ready" });
            EmitMetrics();
            if (config.Executables.Length > 0) EmitApplications(config.Executables);
            while (GetMessage(out var message, 0, 0, 0) > 0)
            {
                if (message.Message == 0x8001) EmitMetrics();
                else if (message.Message == WmTimer && message.WParam == applicationsTimer)
                    EmitApplications(config.Executables);
            }
            return 0;
        }
        catch (Exception error) { Emit(new { type = "error", message = error.Message }); return 1; }
        finally
        {
            if (applicationsTimer != 0) KillTimer(0, applicationsTimer);
        }
    }

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
    [DllImport("user32.dll")] private static extern int GetMessage(out NativeMessage message, nint hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out NativeMessage message, nint hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint id, uint message, nuint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern nuint SetTimer(nint hwnd, nuint id, uint interval, nint callback);
    [DllImport("user32.dll")] private static extern bool KillTimer(nint hwnd, nuint id);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
}
