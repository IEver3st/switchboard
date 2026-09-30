using System.Numerics;
using Switchboard.AudioHost.NoiseSuppression;

namespace Switchboard.AudioHost;

internal readonly record struct MicrophoneFrameResult(
    bool SuppressionAttempted,
    bool SuppressionSucceeded,
    float LocalSnrDb,
    float Peak,
    float Rms)
{
    public static MicrophoneFrameResult Create(bool attempted, bool succeeded, float localSnrDb, float peak, float rms) =>
        new(attempted, succeeded, localSnrDb, peak, rms);
}

internal sealed class AudioGraph
{
    private readonly NoiseSuppressionStage suppression;
    private readonly int frameLength;
    private readonly ParametricEqualizer equalizer = new();
    private readonly Dictionary<string, MutableBus> buses = new(StringComparer.OrdinalIgnoreCase)
    {
        ["game"] = new("game", 1.00f),
        ["chat"] = new("chat", 0.76f),
        ["media"] = new("media", 0.42f),
        ["mic"] = new("mic", 0.92f),
    };

    private long configuredVersion = -1;
    private float gateEnvelope = 1f;
    private float gateDetector;
    private int gateHoldSamples;
    private bool gateOpen = true;
    private float compressorEnvelope;
    private float limiterGain = 1f;
    private float chatMix = 0.15f;
    private float masterGain = 1f;
    private bool masterEnabled = true;

    public AudioGraph(INoiseSuppressor noiseSuppressor)
    {
        suppression = new NoiseSuppressionStage(noiseSuppressor);
        frameLength = noiseSuppressor.FrameLength;
    }

    public float ChatMix => chatMix;
    public float MasterGain => masterGain;
    public bool MasterEnabled => masterEnabled;

    public IReadOnlyCollection<AudioBusState> GetBuses() => buses.Values
        .Select(bus => new AudioBusState(bus.Id, bus.Gain, bus.Muted, bus.ApplicationCount))
        .ToArray();

    public void SetBusGain(string busId, float gain)
    {
        if (!buses.TryGetValue(busId, out var bus)) throw new ArgumentOutOfRangeException(nameof(busId));
        bus.Gain = Math.Clamp(gain, 0f, 1.5f);
    }

    public void SetBusEnabled(string busId, bool enabled)
    {
        if (!buses.TryGetValue(busId, out var bus)) throw new ArgumentOutOfRangeException(nameof(busId));
        bus.Muted = !enabled;
    }

    public void SetMasterGain(float gain) => masterGain = Math.Clamp(gain, 0f, 1.5f);
    public void SetMasterEnabled(bool enabled) => masterEnabled = enabled;

    public void ProcessMaster(Span<float> interleavedSamples) =>
        ApplyGain(interleavedSamples, masterEnabled ? masterGain : 0f);

    public void SetChatMix(float value)
    {
        chatMix = Math.Clamp(value, -1f, 1f);
        buses["game"].Gain = Math.Clamp(0.85f - chatMix * 0.35f, 0.2f, 1.2f);
        buses["chat"].Gain = Math.Clamp(0.85f + chatMix * 0.35f, 0.2f, 1.2f);
    }

    // The virtual-endpoint router is retained for the future signed-driver path.
    // Live physical-microphone processing is owned by MicrophonePipeline so the
    // neural model is instantiated exactly once and never run independently for
    // monitor, stream, and virtual-microphone fan-out consumers.
    public void Configure(AudioConfiguration configuration)
    {
        SetMasterGain(configuration.Master.Gain);
        SetMasterEnabled(configuration.Master.Enabled);
        SetChatMix(configuration.ChatMix);
        for (var index = 0; index < configuration.Buses.Count; index++)
        {
            var bus = configuration.Buses[index];
            if (!buses.ContainsKey(bus.Id)) continue;
            SetBusGain(bus.Id, bus.Gain);
            SetBusEnabled(bus.Id, bus.Enabled);
        }
    }

