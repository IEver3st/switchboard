using System.Diagnostics;
using Switchboard.AudioHost.NoiseSuppression;

namespace Switchboard.AudioHost;

internal sealed class AudioEngine : IDisposable
{
    private readonly object controlGate = new();
    private readonly EndpointService endpoints;
    private INoiseSuppressor suppressor = new BypassNoiseSuppressor("The noise backend has not been initialized.");
    private MicrophonePipeline? microphone;
    private MicrophoneCableOutput? microphoneOutput;
    private NamedPipeAudioOutput? microphoneCapture;
    private readonly RoutingControlGraph recordingGraph = new();
    private IAudioRoutingEngine? routing;
    private AudioHostSettings? settings;
    private MicrophoneDspConfiguration? dspConfiguration;
    private long configurationVersion;
    private long meterSequence;
    private int endpointChangePending;
    private int routingRecoveryPending;
    private string? endpointTopology;
    private bool running;
    private bool disposed;
    private string? error;
    private string? routingError;
    private Exception? routingFailure;
    private double modelInitializationMs;
    private DateTimeOffset startedAt;

    public AudioEngine(EndpointService endpoints)
    {
        this.endpoints = endpoints;
        endpoints.Changed += OnEndpointsChanged;
    }

    public event Action<AudioHostSnapshot>? SnapshotChanged;

    public AudioHostSnapshot Start(AudioHostSettings nextSettings)
    {
        lock (controlGate)
        {
            ThrowIfDisposed();
            var validated = nextSettings.Validate();
            var nextDsp = MicrophoneDspConfiguration.From(validated, configurationVersion + 1);
            StopCore();
            settings = validated;
            recordingGraph.Configure(validated);
            InitializeSuppressorCore();
            configurationVersion++;
            dspConfiguration = nextDsp;
            running = true;
            startedAt = DateTimeOffset.UtcNow;
            StartMicrophoneCore();
            try { StartRoutingCore(); }
            catch (Exception routeStartError)
            {
                routing?.Dispose();
                routing = null;
                routingError = $"Virtual audio routing is unavailable: {routeStartError.Message}";
            }
            var snapshot = GetSnapshotCore();
            SnapshotChanged?.Invoke(snapshot);
            return snapshot;
        }
    }

    public AudioHostSnapshot Configure(AudioHostSettings nextSettings)
    {
        lock (controlGate)
        {
            ThrowIfDisposed();
            var previousSettings = settings;
            var validated = nextSettings.Validate();
            var nextDsp = MicrophoneDspConfiguration.From(validated, configurationVersion + 1);
            settings = validated;
            recordingGraph.Configure(validated);
            configurationVersion++;
            dspConfiguration = nextDsp;
            if (!running) return GetSnapshotCore();

            var nextInputId = settings.MicrophoneBus?.DeviceId;
            var inputChanged = microphone is null || !string.Equals(microphone.InputDeviceId, nextInputId, StringComparison.OrdinalIgnoreCase);
            var routesChanged = previousSettings is null || !RouteSignature(previousSettings).Equals(RouteSignature(settings), StringComparison.OrdinalIgnoreCase);
            if (inputChanged)
            {
                routing?.Dispose();
                routing = null;
                StopMicrophoneOutput();
                microphone?.Dispose();
                microphone = null;
                InitializeSuppressorCore();
                StartMicrophoneCore();
            }
            else
            {
                try
                {
                    microphone!.UpdateConfiguration(settings, dspConfiguration);
                    microphoneOutput?.SetEnabled(settings.MicrophoneBus?.Enabled == true);
                    error = null;
                }
                catch (Exception configurationError)
                {
                    // Monitoring is optional. Keep capture and the processed host boundary alive.
                    error = configurationError.Message;
                }
            }
            try
            {
                if (routing is null || routesChanged || inputChanged)
                {
                    routing?.Dispose();
                    routing = null;
                    StartRoutingCore();
                }
                else
                {
                    routing.Configure(settings);
                    if (previousSettings?.AutomaticApplicationRouting != settings.AutomaticApplicationRouting
                        || !previousSettings.ApplicationRoutes.SequenceEqual(settings.ApplicationRoutes)) routing.Refresh();
                }
            }
            catch (Exception routingError)
            {
                routing?.Dispose();
                routing = null;
                this.routingError = $"Virtual audio routing is unavailable: {routingError.Message}";
            }
            var snapshot = GetSnapshotCore();
            SnapshotChanged?.Invoke(snapshot);
            return snapshot;
        }
    }

