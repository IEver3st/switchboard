using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Switchboard.AudioHost;

// Windows service registration for known Sony models with an integrated motion sensor.
// Recovery is restricted to an absent headset HID service; audio services and pairing stay intact.
internal static class SonyBluetoothTracking
{
    private static readonly HashSet<string> Models = new(StringComparer.OrdinalIgnoreCase)
    { "WH-1000XM5", "WH-1000XM6", "WF-1000XM5", "WF-1000XM6", "WH-ULT900N", "LinkBuds S" };
    public static string EnableConnectedHeadset()
    {
        if (HidHeadTrackingConnection.Discover().Count > 0) return "A compatible motion sensor is already exposed by Windows.";
        var search = new Search { Size = Marshal.SizeOf<Search>(), Authenticated = 1, Remembered = 1, Connected = 1 };
        var device = new Device { Size = Marshal.SizeOf<Device>(), Name = string.Empty };
        var found = BluetoothFindFirstDevice(ref search, ref device);
        if (found == IntPtr.Zero) throw new InvalidOperationException("Connect your headset over Bluetooth before enabling its motion sensor.");
        var candidates = new List<Device>();
        try
        {
            do
            {
                if (device.Connected != 0 && Models.Contains(device.Name)) candidates.Add(device);
                device = new Device { Size = Marshal.SizeOf<Device>(), Name = string.Empty };
            } while (BluetoothFindNextDevice(found, ref device));
        }
        finally { BluetoothFindDeviceClose(found); }
        if (candidates.Count != 1) throw new InvalidOperationException(candidates.Count == 0
            ? "No supported Sony headset is connected. Other headsets must expose their standard motion-sensor interface through Windows."
            : "Connect only the headset you want to use while enabling its motion sensor.");
        var target = candidates[0];
        if (SensorProblem() is { } problem) throw new InvalidOperationException(problem);
        var service = new Guid("00001124-0000-1000-8000-00805f9b34fb");
        var result = BluetoothSetServiceState(IntPtr.Zero, ref target, ref service, 1);
        if (result == 5) throw new InvalidOperationException("Windows requires administrator permission to enable this headset's Bluetooth input service.");
        if (result is 87 or 0x80070057)
        {
            // Windows can retain an enabled service without creating its PnP child.
            // Never cycle an existing input device, including a failed sensor driver.
            if (HasInputDevice(target.Address)) return "The headset input device is already connected. Waiting for Windows to expose its sensor.";
            var disabled = BluetoothSetServiceState(IntPtr.Zero, ref target, ref service, 0);
            if (disabled is not (0 or 87 or 0x80070057)) throw new Win32Exception((int)disabled, "Windows could not repair the missing headset input service.");
            Thread.Sleep(1500);
            result = BluetoothSetServiceState(IntPtr.Zero, ref target, ref service, 1);
        }
        if (result != 0) throw new Win32Exception((int)result, "Windows could not enable the headset motion-sensor service.");
        return $"Windows accepted the input service for {target.Name}. Waiting for its motion sensor.";
    }

