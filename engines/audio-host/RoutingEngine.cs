using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class RoutingEngine : IDisposable
{
    private const int RingCapacitySamples = AudioConstants.SampleRate * AudioConstants.Channels;
    private static readonly string[] RenderBusIds = ["game", "chat", "media", "aux"];
    private readonly EndpointService endpoints;
    private readonly RoutingControlGraph graph;
    private readonly VirtualEndpointSet virtualEndpoints;
    private readonly List<MMDevice> openedDevices = [];
    private readonly List<CaptureFanOut> captures = [];
    private readonly List<AudioOutput> outputs = [];
    private readonly Dictionary<string, RealtimeMeter> meters = new(StringComparer.OrdinalIgnoreCase);
    private int disposed;
    private int failureRaised;

    private RoutingEngine(EndpointService endpoints, RoutingControlGraph graph, VirtualEndpointSet virtualEndpoints)
    {
        this.endpoints = endpoints;
        this.graph = graph;
        this.virtualEndpoints = virtualEndpoints;
    }

    public event Action<Exception>? Failed;
    public VirtualEndpointSet VirtualEndpoints => virtualEndpoints;

    public static RoutingEngine Create(
        EndpointService endpoints,
        AudioHostSettings configuration,
        ISampleProvider virtualMicrophoneSource,
        ISampleProvider streamMicrophoneSource)
    {
        var graph = new RoutingControlGraph();
        graph.Configure(configuration);
        var discovered = endpoints.List();
        var virtualEndpoints = EndpointCatalog.Inspect(discovered);
        if (!virtualEndpoints.Ready)
        {
            throw new InvalidOperationException(
                $"{virtualEndpoints.Snapshot().Message} Missing: {string.Join(", ", virtualEndpoints.Missing)}.");
        }

        var engine = new RoutingEngine(endpoints, graph, virtualEndpoints);
        try
        {
            engine.Build(discovered, configuration, virtualMicrophoneSource, streamMicrophoneSource);
            return engine;
        }
        catch
        {
            engine.Dispose();
            throw;
        }
    }

    public void Start()
    {
        foreach (var output in outputs) output.Start();
        foreach (var capture in captures) capture.Start();
    }

    public IReadOnlyDictionary<string, MeterValue> GetMeters() => meters.ToDictionary(
        pair => pair.Key,
        pair => pair.Value.Snapshot(),
        StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<AudioApplicationState> ListApplications() => endpoints.ListApplications(virtualEndpoints);
    public void Configure(AudioHostSettings configuration) => graph.Configure(configuration);

    private void Build(
        IReadOnlyCollection<AudioEndpoint> discovered,
        AudioHostSettings configuration,
        ISampleProvider virtualMicrophoneSource,
        ISampleProvider streamMicrophoneSource)
    {
        var configurations = configuration.Buses.ToDictionary(bus => bus.Id, StringComparer.OrdinalIgnoreCase);
        var physicalOutputs = new Dictionary<string, List<ISampleProvider>>(StringComparer.OrdinalIgnoreCase);
        var streamSources = new List<ISampleProvider>();

        foreach (var busId in RenderBusIds)
        {
            if (!configurations.TryGetValue(busId, out var bus))
                throw new InvalidOperationException($"The {busId} bus has no routing configuration.");
            var physical = RequirePhysicalEndpoint(discovered, bus.DeviceId, "render", $"{busId} output");
            var personalRing = new SpscFloatRing(RingCapacitySamples);
            var streamRing = new SpscFloatRing(RingCapacitySamples);
            var captureDevice = Open(virtualEndpoints.ForBus(busId).Id);
            AddCapture(new CaptureFanOut(captureDevice, loopback: true, personalRing, streamRing));

            var meter = new RealtimeMeter();
            meters[busId] = meter;
            AddSource(physicalOutputs, physical.Id,
                new ProcessedSampleProvider(personalRing, graph.CreateProcessor(busId), meter));
            streamSources.Add(new ProcessedSampleProvider(streamRing, graph.CreateProcessor(busId)));
        }

        var microphoneOutputDevice = Open(virtualEndpoints.MicrophoneRender.Id);
        AddOutput(new AudioOutput(microphoneOutputDevice, virtualMicrophoneSource));
        streamSources.Add(streamMicrophoneSource);

        foreach (var destination in physicalOutputs)
        {
            var device = Open(destination.Key);
            AddOutput(new AudioOutput(device, new FixedMixer(destination.Value)));
        }

        var streamOutputDevice = Open(virtualEndpoints.StreamRender.Id);
        AddOutput(new AudioOutput(streamOutputDevice, new FixedMixer(streamSources)));
    }

    private MMDevice Open(string endpointId)
    {
        var device = endpoints.Open(endpointId);
        openedDevices.Add(device);
        return device;
    }

    private void AddCapture(CaptureFanOut capture)
    {
        capture.Failed += OnRouteFailed;
        captures.Add(capture);
    }

    private void AddOutput(AudioOutput output)
    {
        output.Failed += OnRouteFailed;
        outputs.Add(output);
    }

    private void OnRouteFailed(Exception error)
    {
        if (Interlocked.Exchange(ref failureRaised, 1) == 0) Failed?.Invoke(error);
    }

    private static void AddSource(
        IDictionary<string, List<ISampleProvider>> destinations,
        string endpointId,
        ISampleProvider source)
    {
        if (!destinations.TryGetValue(endpointId, out var sources))
        {
            sources = [];
            destinations[endpointId] = sources;
        }
        sources.Add(source);
    }

    private static AudioEndpoint RequirePhysicalEndpoint(
        IReadOnlyCollection<AudioEndpoint> discovered,
        string endpointId,
        string flow,
        string purpose)
    {
        var endpoint = discovered.FirstOrDefault(candidate =>
            string.Equals(candidate.Id, endpointId, StringComparison.OrdinalIgnoreCase)
            && string.Equals(candidate.Flow, flow, StringComparison.OrdinalIgnoreCase));
        if (endpoint is null) throw new InvalidOperationException($"The selected {purpose} is disconnected or unavailable.");
        if (endpoint.IsSwitchboard)
            throw new InvalidOperationException($"{endpoint.Name} cannot be used as its own {purpose}; choose a physical device.");
        return endpoint;
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        for (var index = captures.Count - 1; index >= 0; index--)
        {
            captures[index].Failed -= OnRouteFailed;
            captures[index].Dispose();
        }
        for (var index = outputs.Count - 1; index >= 0; index--)
        {
            outputs[index].Failed -= OnRouteFailed;
            outputs[index].Dispose();
        }
        for (var index = openedDevices.Count - 1; index >= 0; index--) openedDevices[index].Dispose();
        captures.Clear();
        outputs.Clear();
        openedDevices.Clear();
    }
}
