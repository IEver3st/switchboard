namespace Switchboard.AudioHost.NoiseSuppression;

// RNNoise's spectral mask can leave audible transients and room tails after
// speech. Use its speech decision on the wet signal, before the latency-aligned
// strength blend. The dry floor still belongs to the user's strength setting.
internal sealed class SpeechActivityEnvelope
{
    private const float OpenProbability = 0.5f;
    private const float KeepOpenProbability = 0.25f;
    private const int HoldSamples = AudioConstants.ProcessingSampleRate * 60 / 1_000;
    private static readonly float Attack = MathF.Exp(-1f / (AudioConstants.ProcessingSampleRate * 0.002f));
    private static readonly float Release = MathF.Exp(-1f / (AudioConstants.ProcessingSampleRate * 0.035f));
    private int remainingHold;
    private float gain;
    private bool open;

    public void Process(Span<float> samples, float voiceProbability)
    {
        var voice = float.IsFinite(voiceProbability)
            && voiceProbability >= (open ? KeepOpenProbability : OpenProbability);
        if (voice)
        {
            open = true;
            remainingHold = HoldSamples;
        }
        for (var index = 0; index < samples.Length; index++)
        {
            if (!voice)
            {
                if (remainingHold > 0) remainingHold--;
                else open = false;
            }
            var target = open ? 1f : 0f;
            gain = target + (target > gain ? Attack : Release) * (gain - target);
            if (gain < 0.000001f) gain = 0f;
            samples[index] *= gain;
        }
    }

    public void Reset()
    {
        remainingHold = 0;
        gain = 0f;
        open = false;
    }
}
