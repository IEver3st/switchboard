using System.Diagnostics;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Switchboard.AudioHost;

// Standard Android Head Tracker HID 1.x / 2.x (ACL), implemented in the host.
// Descriptor-derived report IDs, field sizes and scales; no model-specific packet offsets.
internal sealed class HeadsetHeadTracker : IHeadPoseSource
{
    private HidHeadTrackingConnection? connection;
    private string? error;
    private bool disposed;
    public HeadsetHeadTracker() => Refresh();
    public HeadPose? Latest => Volatile.Read(ref connection)?.Latest;
    public string? Error => Volatile.Read(ref connection)?.Error ?? error;
    public string? Name => Volatile.Read(ref connection)?.Name;
    public void Refresh()
    {
        if (disposed || connection is { Error: null }) return;
        connection?.Dispose(); connection = null;
        try
        {
            var devices = HidHeadTrackingConnection.Discover();
            if (devices.Count != 1)
            {
                error = devices.Count == 0
                    ? SonyBluetoothTracking.SensorProblem() ?? "Windows has not exposed a compatible headset motion sensor. Connect your headset over Bluetooth, then choose Connect headset sensor."
                    : "More than one headset motion sensor is connected. Disconnect the headset you are not wearing.";
                return;
            }
            var next = new HidHeadTrackingConnection(devices[0]);
            error = null; Volatile.Write(ref connection, next);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
        { error = $"Cannot read the headset motion sensor: {ex.Message}"; }
    }
    public void Dispose() { if (disposed) return; disposed = true; Interlocked.Exchange(ref connection, null)?.Dispose(); }
}

internal sealed class HidHeadTrackingConnection : IDisposable
{
    internal sealed record Device(string Path, string Name);
    private readonly SafeFileHandle handle;
    private readonly IntPtr descriptor;
    private readonly Hid.Caps caps;
    private readonly Hid.ValueCap rotation;
    private readonly Hid.ValueCap resetCounter;
    private readonly Dictionary<byte, byte[]> savedFeatures = [];
    private readonly CancellationTokenSource stop = new();
    private FileStream? stream;
    private Task? reader;
    private HeadPose? latest;
    private string? error;
    private int disposed;
    public HeadPose? Latest => Volatile.Read(ref latest);
    public string? Error => Volatile.Read(ref error);
    public string Name { get; }

    public static IReadOnlyList<Device> Discover()
    {
        List<Device> devices = [];
        foreach (var path in Hid.Paths())
        {
            using var file = Hid.Open(path, 0, false);
            if (file.IsInvalid || !Hid.HidD_GetPreparsedData(file, out var ppd)) continue;
            try
            {
                if (Hid.HidP_GetCaps(ppd, out var caps) != Hid.Success || caps.UsagePage != 0x20 || caps.Usage != 0xe1
                    || caps.FeatureLength is < 1 or > 4096 || caps.InputLength is < 2 or > 4096) continue;
                var fields = Hid.Values(ppd, 2, caps.FeatureValues);
                var verified = false;
                foreach (var id in fields.Select(f => f.ReportId).Distinct())
                {
                    var report = new byte[caps.FeatureLength]; report[0] = id;
                    if (!Hid.HidD_GetFeature(file, report, report.Length)) continue;
                    var description = Encoding.ASCII.GetString(report);
                    verified |= SupportsAcl(description);
                }
                if (!verified || !Hid.Values(ppd, 0, caps.InputValues).Any(f => f.UsagePage == 0x20 && f.UsageMin == 0x544 && f.ReportCount == 3 && f.BitSize is > 0 and <= 32)) continue;
                var text = new byte[512];
                var name = Hid.HidD_GetProductString(file, text, text.Length) ? Encoding.Unicode.GetString(text).TrimEnd('\0') : "Headset motion sensor";
                devices.Add(new(path, string.IsNullOrWhiteSpace(name) ? "Headset motion sensor" : name));
            }
            finally { Hid.HidD_FreePreparsedData(ppd); }
        }
        return devices;
    }

