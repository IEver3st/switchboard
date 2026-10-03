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
    // Delay in the model output itself, excluding the caller's frame buffering.
    int OutputDelaySamples => 0;
    float SpeechProbability => float.NaN;
    // True when the model keeps consonants and quiet speech on its own, so the
    // stage must not mix raw microphone audio back in during speech.
    bool PreservesSpeech => false;
    double AlgorithmicLatencyMs { get; }
    string? LastError { get; }

    bool Initialize(NoiseSuppressorInitialization initialization);
    bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb);
    bool Reset();
}