    public void ProcessBus(Span<float> interleavedSamples, string busId, bool includeMaster)
    {
        if (!buses.TryGetValue(busId, out var bus)) throw new ArgumentOutOfRangeException(nameof(busId));
        ApplyGain(interleavedSamples, bus.Muted ? 0f : bus.Gain);
        if (includeMaster) ProcessMaster(interleavedSamples);
    }

    public void ProcessMicrophone(Span<float> interleavedSamples, bool monitoring)
    {
        // Compatibility for the dormant signed-virtual-driver router. It must
        // consume the single processed microphone fan-out once that driver is
        // available; it intentionally does not run a second neural model here.
        ProcessBus(interleavedSamples, "mic", includeMaster: false);
    }

    /// <summary>
    /// Processes normalized 48 kHz mono audio in this deliberate order:
    /// AI suppression, noise gate, software gain, parametric EQ, compressor, limiter.
    /// The caller owns the buffer; this method allocates nothing and acquires no locks.
    /// </summary>
    public MicrophoneFrameResult ProcessMicrophone(Span<float> samples, MicrophoneDspConfiguration configuration)
    {
        if (samples.IsEmpty || samples.Length > frameLength
            || (RequiresSuppressionFrame(configuration) && samples.Length != frameLength)) return default;
        ConfigureAtFrameBoundary(configuration);
        var (attempted, succeeded, localSnr) = suppression.Process(samples, configuration.NoiseSuppression);

        if (configuration.NoiseGate.Enabled) ApplyNoiseGate(samples, configuration.NoiseGate);
        if (configuration.Gain.Enabled) ApplyGain(samples, DbToLinear(configuration.Gain.GainDb));
        if (configuration.Equalizer.Enabled) equalizer.Process(samples);
        if (configuration.Compressor.Enabled) ApplyCompressor(samples, configuration.Compressor);
        if (configuration.Limiter.Enabled) ApplyLimiter(samples, configuration.Limiter);

        var peak = 0f;
        var sumSquares = 0d;
        for (var index = 0; index < samples.Length; index++)
        {
            var sample = samples[index];
            if (!float.IsFinite(sample)) sample = 0f;
            sample = Math.Clamp(sample, -1f, 1f);
            samples[index] = sample;
            peak = Math.Max(peak, MathF.Abs(sample));
            sumSquares += sample * sample;
        }
        return MicrophoneFrameResult.Create(attempted, succeeded, localSnr, peak, (float)Math.Sqrt(sumSquares / samples.Length));
    }

    // Keep full model frames through suppression's fade-out. Once bypassed,
    // ordinary sample-by-sample DSP can consume a capture packet immediately.
    public bool RequiresSuppressionFrame(MicrophoneDspConfiguration configuration) => suppression.RequiresModelFrame(configuration.NoiseSuppression);

    public void Reset()
    {
        suppression.Reset();
        gateEnvelope = 1f;
        gateDetector = 0f;
        gateHoldSamples = 0;
        gateOpen = true;
        compressorEnvelope = 0f;
        limiterGain = 1f;
        equalizer.Reset();
        // Native recurrent state is owned by AudioEngine and is reset only on
        // its control thread. A realtime graph reset must never recreate a model.
    }

    public void BypassNoiseSuppression() => suppression.Bypass();

    private void ConfigureAtFrameBoundary(MicrophoneDspConfiguration configuration)
    {
        if (configuredVersion == configuration.Version) return;
        equalizer.Configure(configuration.Equalizer.Bands);
        configuredVersion = configuration.Version;
    }

    // The gate decides from a level envelope, not raw samples: a raw sample test
    // closes at every zero crossing and reopens on single noise spikes, which
    // chatters during speech and lets room noise through. Hysteresis and a short
    // hold keep the decision stable at the threshold and between syllables.
    private const float GateCloseRatio = 0.63f; // closes 4 dB below the open threshold
    private const float GateDetectorReleaseMs = 20f;
    private const int GateHoldSamples = AudioConstants.ProcessingSampleRate * 30 / 1_000;