    internal static bool SupportsAcl(string description)
    {
        const string marker = "#AndroidHeadTracker#";
        var start = description.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0) return false;
        var parts = description[(start + marker.Length)..].Split('#', '\0');
        if (!Version.TryParse(parts[0], out var version)) return false;
        return version.Major == 1 || version.Major == 2 && parts.Length > 1 && parts[1] is "1" or "3";
    }

    public HidHeadTrackingConnection(Device device)
    {
        Name = device.Name;
        handle = Hid.Open(device.Path, 0xc0000000, true);
        try
        {
            if (handle.IsInvalid) throw new IOException("The motion sensor is busy or access was denied.");
            if (!Hid.HidD_GetPreparsedData(handle, out descriptor) || Hid.HidP_GetCaps(descriptor, out caps) != Hid.Success)
                throw new IOException("The motion sensor descriptor could not be read.");
            var fields = Hid.Values(descriptor, 0, caps.InputValues);
            rotation = fields.First(f => f.UsagePage == 0x20 && f.UsageMin == 0x544 && f.ReportCount == 3);
            resetCounter = fields.FirstOrDefault(f => f.UsagePage == 0x20 && f.UsageMin == 0x546);
            Configure();
            stream = new FileStream(handle, FileAccess.ReadWrite, caps.InputLength, true);
            reader = ReadAsync();
        }
        catch { Dispose(); throw; }
    }
    private void Configure()
    {
        var values = Hid.Values(descriptor, 2, caps.FeatureValues);
        var buttons = Hid.Buttons(descriptor, caps.FeatureButtons);
        var reports = new Dictionary<byte, byte[]>();
        byte[] Report(byte id)
        {
            if (reports.TryGetValue(id, out var data)) return data;
            data = new byte[caps.FeatureLength]; data[0] = id;
            if (!Hid.HidD_GetFeature(handle, data, data.Length)) throw new IOException("Cannot save the sensor's original power settings.");
            savedFeatures[id] = (byte[])data.Clone(); reports[id] = data; return data;
        }
        foreach (var usage in new ushort[] { 0xf800, 0x851, 0x841 })
        {
            var field = buttons.FirstOrDefault(b => b.UsagePage == 0x20 && usage >= b.UsageMin && usage <= (b.IsRange != 0 ? b.UsageMax : b.UsageMin));
            if (field.UsagePage == 0) { if (usage == 0xf800) continue; throw new IOException("The sensor does not expose power and reporting controls."); }
            var report = Report(field.ReportId);
            var current = new ushort[128]; uint count = (uint)current.Length;
            if (Hid.HidP_GetUsages(2, field.UsagePage, field.LinkCollection, current, ref count, descriptor, report, report.Length) == Hid.Success && count > 0)
            {
                // Power, reporting and transport can share one link collection.
                // Clear only this selector's values, preserving the other controls.
                var previous = current.Take((int)count).Where(u => u >= field.UsageMin && u <= (field.IsRange != 0 ? field.UsageMax : field.UsageMin)).ToArray();
                var previousCount = (uint)previous.Length;
                if (previousCount > 0 && Hid.HidP_UnsetUsages(2, field.UsagePage, field.LinkCollection, previous, ref previousCount, descriptor, report, report.Length) != Hid.Success)
                    throw new IOException("Cannot clear the sensor's previous reporting state.");
            }
            count = 1; var desired = new[] { usage };
            if (Hid.HidP_SetUsages(2, field.UsagePage, field.LinkCollection, desired, ref count, descriptor, report, report.Length) != Hid.Success)
                throw new IOException("Cannot encode sensor reporting state.");
        }
        var interval = values.FirstOrDefault(v => v.UsagePage == 0x20 && v.UsageMin == 0x30e);
        if (interval.UsagePage == 0 || interval.PhysicalMax <= interval.PhysicalMin || interval.LogicalMax <= interval.LogicalMin)
            throw new IOException("The sensor has no valid report interval.");
        var seconds = Math.Clamp(.01 / Math.Pow(10, Exponent(interval.UnitsExponent)), interval.PhysicalMin, interval.PhysicalMax);
        var raw = (uint)Math.Round(interval.LogicalMin + (seconds - interval.PhysicalMin) / ((double)interval.PhysicalMax - interval.PhysicalMin) * ((double)interval.LogicalMax - interval.LogicalMin));
        var intervalReport = Report(interval.ReportId);
        if (Hid.HidP_SetUsageValue(2, interval.UsagePage, interval.LinkCollection, interval.UsageMin, raw, descriptor, intervalReport, intervalReport.Length) != Hid.Success)
            throw new IOException("Cannot configure the sensor report interval.");
        foreach (var report in reports.Values)
            if (!Hid.HidD_SetFeature(handle, report, report.Length)) throw new IOException("The headset rejected motion tracking activation.");
    }
    private async Task ReadAsync()
    {
        var report = new byte[caps.InputLength];
        var packed = new byte[(rotation.ReportCount * rotation.BitSize + 7) / 8];
        Quaternion? origin = null;
        long referenceId = 0;
        uint? counter = null;
        try
        {
            while (!stop.IsCancellationRequested)
            {
                var length = await stream!.ReadAsync(report, stop.Token).ConfigureAwait(false);
                if (length == 0) throw new IOException("The headset disconnected.");
                if (length != caps.InputLength || report[0] != rotation.ReportId) continue;
                Array.Clear(packed);
                if (Hid.HidP_GetUsageValueArray(0, 0x20, rotation.LinkCollection, 0x544, packed, (ushort)packed.Length, descriptor, report, report.Length) != Hid.Success) continue;
                var vector = new Vector3(Decode(packed, rotation, 0), Decode(packed, rotation, 1), Decode(packed, rotation, 2));
                if (!float.IsFinite(vector.LengthSquared()) || vector.Length() > MathF.PI + .01f) continue;
                var pose = AndroidRotation(vector);
                if (resetCounter.UsagePage != 0 && Hid.HidP_GetUsageValue(0, 0x20, resetCounter.LinkCollection, 0x546, out var nextCounter, descriptor, report, report.Length) == Hid.Success)
                { if (counter != nextCounter) origin = null; counter = nextCounter; }
                // Reconnects/resets invalidate a calibration against the previous sensor origin.
                if (origin is null) { origin = pose; referenceId = Stopwatch.GetTimestamp(); }
                Volatile.Write(ref latest, new HeadPose(Quaternion.Normalize(Quaternion.Inverse(origin.Value) * pose), Stopwatch.GetTimestamp(), referenceId));
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException)
        { if (!stop.IsCancellationRequested) Volatile.Write(ref error, "Headset sensor disconnected. Waiting to reconnect."); }
    }
    internal static int Exponent(uint exponent) => (int)(exponent & 15) is var n && n >= 8 ? n - 16 : n;
    internal static float Decode(ReadOnlySpan<byte> bytes, Hid.ValueCap cap, int element)
    {
        if (cap.BitSize is 0 or > 32 || element < 0 || element >= cap.ReportCount || bytes.Length * 8 < (element + 1) * cap.BitSize)
            throw new InvalidDataException("Invalid sensor field length.");
        ulong raw = 0;
        for (var bit = 0; bit < cap.BitSize; bit++) { var at = element * cap.BitSize + bit; raw |= (ulong)((bytes[at / 8] >> (at % 8)) & 1) << bit; }
        var signed = (long)raw;
        if (cap.LogicalMin < 0 && (raw & (1UL << (cap.BitSize - 1))) != 0) signed -= 1L << cap.BitSize;
        if (signed < cap.LogicalMin || signed > cap.LogicalMax || cap.LogicalMax <= cap.LogicalMin) return float.NaN;
        return (float)((cap.PhysicalMin + (signed - (double)cap.LogicalMin) / ((double)cap.LogicalMax - cap.LogicalMin)
            * ((double)cap.PhysicalMax - cap.PhysicalMin)) * Math.Pow(10, Exponent(cap.UnitsExponent)));
    }
    internal static Quaternion AndroidRotation(Vector3 vector)
    {
        // Android is reference-to-head, X right/Y forward/Z up. Invert that
        // rotation and change basis to our head-to-world X right/Y up/Z forward.
        var angle = vector.Length();
        return angle < 1e-7f ? Quaternion.Identity : Quaternion.CreateFromAxisAngle(new Vector3(vector.X, vector.Z, vector.Y) / angle, angle);
    }
    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        stop.Cancel();
        if (!handle.IsInvalid && !handle.IsClosed) Hid.CancelIoEx(handle, IntPtr.Zero);
        reader?.GetAwaiter().GetResult();
        if (!handle.IsInvalid && !handle.IsClosed)
            foreach (var feature in savedFeatures.Values) Hid.HidD_SetFeature(handle, feature, feature.Length);
        stream?.Dispose(); handle.Dispose();
        if (descriptor != IntPtr.Zero) Hid.HidD_FreePreparsedData(descriptor);
        stop.Dispose();
    }
}

