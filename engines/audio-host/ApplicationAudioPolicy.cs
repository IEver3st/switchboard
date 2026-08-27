using System.Runtime.InteropServices;

namespace Switchboard.AudioHost;

// Windows does not expose application endpoint preferences through the public
// Core Audio APIs. This boundary contains the undocumented WinRT policy call
// used by the Windows volume mixer and keeps it out of the realtime graph.
internal sealed class ApplicationAudioPolicy : IDisposable
{
    private const string RuntimeClassName = "Windows.Media.Internal.AudioPolicyConfig";
    private const string MmDevicePrefix = @"\\?\SWD#MMDEVAPI#";
    private const string RenderInterfaceSuffix = "#{e6327cad-dcec-4949-ae8a-991e976a79d2}";
    private static readonly Guid Win11Iid = new("ab3d4648-e242-459f-b02f-541c70306324");
    private static readonly Guid Win10Iid = new("2a59116d-6c4f-45e0-a74f-707e3fef9258");
    private readonly object gate = new();
    private IAudioPolicyConfigFactoryWin11? win11;
    private IAudioPolicyConfigFactoryWin10? win10;
    private bool probed;
    private bool disposed;

    public bool Available
    {
        get
        {
            lock (gate)
            {
                Probe();
                return win11 is not null || win10 is not null;
            }
        }
    }

    public void SetRenderEndpoint(int processId, string endpointId)
    {
        if (processId <= 0) throw new ArgumentOutOfRangeException(nameof(processId));
        ArgumentException.ThrowIfNullOrWhiteSpace(endpointId);
        var persistedId = $"{MmDevicePrefix}{endpointId}{RenderInterfaceSuffix}";
        lock (gate)
        {
            Probe();
            SetRole(checked((uint)processId), PolicyRole.Console, persistedId);
            SetRole(checked((uint)processId), PolicyRole.Multimedia, persistedId);
            var console = GetRole(checked((uint)processId), PolicyRole.Console);
            var multimedia = GetRole(checked((uint)processId), PolicyRole.Multimedia);
            if (!string.Equals(console, persistedId, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(multimedia, persistedId, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Windows did not retain the requested application audio route.");
            }
        }
    }

    public string? GetRenderEndpoint(int processId)
    {
        if (processId <= 0) return null;
        lock (gate)
        {
            Probe();
            var persisted = GetRole(checked((uint)processId), PolicyRole.Multimedia);
            if (string.IsNullOrWhiteSpace(persisted)) persisted = GetRole(checked((uint)processId), PolicyRole.Console);
            if (string.IsNullOrWhiteSpace(persisted)) return null;
            if (!persisted.StartsWith(MmDevicePrefix, StringComparison.OrdinalIgnoreCase)
                || !persisted.EndsWith(RenderInterfaceSuffix, StringComparison.OrdinalIgnoreCase)) return null;
            return persisted[MmDevicePrefix.Length..^RenderInterfaceSuffix.Length];
        }
    }

    private void SetRole(uint processId, PolicyRole role, string persistedId)
    {
        var handle = HString.Create(persistedId);
        try
        {
            var result = win11 is not null
                ? win11.SetPersistedDefaultAudioEndpoint(processId, PolicyDataFlow.Render, role, handle)
                : win10 is not null
                    ? win10.SetPersistedDefaultAudioEndpoint(processId, PolicyDataFlow.Render, role, handle)
                    : throw new InvalidOperationException("Windows application audio routing is unavailable on this OS build.");
            if (result < 0) Marshal.ThrowExceptionForHR(result);
        }
        finally { HString.Delete(handle); }
    }

    private string GetRole(uint processId, PolicyRole role)
    {
        IntPtr handle = IntPtr.Zero;
        try
        {
            var result = win11 is not null
                ? win11.GetPersistedDefaultAudioEndpoint(processId, PolicyDataFlow.Render, role, out handle)
                : win10 is not null
                    ? win10.GetPersistedDefaultAudioEndpoint(processId, PolicyDataFlow.Render, role, out handle)
                    : throw new InvalidOperationException("Windows application audio routing is unavailable on this OS build.");
            return result < 0 ? string.Empty : HString.Read(handle);
        }
        finally { HString.Delete(handle); }
    }

    private void Probe()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (probed) return;
        probed = true;
        if (Environment.OSVersion.Version.Build >= 22000)
        {
            try { win11 = Activate<IAudioPolicyConfigFactoryWin11>(Win11Iid); }
            catch { win11 = null; }
        }
        if (win11 is null)
        {
            try { win10 = Activate<IAudioPolicyConfigFactoryWin10>(Win10Iid); }
            catch { win10 = null; }
        }
    }

    private static T? Activate<T>(Guid iid) where T : class
    {
        var className = HString.Create(RuntimeClassName);
        try
        {
            RoGetActivationFactory(className, ref iid, out var pointer);
            if (pointer == IntPtr.Zero) return null;
            try { return Marshal.GetObjectForIUnknown(pointer) as T; }
            finally { Marshal.Release(pointer); }
        }
        finally { HString.Delete(className); }
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
            disposed = true;
            try { if (win11 is not null) Marshal.FinalReleaseComObject(win11); } catch { }
            try { if (win10 is not null) Marshal.FinalReleaseComObject(win10); } catch { }
            win11 = null;
            win10 = null;
        }
    }

