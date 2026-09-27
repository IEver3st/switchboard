using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Switchboard.AudioHost;

// Switchboard's private, portable OpenTrack copy (installed by Electron main after SHA-256 verification).
// Portable mode keeps every OpenTrack setting beside the executable, so a personal OpenTrack install and
// its profiles are never read or changed. OpenTrack has no command line; its own process detector starts
// the Switchboard profile as soon as opentrack.exe itself is running. The process lives only while
// OpenTrack tracking is enabled and is contained in a kill-on-close job, so a host crash cannot orphan it.
internal sealed class ManagedOpenTrack : IDisposable
{
    public const string Version = "opentrack-2026.1.0";
    public const int PhonePort = 4243;
    public static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Switchboard", "OpenTrack", Version);
    private static string InstallDirectory => Path.Combine(Root, "install");
    public static string Executable => Path.Combine(InstallDirectory, "opentrack.exe");
    public static bool Installed => File.Exists(Path.Combine(Root, "switchboard-ready.json")) && File.Exists(Executable);
    private readonly int outputPort;
    private readonly string input;
    private readonly object gate = new();
    private SafeJobHandle? job;
    private Process? process;
    private long lastStart;
    private bool disposed;
    public ManagedOpenTrack(int outputPort, string input) { this.outputPort = outputPort; this.input = input; }
    public string? Error { get; private set; }
    public bool Running { get { lock (gate) return process is { HasExited: false }; } }

    // Starts OpenTrack when installed and not running; relaunches after a crash at most every 15 seconds.
    public void Ensure()
    {
        lock (gate)
        {
            if (disposed || !Installed || process is { HasExited: false }) return;
            if (lastStart != 0 && Stopwatch.GetElapsedTime(lastStart).TotalSeconds < 15) return;
            lastStart = Stopwatch.GetTimestamp();
            process?.Dispose(); process = null;
            try
            {
                StopStale();
                WriteConfiguration();
                job ??= CreateJob();
                var started = Process.Start(new ProcessStartInfo(Executable) { WorkingDirectory = InstallDirectory, UseShellExecute = false })
                    ?? throw new InvalidOperationException("OpenTrack did not start.");
                if (!AssignProcessToJobObject(job, started.Handle) && !started.HasExited)
                {
                    try { started.Kill(true); } catch { }
                    started.Dispose();
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenTrack could not be contained.");
                }
                process = started; Error = null;
            }
            catch (Exception ex) when (ex is Win32Exception or IOException or UnauthorizedAccessException or InvalidOperationException)
            {
                Error = $"OpenTrack could not start: {ex.Message}";
            }
        }
    }

    private void WriteConfiguration()
    {
        var profiles = Path.Combine(InstallDirectory, "ini");
        Directory.CreateDirectory(profiles);
        File.WriteAllText(Path.Combine(InstallDirectory, "portable.txt"), "");
        // \x1e and \x1f are OpenTrack's record/unit separators for "executable -> profile" pairs.
        File.WriteAllText(Path.Combine(InstallDirectory, "globals.ini"),
            "[General]\nsettings-filename=switchboard.ini\nexecutable-detector-enabled=true\nexecutable-list=\\x1eopentrack.exe\\x1fswitchboard.ini\n");
        var tracker = input == "phone" ? "udp" : "neuralnet";
        File.WriteAllText(Path.Combine(profiles, "switchboard.ini"), $"""
            [modules]
            tracker-dll={tracker}
            protocol-dll=udp
            filter-dll=accela

            [opentrack-ui]
            apply-mapping-curves=false
            use-system-tray=true
            start-in-tray=true
            center-at-startup=true

            [udp-proto]
            ip1=127
            ip2=0
            ip3=0
            ip4=1
            port={outputPort}

            [udp-tracker]
            port={PhonePort}

            """);
    }

    // A previous host that was terminated before its job closed can leave only this managed copy behind.
    private static void StopStale()
    {
        foreach (var candidate in Process.GetProcessesByName("opentrack"))
        {
            using (candidate)
            {
                try
                {
                    if (string.Equals(candidate.MainModule?.FileName, Executable, StringComparison.OrdinalIgnoreCase))
                    {
                        candidate.Kill(true); candidate.WaitForExit(2000);
                    }
                }
                catch (Exception ex) when (ex is Win32Exception or InvalidOperationException) { }
            }
        }
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
            disposed = true;
            if (process is { HasExited: false })
            {
                try { process.Kill(true); process.WaitForExit(2000); } catch (Exception ex) when (ex is Win32Exception or InvalidOperationException) { }
            }
            process?.Dispose(); process = null;
            job?.Dispose(); job = null;
        }
    }

    private static SafeJobHandle CreateJob()
    {
        var handle = CreateJobObject(IntPtr.Zero, null);
        if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create the OpenTrack job.");
        var limits = new JobObjectExtendedLimitInformation { BasicLimitInformation = new() { LimitFlags = 0x00002000 } }; // Kill on job close.
        if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf<JobObjectExtendedLimitInformation>()))
        {
            var error = Marshal.GetLastWin32Error(); handle.Dispose();
            throw new Win32Exception(error, "Unable to configure OpenTrack cleanup.");
        }
        return handle;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectBasicLimitInformation
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectExtendedLimitInformation
    {
        public JobObjectBasicLimitInformation BasicLimitInformation;
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    private sealed class SafeJobHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        private SafeJobHandle() : base(true) { }
        protected override bool ReleaseHandle() => CloseHandle(handle);
    }
    [DllImport("kernel32.dll", EntryPoint = "CreateJobObjectW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeJobHandle CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(SafeJobHandle job, int informationClass, ref JobObjectExtendedLimitInformation information, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(SafeJobHandle job, IntPtr process);
    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);
}