internal static class Hid
{
    internal const int Success = 0x110000;
    [StructLayout(LayoutKind.Explicit, Size = 64)] internal struct Caps
    {
        [FieldOffset(0)] public ushort Usage;
        [FieldOffset(2)] public ushort UsagePage;
        [FieldOffset(4)] public ushort InputLength;
        [FieldOffset(8)] public ushort FeatureLength;
        [FieldOffset(48)] public ushort InputValues;
        [FieldOffset(58)] public ushort FeatureButtons;
        [FieldOffset(60)] public ushort FeatureValues;
    }
    [StructLayout(LayoutKind.Explicit, Size = 72)] internal struct ValueCap
    {
        [FieldOffset(0)] public ushort UsagePage;
        [FieldOffset(2)] public byte ReportId;
        [FieldOffset(6)] public ushort LinkCollection;
        [FieldOffset(12)] public byte IsRange;
        [FieldOffset(18)] public ushort BitSize;
        [FieldOffset(20)] public ushort ReportCount;
        [FieldOffset(32)] public uint UnitsExponent;
        [FieldOffset(40)] public int LogicalMin;
        [FieldOffset(44)] public int LogicalMax;
        [FieldOffset(48)] public int PhysicalMin;
        [FieldOffset(52)] public int PhysicalMax;
        [FieldOffset(56)] public ushort UsageMin;
        [FieldOffset(58)] public ushort UsageMax;
    }
    [StructLayout(LayoutKind.Sequential)] private struct InterfaceData { public int Size; public Guid Guid; public int Flags; public IntPtr Reserved; }
    internal static SafeFileHandle Open(string path, uint access, bool asynchronous) => CreateFileW(path, access, 3, IntPtr.Zero, 3, asynchronous ? 0x40000000u : 0, IntPtr.Zero);
    internal static List<string> Paths()
    {
        HidD_GetHidGuid(out var guid);
        var set = SetupDiGetClassDevsW(ref guid, null, IntPtr.Zero, 0x12);
        if (set == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
        List<string> result = [];
        try
        {
            var data = new InterfaceData { Size = Marshal.SizeOf<InterfaceData>() };
            for (uint i = 0; SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref guid, i, ref data); i++)
            {
                SetupDiGetDeviceInterfaceDetailW(set, ref data, IntPtr.Zero, 0, out var size, IntPtr.Zero);
                if (size is < 8 or > 65536) continue;
                var buffer = Marshal.AllocHGlobal((int)size);
                try
                {
                    Marshal.WriteInt32(buffer, IntPtr.Size == 8 ? 8 : 6);
                    if (SetupDiGetDeviceInterfaceDetailW(set, ref data, buffer, size, out _, IntPtr.Zero)
                        && Marshal.PtrToStringUni(buffer + 4) is { } path) result.Add(path);
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
        }
        finally { SetupDiDestroyDeviceInfoList(set); }
        return result;
    }
    internal static ValueCap[] Values(IntPtr ppd, int type, ushort count)
    {
        if (count > 256) throw new IOException("Sensor descriptor exceeds supported field count.");
        var fields = new ValueCap[count];
        return count != 0 && HidP_GetValueCaps(type, fields, ref count, ppd) == Success ? fields[..count] : [];
    }
    internal static ValueCap[] Buttons(IntPtr ppd, ushort count)
    {
        if (count > 256) throw new IOException("Sensor descriptor exceeds supported field count.");
        var fields = new ValueCap[count]; // Relevant header/range offsets match HIDP_BUTTON_CAPS.
        return count != 0 && HidP_GetButtonCaps(2, fields, ref count, ppd) == Success ? fields[..count] : [];
    }
    [DllImport("hid.dll")] internal static extern void HidD_GetHidGuid(out Guid guid);
    [DllImport("hid.dll")] [return: MarshalAs(UnmanagedType.U1)] internal static extern bool HidD_GetPreparsedData(SafeFileHandle file, out IntPtr data);
    [DllImport("hid.dll")] [return: MarshalAs(UnmanagedType.U1)] internal static extern bool HidD_FreePreparsedData(IntPtr data);
    [DllImport("hid.dll")] internal static extern int HidP_GetCaps(IntPtr data, out Caps caps);
    [DllImport("hid.dll")] internal static extern int HidP_GetValueCaps(int type, [Out] ValueCap[] values, ref ushort count, IntPtr data);
    [DllImport("hid.dll")] internal static extern int HidP_GetButtonCaps(int type, [Out] ValueCap[] values, ref ushort count, IntPtr data);
    [DllImport("hid.dll")] [return: MarshalAs(UnmanagedType.U1)] internal static extern bool HidD_GetProductString(SafeFileHandle file, [Out] byte[] data, int length);
    [DllImport("hid.dll")] [return: MarshalAs(UnmanagedType.U1)] internal static extern bool HidD_GetFeature(SafeFileHandle file, [In, Out] byte[] data, int length);
    [DllImport("hid.dll")] [return: MarshalAs(UnmanagedType.U1)] internal static extern bool HidD_SetFeature(SafeFileHandle file, byte[] data, int length);
    [DllImport("hid.dll")] internal static extern int HidP_GetUsageValueArray(int type, ushort page, ushort link, ushort usage, [Out] byte[] value, ushort length, IntPtr ppd, byte[] report, int reportLength);
    [DllImport("hid.dll")] internal static extern int HidP_GetUsageValue(int type, ushort page, ushort link, ushort usage, out uint value, IntPtr ppd, byte[] report, int length);
    [DllImport("hid.dll")] internal static extern int HidP_SetUsageValue(int type, ushort page, ushort link, ushort usage, uint value, IntPtr ppd, [In, Out] byte[] report, int length);
    [DllImport("hid.dll")] internal static extern int HidP_GetUsages(int type, ushort page, ushort link, [Out] ushort[] usages, ref uint count, IntPtr ppd, byte[] report, int length);
    [DllImport("hid.dll")] internal static extern int HidP_SetUsages(int type, ushort page, ushort link, ushort[] usages, ref uint count, IntPtr ppd, [In, Out] byte[] report, int length);
    [DllImport("hid.dll")] internal static extern int HidP_UnsetUsages(int type, ushort page, ushort link, ushort[] usages, ref uint count, IntPtr ppd, [In, Out] byte[] report, int length);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern SafeFileHandle CreateFileW(string path, uint access, uint sharing, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll")] internal static extern bool CancelIoEx(SafeFileHandle file, IntPtr overlapped);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr SetupDiGetClassDevsW(ref Guid guid, string? enumerator, IntPtr parent, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)] private static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr device, ref Guid guid, uint index, ref InterfaceData data);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool SetupDiGetDeviceInterfaceDetailW(IntPtr set, ref InterfaceData data, IntPtr detail, uint size, out uint required, IntPtr device);
    [DllImport("setupapi.dll")] private static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
}
