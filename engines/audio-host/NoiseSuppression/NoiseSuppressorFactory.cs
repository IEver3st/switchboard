namespace Switchboard.AudioHost.NoiseSuppression;

internal static class NoiseSuppressorFactory
{
    public static INoiseSuppressor Create(string nativeDirectory, string modelDirectory, out string? fallbackReason)
    {
        var initialization = new NoiseSuppressorInitialization(nativeDirectory, modelDirectory);
        // Optional models remain available to explicit offline comparisons. A
        // model file on disk must not silently change live timbre or latency.
        var rnnoise = new RnnoiseNoiseSuppressor();
        if (rnnoise.Initialize(initialization))
        {
            fallbackReason = null;
            return rnnoise;
        }

        fallbackReason = rnnoise.LastError;
        rnnoise.Dispose();
        return new BypassNoiseSuppressor(fallbackReason);
    }
}