    public AudioHostSnapshot Stop()
    {
        lock (controlGate)
        {
            StopCore();
            var snapshot = GetSnapshotCore();
            SnapshotChanged?.Invoke(snapshot);
            return snapshot;
        }
    }

    public AudioHostSnapshot RouteApplication(AudioApplicationRouteRequest request)
    {
        lock (controlGate)
        {
            ThrowIfDisposed();
            if (!running || routing is null) throw new InvalidOperationException("Virtual audio routing is not running.");
            if (!endpoints.ApplicationRoutingAvailable)
                throw new InvalidOperationException("Windows application audio routing is unavailable on this OS build.");
            routing.RouteApplication(request.Validate());
            if (settings is not null && routing.Backend == "vb-cable") settings.ApplicationRoutes = routing.ApplicationRoutes;
            var snapshot = GetSnapshotCore();
            SnapshotChanged?.Invoke(snapshot);
            return snapshot;
        }
    }

    public AudioHostSnapshot GetSnapshot()
    {
        lock (controlGate) return GetSnapshotCore();
    }

    public AudioHostSnapshot RecenterSpatial()
    {
        lock (controlGate)
        {
            if (!running || routing is null) throw new InvalidOperationException("Start audio routing before centering the stage.");
            routing.Spatial.Recenter();
            var snapshot = GetSnapshotCore();
            SnapshotChanged?.Invoke(snapshot);
            return snapshot;
        }
    }

    public AudioHostSnapshot ConnectHeadsetTracking()
    {
        lock (controlGate)
        {
            if (!running || routing is null || settings?.Spatial is not { AnyEnabled: true, TrackingEnabled: true, TrackingSource: "headset" })
                throw new InvalidOperationException("Enable headset tracking first.");
            if (routing.Spatial.Current.Tracker?.Name is not null) return GetSnapshotCore();
            if (!SonyBluetoothTracking.NeedsDriverRepair())
            {
                SonyBluetoothTracking.EnableConnectedHeadset();
                routing.Spatial.Refresh();
                return GetSnapshotCore();
            }
        }
        // The Windows approval prompt can take a while; never hold the control lock across it.
        SonyBluetoothTracking.RepairSensorDriver();
        lock (controlGate)
        {
            ThrowIfDisposed();
            routing?.Spatial.Refresh();
            return GetSnapshotCore();
        }
    }

    public Task RunMicrophoneTestAsync(CancellationToken cancellationToken)
    {
        MicrophonePipeline pipeline;
        lock (controlGate)
        {
            ThrowIfDisposed();
            pipeline = microphone ?? throw new InvalidOperationException(error ?? "The microphone pipeline is unavailable.");
        }
        return pipeline.RunMicrophoneTestAsync(cancellationToken);
    }

