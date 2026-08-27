using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace Switchboard.AudioHost;

internal sealed class EndpointService : IDisposable
{
    private readonly MMDeviceEnumerator enumerator = new();
    private readonly MMDeviceNotificationClient notifications;
    private readonly ApplicationAudioPolicy applicationPolicy = new();
    private int disposed;

    public EndpointService()
    {
        notifications = enumerator.CreateNotificationClient(useSynchronizationContext: false);
        notifications.DeviceStateChanged += (_, _) => Changed?.Invoke();
        notifications.DeviceAdded += (_, _) => Changed?.Invoke();
        notifications.DeviceRemoved += (_, _) => Changed?.Invoke();
        notifications.DefaultDeviceChanged += (_, _) => Changed?.Invoke();
        notifications.PropertyValueChanged += (_, _) => Changed?.Invoke();
    }

    public event Action? Changed;
    public bool ApplicationRoutingAvailable => applicationPolicy.Available;

    public IReadOnlyList<AudioEndpoint> List()
    {
        using var defaultRenderDevice = TryGetDefault(DataFlow.Render);
        using var defaultCaptureDevice = TryGetDefault(DataFlow.Capture);
        var defaultRender = defaultRenderDevice?.ID;
        var defaultCapture = defaultCaptureDevice?.ID;
        var endpoints = new List<AudioEndpoint>();

        using var devices = enumerator.EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active);
        for (var index = 0; index < devices.Count; index++)
        {
            using var device = devices[index];
            var isDefault = string.Equals(device.ID, defaultRender, StringComparison.OrdinalIgnoreCase)
                            || string.Equals(device.ID, defaultCapture, StringComparison.OrdinalIgnoreCase);
            float volume;
            bool muted;
            try
            {
                var endpointVolume = device.AudioEndpointVolume;
                volume = endpointVolume.MasterVolumeLevelScalar;
                muted = endpointVolume.Mute;
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
            using var sessions = output.AudioSessionManager.Sessions;
            for (var index = 0; index < sessions.Count; index++)
            {
                using var session = sessions[index];
                var processId = checked((int)session.GetProcessID);
                if (processId <= 0) continue;
                var processName = ResolveProcessName(processId);
                string? preferredEndpointId;
                try { preferredEndpointId = applicationPolicy.GetRenderEndpoint(processId); }
                catch { preferredEndpointId = null; }
                var preferredDestination = DestinationForEndpoint(virtualEndpoints, preferredEndpointId);
                result.Add(new AudioApplicationState(
                    session.GetSessionInstanceIdentifier,
                    string.IsNullOrWhiteSpace(session.DisplayName) ? processName : session.DisplayName,
                    processName,
                    processId,
                    preferredDestination ?? busId,
                    busId,
                    preferredDestination,
                    preferredDestination is null ? "unmanaged" : preferredDestination == busId ? "applied" : "pending-restart",
                    session.State == AudioSessionState.AudioSessionStateActive));
            }
        }
        return result;
    }

    public void RouteApplication(AudioApplicationRouteRequest request, VirtualEndpointSet virtualEndpoints)
    {
        request.Validate();
        using var process = Process.GetProcessById(request.ProcessId);
        if (process.HasExited)
        {
            throw new InvalidOperationException($"Process {request.ProcessId} has exited.");
        }

        applicationPolicy.SetRenderEndpoint(request.ProcessId, virtualEndpoints.ForBus(request.Destination).Id);
    }

    private MMDevice? TryGetDefault(DataFlow flow)
    {
        try { return enumerator.GetDefaultAudioEndpoint(flow, Role.Multimedia); }
        catch { return null; }
    }

    private static string ResolveProcessName(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            return process.ProcessName;
        }
        catch { return $"Process {processId}"; }
    }

    private static string? DestinationForEndpoint(VirtualEndpointSet endpoints, string? endpointId)
    {
        if (string.IsNullOrWhiteSpace(endpointId)) return null;
        if (string.Equals(endpointId, endpoints.Game.Id, StringComparison.OrdinalIgnoreCase)) return "game";
        if (string.Equals(endpointId, endpoints.Chat.Id, StringComparison.OrdinalIgnoreCase)) return "chat";
        if (string.Equals(endpointId, endpoints.Media.Id, StringComparison.OrdinalIgnoreCase)) return "media";
        return null;
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

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        notifications.Dispose();
        applicationPolicy.Dispose();
        enumerator.Dispose();
    }
}
