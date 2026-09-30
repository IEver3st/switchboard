using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class CableRoutingEngine : IAudioRoutingEngine
{
    private static readonly string[] BusIds = ["game", "chat", "media"];
    private readonly EndpointService endpoints;
    private readonly Func<IReadOnlyList<AudioProcessSession>> readSessions;
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
    private NamedPipeAudioOutput? chatOutput;
    private int disposed;
    private bool automatic = true;
    private readonly Dictionary<AudioProcessIdentity, string> failures = [];

    private CableRoutingEngine(EndpointService endpoints, AudioEndpoint sink, VirtualDriverState driver, Func<IReadOnlyList<AudioProcessSession>>? readSessions)
    {
        this.endpoints = endpoints;
        this.readSessions = readSessions ?? endpoints.ListProcessSessions;
        this.sink = sink;
        this.driver = driver;
        journal = new AudioRouteLeaseJournal(policy);
    }

    public event Action<Exception>? Failed;
    public VirtualDriverState Driver => driver;
    public string Backend => "vb-cable";
    public bool HasVirtualOutputs => false;
    public SpatialSession Spatial { get; } = new();
    public IReadOnlyList<AudioApplicationPreference> ApplicationRoutes => preferences
        .OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase).Select(pair => new AudioApplicationPreference(pair.Key, pair.Value)).ToArray();

    public static CableRoutingEngine Create(EndpointService endpoints, AudioHostSettings settings, Func<IReadOnlyList<AudioProcessSession>>? readSessions = null, string clipPipeName = NamedPipeAudioOutput.SystemPipeName)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 20348))
            throw new PlatformNotSupportedException("Application mixing requires Windows build 20348 or later.");
        var inventory = endpoints.List();
        var driver = CableEndpointCatalog.Inspect(inventory);
        var sink = CableEndpointCatalog.FindInput(inventory) ?? throw new InvalidOperationException(driver.Message);
        if (!endpoints.ApplicationRoutingAvailable) throw new InvalidOperationException("Windows application endpoint policy is unavailable.");
        var engine = new CableRoutingEngine(endpoints, sink, driver, readSessions);
        try
        {
            engine.Build(settings, inventory, clipPipeName);
            return engine;
        }
        catch { engine.Dispose(); throw; }
    }

    private void Build(AudioHostSettings settings, IReadOnlyCollection<AudioEndpoint> inventory, string clipPipeName)
    {
        Configure(settings);
        sessions = readSessions();
        journal.Recover(sessions.Select(session => session.Process));
        Dictionary<string, List<ISampleProvider>> byOutput = [];
        var replaySources = new ReplayTrackSources();
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
            sources.Add(Spatial.Wrap(new ProcessedSampleProvider(monitor, graph.CreateProcessor("personal", busId), meter), busId));
            replaySources.Add(busId, new ProcessedSampleProvider(recording, graph.CreateProcessor("clip", busId)));
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
        clipOutput = new NamedPipeAudioOutput(replaySources.System, clipPipeName);
        chatOutput = new NamedPipeAudioOutput(replaySources.Chat,
            clipPipeName == NamedPipeAudioOutput.SystemPipeName ? NamedPipeAudioOutput.ChatPipeName : clipPipeName + "-chat");
        clipOutput.Failed += OnFailed;
        chatOutput.Failed += OnFailed;
    }

    public void Configure(AudioHostSettings settings)
    {
        Spatial.Configure(settings.Spatial);
        graph.Configure(settings);
        if (automatic != settings.AutomaticApplicationRouting) failures.Clear();
        automatic = settings.AutomaticApplicationRouting;
        var nextPreferences = settings.ApplicationRoutes.ToDictionary(route => route.ExecutablePath, route => route.Destination, StringComparer.OrdinalIgnoreCase);
        foreach (var path in preferences.Keys.Concat(nextPreferences.Keys).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (preferences.GetValueOrDefault(path) == nextPreferences.GetValueOrDefault(path)) continue;
            externallyChanged.Remove(path);
            foreach (var failed in failures.Keys.Where(process => process.ExecutablePath.Equals(path, StringComparison.OrdinalIgnoreCase)).ToArray()) failures.Remove(failed);
        }
        preferences.Clear();
        foreach (var route in nextPreferences) preferences[route.Key] = route.Value;
    }

    public void Start()
    {
        foreach (var output in outputs) output.Start();
        clipOutput!.Start();
        chatOutput!.Start();
        Refresh();
    }

    public void Refresh()
    {
        sessions = readSessions();
        foreach (var route in routes.Values.ToArray())
        {
            if (Desired(route.Process) != route.BusId)
            {
                Remove(route);
                continue;
            }
            if (AudioProcessIdentity.TryRead(route.Process.Id) != route.Process)
            {
                Remove(route);
                continue;
            }
            if (route.Capture.Failure is { } failure)
            {
                failures[route.Process] = failure.Message;
                Remove(route);
                continue;
            }
            if (policy.ReadPreferences(route.Process.Id) != ApplicationAudioPolicy.PreferencesFor(sink.Id))
            {
                externallyChanged.Add(route.Process.ExecutablePath);
                Remove(route);
            }
        }
        // The host's existing 5-second control tick discovers new audio sessions
        // and app restarts. No extra timer/process remains when audio is disabled.
        var discovered = sessions.Select(session => session.Process).Distinct().ToArray();
        foreach (var stale in failures.Keys.Where(process => !discovered.Contains(process)).ToArray()) failures.Remove(stale);
        // Windows keeps a routed executable's redirect to the cable after it exits.
        // Release it as soon as the app runs again, even if it is no longer mixed;
        // otherwise its audio plays into a cable nothing is forwarding.
        foreach (var process in discovered)
        {
            if (!journal.HasLease(process.ExecutablePath)
                || routes.Values.Any(route => route.Process.ExecutablePath.Equals(process.ExecutablePath, StringComparison.OrdinalIgnoreCase))) continue;
            try { journal.Recover([process]); }
            catch (Exception error) { failures[process] = error.Message; }
        }
        foreach (var process in ApplicationRoutingPolicy.DiscoveryOrder(discovered, preferences, AudioProcessIdentity.IsInTree))
        {
            var busId = Desired(process);
            if (busId is null || routes.ContainsKey(process.Id) || externallyChanged.Contains(process.ExecutablePath)
                || failures.ContainsKey(process) || routes.Count >= 32) continue;
            // Idle sessions are routed when they first play; saved overrides also apply to idle apps.
            if (!preferences.ContainsKey(process.ExecutablePath) && !sessions.Any(session => session.Process == process && session.Active)) continue;
            if (AudioProcessIdentity.IsInTree(Environment.ProcessId, process.Id)
                || routes.Values.Any(route => AudioProcessIdentity.IsInTree(process.Id, route.Process.Id)
                    || AudioProcessIdentity.IsInTree(route.Process.Id, process.Id))) continue;
            try
            {
                if (!routes.Values.Any(route => route.Process.ExecutablePath.Equals(process.ExecutablePath, StringComparison.OrdinalIgnoreCase))) journal.Recover([process]);
                Add(process, busId);
            }
            catch (Exception error)
            {
                // A protected/exiting app must not interrupt every other application's audio.
                // Retry on app restart or an explicit preference change, not every control tick.
                failures[process] = error.Message;
            }
        }
        foreach (var route in routes.Values)
        {
            var tree = sessions.Where(session => AudioProcessIdentity.IsInTree(session.Process.Id, route.Process.Id)).ToArray();
            route.Capture.SetEnabled(CanPlay(tree.Select(session => (session.EndpointId, session.Active)), sink.Id));
        }
    }

    private string? Desired(AudioProcessIdentity process) => ApplicationRoutingPolicy.Destination(process.ExecutablePath, automatic, preferences);

    internal static bool CanPlay(IEnumerable<(string EndpointId, bool Active)> sessions, string sinkId)
    {
        var list = sessions.ToArray();
        return list.Any(session => session.EndpointId == sinkId)
            && !list.Any(session => session.Active && session.EndpointId != sinkId);
    }

    public void RouteApplication(AudioApplicationRouteRequest request)
    {
        request.Validate();
        sessions = readSessions();
        var process = sessions.FirstOrDefault(session => session.Process.Id == request.ProcessId)?.Process
            ?? throw new InvalidOperationException("That application no longer has an audio session.");
        // A process-loopback capture owns the whole tree. A chip for a child
        // therefore moves its existing owner instead of creating a second reader.
        process = ApplicationRoutingPolicy.CaptureRoot(process, routes.Values.Select(route => route.Process), AudioProcessIdentity.IsInTree);
        if (AudioProcessIdentity.IsInTree(Environment.ProcessId, process.Id))
            throw new InvalidOperationException("Switchboard and its parent processes cannot be routed into their own mixer.");
        var previous = preferences.GetValueOrDefault(process.ExecutablePath);
        if (preferences.Count >= 64 && previous is null) throw new InvalidOperationException("At most 64 application preferences are supported.");
        // One preference per executable matches Windows' endpoint policy scope.
        // Recreate readers on a bus move; never let two output threads read one ring.
        var existing = routes.Values.Where(route => route.Process.ExecutablePath.Equals(process.ExecutablePath, StringComparison.OrdinalIgnoreCase)
            || AudioProcessIdentity.IsInTree(route.Process.Id, process.Id)).ToArray();
        try
        {
            // A newly selected parent replaces any captures of its children.
            foreach (var route in existing) Remove(route);
            Add(process, request.Destination);
            preferences[process.ExecutablePath] = request.Destination;
            externallyChanged.Remove(process.ExecutablePath);
            failures.Remove(process);
            Refresh();
        }
        catch
        {
            if (routes.TryGetValue(process.Id, out var failed)) Remove(failed);
            if (previous is null) preferences.Remove(process.ExecutablePath);
            else preferences[process.ExecutablePath] = previous;
            // Reopen the previous owners if acquisition failed after teardown.
            // Keep the original failure even if an app exited during recovery.
            foreach (var route in existing)
                try { if (!routes.ContainsKey(route.Process.Id)) Add(route.Process, route.BusId); } catch { }
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

    public IReadOnlyList<AudioApplicationState> ListApplications() => sessions.Where(session => ApplicationRoutingPolicy.AutomaticDestination(session.Process.ExecutablePath) is not null
        && !AudioProcessIdentity.IsInTree(Environment.ProcessId, session.Process.Id)).GroupBy(session => session.Process).Select(group =>
    {
        var session = group.First();
        var owner = ApplicationRoutingPolicy.CaptureRoot(session.Process, routes.Values.Select(route => route.Process), AudioProcessIdentity.IsInTree);
        preferences.TryGetValue(owner.ExecutablePath, out var preferred);
        routes.TryGetValue(owner.Id, out var route);
        var desired = route?.BusId ?? Desired(session.Process);
        var destination = route?.BusId ?? desired ?? "game";
        var reason = failures.GetValueOrDefault(owner);
        if (route is null && desired is not null && group.Any(item => item.Active) && reason is null)
            reason = routes.Count >= 32 ? "The mixer is at its 32-app limit. Close an audio app to free a slot."
                : routes.Values.Any(other => AudioProcessIdentity.IsInTree(session.Process.Id, other.Process.Id)
                    || AudioProcessIdentity.IsInTree(other.Process.Id, session.Process.Id))
                    ? "This app shares a captured process tree. Use the parent app's category." : null;
        if (externallyChanged.Contains(owner.ExecutablePath)) reason = "Output changed in Windows. Choose a category again to resume mixing.";
        return new AudioApplicationState($"process:{session.Process.Id}:{session.Process.StartedAt}", session.Name,
            Path.GetFileNameWithoutExtension(session.Process.ExecutablePath), session.Process.Id, destination, route?.Capture.Enabled == true ? route.BusId : null,
            desired, reason is not null ? "unavailable" : route?.Capture.Enabled == true ? "applied" : route is not null ? "pending-restart" : "unmanaged",
            group.Any(item => item.Active), session.Process.ExecutablePath, preferred is null, reason);
    }).ToArray();

    public IReadOnlyDictionary<string, MeterValue> GetMeters() => meters.ToDictionary(pair => pair.Key, pair => pair.Value.Snapshot());
    private void OnFailed(Exception error) => Failed?.Invoke(error);

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        Spatial.Dispose();
        foreach (var route in routes.Values) route.Capture.SetEnabled(false);
        foreach (var route in routes.Values) route.Capture.Dispose();
        routes.Clear();
        PublishSources();
        clipOutput?.Dispose();
        chatOutput?.Dispose();
        foreach (var output in outputs) { output.Failed -= OnFailed; output.Dispose(); }
        foreach (var device in devices) device.Dispose();
        try { journal.RestoreAll(); }
        finally { journal.Dispose(); policy.Dispose(); }
    }

    private sealed record Route(AudioProcessIdentity Process, string BusId, ProcessAudioCapture Capture, ISampleProvider Personal, ISampleProvider Clip);
}