    private void ApplyNoiseGate(Span<float> samples, NoiseGateConfiguration configuration)
    {
        var openThreshold = DbToLinear(configuration.ThresholdDb);
        var closeThreshold = openThreshold * GateCloseRatio;
        var detectorRelease = TimeCoefficient(GateDetectorReleaseMs);
        var attack = TimeCoefficient(configuration.AttackMs);
        var release = TimeCoefficient(configuration.ReleaseMs);
        for (var index = 0; index < samples.Length; index++)
        {
            var magnitude = MathF.Abs(samples[index]);
            gateDetector = magnitude > gateDetector ? magnitude : magnitude + detectorRelease * (gateDetector - magnitude);
            if (gateDetector >= openThreshold)
            {
                gateOpen = true;
                gateHoldSamples = GateHoldSamples;
            }
            else if (gateHoldSamples > 0)
            {
                gateHoldSamples--;
            }
            else if (gateDetector < closeThreshold)
            {
                gateOpen = false;
            }
            var target = gateOpen ? 1f : 0f;
            var coefficient = target > gateEnvelope ? attack : release;
            gateEnvelope = target + coefficient * (gateEnvelope - target);
            samples[index] *= gateEnvelope;
        }
    }

    private void ApplyCompressor(Span<float> samples, CompressorConfiguration configuration)
    {
        var threshold = DbToLinear(configuration.ThresholdDb);
        var makeup = DbToLinear(configuration.MakeupDb);
        var attack = TimeCoefficient(configuration.AttackMs);
        var release = TimeCoefficient(configuration.ReleaseMs);
        for (var index = 0; index < samples.Length; index++)
        {
            var magnitude = MathF.Abs(samples[index]);
            var coefficient = magnitude > compressorEnvelope ? attack : release;
            compressorEnvelope = magnitude + coefficient * (compressorEnvelope - magnitude);
            var gain = 1f;
            if (compressorEnvelope > threshold)
            {
                var inputDb = LinearToDb(compressorEnvelope);
                var outputDb = configuration.ThresholdDb + (inputDb - configuration.ThresholdDb) / configuration.Ratio;
                gain = DbToLinear(outputDb - inputDb);
            }
            samples[index] *= gain * makeup;
        }
    }

    private void ApplyLimiter(Span<float> samples, LimiterConfiguration configuration)
    {
        var ceiling = DbToLinear(configuration.ThresholdDb);
        var release = TimeCoefficient(configuration.ReleaseMs);
        for (var index = 0; index < samples.Length; index++)
        {
            var magnitude = MathF.Abs(samples[index]);
            var requiredGain = magnitude > ceiling ? ceiling / magnitude : 1f;
            limiterGain = requiredGain < limiterGain
                ? requiredGain
                : 1f + release * (limiterGain - 1f);
            samples[index] = Math.Clamp(samples[index] * limiterGain, -ceiling, ceiling);
        }
    }

    private static void ApplyGain(Span<float> samples, float gain)
    {
        var vectorWidth = Vector<float>.Count;
        var gainVector = new Vector<float>(gain);
        var index = 0;
        for (; index <= samples.Length - vectorWidth; index += vectorWidth)
        {
            var vector = new Vector<float>(samples.Slice(index, vectorWidth));
            (vector * gainVector).CopyTo(samples.Slice(index, vectorWidth));
        }
        for (; index < samples.Length; index++) samples[index] *= gain;
    }

    private static float DbToLinear(float db) => MathF.Pow(10f, db / 20f);
    private static float LinearToDb(float value) => 20f * MathF.Log10(Math.Max(value, 0.000001f));
    private static float TimeCoefficient(float milliseconds) => MathF.Exp(-1f / (Math.Max(milliseconds, 0.01f) * 0.001f * AudioConstants.ProcessingSampleRate));
    private sealed class MutableBus(string id, float gain)
    {
        public string Id { get; } = id;
        public float Gain { get; set; } = gain;
        public bool Muted { get; set; }
        public int ApplicationCount { get; set; }
    }

    private sealed class ParametricEqualizer
    {
        private readonly Biquad[] filters = new Biquad[AudioConstants.MaximumProcessorBands];
        private int count;

