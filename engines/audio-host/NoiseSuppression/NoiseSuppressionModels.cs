namespace Switchboard.AudioHost.NoiseSuppression;

// Live model choice. It is a separate audio setting rather than a preset parameter,
// and a model file on disk never changes live timbre or latency by itself.
internal static class NoiseSuppressionModels
{
    public const string Standard = "rnnoise";
    public const string DeepFilterNet3 = "deepfilternet3";

    public static string Parse(string? model) => model == DeepFilterNet3 ? DeepFilterNet3 : Standard;
}
