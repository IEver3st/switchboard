namespace Switchboard.AudioHost.NoiseSuppression;

internal static class NoiseSuppressorFactory
{
    public static INoiseSuppressor Create(string nativeDirectory, string modelDirectory, out string? fallbackReason)
    {
        var initialization = new NoiseSuppressorInitialization(nativeDirectory, modelDirectory);
        var deepFilter = new DeepFilterNetNoiseSuppressor();
        if (deepFilter.Initialize(initialization))
        {
            fallbackReason = null;
            return deepFilter;
        }

        var deepFilterReason = deepFilter.LastError;
        deepFilter.Dispose();
        var rnnoise = new RnnoiseNoiseSuppressor();
        if (rnnoise.Initialize(initialization))
        {
            fallbackReason = deepFilterReason;
            return rnnoise;
        }

        fallbackReason = $"{deepFilterReason} {rnnoise.LastError}".Trim();
        rnnoise.Dispose();
        return new BypassNoiseSuppressor(fallbackReason);
    }
}

