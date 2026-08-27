using System.Numerics;

namespace Switchboard.AudioHost;

// Control-rate state for the transport mixer. It is intentionally separate from the
// microphone DSP graph: the virtual driver moves samples, while Audio.Host owns policy.
internal sealed class RoutingControlGraph
{
    private readonly Dictionary<string, MixControl> mixes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["personal"] = new(),
        ["stream"] = new(),
        ["clip"] = new(),
    };
    private long configurationVersion;

    public void Configure(AudioHostSettings settings)
    {
        var version = Interlocked.Increment(ref configurationVersion);
        var enabledChannels = settings.Buses.ToDictionary(bus => bus.Id, bus => bus.Enabled, StringComparer.OrdinalIgnoreCase);
        foreach (var mix in settings.Mixes)
        {
            if (!mixes.TryGetValue(mix.Id, out var mixControl)) continue;
            mixControl.SetMaster(mix.Master.Gain, mix.Master.Enabled);
            foreach (var bus in mix.Buses)
            {
                if (!mixControl.Buses.TryGetValue(bus.Id, out var busControl)) continue;
                var balance = mix.Id.Equals("personal", StringComparison.OrdinalIgnoreCase)
                    ? ChatMixGain(bus.Id, settings.ChatMix)
                    : 1f;
                var channelEnabled = enabledChannels.GetValueOrDefault(bus.Id, true);
                busControl.Set(bus.Gain * balance, bus.Enabled && channelEnabled);
            }
            foreach (var path in settings.ChannelProcessing)
            {
                if (!mixControl.Buses.TryGetValue(path.BusId, out var busControl)) continue;
                busControl.SetProcessing(ChannelDspConfiguration.From(path, version));
            }
        }
    }

    public RoutingBusProcessor CreateProcessor(string mixId, string busId)
    {
        if (!mixes.TryGetValue(mixId, out var mix)) throw new ArgumentOutOfRangeException(nameof(mixId));
        if (!mix.Buses.TryGetValue(busId, out var bus)) throw new ArgumentOutOfRangeException(nameof(busId));
        return new RoutingBusProcessor(bus, mix);
    }

    private static float ChatMixGain(string busId, float chatMix) => busId switch
    {
        "game" => Math.Clamp(1f - chatMix, 0f, 1f),
        "chat" => Math.Clamp(1f + chatMix, 0f, 1f),
        _ => 1f,
    };

    internal sealed class MixControl
    {
        private float masterGain = 1f;
        private int masterEnabled = 1;
        public Dictionary<string, BusControl> Buses { get; } = new(StringComparer.OrdinalIgnoreCase)
        {
            ["game"] = new(),
            ["chat"] = new(),
            ["media"] = new(),
            ["aux"] = new(),
            ["mic"] = new(),
        };
        public float MasterGain => Volatile.Read(ref masterEnabled) != 0 ? Volatile.Read(ref masterGain) : 0f;
        public void SetMaster(float gain, bool enabled)
        {
            Volatile.Write(ref masterGain, Math.Clamp(gain, 0f, 1.5f));
            Volatile.Write(ref masterEnabled, enabled ? 1 : 0);
        }
    }

    internal sealed class BusControl
    {
        private float gain = 1f;
        private int enabled = 1;
        private ChannelDspConfiguration processing = ChannelDspConfiguration.Bypass(0);
        public float Gain => Volatile.Read(ref gain);
        public bool Enabled => Volatile.Read(ref enabled) != 0;
        public ChannelDspConfiguration Processing => Volatile.Read(ref processing);
        public void Set(float nextGain, bool nextEnabled)
        {
            Volatile.Write(ref gain, Math.Clamp(nextGain, 0f, 1.5f));
            Volatile.Write(ref enabled, nextEnabled ? 1 : 0);
        }

        public void SetProcessing(ChannelDspConfiguration next) => Volatile.Write(ref processing, next);
    }
}

internal sealed class RoutingBusProcessor
{
    private readonly RoutingControlGraph.BusControl control;
    private readonly RoutingControlGraph.MixControl mix;
    private readonly StereoParametricEqualizer equalizer = new();
    private long configuredVersion = -1;
    private float normalizationEnvelope;
    private float normalizationGain = 1f;
    private float compressorEnvelope;
    private float limiterGain = 1f;

