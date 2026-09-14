using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Switchboard.CaptureHost;

// Demand-driven diagnostic mode. No engine, media handle, window or polling loop.
internal static class ResourceDiagnostics
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static int Run()
    {
        if (!OperatingSystem.IsWindows()) return 1;
        string? line;
        while ((line = Console.ReadLine()) is not null)
        {
            if (line.Length > 8192) return 2;
            try
            {
                var requested = JsonSerializer.Deserialize<int[]>(line);
                if (requested is null || requested.Length > 256 || requested.Any(id => id <= 0)) return 2;
                var ids = requested.Append(Environment.ProcessId).Distinct().ToArray();
                var watch = Stopwatch.StartNew();
                var processes = new List<object>();
                var inaccessible = 0;
                foreach (var id in ids)
                {
                    try
                    {
                        using var process = Process.GetProcessById(id);
                        var ioAvailable = GetProcessIoCounters(process.Handle, out var io);
                        processes.Add(new {
                            pid = id, startedAt = process.StartTime.ToUniversalTime().ToString("O"), name = process.ProcessName,
                            cpuSeconds = process.TotalProcessorTime.TotalSeconds,
                            privateMb = process.PrivateMemorySize64 / 1048576d, residentMb = process.WorkingSet64 / 1048576d,
                            peakResidentMb = process.PeakWorkingSet64 / 1048576d,
                            readBytes = ioAvailable ? (double?)io.ReadBytes : null, writeBytes = ioAvailable ? (double?)io.WriteBytes : null,
                            handles = (int?)process.HandleCount,
                        });
                    }
                    catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
                    { inaccessible++; }
                }
                Console.WriteLine(JsonSerializer.Serialize(new { processes, requested = ids.Length, inaccessible,
                    durationMs = watch.Elapsed.TotalMilliseconds, monitorPid = Environment.ProcessId }, JsonOptions));
            }
            catch (JsonException) { return 2; }
        }
        return 0;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessIoCounters(IntPtr process, out IoCounters counters);
}
