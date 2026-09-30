namespace Switchboard.AudioHost.NoiseSuppression;

// RNNoise's spectral mask can leave audible transients and room tails after
// speech. Its speech decision lowers the wet signal between phrases, before the
// latency-aligned strength blend. It attenuates by a bounded range instead of
// muting: RNNoise's voice probability dips under soft onsets, unvoiced
// consonants and word tails, and a hard mute chopped those out of real speech.
internal sealed class SpeechActivityEnvelope
{
    // Below this suppression strength the dry floor already dominates residue.
    private const float FirstAttenuationDb = 21f;
    private const float MaximumRangeDb = 18f;
    private const float OpenProbability = 0.35f;
    private const float KeepOpenProbability = 0.12f;
    private const int HoldSamples = AudioConstants.ProcessingSampleRate * 200 / 1_000;
    private static readonly float Attack = MathF.Exp(-1f / (AudioConstants.ProcessingSampleRate * 0.002f));
    private static readonly float Release = MathF.Exp(-1f / (AudioConstants.ProcessingSampleRate * 0.080f));
    private int remainingHold;
    private float floor = 1f;
    private float gain = 1f;
    private bool open;

    public float FloorGain => floor;

    public void Configure(float attenuationDb)
    {
        var range = Math.Clamp(attenuationDb - FirstAttenuationDb, 0f, MaximumRangeDb);
        floor = MathF.Pow(10f, -range / 20f);
        if (!open) gain = Math.Max(gain, floor);
    }

    public void Process(Span<float> samples, float voiceProbability)
    {
        var voice = float.IsFinite(voiceProbability)
            && voiceProbability >= (open ? KeepOpenProbability : OpenProbability);
        if (voice)
        {
            open = true;
            remainingHold = HoldSamples;
        }
        if (floor >= 1f) return;
        for (var index = 0; index < samples.Length; index++)
        {
            if (!voice)
            {
                if (remainingHold > 0) remainingHold--;
                else open = false;
            }
            var target = open ? 1f : floor;
            gain = target + (target > gain ? Attack : Release) * (gain - target);
            samples[index] *= gain;
        }
    }

    public void Reset()
    {
        remainingHold = 0;
        gain = floor;
        open = false;
    }
}
