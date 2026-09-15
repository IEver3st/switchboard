namespace Switchboard.CaptureHost;

internal static class StorageHeadroom
{
    internal static (bool Critical, bool Low, string? Problem) Evaluate(long? clips, long? cache, long estimatedReplayBytes)
    {
        var low = Math.Max(5L * 1024 * 1024 * 1024, estimatedReplayBytes * 4);
        var critical = Math.Max(1L * 1024 * 1024 * 1024, estimatedReplayBytes * 2);
        var clipsProblem = clips is null || clips < low;
        var cacheProblem = cache is null || cache < low;
        return (clips is null || cache is null || clips < critical || cache < critical,
            clipsProblem || cacheProblem,
            clipsProblem && cacheProblem ? "both" : clipsProblem ? "clips" : cacheProblem ? "cache" : null);
    }
}
