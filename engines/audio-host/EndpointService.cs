using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace Switchboard.AudioHost;

internal sealed class EndpointService : IDisposable
{
    private readonly MMDeviceEnumerator enumerator = new();

    public IReadOnlyList<AudioEndpoint> List()
    {
        var defaultRender = TryGetDefault(DataFlow.Render)?.ID;
        var defaultCapture = TryGetDefault(DataFlow.Capture)?.ID;
        var endpoints = new List<AudioEndpoint>();

        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active))
        {
            var isDefault = string.Equals(device.ID, defaultRender, StringComparison.OrdinalIgnoreCase)
                            || string.Equals(device.ID, defaultCapture, StringComparison.OrdinalIgnoreCase);
            float volume;
            bool muted;
            try
            {
                volume = device.AudioEndpointVolume.MasterVolumeLevelScalar;
                muted = device.AudioEndpointVolume.Mute;
            }
            catch
            {
                volume = 1f;
                muted = false;
            }

            var interfaceName = TryGetInterfaceName(device);
            endpoints.Add(new AudioEndpoint(
                device.ID,
                device.FriendlyName,
                device.DataFlow.ToString().ToLowerInvariant(),
                isDefault,
                TryGetFormFactor(device),
                interfaceName,
                volume,
                muted,
                EndpointCatalog.IsSwitchboard(device.FriendlyName, interfaceName)));
        }

        return endpoints.OrderByDescending(endpoint => endpoint.IsDefault).ThenBy(endpoint => endpoint.Name).ToArray();
    }

    public MMDevice Open(string endpointId) => enumerator.GetDevice(endpointId);

    public IReadOnlyList<AudioApplicationState> ListApplications(VirtualEndpointSet virtualEndpoints)
    {
        var result = new List<AudioApplicationState>();
        foreach (var (busId, endpoint) in new[]
        {
            ("game", virtualEndpoints.Game),
            ("chat", virtualEndpoints.Chat),
            ("media", virtualEndpoints.Media),
        })
        {
            using var output = Open(endpoint.Id);
            var sessions = output.AudioSessionManager.Sessions;
            for (var index = 0; index < sessions.Count; index++)
            {
                using var session = sessions[index];
                var processId = checked((int)session.GetProcessID);
                if (processId <= 0) continue;
                result.Add(new AudioApplicationState(
                    session.GetSessionInstanceIdentifier,
                    ResolveProcessName(processId, session.DisplayName),
                    processId,
                    busId,
                    session.State == AudioSessionState.AudioSessionStateActive));
            }
        }
        return result;
    }

    private MMDevice? TryGetDefault(DataFlow flow)
    {
        try { return enumerator.GetDefaultAudioEndpoint(flow, Role.Multimedia); }
        catch { return null; }
    }

    private static string ResolveProcessName(int processId, string displayName)
    {
        if (!string.IsNullOrWhiteSpace(displayName)) return displayName;
        try
        {
            using var process = Process.GetProcessById(processId);
            return process.ProcessName;
        }
        catch { return $"Process {processId}"; }
    }

    private static string? TryGetFormFactor(MMDevice device)
    {
        try
        {
            return Convert.ToUInt32(device.Properties[PropertyKeys.PKEY_AudioEndpoint_FormFactor].Value) switch
            {
                0 => "remote-network-device",
                1 => "speakers",
                2 => "line-level",
                3 => "headphones",
                4 => "microphone",
                5 => "headset",
                6 => "handset",
                8 => "spdif",
                9 => "digital-display",
                _ => "unknown",
            };
        }
        catch { return null; }
    }

    private static string? TryGetInterfaceName(MMDevice device)
    {
        try { return device.DeviceFriendlyName; }
        catch { return null; }
    }

    public void Dispose() => enumerator.Dispose();
}
