namespace Switchboard.AudioHost;

internal static class AudioConstants
{
    public const int SampleRate = 48_000;
    public const int Channels = 2;
    public const int BitsPerSample = 32;
    public const int LatencyMilliseconds = 20;
    public const string InterfaceName = "Switchboard Virtual Audio Device";
    public const int ProcessingSampleRate = 48_000;
    public const int MaximumProcessorBands = 8;
}

internal sealed record AudioEndpoint(
    string Id,
    string Name,
    string Flow,
    bool IsDefault,
    string? FormFactor,
    string? InterfaceName,
    float Volume,
    bool Muted,
    bool IsSwitchboard);

internal sealed record AudioBusState(string Id, float Gain, bool Muted, int ApplicationCount);
internal sealed record AudioMixBusState(string Id, float Gain, bool Enabled);
internal sealed record AudioMixState(
    string Id,
    string Label,
    AudioMasterConfiguration Master,
    IReadOnlyCollection<AudioMixBusState> Buses);
internal sealed record ProcessorState(string Id, bool Enabled);

internal sealed record AudioHostStatus(
    string State,
    int SampleRate,
    string Format,
    double MemoryMb,
    IReadOnlyCollection<AudioBusState> Buses,
    IReadOnlyCollection<ProcessorState> Processors,
    float ChatMix,
    float MasterGain,
    bool MasterEnabled,
    bool VirtualDriverPresent,
    string Message);

internal sealed record DriverEndpoint(string Id, string Name, string Flow);

internal sealed record VirtualDriverState(
    string State,
    string InterfaceName,
    IReadOnlyCollection<string> MissingEndpoints,
    IReadOnlyCollection<DriverEndpoint> Endpoints,
    string Message);

internal sealed record AudioApplicationState(
    string Id,
    string Name,
    string ExecutableName,
    int ProcessId,
    string Destination,
    string CurrentDestination,
    string? PreferredDestination,
    string RoutingState,
    bool Active);

internal sealed record AudioApplicationRouteRequest(int ProcessId, string Destination)
{
    public AudioApplicationRouteRequest Validate()
    {
        if (ProcessId <= 0) throw new InvalidOperationException("A positive application process identifier is required.");
        if (Destination is not ("game" or "chat" or "media"))
            throw new InvalidOperationException("The application destination must be game, chat, or media.");
        return this;
    }
}

internal sealed record AudioRuntimeSnapshot(
    VirtualDriverState Driver,
    IReadOnlyDictionary<string, string> Capabilities,
    IReadOnlyCollection<AudioApplicationState> Applications,
    IReadOnlyCollection<AudioBusState> Buses);

internal sealed class AudioConfiguration
{
    public AudioMasterConfiguration Master { get; init; } = new();
    public float ChatMix { get; init; }
    public float Monitoring { get; init; }
    public bool MonitoringEnabled { get; init; }
    public string MonitoringDeviceId { get; init; } = string.Empty;
    public IReadOnlyList<AudioBusConfiguration> Buses { get; init; } = [];
    public IReadOnlyList<AudioProcessorConfiguration> MicProcessors { get; init; } = [];
}

internal sealed class AudioMasterConfiguration
{
    public float Gain { get; init; } = 1f;
    public bool Enabled { get; init; } = true;
}

internal sealed class AudioBusConfiguration
{
    public string Id { get; init; } = string.Empty;
    // Retained for the dormant compatibility graph. Canonical destination controls
    // are supplied through AudioHostSettings.Mixes.
    public float Gain { get; init; } = 1f;
    public bool Enabled { get; init; } = true;
    public string DeviceId { get; init; } = string.Empty;
}

internal sealed class AudioMixConfiguration
{
    public string Id { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public AudioMasterConfiguration Master { get; init; } = new();
    public IReadOnlyList<AudioMixBusConfiguration> Buses { get; init; } = [];
}

internal sealed class AudioMixBusConfiguration
{
    public string Id { get; init; } = string.Empty;
    public float Gain { get; init; } = 1f;
    public bool Enabled { get; init; } = true;
}

internal sealed class AudioProcessorConfiguration
{
    public string Id { get; init; } = string.Empty;
    public bool Enabled { get; init; }
}

internal readonly record struct MeterValue(float Level, float Peak, bool Clipping);

internal sealed class AudioHostSettings
{
    public bool Enabled { get; init; }
    public int SampleRate { get; init; } = AudioConstants.ProcessingSampleRate;
    public AudioMasterConfiguration Master { get; init; } = new();
    public float ChatMix { get; init; }
    public float Monitoring { get; init; }
    public bool MonitoringEnabled { get; init; }
    public string MonitoringDeviceId { get; init; } = string.Empty;
    public IReadOnlyList<AudioBusConfiguration> Buses { get; init; } = [];
    public IReadOnlyList<AudioMixConfiguration> Mixes { get; init; } = [];
    public IReadOnlyList<MicrophoneProcessorSettings> MicProcessors { get; init; } = [];
    public IReadOnlyList<ChannelProcessingSettings> ChannelProcessing { get; init; } = [];
    public AudioBusConfiguration? MicrophoneBus => Buses.FirstOrDefault(bus => bus.Id.Equals("mic", StringComparison.OrdinalIgnoreCase));

