namespace Switchboard.AudioHost.NoiseSuppression;

internal sealed record NoiseSuppressorInitialization(string NativeDirectory, string ModelDirectory);

internal interface INoiseSuppressor : IDisposable
{
    bool IsAvailable { get; }
    string BackendName { get; }
    string ModelIdentifier { get; }
    string? ModelHash { get; }
    string? NativeLibraryHash { get; }
    int SampleRate { get; }
    int FrameLength { get; }
    double AlgorithmicLatencyMs { get; }
    double AttenuationLimitDb { get; }
    string? LastError { get; }

    bool Initialize(NoiseSuppressorInitialization initialization);
    void Configure(float amount);
    bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb);
    bool Reset();
}

