namespace Switchboard.AudioHost.NoiseSuppression;

// One owner for model framing, strength, speech protection and bypass. Native
// backends supply only their fully processed frame and measured output delay.
// Buffers are allocated on the control thread; Process has no locks or I/O.
internal sealed class NoiseSuppressionStage
{
    private const int SpeechHoldSamples = AudioConstants.ProcessingSampleRate * 300 / 1_000;
    private readonly INoiseSuppressor model;
    private readonly float[] input;
    private readonly float[] wet;
    private readonly float[] dryDelay;
    private int delayPosition;
    private int warmupSamples;
    private int speechHold;
    private float wetMix;
    private bool wasRequested;
    private bool bypassed;

    public NoiseSuppressionStage(INoiseSuppressor model)
    {
        this.model = model;
        input = new float[model.FrameLength];
        wet = new float[model.FrameLength];
        if (model.OutputDelaySamples < 0 || model.OutputDelaySamples > AudioConstants.ProcessingSampleRate / 10)
            throw new InvalidOperationException("The noise model reported an invalid output delay.");
        dryDelay = new float[model.OutputDelaySamples];
    }

    public bool RequiresModelFrame(NoiseSuppressionConfiguration configuration) => !bypassed
        && (wetMix > 0 || Requested(configuration));

    public (bool Attempted, bool Succeeded, float LocalSnrDb) Process(Span<float> samples, NoiseSuppressionConfiguration configuration)
    {
        samples.CopyTo(input);
        DelayDry(samples);
        var requested = !bypassed && Requested(configuration);
        if (requested && !wasRequested)
        {
            // Overlap/lookahead may contain data from before bypass. Wait until
            // the model has consumed its delay in new input before fading in.
            warmupSamples = dryDelay.Length;
            wetMix = 0;
            speechHold = SpeechHoldSamples;
        }
        wasRequested = requested;
        if (!requested && wetMix == 0) return (false, false, float.NaN);

        var localSnr = float.NaN;
        bool succeeded;
        try { succeeded = model.Process(input, wet, out localSnr); }
        catch { succeeded = false; }
        if (!succeeded || !AllFinite(wet))
        {
            // samples holds today's dry audio on the same timeline. A failed
            // or partially written model frame never reaches consumers.
            wetMix = 0;
            warmupSamples = dryDelay.Length;
            wasRequested = false;
            return (true, false, float.NaN);
        }
        if (warmupSamples > 0)
        {
            warmupSamples = Math.Max(0, warmupSamples - samples.Length);
            return (true, true, localSnr);
        }

        var dryFloor = NoiseStrengthMapping.ToDryFloor(configuration.Amount);
        // Raw speech restoration compensates for models that remove consonants. It
        // also lets keyboard and room noise through while talking, so a model that
        // preserves speech keeps the same suppression during speech and pauses.
        if (!model.PreservesSpeech)
        {
            var probability = model.SpeechProbability;
            if (!float.IsFinite(probability))
                probability = float.IsFinite(localSnr) ? Math.Clamp((localSnr + 5f) / 15f, 0f, 1f) : 1f;
            if (probability >= (speechHold > 0 ? 0.12f : 0.35f)) speechHold = SpeechHoldSamples;
        }
        if (speechHold > 0 && !model.PreservesSpeech)
        {
            // Retain quiet syllables and consonants the model calls non-speech.
            // VAD protects the dry contribution; it never attenuates audio.
            double dryPower = 0, wetPower = 0;
            for (var i = 0; i < samples.Length; i++)
            {
                dryPower += samples[i] * samples[i];
                wetPower += wet[i] * wet[i];
            }
            // Intact model output needs no extra dry noise. Restore the original
            // voice progressively only when the model removes its body/level.
            var retained = (float)Math.Sqrt(wetPower / Math.Max(dryPower, 1e-20));
            var protection = Math.Clamp((0.85f - retained) / 0.35f, 0f, 1f);
            dryFloor = Math.Max(dryFloor, NoiseStrengthMapping.ToSpeechDryFloor(configuration.Amount) * protection);
            speechHold = Math.Max(0, speechHold - samples.Length);
        }
        var target = requested ? 1f - dryFloor : 0f;
        var maximumStep = samples.Length / (AudioConstants.ProcessingSampleRate * 0.020f);
        var nextMix = wetMix + Math.Clamp(target - wetMix, -maximumStep, maximumStep);
        var step = (nextMix - wetMix) / samples.Length;
        for (var i = 0; i < samples.Length; i++)
        {
            wetMix += step;
            samples[i] += (wet[i] - samples[i]) * wetMix;
        }
        wetMix = nextMix;
        return (true, true, localSnr);
    }

    public void Bypass() { bypassed = true; wetMix = 0; }

    public void Reset()
    {
        Array.Clear(dryDelay);
        Array.Clear(input);
        Array.Clear(wet);
        delayPosition = warmupSamples = speechHold = 0;
        wetMix = 0;
        wasRequested = false;
        bypassed = false;
    }

    private bool Requested(NoiseSuppressionConfiguration configuration) => configuration.Enabled && configuration.Amount > 0 && model.IsAvailable;

    private void DelayDry(Span<float> samples)
    {
        if (dryDelay.Length == 0) return;
        for (var i = 0; i < samples.Length; i++)
        {
            samples[i] = dryDelay[delayPosition];
            dryDelay[delayPosition] = input[i];
            if (++delayPosition == dryDelay.Length) delayPosition = 0;
        }
    }

    private static bool AllFinite(ReadOnlySpan<float> samples)
    {
        foreach (var sample in samples) if (!float.IsFinite(sample)) return false;
        return true;
    }
}