    public static string? SensorProblem()
    {
        foreach (var device in PresentDevices("HID"))
        {
            if (!device.Id.Contains("VID&0002054C", StringComparison.OrdinalIgnoreCase)
                || !device.HardwareIds.Contains("UP:0020_U:00E1", StringComparison.OrdinalIgnoreCase)
                || !device.Parent.StartsWith("BTHENUM\\", StringComparison.OrdinalIgnoreCase) || device.Problem == 0) continue;
            return device.Problem == 10
                ? "Your headset sensor is connected, but the Windows sensor driver cannot start (Code 10). Administrator repair of this sensor's driver binding is required; reconnecting will not fix that driver error."
                : $"Windows detected your headset sensor but reports device error {device.Problem}. Resolve its driver error in Device Manager before using head tracking.";
        }
        return null;
    }
    private static bool HasInputDevice(ulong address) => PresentDevices("BTHENUM").Any(d =>
        d.Id.Contains("{00001124-0000-1000-8000-00805F9B34FB}", StringComparison.OrdinalIgnoreCase)
        && d.Id.Contains(address.ToString("X12"), StringComparison.OrdinalIgnoreCase));
    private sealed record PnpDevice(string Id, string Parent, string HardwareIds, uint Problem);
    private static List<PnpDevice> PresentDevices(string enumerator)
    {
        var set = SetupDiGetClassDevsW(IntPtr.Zero, enumerator, IntPtr.Zero, 6);
        if (set == new IntPtr(-1)) throw new Win32Exception();
        var result = new List<PnpDevice>();
        try
        {
            var info = new DeviceInfo { Size = Marshal.SizeOf<DeviceInfo>() };
            for (uint i = 0; SetupDiEnumDeviceInfo(set, i, ref info); i++)
            {
                var id = new System.Text.StringBuilder(512);
                if (!SetupDiGetDeviceInstanceIdW(set, ref info, id, id.Capacity, out _)) continue;
                var bytes = new byte[4096];
                var hardware = SetupDiGetDeviceRegistryPropertyW(set, ref info, 1, out _, bytes, bytes.Length, out var needed)
                    ? System.Text.Encoding.Unicode.GetString(bytes, 0, (int)Math.Min(needed, bytes.Length)) : string.Empty;
                var parent = new System.Text.StringBuilder(512);
                if (CM_Get_Parent(out var parentNode, info.Instance, 0) == 0) CM_Get_Device_IDW(parentNode, parent, parent.Capacity, 0);
                if (CM_Get_DevNode_Status(out _, out var problem, info.Instance, 0) == 0)
                    result.Add(new(id.ToString(), parent.ToString(), hardware, problem));
            }
        }
        finally { SetupDiDestroyDeviceInfoList(set); }
        return result;
    }
    [StructLayout(LayoutKind.Sequential)] private struct DeviceInfo { public int Size; public Guid Class; public uint Instance; public IntPtr Reserved; }
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr SetupDiGetClassDevsW(IntPtr guid, string enumerator, IntPtr parent, uint flags);
    [DllImport("setupapi.dll")] private static extern bool SetupDiEnumDeviceInfo(IntPtr set, uint index, ref DeviceInfo info);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] private static extern bool SetupDiGetDeviceInstanceIdW(IntPtr set, ref DeviceInfo info, System.Text.StringBuilder id, int length, out uint needed);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] private static extern bool SetupDiGetDeviceRegistryPropertyW(IntPtr set, ref DeviceInfo info, uint property, out uint type, byte[] data, int length, out uint needed);
    [DllImport("setupapi.dll")] private static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("cfgmgr32.dll")] private static extern uint CM_Get_DevNode_Status(out uint status, out uint problem, uint instance, uint flags);
    [DllImport("cfgmgr32.dll")] private static extern uint CM_Get_Parent(out uint parent, uint instance, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)] private static extern uint CM_Get_Device_IDW(uint instance, System.Text.StringBuilder id, int length, uint flags);
    [StructLayout(LayoutKind.Sequential)] private struct Search
    {
        public int Size, Authenticated, Remembered, Unknown, Connected, Inquiry;
        public byte Timeout;
        public IntPtr Radio;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct Device
    {
        public int Size;
        public ulong Address;
        public uint DeviceClass;
        public int Connected, Remembered, Authenticated;
        public long SeenA, SeenB, UsedA, UsedB;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string Name;
    }
    [DllImport("bthprops.cpl", SetLastError = true)] private static extern IntPtr BluetoothFindFirstDevice(ref Search search, ref Device device);
    [DllImport("bthprops.cpl")] private static extern bool BluetoothFindNextDevice(IntPtr search, ref Device device);
    [DllImport("bthprops.cpl")] private static extern bool BluetoothFindDeviceClose(IntPtr search);
    [DllImport("bthprops.cpl")] private static extern uint BluetoothSetServiceState(IntPtr radio, ref Device device, ref Guid service, uint flags);
}
