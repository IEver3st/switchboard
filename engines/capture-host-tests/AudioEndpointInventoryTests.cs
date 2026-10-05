using System.Text.Json;
using Switchboard.CaptureHost;

internal static class AudioEndpointInventoryTests
{
    public static void Run()
    {
        var json = AudioEndpointInventory.Serialize([
            new AudioEndpointInfo("{0.0.0.00000000}.{render}", "Speakers", "render", true, "speakers", "Realtek Audio"),
            new AudioEndpointInfo("{0.0.1.00000000}.{capture}", "Microphone", "capture", false),
        ]);
        using var document = JsonDocument.Parse(json);
        var endpoints = document.RootElement.EnumerateArray().ToArray();
        if (endpoints.Length != 2) throw new Exception("Endpoint inventory must serialize every endpoint.");
        var full = endpoints[0].EnumerateObject().Select(property => property.Name).ToArray();
        if (!full.SequenceEqual(["id", "name", "flow", "isDefault", "formFactor", "interfaceName"]))
            throw new Exception($"Endpoint JSON must use camelCase contract names, got {string.Join(", ", full)}.");
        var sparse = endpoints[1].EnumerateObject().Select(property => property.Name).ToArray();
        if (!sparse.SequenceEqual(["id", "name", "flow", "isDefault"]))
            throw new Exception("Unknown endpoint properties must be omitted rather than serialized as null.");
        if (endpoints[0].GetProperty("isDefault").ValueKind != JsonValueKind.True
            || endpoints[1].GetProperty("flow").GetString() != "capture")
            throw new Exception("Endpoint flow and default state must round-trip.");

        string[] contract = ["remote-network-device", "speakers", "line-level", "headphones", "microphone",
            "headset", "handset", "spdif", "digital-display", "unknown"];
        var emitted = Enumerable.Range(0, 12).Select(value => AudioEndpointInventory.FormFactorName((uint)value)).Distinct().ToArray();
        if (emitted.Except(contract).Any() || contract.Except(emitted).Any())
            throw new Exception("Endpoint form factors must match audioEndpointFormFactorSchema.");
        if (AudioEndpointInventory.FormFactorName(7) != "unknown" || AudioEndpointInventory.FormFactorName(10) != "unknown")
            throw new Exception("Unknown and passthrough form factors must map to unknown.");
        Console.WriteLine("Audio endpoint inventory JSON shape passed.");
    }
}
