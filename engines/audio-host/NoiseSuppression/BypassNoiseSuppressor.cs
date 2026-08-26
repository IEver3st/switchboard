namespace Switchboard.AudioHost.NoiseSuppression;

internal sealed class BypassNoiseSuppressor(string? reason = null) : INoiseSuppressor
{
    public bool IsAvailable => false;
    public string BackendName => "Bypass";
    public string ModelIdentifier => "none";
    public string? ModelHash => null;
    public string? NativeLibraryHash => null;
    public int SampleRate => AudioConstants.ProcessingSampleRate;
    public int FrameLength => 480;
    public double AlgorithmicLatencyMs => 0;
    public double AttenuationLimitDb { get; private set; }
    public string? LastError { get; private set; } = reason;
    public bool Initialize(NoiseSuppressorInitialization initialization) => false;
    public void Configure(float amount) => AttenuationLimitDb = NoiseStrengthMapping.ToAttenuationDb(amount);
    public bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
    {
        localSnrDb = float.NaN;
        input.CopyTo(output);
        return false;
    }
    public bool Reset() => true;
    public void Dispose() { }
}

