using System.Diagnostics;
using Switchboard.AudioHost.NoiseSuppression;

namespace Switchboard.AudioHost;

internal sealed class AudioEngine : IDisposable
{
    private readonly object controlGate = new();
    private readonly EndpointService endpoints;
    private INoiseSuppressor suppressor = new BypassNoiseSuppressor("The noise backend has not been initialized.");
    private MicrophonePipeline? microphone;
    private RoutingEngine? routing;
    private AudioHostSettings? settings;
    private MicrophoneDspConfiguration? dspConfiguration;
    private long configurationVersion;
    private long meterSequence;
    private int endpointChangePending;
    private int routingRecoveryPending;
    private bool running;
    private bool disposed;
    private string? error;
    private string? routingError;
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
            StopCore();
            settings = nextSettings.Validate();
            InitializeSuppressorCore();
            configurationVersion++;
            dspConfiguration = MicrophoneDspConfiguration.From(settings, configurationVersion);
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
            settings = nextSettings.Validate();
            configurationVersion++;
            dspConfiguration = MicrophoneDspConfiguration.From(settings, configurationVersion);
            if (!running) return GetSnapshotCore();

            var nextInputId = settings.MicrophoneBus?.DeviceId;
            var inputChanged = microphone is null || !string.Equals(microphone.InputDeviceId, nextInputId, StringComparison.OrdinalIgnoreCase);
            var routesChanged = previousSettings is null || !RouteSignature(previousSettings).Equals(RouteSignature(settings), StringComparison.OrdinalIgnoreCase);
            if (inputChanged)
            {
                routing?.Dispose();
                routing = null;
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
            var snapshot = GetSnapshotCore();
            SnapshotChanged?.Invoke(snapshot);
            return snapshot;
        }
    }

    public AudioHostSnapshot GetSnapshot()
    {
        lock (controlGate) return GetSnapshotCore();
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
            var endpointsChanged = Interlocked.Exchange(ref endpointChangePending, 0) != 0;
            var microphoneNeedsRecovery = microphone is null || microphone.CaptureStopped;
            var routingNeedsRecovery = routing is null
                                       || Interlocked.Exchange(ref routingRecoveryPending, 0) != 0
                                       || endpointsChanged;
            if (!microphoneNeedsRecovery && !routingNeedsRecovery) return;

            if (routingNeedsRecovery)
            {
                if (routing is not null) routing.Failed -= OnRoutingFailed;
                routing?.Dispose();
                routing = null;
            }
            if (microphoneNeedsRecovery || endpointsChanged)
            {
                microphone?.Dispose();
                microphone = null;
                InitializeSuppressorCore();
                StartMicrophoneCore(recovery: true);
                routingNeedsRecovery = true;
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
            }
            finally
            {
                next?.Dispose();
            }
            error = null;
        }
        catch (Exception startError)
        {
            microphone?.Dispose();
            microphone = null;
            error = $"The selected microphone could not start: {startError.Message}";
        }
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
        var virtualMicrophoneSource = microphone?.VirtualMicrophoneSource ?? new SilentSampleProvider();
        var streamMicrophoneSource = microphone?.StreamMicrophoneSource ?? new SilentSampleProvider();
        var clipMicrophoneSource = microphone?.ClipMicrophoneSource ?? new SilentSampleProvider();
        RoutingEngine? next = null;
        try
        {
            next = RoutingEngine.Create(
                endpoints,
                settings,
                virtualMicrophoneSource,
                streamMicrophoneSource,
                clipMicrophoneSource);
            next.Failed += OnRoutingFailed;
            next.Start();
            routing = next;
            next = null;
            routingError = null;
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
        lock (controlGate)
        {
            if (!running) return;
            routingError = $"Audio routing stopped: {routeError.Message}";
            Interlocked.Exchange(ref routingRecoveryPending, 1);
            SnapshotChanged?.Invoke(GetSnapshotCore());
        }
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
        var driver = routing?.VirtualEndpoints.Snapshot() ?? EndpointCatalog.Inspect(endpoints.List()).Snapshot();
        IReadOnlyCollection<AudioApplicationState> applications;
        try { applications = routing?.ListApplications() ?? []; }
        catch { applications = []; }
        var counts = applications.GroupBy(application => application.Destination, StringComparer.OrdinalIgnoreCase)
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
            pipeline?.LastError ?? error);
        return new AudioHostSnapshot(
            new AudioHostCapabilities(
                routingAvailable && endpoints.ApplicationRoutingAvailable ? "available" : "unavailable",
                routingAvailable ? "available" : "unavailable",
                routingAvailable ? "available" : "unavailable",
                microphoneAvailable ? "available" : "unavailable",
                suppressionAvailable ? "available" : "unavailable",
                microphoneAvailable ? "available" : "unavailable",
                microphoneAvailable ? "available" : "unavailable",
                microphoneAvailable && pipeline!.CanRunMicrophoneTest ? "available" : "unavailable",
                "unavailable",
                suppressionReason),
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
            error ?? routingError,
            driver,
            applications,
            buses,
            mixes,
            microphoneRuntime);
    }

    private void StopCore()
    {
        running = false;
        if (routing is not null) routing.Failed -= OnRoutingFailed;
        routing?.Dispose();
        routing = null;
        microphone?.Dispose();
        microphone = null;
        suppressor.Dispose();
        suppressor = new BypassNoiseSuppressor("The audio engine is stopped.");
        error = null;
        routingError = null;
        Interlocked.Exchange(ref endpointChangePending, 0);
        Interlocked.Exchange(ref routingRecoveryPending, 0);
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

    private void ThrowIfDisposed()
    {
        if (disposed) throw new ObjectDisposedException(nameof(AudioEngine));
    }
}
