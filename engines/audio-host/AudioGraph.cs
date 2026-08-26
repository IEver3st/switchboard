using System.Numerics;

namespace Switchboard.AudioHost;

internal sealed class AudioGraph
{
    private readonly Dictionary<string, MutableBus> buses = new(StringComparer.OrdinalIgnoreCase)
    {
        ["game"] = new("game", 1.00f),
        ["chat"] = new("chat", 0.76f),
        ["media"] = new("media", 0.42f),
        ["aux"] = new("aux", 0.90f),
    };

    private readonly Dictionary<string, bool> processors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["gain"] = true,
        ["noise-gate"] = true,
        ["noise-suppression"] = true,
        ["equalizer"] = true,
        ["compressor"] = true,
        ["limiter"] = true,
    };

    private float chatMix = 0.15f;

    public float ChatMix => chatMix;

    public IReadOnlyCollection<AudioBusState> GetBuses() => buses.Values
        .Select(bus => new AudioBusState(bus.Id, bus.Gain, bus.Muted, bus.ApplicationCount))
        .ToArray();

    public IReadOnlyCollection<ProcessorState> GetProcessors() => processors
        .Select(pair => new ProcessorState(pair.Key, pair.Value))
        .ToArray();

    public void SetBusGain(string busId, float gain)
    {
        if (!buses.TryGetValue(busId, out var bus)) throw new ArgumentOutOfRangeException(nameof(busId));
        bus.Gain = Math.Clamp(gain, 0f, 1.5f);
    }

    public void SetChatMix(float value)
    {
        chatMix = Math.Clamp(value, -1f, 1f);
        buses["game"].Gain = Math.Clamp(0.85f - chatMix * 0.35f, 0.2f, 1.2f);
        buses["chat"].Gain = Math.Clamp(0.85f + chatMix * 0.35f, 0.2f, 1.2f);
    }

    public void SetProcessor(string id, bool enabled)
    {
        if (!processors.ContainsKey(id)) throw new ArgumentOutOfRangeException(nameof(id));
        processors[id] = enabled;
    }

    // Realtime rule: caller owns the buffer. This method allocates nothing and acquires no locks.
    public void ProcessMicrophone(Span<float> interleavedSamples, float inputGain)
    {
        var gain = processors["gain"] ? inputGain : 1f;
        ApplyGain(interleavedSamples, gain);

        if (processors["noise-gate"]) ApplyNoiseGate(interleavedSamples, 0.0075f);
        if (processors["compressor"]) ApplySoftCompressor(interleavedSamples, 0.58f, 4f);
        if (processors["limiter"]) ApplyLimiter(interleavedSamples, 0.97f);

        // Noise suppression and parametric EQ are explicit extension points. They should be
        // implemented as isolated, benchmarked processors rather than hidden inside this graph.
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

    private static void ApplyNoiseGate(Span<float> samples, float threshold)
    {
        for (var index = 0; index < samples.Length; index++)
        {
            if (MathF.Abs(samples[index]) < threshold) samples[index] = 0f;
        }
    }

    private static void ApplySoftCompressor(Span<float> samples, float threshold, float ratio)
    {
        for (var index = 0; index < samples.Length; index++)
        {
            var sample = samples[index];
            var magnitude = MathF.Abs(sample);
            if (magnitude <= threshold) continue;
            var compressed = threshold + (magnitude - threshold) / ratio;
            samples[index] = MathF.CopySign(compressed, sample);
        }
    }

    private static void ApplyLimiter(Span<float> samples, float ceiling)
    {
        for (var index = 0; index < samples.Length; index++)
        {
            samples[index] = Math.Clamp(samples[index], -ceiling, ceiling);
        }
    }

    private sealed class MutableBus(string id, float gain)
    {
        public string Id { get; } = id;
        public float Gain { get; set; } = gain;
        public bool Muted { get; set; }
        public int ApplicationCount { get; set; }
    }
}
