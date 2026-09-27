using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Switchboard.AudioHost;

internal sealed record AudioProcessIdentity(int Id, long StartedAt, string ExecutablePath)
{
    public static AudioProcessIdentity? TryRead(int id)
    {
        try
        {
            using var process = Process.GetProcessById(id);
            var path = process.MainModule?.FileName;
            return process.HasExited || string.IsNullOrEmpty(path) ? null : new(id, process.StartTime.ToUniversalTime().Ticks, path);
        }
        catch { return null; }
    }

    public static bool IsInTree(int candidate, int root)
    {
        var visited = new HashSet<int>();
        while (candidate > 0 && visited.Count < 64 && visited.Add(candidate))
        {
            if (candidate == root) return true;
            try
            {
                using var process = Process.GetProcessById(candidate);
                if (NtQueryInformationProcess(process.Handle, 0, out var info, Marshal.SizeOf<ProcessBasicInformation>(), out _) != 0) return false;
                candidate = checked((int)info.ParentProcessId);
            }
            catch { return false; }
        }
        return false;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessBasicInformation
    {
        public IntPtr Reserved1, PebBaseAddress, Reserved2, Reserved3, ProcessId, ParentProcessId;
    }
    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(IntPtr handle, int informationClass,
        out ProcessBasicInformation information, int length, out int returnLength);
}
