namespace Switchboard.AudioHost;

internal sealed record ChannelNormalizationConfiguration(bool Enabled, float TargetLufs, float MaxGainDb);

internal sealed record ChannelDspConfiguration(
    long Version,
    EqualizerConfiguration Equalizer,
    ChannelNormalizationConfiguration Normalization,
    CompressorConfiguration Compressor,
    LimiterConfiguration Limiter)
{
    public static ChannelDspConfiguration Bypass(long version) => new(
        version,
        new EqualizerConfiguration(false, []),
        new ChannelNormalizationConfiguration(false, -18f, 6f),
        new CompressorConfiguration(false, -18f, 4f, 12f, 180f, 2f),
        new LimiterConfiguration(false, -1f, 90f));

    public static ChannelDspConfiguration From(ChannelProcessingSettings settings, long version)
    {
        var bands = settings.Equalizer.Bands
            .Take(AudioConstants.MaximumProcessorBands)
            .Select(band => new EqualizerBandConfiguration(
                band.Enabled,
                band.Type,
                Math.Clamp(band.Frequency, 20f, 20_000f),
                Math.Clamp(band.GainDb, -12f, 12f),
                Math.Clamp(band.Q, 0.2f, 10f)))
            .ToArray();
        return new ChannelDspConfiguration(
            version,
            new EqualizerConfiguration(settings.Equalizer.Enabled, bands),
            new ChannelNormalizationConfiguration(
                settings.Normalization.Enabled,
                Math.Clamp(settings.Normalization.TargetLufs, -30f, -10f),
                Math.Clamp(settings.Normalization.MaxGainDb, 0f, 18f)),
            new CompressorConfiguration(
                settings.Compressor.Enabled,
                Math.Clamp(settings.Compressor.ThresholdDb, -60f, 0f),
                Math.Clamp(settings.Compressor.Ratio, 1f, 20f),
                Math.Clamp(settings.Compressor.AttackMs, 0.1f, 200f),
                Math.Clamp(settings.Compressor.ReleaseMs, 10f, 2_000f),
                Math.Clamp(settings.Compressor.MakeupDb, 0f, 18f)),
            new LimiterConfiguration(
                settings.Limiter.Enabled,
                Math.Clamp(settings.Limiter.ThresholdDb, -18f, 0f),
                Math.Clamp(settings.Limiter.ReleaseMs, 10f, 1_000f)));
    }
}