    public void RecoverIfNeeded()
    {
        lock (controlGate)
        {
            if (!running) return;
            if (settings is not null) microphone?.RecoverMonitoring(settings);
            microphoneOutput?.Recover();
            routing?.Spatial.Refresh();
            try { routing?.Refresh(); }
            catch (Exception refreshError) { OnRoutingFailed(refreshError); }
            // Windows emits property/default notifications for application policy
            // writes too. Rebuilding on those notifications reroutes the same app
            // again and creates a five-second teardown loop.
            var endpointsChanged = Interlocked.Exchange(ref endpointChangePending, 0) != 0
                && !string.Equals(endpointTopology, EndpointTopology(), StringComparison.Ordinal);
            var microphoneNeedsRecovery = !string.IsNullOrWhiteSpace(settings?.MicrophoneBus?.DeviceId)
                                          && (microphone is null || microphone.CaptureStopped || microphoneCapture?.IsHealthy != true);
            var routingNeedsRecovery = routing is null
                                       || Interlocked.Exchange(ref routingRecoveryPending, 0) != 0
                                       || endpointsChanged
                                       || (microphoneNeedsRecovery && routing?.HasVirtualOutputs != false);
            if (!microphoneNeedsRecovery && !routingNeedsRecovery) return;

            if (routingNeedsRecovery)
            {
                if (routing is not null) routing.Failed -= OnRoutingFailed;
                routing?.Dispose();
                routing = null;
            }
            if (microphoneNeedsRecovery || endpointsChanged)
            {
                StopMicrophoneOutput();
                microphone?.Dispose();
                microphone = null;
                InitializeSuppressorCore();
                StartMicrophoneCore(recovery: true);
                routingNeedsRecovery |= routing?.HasVirtualOutputs != false;
            }
            if (routingNeedsRecovery)
            {
                try { StartRoutingCore(); }
                catch (Exception routeStartError)
                {
                    routingError = $"Virtual audio routing is unavailable: {routeStartError.Message}";
                    Interlocked.Exchange(ref routingRecoveryPending, 1);
                }
            }
            SnapshotChanged?.Invoke(GetSnapshotCore());
        }
    }

    public object GetMeterFrame()
    {
        var routingMeters = routing?.GetMeters();
        var level = microphone?.MeterLevel ?? 0f;
        var peak = microphone?.MeterPeak ?? 0f;
        return new
        {
            sequence = Interlocked.Increment(ref meterSequence) - 1,
            timestamp = DateTimeOffset.UtcNow,
            values = new object[]
            {
                Meter("game", routingMeters),
                Meter("chat", routingMeters),
                Meter("media", routingMeters),
                Meter("aux", routingMeters),
                new { busId = "mic", level = Math.Clamp(level, 0f, 1f), peak = Math.Clamp(peak, 0f, 1f), clipping = peak >= 0.985f },
            },
        };
    }

    public TimeSpan Uptime => running ? DateTimeOffset.UtcNow - startedAt : TimeSpan.Zero;
    public bool Running => running;
    public IReadOnlyCollection<AudioBusState> GetBuses()
    {
        var personal = settings?.Mixes.FirstOrDefault(mix => mix.Id.Equals("personal", StringComparison.OrdinalIgnoreCase));
        return settings?.Buses.Select(bus =>
        {
            var control = personal?.Buses.FirstOrDefault(candidate => candidate.Id.Equals(bus.Id, StringComparison.OrdinalIgnoreCase));
            return new AudioBusState(bus.Id, control?.Gain ?? 1f, !bus.Enabled || !(control?.Enabled ?? true), 0);
        }).ToArray() ?? [];
    }
    public IReadOnlyCollection<ProcessorState> GetProcessors() => settings?.MicProcessors.Select(processor => new ProcessorState(processor.Id, processor.Enabled)).ToArray() ?? [];

    public void Dispose()
    {
        lock (controlGate)
        {
            if (disposed) return;
            disposed = true;
            endpoints.Changed -= OnEndpointsChanged;
            StopCore();
        }
    }

