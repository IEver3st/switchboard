namespace Switchboard.AudioHost;

internal interface IAudioRoutingEngine : IDisposable
{
    event Action<Exception>? Failed;
    VirtualDriverState Driver { get; }
    string Backend { get; }
    bool HasVirtualOutputs { get; }
    IReadOnlyList<AudioApplicationPreference> ApplicationRoutes { get; }
    void Start();
    void Configure(AudioHostSettings settings);
    void Refresh();
    IReadOnlyDictionary<string, MeterValue> GetMeters();
    IReadOnlyList<AudioApplicationState> ListApplications();
    void RouteApplication(AudioApplicationRouteRequest request);
}
