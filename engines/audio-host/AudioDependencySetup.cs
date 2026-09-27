using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using Microsoft.Win32;

namespace Switchboard.AudioHost;

// One-shot setup control plane. Never creates an audio engine or realtime stream.
internal static class AudioDependencySetup
{
    internal sealed record DefaultEndpoint(string Flow, int Role, string Id);
    internal sealed record Configuration(DefaultEndpoint[] Defaults, string? Installed);
    internal sealed record RegisteredDrivers(bool Cable, bool Microphone);
    internal sealed record Inventory(bool Cable, bool Microphone, bool MicrophoneRateReady, double BootTimeMs, DefaultEndpoint[] Defaults, RegisteredDrivers Registered);

    public static Inventory Inspect()
    {
        using var enumerator = new MMDeviceEnumerator();
        var defaults = new List<DefaultEndpoint>();
        foreach (var flow in new[] { DataFlow.Render, DataFlow.Capture })
        foreach (var role in new[] { Role.Console, Role.Multimedia, Role.Communications })
        {
            try { using var d = enumerator.GetDefaultAudioEndpoint(flow, role); defaults.Add(new(flow.ToString(), (int)role, d.ID)); }
            catch (COMException) { }
        }
        using var devices = enumerator.EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active);
        var cableRender = false; var cableCapture = false; var micRender = 0; var micCapture = 0;
        foreach (var device in devices)
        using (device)
        {
            if (device.DeviceFriendlyName == CableEndpointCatalog.InterfaceName)
            {
                if (device.DataFlow == DataFlow.Render && !device.FriendlyName.Contains("16ch", StringComparison.OrdinalIgnoreCase)) cableRender = true;
                if (device.DataFlow == DataFlow.Capture) cableCapture = true;
            }
            if (device.DeviceFriendlyName == MicrophoneCableCatalog.InterfaceName)
            {
                using var client = device.CreateAudioClient();
                if (device.DataFlow == DataFlow.Render) micRender = client.MixFormat.SampleRate;
                else micCapture = client.MixFormat.SampleRate;
            }
        }
        return new(cableRender && cableCapture, micRender > 0 && micCapture > 0,
            micRender == 48000 && micCapture == 48000,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - Environment.TickCount64, defaults.ToArray(),
            new(Registered("VBAudioVACMME"), Registered("VBAudioHFVAIOMME")));
    }

    private static bool Registered(string service)
    {
        using var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + service);
        return key is not null;
    }

    public static Inventory Configure(Configuration configuration)
    {
        var previous = configuration.Defaults;
        if (previous is null || configuration.Installed is not (null or "cable" or "microphone")) throw new InvalidOperationException("Invalid audio setup configuration.");
        var installedInterface = configuration.Installed == "cable" ? CableEndpointCatalog.InterfaceName
            : configuration.Installed == "microphone" ? MicrophoneCableCatalog.InterfaceName : null;
        if (previous.Length > 6 || previous.Any(d => d.Role is < 0 or > 2 || d.Flow is not ("Render" or "Capture") || d.Id.Length > 512))
            throw new InvalidOperationException("Invalid audio setup defaults.");
        using var enumerator = new MMDeviceEnumerator();
        var policy = (IPolicyConfig)new PolicyConfig();
        try
        {
            // Restore only defaults taken over by a vendor transport. Preserve newer user choices.
            foreach (var saved in previous)
            {
                var flow = Enum.Parse<DataFlow>(saved.Flow);
                using var current = enumerator.GetDefaultAudioEndpoint(flow, (Role)saved.Role);
                if (current.ID == saved.Id || current.DeviceFriendlyName != installedInterface) continue;
                MMDevice target;
                try { target = enumerator.GetDevice(saved.Id); } catch (COMException) { continue; }
                using (target)
                {
                    if (target.State != DeviceState.Active || target.DataFlow != flow) continue;
                    Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(saved.Id, saved.Role));
                }
            }
            using var devices = enumerator.EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active);
            foreach (var device in devices)
            using (device)
            {
                if (device.DeviceFriendlyName != MicrophoneCableCatalog.InterfaceName) continue;
                using var client = device.CreateAudioClient();
                if (client.MixFormat.SampleRate == 48000) continue;
                Marshal.ThrowExceptionForHR(policy.GetDeviceFormat(device.ID, false, out var format));
                try
                {
                    var align = (ushort)Marshal.ReadInt16(format, 12);
                    Marshal.WriteInt32(format, 4, 48000);
                    Marshal.WriteInt32(format, 8, 48000 * align);
                    Marshal.ThrowExceptionForHR(policy.SetDeviceFormat(device.ID, format, IntPtr.Zero));
                }
                finally { Marshal.FreeCoTaskMem(format); }
            }
        }
        finally { Marshal.ReleaseComObject(policy); }
        var result = Inspect();
        if (result.Microphone && !result.MicrophoneRateReady) throw new InvalidOperationException("Hi-Fi Cable sample-rate configuration did not apply. Set both endpoints to 48 kHz in Windows Sound settings.");
        return result;
    }

    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] private class PolicyConfig { }
    [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat(string a, IntPtr b);
        [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string a, bool b, out IntPtr c);
        [PreserveSig] int ResetDeviceFormat(string a);
        [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string a, IntPtr b, IntPtr c);
        [PreserveSig] int GetProcessingPeriod(string a, bool b, IntPtr c, IntPtr d);
        [PreserveSig] int SetProcessingPeriod(string a, IntPtr b);
        [PreserveSig] int GetShareMode(string a, IntPtr b);
        [PreserveSig] int SetShareMode(string a, IntPtr b);
        [PreserveSig] int GetPropertyValue(string a, bool b, IntPtr c, IntPtr d);
        [PreserveSig] int SetPropertyValue(string a, bool b, IntPtr c, IntPtr d);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
        [PreserveSig] int SetEndpointVisibility(string a, bool b);
    }
}
