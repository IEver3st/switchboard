namespace Switchboard.AudioHost;

// Match the driver's interface as well as the endpoint name. A renamed physical
// device or the 16-channel sibling must never be mistaken for the stereo sink.
internal static class CableEndpointCatalog
{
    public const string InterfaceName = "VB-Audio Virtual Cable";
    public static AudioEndpoint? FindInput(IEnumerable<AudioEndpoint> endpoints) => endpoints.FirstOrDefault(endpoint =>
        endpoint.Flow == "render"
        && string.Equals(endpoint.InterfaceName, InterfaceName, StringComparison.OrdinalIgnoreCase)
        && (EndpointCatalog.FriendlyNameMatches(endpoint.Name, "CABLE Input")
            || EndpointCatalog.FriendlyNameMatches(endpoint.Name, "Speakers")));

    public static bool IsVirtual(AudioEndpoint endpoint) => endpoint.IsSwitchboard
        || (endpoint.InterfaceName ?? endpoint.Name).Contains("Virtual", StringComparison.OrdinalIgnoreCase);

    public static VirtualDriverState Inspect(IReadOnlyCollection<AudioEndpoint> endpoints)
    {
        var input = FindInput(endpoints);
        var available = endpoints.Where(endpoint => string.Equals(endpoint.InterfaceName, InterfaceName, StringComparison.OrdinalIgnoreCase))
            .Select(endpoint => new DriverEndpoint(endpoint.Id, endpoint.Name, endpoint.Flow)).ToArray();
        return new VirtualDriverState(input is null ? "not-installed" : "ready", InterfaceName,
            input is null ? ["CABLE Input (render)"] : [], available,
            input is null ? "Install the free standard VB-CABLE and restart Windows to enable application mixing."
                : "VB-CABLE application mixing: personal and clip mixes. Separate virtual microphone and stream outputs are unavailable with one cable.");
    }
}