    [DllImport("combase.dll", PreserveSig = false)]
    private static extern void RoGetActivationFactory(IntPtr activatableClassId, ref Guid iid, out IntPtr factory);

    private static class HString
    {
        [DllImport("combase.dll", PreserveSig = false)]
        private static extern void WindowsCreateString([MarshalAs(UnmanagedType.LPWStr)] string source, uint length, out IntPtr value);
        [DllImport("combase.dll")]
        private static extern int WindowsDeleteString(IntPtr value);
        [DllImport("combase.dll")]
        private static extern IntPtr WindowsGetStringRawBuffer(IntPtr value, out uint length);

        public static IntPtr Create(string value)
        {
            if (string.IsNullOrEmpty(value)) return IntPtr.Zero;
            WindowsCreateString(value, checked((uint)value.Length), out var handle);
            return handle;
        }

        public static string Read(IntPtr value)
        {
            if (value == IntPtr.Zero) return string.Empty;
            var buffer = WindowsGetStringRawBuffer(value, out var length);
            return buffer == IntPtr.Zero ? string.Empty : Marshal.PtrToStringUni(buffer, checked((int)length)) ?? string.Empty;
        }

        public static void Delete(IntPtr value)
        {
            if (value != IntPtr.Zero) _ = WindowsDeleteString(value);
        }
    }

    private enum PolicyDataFlow { Render = 0, Capture = 1, All = 2 }
    private enum PolicyRole { Console = 0, Multimedia = 1, Communications = 2 }

    [ComImport, Guid("ab3d4648-e242-459f-b02f-541c70306324"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioPolicyConfigFactoryWin11
    {
        [PreserveSig] int GetIids(out int count, out IntPtr values);
        [PreserveSig] int GetRuntimeClassName(out IntPtr value);
        [PreserveSig] int GetTrustLevel(out int value);
        [PreserveSig] int R00(); [PreserveSig] int R01(); [PreserveSig] int R02(); [PreserveSig] int R03();
        [PreserveSig] int R04(); [PreserveSig] int R05(); [PreserveSig] int R06(); [PreserveSig] int R07();
        [PreserveSig] int R08(); [PreserveSig] int R09(); [PreserveSig] int R10(); [PreserveSig] int R11();
        [PreserveSig] int R12(); [PreserveSig] int R13(); [PreserveSig] int R14(); [PreserveSig] int R15();
        [PreserveSig] int R16(); [PreserveSig] int R17(); [PreserveSig] int R18();
        [PreserveSig] int SetPersistedDefaultAudioEndpoint(uint processId, PolicyDataFlow flow, PolicyRole role, IntPtr deviceId);
        [PreserveSig] int GetPersistedDefaultAudioEndpoint(uint processId, PolicyDataFlow flow, PolicyRole role, out IntPtr deviceId);
        [PreserveSig] int ClearAllPersistedApplicationDefaultEndpoints();
    }

    [ComImport, Guid("2a59116d-6c4f-45e0-a74f-707e3fef9258"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioPolicyConfigFactoryWin10
    {
        [PreserveSig] int GetIids(out int count, out IntPtr values);
        [PreserveSig] int GetRuntimeClassName(out IntPtr value);
        [PreserveSig] int GetTrustLevel(out int value);
        [PreserveSig] int R00(); [PreserveSig] int R01(); [PreserveSig] int R02(); [PreserveSig] int R03();
        [PreserveSig] int R04(); [PreserveSig] int R05(); [PreserveSig] int R06(); [PreserveSig] int R07();
        [PreserveSig] int R08(); [PreserveSig] int R09(); [PreserveSig] int R10(); [PreserveSig] int R11();
        [PreserveSig] int R12();
        [PreserveSig] int SetPersistedDefaultAudioEndpoint(uint processId, PolicyDataFlow flow, PolicyRole role, IntPtr deviceId);
        [PreserveSig] int GetPersistedDefaultAudioEndpoint(uint processId, PolicyDataFlow flow, PolicyRole role, out IntPtr deviceId);
        [PreserveSig] int ClearAllPersistedApplicationDefaultEndpoints();
    }
}
