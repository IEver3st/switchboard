using System.Text.Json;

namespace Switchboard.AudioHost;

internal sealed record NoiseSuppressionConfiguration(bool Enabled, float Amount);
internal sealed record NoiseGateConfiguration(bool Enabled, float ThresholdDb, float AttackMs, float ReleaseMs);
internal sealed record GainConfiguration(bool Enabled, float GainDb);
internal sealed record EqualizerBandConfiguration(bool Enabled, string Type, float Frequency, float GainDb, float Q);
internal sealed record EqualizerConfiguration(bool Enabled, IReadOnlyList<EqualizerBandConfiguration> Bands);
internal sealed record CompressorConfiguration(bool Enabled, float ThresholdDb, float Ratio, float AttackMs, float ReleaseMs, float MakeupDb);
internal sealed record LimiterConfiguration(bool Enabled, float ThresholdDb, float ReleaseMs);

internal sealed record MicrophoneDspConfiguration(
    long Version,
    NoiseSuppressionConfiguration NoiseSuppression,
    NoiseGateConfiguration NoiseGate,
    GainConfiguration Gain,
    EqualizerConfiguration Equalizer,
    CompressorConfiguration Compressor,
    LimiterConfiguration Limiter)
{
    public static MicrophoneDspConfiguration From(AudioHostSettings settings, long version)
    {
        var processors = settings.MicProcessors.ToDictionary(processor => processor.Id, StringComparer.OrdinalIgnoreCase);
        var suppression = Find(processors, "noise-suppression");
        var gate = Find(processors, "noise-gate");
        var gain = Find(processors, "gain");
        var equalizer = Find(processors, "equalizer");
        var compressor = Find(processors, "compressor");
        var limiter = Find(processors, "limiter");
        return new MicrophoneDspConfiguration(
            version,
            new NoiseSuppressionConfiguration(suppression.Enabled, Number(suppression.Parameters, "amount", 55f, 0f, 100f)),
            new NoiseGateConfiguration(gate.Enabled, Number(gate.Parameters, "thresholdDb", -48f, -80f, -10f), Number(gate.Parameters, "attackMs", 10f, 0.1f, 100f), Number(gate.Parameters, "releaseMs", 180f, 10f, 1_000f)),
            new GainConfiguration(gain.Enabled, Number(gain.Parameters, "gainDb", 0f, -20f, 30f)),
            new EqualizerConfiguration(equalizer.Enabled, ParseBands(equalizer.Parameters)),
            new CompressorConfiguration(compressor.Enabled, Number(compressor.Parameters, "thresholdDb", -18f, -60f, 0f), Number(compressor.Parameters, "ratio", 4f, 1f, 20f), Number(compressor.Parameters, "attackMs", 12f, 0.1f, 200f), Number(compressor.Parameters, "releaseMs", 180f, 10f, 2_000f), Number(compressor.Parameters, "makeupDb", 2f, 0f, 18f)),
            new LimiterConfiguration(limiter.Enabled, Number(limiter.Parameters, "thresholdDb", -1f, -18f, 0f), Number(limiter.Parameters, "releaseMs", 90f, 10f, 1_000f)));
    }

    private static MicrophoneProcessorSettings Find(IReadOnlyDictionary<string, MicrophoneProcessorSettings> processors, string id) =>
        processors.TryGetValue(id, out var processor)
            ? processor
            : throw new InvalidOperationException($"Missing microphone processor: {id}.");

    private static float Number(JsonElement parameters, string name, float fallback, float minimum, float maximum)
    {
        if (!parameters.TryGetProperty(name, out var property) || !property.TryGetSingle(out var value) || !float.IsFinite(value)) return fallback;
        return Math.Clamp(value, minimum, maximum);
    }

    private static IReadOnlyList<EqualizerBandConfiguration> ParseBands(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("bands", out var bands) || bands.ValueKind != JsonValueKind.Array) return [];
        var result = new List<EqualizerBandConfiguration>(AudioConstants.MaximumProcessorBands);
        foreach (var band in bands.EnumerateArray())
        {
            if (result.Count == AudioConstants.MaximumProcessorBands) break;
            var type = band.TryGetProperty("type", out var typeProperty) ? typeProperty.GetString() ?? "bell" : "bell";
            result.Add(new EqualizerBandConfiguration(
                !band.TryGetProperty("enabled", out var enabled) || enabled.GetBoolean(),
                type,
                Number(band, "frequency", 1_000f, 20f, 20_000f),
                Number(band, "gainDb", 0f, -12f, 12f),
                Number(band, "q", 1f, 0.2f, 10f)));
        }
        return result;
    }
}

