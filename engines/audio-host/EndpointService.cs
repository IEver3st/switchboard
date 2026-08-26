using NAudio.CoreAudioApi;

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

            endpoints.Add(new AudioEndpoint(
                device.ID,
                device.FriendlyName,
                device.DataFlow.ToString().ToLowerInvariant(),
                isDefault,
                TryGetFormFactor(device),
                TryGetInterfaceName(device),
                volume,
                muted));
        }

        return endpoints.OrderByDescending(endpoint => endpoint.IsDefault).ThenBy(endpoint => endpoint.Name).ToArray();
    }

    public IReadOnlyList<object> ListSessions()
    {
        var output = TryGetDefault(DataFlow.Render);
        if (output is null) return [];

        var sessions = output.AudioSessionManager.Sessions;
        var result = new List<object>(sessions.Count);
        for (var index = 0; index < sessions.Count; index++)
        {
            var session = sessions[index];
            result.Add(new
            {
                ProcessID = session.GetProcessID,
                session.DisplayName,
                Volume = session.SimpleAudioVolume.Volume,
                session.SimpleAudioVolume.Mute,
                State = session.State.ToString(),
            });
        }

        return result;
    }

    private MMDevice? TryGetDefault(DataFlow flow)
    {
        try
        {
            return enumerator.GetDefaultAudioEndpoint(flow, Role.Multimedia);
        }
        catch
        {
            return null;
        }
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
        catch
        {
            return null;
        }
    }

    private static string? TryGetInterfaceName(MMDevice device)
    {
        try
        {
            return device.DeviceFriendlyName;
        }
        catch
        {
            return null;
        }
    }

    public void Dispose() => enumerator.Dispose();
}
