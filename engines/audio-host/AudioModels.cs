namespace Switchboard.AudioHost;

internal sealed record AudioEndpoint(
    string Id,
    string Name,
    string Flow,
    bool IsDefault,
    string? FormFactor,
    string? InterfaceName,
    float Volume,
    bool Muted);

internal sealed record AudioBusState(
    string Id,
    float Gain,
    bool Muted,
    int ApplicationCount);

internal sealed record ProcessorState(
    string Id,
    bool Enabled);

internal sealed record AudioHostStatus(
    string State,
    int SampleRate,
    string Format,
    double MemoryMb,
    IReadOnlyCollection<AudioBusState> Buses,
    IReadOnlyCollection<ProcessorState> Processors,
    float ChatMix,
    bool VirtualDriverPresent,
    string Message);
