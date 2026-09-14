using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Switchboard.CaptureHost;

// Demand-driven diagnostic mode. No engine, media handle, window or polling loop.
internal static class ResourceDiagnostics
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static int Run()
    {
        if (!OperatingSystem.IsWindows()) return 1;
        Console.WriteLine("{\"type\":\"ready\"}");
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
                        // Read only this PID through one limited-query handle. Process's
                        // lazy name/memory properties can enumerate system-wide process
                        // information repeatedly, once for every requested PID.
                        using var process = OpenProcess(0x1000, false, id); // PROCESS_QUERY_LIMITED_INFORMATION
                        var memory = new MemoryCounters { Size = (uint)Marshal.SizeOf<MemoryCounters>() };
                        if (process.IsInvalid
                            || !GetProcessTimes(process, out var created, out _, out var kernel, out var user)
                            || !K32GetProcessMemoryInfo(process, ref memory, memory.Size))
                        { inaccessible++; continue; }
                        var name = new StringBuilder(1024);
                        var nameLength = name.Capacity;
                        var processName = QueryFullProcessImageName(process, 0, name, ref nameLength)
                            ? Path.GetFileNameWithoutExtension(name.ToString()) : $"Process {id}";
                        processName = processName[..Math.Min(processName.Length, 160)];
                        var ioAvailable = GetProcessIoCounters(process, out var io);
                        var handlesAvailable = GetProcessHandleCount(process, out var handles);
                        processes.Add(new {
                            pid = id, startedAt = DateTime.FromFileTimeUtc(created).ToString("O"), name = processName,
                            cpuSeconds = kernel / 10000000d + user / 10000000d,
                            privateMb = (double)memory.PrivateUsage / 1048576d, residentMb = (double)memory.WorkingSet / 1048576d,
                            peakResidentMb = (double)memory.PeakWorkingSet / 1048576d,
                            readBytes = ioAvailable ? (double?)io.ReadBytes : null, writeBytes = ioAvailable ? (double?)io.WriteBytes : null,
                            handles = handlesAvailable ? (int?)Math.Min(handles, int.MaxValue) : null,
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
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryCounters
    {
        public uint Size, PageFaults;
        public nuint PeakWorkingSet, WorkingSet, QuotaPeakPagedPool, QuotaPagedPool,
            QuotaPeakNonPagedPool, QuotaNonPagedPool, PagefileUsage, PeakPagefileUsage, PrivateUsage;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessTimes(SafeProcessHandle process, out long created, out long exited, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool K32GetProcessMemoryInfo(SafeProcessHandle process, ref MemoryCounters counters, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageName(SafeProcessHandle process, uint flags, StringBuilder name, ref int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessHandleCount(SafeProcessHandle process, out uint count);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessIoCounters(SafeProcessHandle process, out IoCounters counters);
}