    private void StartMicrophoneCore(bool recovery = false)
    {
        if (settings is null || dspConfiguration is null) return;
        var microphoneBus = settings.MicrophoneBus;
        if (microphoneBus is null || string.IsNullOrWhiteSpace(microphoneBus.DeviceId))
        {
            error = "No physical microphone is selected.";
            return;
        }
        try
        {
            MicrophonePipeline? next = null;
            try
            {
                next = new MicrophonePipeline(suppressor, settings, dspConfiguration);
                if (recovery) next.MarkRecovery();
                next.Start();
                microphone = next;
                next = null;
                microphoneCapture = new NamedPipeAudioOutput(
                    new ProcessedSampleProvider(microphone.ClipMicrophoneSource, recordingGraph.CreateProcessor("clip", "mic")),
                    NamedPipeAudioOutput.MicrophonePipeName);
                microphoneCapture.Start();
                if (!EndpointCatalog.Inspect(endpoints.List()).Ready)
                    microphoneOutput = new MicrophoneCableOutput(endpoints, microphone.VirtualMicrophoneSource, settings.MicrophoneBus?.Enabled == true);
            }
            finally
            {
                next?.Dispose();
            }
            error = null;
        }
        catch (Exception startError)
        {
            StopMicrophoneOutput();
            microphone?.Dispose();
            microphone = null;
            error = $"The selected microphone could not start: {startError.Message}";
        }
    }

    private void StopMicrophoneOutput()
    {
        microphoneCapture?.Dispose();
        microphoneCapture = null;
        microphoneOutput?.Dispose();
        microphoneOutput = null;
    }