    public RoutingBusProcessor(RoutingControlGraph.BusControl control, RoutingControlGraph.MixControl mix)
    {
        this.control = control;
        this.mix = mix;
    }

    public void Process(Span<float> samples)
    {
        var configuration = control.Processing;
        if (configuration.Version != configuredVersion)
        {
            equalizer.Configure(configuration.Equalizer.Bands);
            normalizationEnvelope = 0f;
            normalizationGain = 1f;
            compressorEnvelope = 0f;
            limiterGain = 1f;
            configuredVersion = configuration.Version;
        }

        if (configuration.Equalizer.Enabled) equalizer.Process(samples);
        if (configuration.Normalization.Enabled) ApplyNormalization(samples, configuration.Normalization);
        if (configuration.Compressor.Enabled) ApplyCompressor(samples, configuration.Compressor);
        if (configuration.Limiter.Enabled) ApplyLimiter(samples, configuration.Limiter);
        ApplyGain(samples, (control.Enabled ? control.Gain : 0f) * mix.MasterGain);
    }

    private void ApplyNormalization(Span<float> samples, ChannelNormalizationConfiguration configuration)
    {
        var target = DbToLinear(configuration.TargetLufs);
        var maximumGain = DbToLinear(configuration.MaxGainDb);
        var detectorAttack = TimeCoefficient(40f);
        var detectorRelease = TimeCoefficient(1_500f);
        var gainAttack = TimeCoefficient(250f);
        var gainRelease = TimeCoefficient(2_000f);
        for (var index = 0; index + 1 < samples.Length; index += 2)
        {
            var magnitude = MathF.Max(MathF.Abs(samples[index]), MathF.Abs(samples[index + 1]));
            var detectorCoefficient = magnitude > normalizationEnvelope ? detectorAttack : detectorRelease;
            normalizationEnvelope = magnitude + detectorCoefficient * (normalizationEnvelope - magnitude);
            var desired = normalizationEnvelope > 0.00001f
                ? Math.Clamp(target / normalizationEnvelope, 1f, maximumGain)
                : 1f;
            var gainCoefficient = desired < normalizationGain ? gainAttack : gainRelease;
            normalizationGain = desired + gainCoefficient * (normalizationGain - desired);
            samples[index] *= normalizationGain;
            samples[index + 1] *= normalizationGain;
        }
    }

    private void ApplyCompressor(Span<float> samples, CompressorConfiguration configuration)
    {
        var threshold = DbToLinear(configuration.ThresholdDb);
        var makeup = DbToLinear(configuration.MakeupDb);
        var attack = TimeCoefficient(configuration.AttackMs);
        var release = TimeCoefficient(configuration.ReleaseMs);
        for (var index = 0; index + 1 < samples.Length; index += 2)
        {
            var magnitude = MathF.Max(MathF.Abs(samples[index]), MathF.Abs(samples[index + 1]));
            var coefficient = magnitude > compressorEnvelope ? attack : release;
            compressorEnvelope = magnitude + coefficient * (compressorEnvelope - magnitude);
            var gain = 1f;
            if (compressorEnvelope > threshold)
            {
                var inputDb = LinearToDb(compressorEnvelope);
                var outputDb = configuration.ThresholdDb + (inputDb - configuration.ThresholdDb) / configuration.Ratio;
                gain = DbToLinear(outputDb - inputDb);
            }
            gain *= makeup;
            samples[index] *= gain;
            samples[index + 1] *= gain;
        }
    }

    private void ApplyLimiter(Span<float> samples, LimiterConfiguration configuration)
    {
        var ceiling = DbToLinear(configuration.ThresholdDb);
        var release = TimeCoefficient(configuration.ReleaseMs);
        for (var index = 0; index + 1 < samples.Length; index += 2)
        {
            var magnitude = MathF.Max(MathF.Abs(samples[index]), MathF.Abs(samples[index + 1]));
            var requiredGain = magnitude > ceiling ? ceiling / magnitude : 1f;
            limiterGain = requiredGain < limiterGain ? requiredGain : 1f + release * (limiterGain - 1f);
            samples[index] = Math.Clamp(samples[index] * limiterGain, -ceiling, ceiling);
            samples[index + 1] = Math.Clamp(samples[index + 1] * limiterGain, -ceiling, ceiling);
        }
    }