    public AudioHostSettings Validate()
    {
        if (SampleRate != AudioConstants.ProcessingSampleRate) throw new InvalidOperationException("Audio.Host requires 48 kHz audio.");
        if (Monitoring is < 0f or > 1f) throw new InvalidOperationException("Monitoring level must be between 0 and 1.");
        if (Buses.GroupBy(bus => bus.Id, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
            throw new InvalidOperationException("Audio bus identifiers must be unique.");
        var requiredMixes = new[] { "personal", "stream", "clip" };
        if (Mixes.Count != requiredMixes.Length
            || requiredMixes.Any(id => Mixes.Count(mix => mix.Id.Equals(id, StringComparison.OrdinalIgnoreCase)) != 1))
            throw new InvalidOperationException("Personal, stream, and clip mix configurations are required.");
        foreach (var mix in Mixes)
        {
            if (mix.Master.Gain is < 0f or > 1.5f)
                throw new InvalidOperationException($"The {mix.Id} master gain must be between 0 and 1.5.");
            if (mix.Buses.GroupBy(bus => bus.Id, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
                throw new InvalidOperationException($"The {mix.Id} mix bus identifiers must be unique.");
            foreach (var busId in new[] { "game", "chat", "media", "aux", "mic" })
            {
                var bus = mix.Buses.SingleOrDefault(candidate => candidate.Id.Equals(busId, StringComparison.OrdinalIgnoreCase))
                          ?? throw new InvalidOperationException($"The {mix.Id} mix is missing the {busId} bus.");
                if (bus.Gain is < 0f or > 1.5f)
                    throw new InvalidOperationException($"The {mix.Id} {busId} gain must be between 0 and 1.5.");
            }
        }
        if (ChannelProcessing.GroupBy(path => path.BusId, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
            throw new InvalidOperationException("Channel processing identifiers must be unique.");
        foreach (var busId in new[] { "game", "chat", "media" })
        {
            if (!ChannelProcessing.Any(path => path.BusId.Equals(busId, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"The {busId} channel processing configuration is missing.");
        }
        return this;
    }
}

internal sealed class ChannelProcessingSettings
{
    public string BusId { get; init; } = string.Empty;
    public ChannelEqualizerSettings Equalizer { get; init; } = new();
    public ChannelNormalizationSettings Normalization { get; init; } = new();
    public ChannelCompressorSettings Compressor { get; init; } = new();
    public ChannelLimiterSettings Limiter { get; init; } = new();
}

internal sealed class ChannelEqualizerSettings
{
    public bool Enabled { get; init; }
    public IReadOnlyList<EqualizerBandSettings> Bands { get; init; } = [];
}

internal sealed class EqualizerBandSettings
{
    public bool Enabled { get; init; } = true;
    public string Type { get; init; } = "bell";
    public float Frequency { get; init; } = 1_000f;
    public float GainDb { get; init; }
    public float Q { get; init; } = 1f;
}

internal sealed class ChannelNormalizationSettings
{
    public bool Enabled { get; init; }
    public float TargetLufs { get; init; } = -18f;
    public float MaxGainDb { get; init; } = 6f;
}

internal sealed class ChannelCompressorSettings
{
    public bool Enabled { get; init; }
    public float ThresholdDb { get; init; } = -18f;
    public float Ratio { get; init; } = 4f;
    public float AttackMs { get; init; } = 12f;
    public float ReleaseMs { get; init; } = 180f;
    public float MakeupDb { get; init; } = 2f;
}

internal sealed class ChannelLimiterSettings
{
    public bool Enabled { get; init; }
    public float ThresholdDb { get; init; } = -1f;
    public float ReleaseMs { get; init; } = 90f;
}

internal sealed class MicrophoneProcessorSettings
{
    public string Id { get; init; } = string.Empty;
    public bool Enabled { get; init; }
    public System.Text.Json.JsonElement Parameters { get; init; }
}

internal sealed record ConfiguredMicrophoneProcessor(
    string Id,
    bool Enabled,
    System.Text.Json.JsonElement Parameters);

internal sealed record MicrophoneMonitoringRuntime(
    bool Requested,
    bool Active,
    float Level,
    string? RequestedDeviceId,
    string? ActiveDeviceId);

internal sealed record MicrophoneRuntime(
    long ConfigurationVersion,
    string? RequestedInputDeviceId,
    string? ActiveInputDeviceId,
    string? InputFormat,
    IReadOnlyCollection<ConfiguredMicrophoneProcessor> Processors,
    MicrophoneMonitoringRuntime Monitoring,
    string? Error);

internal sealed record AudioHostCapabilities(
    string VirtualChannels,
    string ApplicationRouting,
    string ChannelDsp,
    string MicrophoneDsp,
    string NoiseSuppression,
    string RealtimeMetering,
    string Monitoring,
    string MicrophoneTest,
    string SpatialAudio,
    string? Reason);

internal sealed record NoiseSuppressionDiagnostics(
    string Backend,
    bool Available,
    string? ModelIdentifier,
    string? ModelHash,
    string? NativeLibraryHash,
    string State,
    double ModelInitializationMs,
    int InputSampleRate,
    int ProcessingSampleRate,
    int FrameLength,
    double AlgorithmicLatencyMs,
    float AttenuationLimitDb,
    float? LocalSnrDb,
    double P50Ms,
    double P95Ms,
    double P99Ms,
    double MaximumMs,
    double CaptureCallbackP99Ms,
    long CaptureOverruns,
    long MonitorOverruns,
    long MonitorUnderruns,
    long DroppedOrBypassedFrames,
    long RecoveryCount,
    string? LastError);

internal sealed record AudioHostSnapshot(
    AudioHostCapabilities Capabilities,
    NoiseSuppressionDiagnostics NoiseSuppression,
    string? InputDeviceId,
    string? InputFormat,
    string? MonitoringDeviceId,
    bool Running,
    string? Error,
    VirtualDriverState Driver,
    IReadOnlyCollection<AudioApplicationState> Applications,
    IReadOnlyCollection<AudioBusState> Buses,
    IReadOnlyCollection<AudioMixState> Mixes,
    MicrophoneRuntime Microphone);