        public void Configure(IReadOnlyList<EqualizerBandConfiguration> bands)
        {
            count = 0;
            for (var index = 0; index < Math.Min(filters.Length, bands.Count); index++)
            {
                var band = bands[index];
                if (band.Enabled && MathF.Abs(band.GainDb) >= 0.001f) filters[count++].Configure(band);
            }
            for (var index = count; index < filters.Length; index++) filters[index].SetIdentity();
        }

        public void Process(Span<float> samples)
        {
            for (var band = 0; band < count; band++) filters[band].Process(samples);
        }

        public void Reset()
        {
            for (var index = 0; index < filters.Length; index++) filters[index].Reset();
        }
    }

    private struct Biquad
    {
        private float b0 = 1f;
        private float b1;
        private float b2;
        private float a1;
        private float a2;
        private float z1;
        private float z2;

        public Biquad() { }

        public void Configure(EqualizerBandConfiguration band)
        {
            if (!band.Enabled || MathF.Abs(band.GainDb) < 0.001f)
            {
                SetIdentity();
                return;
            }
            var a = MathF.Pow(10f, band.GainDb / 40f);
            var omega = 2f * MathF.PI * band.Frequency / AudioConstants.ProcessingSampleRate;
            var cosine = MathF.Cos(omega);
            var sine = MathF.Sin(omega);
            float rawB0, rawB1, rawB2, rawA0, rawA1, rawA2;
            if (band.Type.Equals("low-shelf", StringComparison.OrdinalIgnoreCase))
            {
                var alpha = sine / (2f * Math.Max(band.Q, 0.2f));
                var twoSqrtAAlpha = 2f * MathF.Sqrt(a) * alpha;
                rawB0 = a * ((a + 1f) - (a - 1f) * cosine + twoSqrtAAlpha);
                rawB1 = 2f * a * ((a - 1f) - (a + 1f) * cosine);
                rawB2 = a * ((a + 1f) - (a - 1f) * cosine - twoSqrtAAlpha);
                rawA0 = (a + 1f) + (a - 1f) * cosine + twoSqrtAAlpha;
                rawA1 = -2f * ((a - 1f) + (a + 1f) * cosine);
                rawA2 = (a + 1f) + (a - 1f) * cosine - twoSqrtAAlpha;
            }
            else if (band.Type.Equals("high-shelf", StringComparison.OrdinalIgnoreCase))
            {
                var alpha = sine / (2f * Math.Max(band.Q, 0.2f));
                var twoSqrtAAlpha = 2f * MathF.Sqrt(a) * alpha;
                rawB0 = a * ((a + 1f) + (a - 1f) * cosine + twoSqrtAAlpha);
                rawB1 = -2f * a * ((a - 1f) + (a + 1f) * cosine);
                rawB2 = a * ((a + 1f) + (a - 1f) * cosine - twoSqrtAAlpha);
                rawA0 = (a + 1f) - (a - 1f) * cosine + twoSqrtAAlpha;
                rawA1 = 2f * ((a - 1f) - (a + 1f) * cosine);
                rawA2 = (a + 1f) - (a - 1f) * cosine - twoSqrtAAlpha;
            }
            else
            {
                var alpha = sine / (2f * band.Q);
                rawB0 = 1f + alpha * a;
                rawB1 = -2f * cosine;
                rawB2 = 1f - alpha * a;
                rawA0 = 1f + alpha / a;
                rawA1 = -2f * cosine;
                rawA2 = 1f - alpha / a;
            }
            b0 = rawB0 / rawA0;
            b1 = rawB1 / rawA0;
            b2 = rawB2 / rawA0;
            a1 = rawA1 / rawA0;
            a2 = rawA2 / rawA0;
        }

        public void Process(Span<float> samples)
        {
            for (var index = 0; index < samples.Length; index++)
            {
                var input = samples[index];
                var output = input * b0 + z1;
                z1 = input * b1 - output * a1 + z2;
                z2 = input * b2 - output * a2;
                samples[index] = output;
            }
        }

        public void SetIdentity()
        {
            b0 = 1f;
            b1 = b2 = a1 = a2 = 0f;
        }

        public void Reset() => z1 = z2 = 0f;
    }
}