    private void InitializeSuppressorCore()
    {
        suppressor.Dispose();
        suppressor = new BypassNoiseSuppressor("The noise backend has not been initialized.");
        var nativeDirectory = AppContext.BaseDirectory;
        var modelDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Switchboard",
            "models",
            "deepfilternet");
        var initializedAt = Stopwatch.GetTimestamp();
        suppressor = NoiseSuppressorFactory.Create(nativeDirectory, modelDirectory, out _);
        modelInitializationMs = Stopwatch.GetElapsedTime(initializedAt).TotalMilliseconds;
    }

    private void StartRoutingCore()
    {
        if (settings is null) throw new InvalidOperationException("Audio settings are unavailable.");
        microphone?.ResetRoutingBuffers(includeVirtualMicrophone: microphoneOutput is null, includeClipMicrophone: false);
        var virtualMicrophoneSource = microphone?.VirtualMicrophoneSource ?? new SilentSampleProvider();
        var streamMicrophoneSource = microphone?.StreamMicrophoneSource ?? new SilentSampleProvider();
        IAudioRoutingEngine? next = null;
        try
        {
            next = EndpointCatalog.Inspect(endpoints.List()).Ready ? RoutingEngine.Create(
                endpoints,
                settings,
                virtualMicrophoneSource,
                streamMicrophoneSource) : CableRoutingEngine.Create(endpoints, settings);
            next.Failed += OnRoutingFailed;
            next.Start();
            routing = next;
            endpointTopology = EndpointTopology();
            next = null;
            routingError = null;
            Volatile.Write(ref routingFailure, null);
            Interlocked.Exchange(ref routingRecoveryPending, 0);
        }
        finally
        {
            if (next is not null) next.Failed -= OnRoutingFailed;
            next?.Dispose();
        }
    }

    private void OnRoutingFailed(Exception routeError)
    {
        // WASAPI stop/dispose may join this callback while controlGate is held.
        // Publish only a recovery signal here; the control-rate loop owns teardown.
        Volatile.Write(ref routingFailure, routeError);
        Interlocked.Exchange(ref routingRecoveryPending, 1);
    }

    private void OnEndpointsChanged() => Interlocked.Exchange(ref endpointChangePending, 1);

    private AudioHostSnapshot GetSnapshotCore()
    {
        var pipeline = microphone;
        var timings = pipeline?.FrameTimings ?? new Realtime.FrameTimingSnapshot(0, 0, 0, 0, 0);
        var callbackTimings = pipeline?.CallbackTimings ?? new Realtime.FrameTimingSnapshot(0, 0, 0, 0, 0);
        var microphoneAvailable = running && pipeline is not null && !pipeline.CaptureStopped;
        var routingAvailable = running
                               && routing is not null
                               && Volatile.Read(ref routingRecoveryPending) == 0;
        var suppressionAvailable = microphoneAvailable && suppressor.IsAvailable && !(pipeline?.SuppressionBypassed ?? false);
        var suppressionReason = suppressionAvailable
            ? null
            : pipeline?.LastError ?? suppressor.LastError ?? error ?? "Noise removal is unavailable with the current audio setup.";
        var localSnr = pipeline?.LocalSnr;
        var inventory = endpoints.List();
        var nativeDriver = EndpointCatalog.Inspect(inventory);
        var driver = routing?.Driver ?? (nativeDriver.Ready ? nativeDriver.Snapshot() : CableEndpointCatalog.Inspect(inventory));
        IReadOnlyCollection<AudioApplicationState> applications;
        try { applications = routing?.ListApplications() ?? []; }
        catch { applications = []; }
        var counts = applications.Where(application => application.CurrentDestination is not null).GroupBy(application => application.CurrentDestination!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
        var personalMix = settings?.Mixes.FirstOrDefault(mix => mix.Id.Equals("personal", StringComparison.OrdinalIgnoreCase));
        var buses = (settings?.Buses ?? []).Select(bus =>
        {
            var control = personalMix?.Buses.FirstOrDefault(candidate => candidate.Id.Equals(bus.Id, StringComparison.OrdinalIgnoreCase));
            return new AudioBusState(
                bus.Id,
                control?.Gain ?? 1f,
                !bus.Enabled || !(control?.Enabled ?? true),
                counts.GetValueOrDefault(bus.Id));
        }).ToArray();
        var mixes = (settings?.Mixes ?? []).Select(mix => new AudioMixState(
            mix.Id,
            mix.Label,
            mix.Master,
            mix.Buses.Select(bus => new AudioMixBusState(bus.Id, bus.Gain, bus.Enabled)).ToArray())).ToArray();
        var requestedInputDeviceId = settings?.MicrophoneBus?.DeviceId;
        var requestedMonitoringDeviceId = string.IsNullOrWhiteSpace(settings?.MonitoringDeviceId)
            ? null
            : settings.MonitoringDeviceId;
        var microphoneRuntime = new MicrophoneRuntime(
            configurationVersion,
            string.IsNullOrWhiteSpace(requestedInputDeviceId) ? null : requestedInputDeviceId,
            pipeline?.InputDeviceId,
            pipeline?.InputFormat,
            (settings?.MicProcessors ?? []).Select(processor => new ConfiguredMicrophoneProcessor(
                processor.Id,
                processor.Enabled,
                processor.Parameters.Clone())).ToArray(),
            new MicrophoneMonitoringRuntime(
                settings?.MonitoringEnabled ?? false,
                pipeline?.MonitoringDeviceId is not null,
                settings?.Monitoring ?? 0f,
                requestedMonitoringDeviceId,
                pipeline?.MonitoringDeviceId),
            pipeline?.LastError ?? error,
            microphoneOutput?.Snapshot());
        return new AudioHostSnapshot(
            new AudioHostCapabilities(
                routingAvailable && routing!.HasVirtualOutputs ? "available" : "unavailable",
                routingAvailable && endpoints.ApplicationRoutingAvailable ? "available" : "unavailable",
                routingAvailable ? "available" : "unavailable",
                microphoneAvailable ? "available" : "unavailable",
                suppressionAvailable ? "available" : "unavailable",
                microphoneAvailable || routingAvailable ? "available" : "unavailable",
                microphoneAvailable ? "available" : "unavailable",
                microphoneAvailable && pipeline!.CanRunMicrophoneTest ? "available" : "unavailable",
                routingAvailable ? "available" : "unavailable",
                routingError ?? (routing?.Backend == "vb-cable" ? driver.Message : suppressionReason),
                routing?.Backend ?? "none",
                microphoneAvailable && (microphoneOutput?.Running == true || routingAvailable && routing!.HasVirtualOutputs) ? "available" : "unavailable",
                routingAvailable && routing!.HasVirtualOutputs ? "available" : "unavailable",
                "unavailable",
                routingAvailable ? "available" : "unavailable",
                microphoneAvailable && microphoneCapture?.IsHealthy == true ? "available" : "unavailable"),
            new NoiseSuppressionDiagnostics(
                suppressor.BackendName,
                suppressor.IsAvailable,
                suppressor.ModelIdentifier,
                suppressor.ModelHash,
                suppressor.NativeLibraryHash,
                !running ? "not-loaded" : suppressionAvailable ? "ready" : "bypassed",
                modelInitializationMs,
                pipeline?.InputSampleRate ?? 0,
                AudioConstants.ProcessingSampleRate,
                suppressor.FrameLength,
                (float)suppressor.AlgorithmicLatencyMs,
                (float)suppressor.AttenuationLimitDb,
                localSnr is { } value && float.IsFinite(value) ? value : null,
                timings.P50Ms,
                timings.P95Ms,
                timings.P99Ms,
                timings.MaximumMs,
                callbackTimings.P99Ms,
                pipeline?.CaptureOverruns ?? 0,
                pipeline?.MonitorOverruns ?? 0,
                pipeline?.MonitorUnderruns ?? 0,
                pipeline?.DroppedOrBypassedFrames ?? 0,
                pipeline?.RecoveryCount ?? 0,
                pipeline?.LastError ?? suppressor.LastError),
            pipeline?.InputDeviceId,
            pipeline?.InputFormat,
            pipeline?.MonitoringDeviceId,
            running,
            error ?? (Volatile.Read(ref routingFailure) is { } failed ? $"Audio routing stopped: {failed.Message}" : routingError),
            driver,
            applications,
            buses,
            mixes,
            microphoneRuntime,
            routing?.Backend == "vb-cable" ? routing.ApplicationRoutes : settings?.ApplicationRoutes ?? [],
            routing?.Backend == "vb-cable" ? settings?.AutomaticApplicationRouting : null,
            routingAvailable ? routing!.Spatial.Snapshot() : new SpatialRuntime(settings?.Spatial ?? new(), false, "off", routingError));
    }

    private void StopCore()
    {
        running = false;
        if (routing is not null) routing.Failed -= OnRoutingFailed;
        Exception? restoreFailure = null;
        try { routing?.Dispose(); }
        catch (Exception failure) { restoreFailure = failure; }
        finally
        {
            routing = null;
            StopMicrophoneOutput();
            microphone?.Dispose();
            microphone = null;
            suppressor.Dispose();
            suppressor = new BypassNoiseSuppressor("The audio engine is stopped.");
        }
        error = null;
        routingError = null;
        Volatile.Write(ref routingFailure, null);
        Interlocked.Exchange(ref endpointChangePending, 0);
        endpointTopology = null;
        Interlocked.Exchange(ref routingRecoveryPending, 0);
        if (restoreFailure is not null) throw new InvalidOperationException("Audio stopped, but a Windows route could not be restored. The recovery journal was retained.", restoreFailure);
    }

    private static object Meter(string busId, IReadOnlyDictionary<string, MeterValue>? meters)
    {
        var meter = meters?.GetValueOrDefault(busId) ?? default;
        return new { busId, level = meter.Level, peak = meter.Peak, clipping = meter.Clipping };
    }

    private static string RouteSignature(AudioHostSettings settings) => string.Join('|', settings.Buses
        .Where(bus => bus.Id is "game" or "chat" or "media" or "aux")
        .OrderBy(bus => bus.Id)
        .Select(bus => $"{bus.Id}:{bus.DeviceId}"));

    private string EndpointTopology() => string.Join('|', endpoints.List()
        .OrderBy(endpoint => endpoint.Id, StringComparer.Ordinal)
        .Select(endpoint => $"{endpoint.Id}:{endpoint.Flow}:{endpoint.InterfaceName}"));

    private void ThrowIfDisposed()
    {
        if (disposed) throw new ObjectDisposedException(nameof(AudioEngine));
    }
}
