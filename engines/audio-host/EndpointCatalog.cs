namespace Switchboard.AudioHost;

internal static class EndpointCatalog
{
    public const string Game = "Switchboard Audio - Gaming";
    public const string Chat = "Switchboard Audio - Chat";
    public const string Media = "Switchboard Audio - Media";
    public const string Auxiliary = "Switchboard Audio - Aux";
    public const string Microphone = "Switchboard Audio - Microphone";
    public const string Stream = "Switchboard Audio - Stream";

    private static readonly (string Name, string Flow)[] Expected =
    [
        (Game, "render"),
        (Chat, "render"),
        (Media, "render"),
        (Auxiliary, "render"),
        (Microphone, "render"),
        (Stream, "render"),
        (Microphone, "capture"),
        (Stream, "capture"),
    ];

    public static VirtualEndpointSet Inspect(IReadOnlyCollection<AudioEndpoint> endpoints)
    {
        var matches = new Dictionary<string, AudioEndpoint>(StringComparer.OrdinalIgnoreCase);
        var missing = new List<string>();
        foreach (var expected in Expected)
        {
            var endpoint = endpoints.FirstOrDefault(candidate =>
                candidate.IsSwitchboard
                && string.Equals(candidate.Flow, expected.Flow, StringComparison.OrdinalIgnoreCase)
                && FriendlyNameMatches(candidate.Name, expected.Name));
            var key = Key(expected.Name, expected.Flow);
            if (endpoint is null) missing.Add($"{expected.Name} ({expected.Flow})");
            else matches[key] = endpoint;
        }
        return new VirtualEndpointSet(matches, missing);
    }

    public static bool IsSwitchboard(string name, string? interfaceName) =>
        string.Equals(interfaceName, AudioConstants.InterfaceName, StringComparison.OrdinalIgnoreCase)
        || name.Contains(AudioConstants.InterfaceName, StringComparison.OrdinalIgnoreCase);

    public static bool FriendlyNameMatches(string actual, string expected) =>
        string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)
        || actual.StartsWith($"{expected} (", StringComparison.OrdinalIgnoreCase);

    internal static string Key(string name, string flow) => $"{flow}:{name}";
}

internal sealed class VirtualEndpointSet(
    IReadOnlyDictionary<string, AudioEndpoint> endpoints,
    IReadOnlyCollection<string> missing)
{
    public bool Ready => missing.Count == 0;
    public IReadOnlyCollection<string> Missing => missing;
    public AudioEndpoint Game => Get(EndpointCatalog.Game, "render");
    public AudioEndpoint Chat => Get(EndpointCatalog.Chat, "render");
    public AudioEndpoint Media => Get(EndpointCatalog.Media, "render");
    public AudioEndpoint Auxiliary => Get(EndpointCatalog.Auxiliary, "render");
    public AudioEndpoint MicrophoneRender => Get(EndpointCatalog.Microphone, "render");
    public AudioEndpoint StreamRender => Get(EndpointCatalog.Stream, "render");
    public AudioEndpoint MicrophoneCapture => Get(EndpointCatalog.Microphone, "capture");
    public AudioEndpoint StreamCapture => Get(EndpointCatalog.Stream, "capture");

    public VirtualDriverState Snapshot()
    {
        var discovered = endpoints.Values
            .Select(endpoint => new DriverEndpoint(endpoint.Id, endpoint.Name, endpoint.Flow))
            .OrderBy(endpoint => endpoint.Flow)
            .ThenBy(endpoint => endpoint.Name)
            .ToArray();
        var message = Ready
            ? "All eight Switchboard transport endpoints are active."
            : $"Switchboard Virtual Audio Device is missing {missing.Count} required endpoint{(missing.Count == 1 ? string.Empty : "s")}.";
        return new VirtualDriverState(
            Ready ? "ready" : discovered.Length == 0 ? "not-installed" : "incomplete",
            AudioConstants.InterfaceName,
            missing,
            discovered,
            message);
    }

    public AudioEndpoint ForBus(string busId) => busId.ToLowerInvariant() switch
    {
        "game" => Game,
        "chat" => Chat,
        "media" => Media,
        "aux" => Auxiliary,
        _ => throw new ArgumentOutOfRangeException(nameof(busId)),
    };

    private AudioEndpoint Get(string name, string flow) => endpoints[EndpointCatalog.Key(name, flow)];
}
