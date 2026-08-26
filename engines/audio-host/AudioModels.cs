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
    int ProcessId,
    string Destination,
    bool Active);

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
    public float Gain { get; init; } = 1f;
    public bool Enabled { get; init; } = true;
    public string DeviceId { get; init; } = string.Empty;
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
    public IReadOnlyList<MicrophoneProcessorSettings> MicProcessors { get; init; } = [];
    public AudioBusConfiguration? MicrophoneBus => Buses.FirstOrDefault(bus => bus.Id.Equals("mic", StringComparison.OrdinalIgnoreCase));

    public AudioHostSettings Validate()
    {
        if (SampleRate != AudioConstants.ProcessingSampleRate) throw new InvalidOperationException("Audio.Host requires 48 kHz audio.");
        if (Master.Gain is < 0f or > 1.5f) throw new InvalidOperationException("Master gain must be between 0 and 1.5.");
        if (Monitoring is < 0f or > 1f) throw new InvalidOperationException("Monitoring level must be between 0 and 1.");
        if (Buses.GroupBy(bus => bus.Id, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
            throw new InvalidOperationException("Audio bus identifiers must be unique.");
        return this;
    }
}

internal sealed class MicrophoneProcessorSettings
{
    public string Id { get; init; } = string.Empty;
    public bool Enabled { get; init; }
    public System.Text.Json.JsonElement Parameters { get; init; }
}

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
    IReadOnlyCollection<AudioBusState> Buses);
