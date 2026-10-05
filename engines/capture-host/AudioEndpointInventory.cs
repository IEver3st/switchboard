using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using NAudio.CoreAudioApi;

namespace Switchboard.CaptureHost;

// One-shot inventory of active Windows audio endpoints for clip track pickers.
// Every COM object is released before the method returns; nothing is held open.
internal sealed record AudioEndpointInfo(
    string Id,
    string Name,
    string Flow,
    bool IsDefault,
    string? FormFactor = null,
    string? InterfaceName = null);

internal static class AudioEndpointInventory
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static IReadOnlyList<AudioEndpointInfo> List()
    {
        using var enumerator = new MMDeviceEnumerator();
        var defaults = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var flow in new[] { DataFlow.Render, DataFlow.Capture })
            foreach (var role in new[] { Role.Multimedia, Role.Console })
                if (TryGetDefaultId(enumerator, flow, role) is { } id) defaults.Add($"{FlowName(flow)}:{id}");

        var endpoints = new List<AudioEndpointInfo>();
        using var devices = enumerator.EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active);
        for (var index = 0; index < devices.Count; index++)
        {
            try
            {
                using var device = devices[index];
                var flow = FlowName(device.DataFlow);
                endpoints.Add(new AudioEndpointInfo(
                    device.ID,
                    device.FriendlyName,
                    flow,
                    defaults.Contains($"{flow}:{device.ID}"),
                    TryGetFormFactor(device),
                    TryGetInterfaceName(device)));
            }
            catch (COMException) { /* Endpoint disappeared during inventory. */ }
        }

        return endpoints
            .OrderBy(endpoint => endpoint.Flow, StringComparer.Ordinal)
            .ThenByDescending(endpoint => endpoint.IsDefault)
            .ThenBy(endpoint => endpoint.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static string Serialize(IEnumerable<AudioEndpointInfo> endpoints)
        => JsonSerializer.Serialize(endpoints, JsonOptions);

    // Values match EndpointFormFactor in mmdeviceapi.h and audioEndpointFormFactorSchema.
    internal static string FormFactorName(uint value) => value switch
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

    private static string FlowName(DataFlow flow) => flow == DataFlow.Capture ? "capture" : "render";

    private static string? TryGetDefaultId(MMDeviceEnumerator enumerator, DataFlow flow, Role role)
    {
        try
        {
            using var device = enumerator.GetDefaultAudioEndpoint(flow, role);
            return device.ID;
        }
        catch (COMException) { return null; }
    }

    private static string? TryGetFormFactor(MMDevice device)
    {
        try { return FormFactorName(Convert.ToUInt32(device.Properties[PropertyKeys.PKEY_AudioEndpoint_FormFactor].Value)); }
        catch { return null; }
    }

    private static string? TryGetInterfaceName(MMDevice device)
    {
        try { return device.DeviceFriendlyName; }
        catch { return null; }
    }
}