    private static void ApplyGain(Span<float> samples, float gain)
    {
        var width = Vector<float>.Count;
        var gainVector = new Vector<float>(gain);
        var index = 0;
        for (; index <= samples.Length - width; index += width)
        {
            var vector = new Vector<float>(samples.Slice(index, width));
            (vector * gainVector).CopyTo(samples.Slice(index, width));
        }
        for (; index < samples.Length; index++) samples[index] *= gain;
    }

    private static float DbToLinear(float db) => MathF.Pow(10f, db / 20f);
    private static float LinearToDb(float value) => 20f * MathF.Log10(Math.Max(value, 0.000001f));
    private static float TimeCoefficient(float milliseconds) => MathF.Exp(-1f / (Math.Max(milliseconds, 0.01f) * 0.001f * AudioConstants.SampleRate));
}

internal sealed class StereoParametricEqualizer
{
    private readonly StereoBiquad[] filters = new StereoBiquad[AudioConstants.MaximumProcessorBands];
    private int count;

    public void Configure(IReadOnlyList<EqualizerBandConfiguration> bands)
    {
        count = Math.Min(filters.Length, bands.Count);
        for (var index = 0; index < count; index++) filters[index].Configure(bands[index]);
        for (var index = count; index < filters.Length; index++) filters[index].SetIdentity();
    }

    public void Process(Span<float> samples)
    {
        for (var index = 0; index < count; index++) filters[index].Process(samples);
    }

    private struct StereoBiquad
    {
        private float b0 = 1f;
        private float b1;
        private float b2;
        private float a1;
        private float a2;
        private float leftZ1;
        private float leftZ2;
        private float rightZ1;
        private float rightZ2;

        public StereoBiquad() { }

        public void Configure(EqualizerBandConfiguration band)
        {
            if (!band.Enabled || MathF.Abs(band.GainDb) < 0.001f)
            {
                SetIdentity();
                return;
            }
            var a = MathF.Pow(10f, band.GainDb / 40f);
            var omega = 2f * MathF.PI * band.Frequency / AudioConstants.SampleRate;
            var cosine = MathF.Cos(omega);
            var sine = MathF.Sin(omega);
            float rawB0, rawB1, rawB2, rawA0, rawA1, rawA2;
            if (band.Type.Equals("low-shelf", StringComparison.OrdinalIgnoreCase))
            {
                var alpha = sine / 2f * MathF.Sqrt((a + 1f / a) * (1f / Math.Max(band.Q, 0.2f) - 1f) + 2f);
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
                var alpha = sine / 2f * MathF.Sqrt((a + 1f / a) * (1f / Math.Max(band.Q, 0.2f) - 1f) + 2f);
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
            ResetState();
        }

        public void Process(Span<float> samples)
        {
            for (var index = 0; index + 1 < samples.Length; index += 2)
            {
                var leftInput = samples[index];
                var leftOutput = leftInput * b0 + leftZ1;
                leftZ1 = leftInput * b1 - leftOutput * a1 + leftZ2;
                leftZ2 = leftInput * b2 - leftOutput * a2;
                samples[index] = leftOutput;

                var rightInput = samples[index + 1];
                var rightOutput = rightInput * b0 + rightZ1;
                rightZ1 = rightInput * b1 - rightOutput * a1 + rightZ2;
                rightZ2 = rightInput * b2 - rightOutput * a2;
                samples[index + 1] = rightOutput;
            }
        }

        public void SetIdentity()
        {
            b0 = 1f;
            b1 = b2 = a1 = a2 = 0f;
            ResetState();
        }

        private void ResetState() => leftZ1 = leftZ2 = rightZ1 = rightZ2 = 0f;
    }
}
