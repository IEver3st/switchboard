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
                session.ProcessID,
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

    public void Dispose() => enumerator.Dispose();
}
