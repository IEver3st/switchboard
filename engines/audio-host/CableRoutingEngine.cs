using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class CableRoutingEngine : IAudioRoutingEngine
{
    private static readonly string[] BusIds = ["game", "chat", "media"];
    private readonly EndpointService endpoints;
    private readonly AudioEndpoint sink;
    private readonly VirtualDriverState driver;
    private readonly ApplicationAudioPolicy policy = new();
    private readonly AudioRouteLeaseJournal journal;
    private readonly RoutingControlGraph graph = new();
    private readonly Dictionary<string, string> preferences = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> externallyChanged = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<int, Route> routes = [];
    private readonly Dictionary<string, DynamicAudioMixer> personal = [];
    private readonly Dictionary<string, DynamicAudioMixer> clip = [];
    private readonly Dictionary<string, RealtimeMeter> meters = [];
    private readonly List<MMDevice> devices = [];
    private readonly List<AudioOutput> outputs = [];
    private IReadOnlyList<AudioProcessSession> sessions = [];
    private NamedPipeAudioOutput? clipOutput;
    private int disposed;

    private CableRoutingEngine(EndpointService endpoints, AudioEndpoint sink, VirtualDriverState driver)
    {
        this.endpoints = endpoints;
        this.sink = sink;
        this.driver = driver;
        journal = new AudioRouteLeaseJournal(policy);
    }

    public event Action<Exception>? Failed;
    public VirtualDriverState Driver => driver;
    public string Backend => "vb-cable";
    public bool HasVirtualOutputs => false;
    public IReadOnlyList<AudioApplicationPreference> ApplicationRoutes => preferences
        .OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase).Select(pair => new AudioApplicationPreference(pair.Key, pair.Value)).ToArray();

    public static CableRoutingEngine Create(EndpointService endpoints, AudioHostSettings settings)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 20348))
            throw new PlatformNotSupportedException("Application mixing requires Windows build 20348 or later.");
        var inventory = endpoints.List();
        var driver = CableEndpointCatalog.Inspect(inventory);
        var sink = CableEndpointCatalog.FindInput(inventory) ?? throw new InvalidOperationException(driver.Message);
        if (!endpoints.ApplicationRoutingAvailable) throw new InvalidOperationException("Windows application endpoint policy is unavailable.");
        var engine = new CableRoutingEngine(endpoints, sink, driver);
        try
        {
            engine.Build(settings, inventory);
            return engine;
        }
        catch { engine.Dispose(); throw; }
    }

    private void Build(AudioHostSettings settings, IReadOnlyCollection<AudioEndpoint> inventory)
    {
        Configure(settings);
        sessions = endpoints.ListProcessSessions();
        journal.Recover(sessions.Select(session => session.Process));
        Dictionary<string, List<ISampleProvider>> byOutput = [];
        List<ISampleProvider> clipSources = [];
        foreach (var busId in BusIds)
        {
            var configured = settings.Buses.SingleOrDefault(bus => bus.Id == busId)
                ?? throw new InvalidOperationException($"The {busId} output is not configured.");
            var destination = inventory.FirstOrDefault(endpoint => endpoint.Id == configured.DeviceId && endpoint.Flow == "render")
                ?? throw new InvalidOperationException($"Select a connected physical output for {busId}.");
            if (CableEndpointCatalog.IsVirtual(destination))
                throw new InvalidOperationException($"Choose physical headphones or speakers for {busId}; virtual outputs can create audio feedback.");
            var monitor = personal[busId] = new DynamicAudioMixer();
            var recording = clip[busId] = new DynamicAudioMixer();
            var meter = meters[busId] = new RealtimeMeter();
            if (!byOutput.TryGetValue(destination.Id, out var sources)) byOutput[destination.Id] = sources = [];
            sources.Add(new ProcessedSampleProvider(monitor, graph.CreateProcessor("personal", busId), meter));
            clipSources.Add(new ProcessedSampleProvider(recording, graph.CreateProcessor("clip", busId)));
        }
        // Capture.Host records its microphone track separately. This pipe must
        // contain applications only, including when Capture's microphone is off.
        foreach (var (id, sources) in byOutput)
        {
            var device = endpoints.Open(id);
            devices.Add(device);
            var output = new AudioOutput(device, new FixedMixer(sources));
            output.Failed += OnFailed;
            outputs.Add(output);
        }
        clipOutput = new NamedPipeAudioOutput(new FixedMixer(clipSources));
    }

    public void Configure(AudioHostSettings settings)
    {
        graph.Configure(settings);
        preferences.Clear();
        foreach (var route in settings.ApplicationRoutes) preferences[route.ExecutablePath] = route.Destination;
    }

    public void Start()
    {
        foreach (var output in outputs) output.Start();
        clipOutput!.Start();
        Refresh();
    }

    public void Refresh()
    {
        sessions = endpoints.ListProcessSessions();
        foreach (var route in routes.Values.ToArray())
        {
            if (!preferences.TryGetValue(route.Process.ExecutablePath, out var desired) || desired != route.BusId)
            {
                Remove(route);
                continue;
            }
            if (AudioProcessIdentity.TryRead(route.Process.Id) != route.Process)
            {
                Remove(route);
                continue;
            }
            if (route.Capture.Failure is { } failure) throw new InvalidOperationException("An application capture failed.", failure);
            if (policy.ReadPreferences(route.Process.Id) != ApplicationAudioPolicy.PreferencesFor(sink.Id))
            {
                externallyChanged.Add(route.Process.ExecutablePath);
                Remove(route);
            }
        }
        // The host's existing 5-second control tick discovers new audio sessions
        // and app restarts. No extra timer/process remains when audio is disabled.
        foreach (var process in sessions.Select(session => session.Process).Distinct())
        {
            if (routes.ContainsKey(process.Id) || externallyChanged.Contains(process.ExecutablePath)
                || !preferences.TryGetValue(process.ExecutablePath, out var busId)) continue;
            if (!routes.Values.Any(route => route.Process.ExecutablePath.Equals(process.ExecutablePath, StringComparison.OrdinalIgnoreCase))) journal.Recover([process]);
            Add(process, busId);
        }
        foreach (var route in routes.Values)
        {
            var tree = sessions.Where(session => AudioProcessIdentity.IsInTree(session.Process.Id, route.Process.Id)).ToArray();
            route.Capture.SetEnabled(CanPlay(tree.Select(session => (session.EndpointId, session.Active)), sink.Id));
        }
    }

    internal static bool CanPlay(IEnumerable<(string EndpointId, bool Active)> sessions, string sinkId)
    {
        var list = sessions.ToArray();
        return list.Any(session => session.EndpointId == sinkId)
            && !list.Any(session => session.Active && session.EndpointId != sinkId);
    }

    public void RouteApplication(AudioApplicationRouteRequest request)
    {
        request.Validate();
        sessions = endpoints.ListProcessSessions();
        var process = sessions.FirstOrDefault(session => session.Process.Id == request.ProcessId)?.Process
            ?? throw new InvalidOperationException("That application no longer has an audio session.");
        var previous = preferences.GetValueOrDefault(process.ExecutablePath);
        if (preferences.Count >= 64 && previous is null) throw new InvalidOperationException("At most 64 application preferences are supported.");
        // One preference per executable matches Windows' endpoint policy scope.
        // Recreate readers on a bus move; never let two output threads read one ring.
        var existing = routes.Values.Where(route => route.Process.ExecutablePath.Equals(process.ExecutablePath, StringComparison.OrdinalIgnoreCase)).ToArray();
        foreach (var route in existing) Remove(route);
        try
        {
            Add(process, request.Destination);
            preferences[process.ExecutablePath] = request.Destination;
            externallyChanged.Remove(process.ExecutablePath);
            Refresh();
        }
        catch
        {
            if (routes.TryGetValue(process.Id, out var failed)) Remove(failed);
            if (previous is null) preferences.Remove(process.ExecutablePath);
            else preferences[process.ExecutablePath] = previous;
            throw;
        }
    }

    private void Add(AudioProcessIdentity process, string busId)
    {
        if (routes.Count >= 32) throw new InvalidOperationException("At most 32 application captures can run together.");
        if (AudioProcessIdentity.IsInTree(Environment.ProcessId, process.Id))
            throw new InvalidOperationException("Switchboard and its parent processes cannot be routed into their own mixer.");
        if (routes.Values.Any(route => AudioProcessIdentity.IsInTree(process.Id, route.Process.Id)
            || AudioProcessIdentity.IsInTree(route.Process.Id, process.Id)))
            throw new InvalidOperationException("A parent or child of this application is already captured. Route only one process in each tree.");
        var capture = new ProcessAudioCapture(process.Id);
        try
        {
            capture.Start();
            journal.Acquire(process, sink.Id);
            routes.Add(process.Id, new(process, busId, capture, capture.PersonalSource, capture.ClipSource));
            PublishSources();
        }
        catch { capture.Dispose(); journal.Restore(process); throw; }
    }

    private void Remove(Route route)
    {
        route.Capture.SetEnabled(false);
        routes.Remove(route.Process.Id);
        PublishSources();
        route.Capture.Dispose();
        journal.Restore(route.Process);
    }

    private void PublishSources()
    {
        foreach (var busId in BusIds)
        {
            if (personal.TryGetValue(busId, out var monitor)) monitor.SetSources(routes.Values.Where(route => route.BusId == busId).Select(route => route.Personal));
            if (clip.TryGetValue(busId, out var recording)) recording.SetSources(routes.Values.Where(route => route.BusId == busId).Select(route => route.Clip));
        }
    }

    public IReadOnlyList<AudioApplicationState> ListApplications() => sessions.GroupBy(session => session.Process).Select(group =>
    {
        var session = group.First();
        preferences.TryGetValue(session.Process.ExecutablePath, out var preferred);
        routes.TryGetValue(session.Process.Id, out var route);
        var destination = route?.BusId ?? preferred ?? "game";
        return new AudioApplicationState($"process:{session.Process.Id}:{session.Process.StartedAt}", session.Name,
            Path.GetFileNameWithoutExtension(session.Process.ExecutablePath), session.Process.Id, destination, route?.Capture.Enabled == true ? route.BusId : null,
            preferred, preferred is null ? "unmanaged" : route?.Capture.Enabled == true ? "applied" : "pending-restart", group.Any(item => item.Active));
    }).ToArray();

    public IReadOnlyDictionary<string, MeterValue> GetMeters() => meters.ToDictionary(pair => pair.Key, pair => pair.Value.Snapshot());
    private void OnFailed(Exception error) => Failed?.Invoke(error);

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        foreach (var route in routes.Values) route.Capture.SetEnabled(false);
        foreach (var route in routes.Values) route.Capture.Dispose();
        routes.Clear();
        PublishSources();
        clipOutput?.Dispose();
        foreach (var output in outputs) { output.Failed -= OnFailed; output.Dispose(); }
        foreach (var device in devices) device.Dispose();
        try { journal.RestoreAll(); }
        finally { journal.Dispose(); policy.Dispose(); }
    }

    private sealed record Route(AudioProcessIdentity Process, string BusId, ProcessAudioCapture Capture, ISampleProvider Personal, ISampleProvider Clip);
}
