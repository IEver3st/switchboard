namespace Switchboard.AudioHost.NoiseSuppression;

internal static class NoiseSuppressorFactory
{
    public static INoiseSuppressor Create(string nativeDirectory, string modelDirectory, out string? fallbackReason) =>
        Create(NoiseSuppressionModels.Standard, nativeDirectory, modelDirectory, out fallbackReason);

    public static INoiseSuppressor Create(string model, string nativeDirectory, string modelDirectory, out string? fallbackReason)
    {
        var initialization = new NoiseSuppressorInitialization(nativeDirectory, modelDirectory);
        // Only an explicit model choice selects DeepFilterNet3. If it cannot start,
        // RNNoise keeps the microphone clean and the reason is reported.
        string? deepFilterError = null;
        if (model == NoiseSuppressionModels.DeepFilterNet3)
        {
            var deepFilter = new DeepFilterNetNoiseSuppressor();
            if (deepFilter.Initialize(initialization))
            {
                fallbackReason = null;
                return deepFilter;
            }
            deepFilterError = deepFilter.LastError ?? "DeepFilterNet3 could not start.";
            deepFilter.Dispose();
        }

        var rnnoise = new RnnoiseNoiseSuppressor();
        if (rnnoise.Initialize(initialization))
        {
            fallbackReason = deepFilterError is null ? null : $"{deepFilterError} Using standard noise removal.";
            return rnnoise;
        }

        fallbackReason = rnnoise.LastError;
        rnnoise.Dispose();
        return new BypassNoiseSuppressor(fallbackReason);
    }
}
