namespace Switchboard.AudioHost.Realtime;

internal sealed class FrameTimingMetrics
{
    private readonly double[] samples;
    private long totalFrames;
    private double maximumMs;

    public FrameTimingMetrics(int capacity = 4_096) => samples = new double[capacity];

    public void Record(double milliseconds)
    {
        var sequence = totalFrames;
        samples[sequence % samples.Length] = milliseconds;
        if (milliseconds > maximumMs) maximumMs = milliseconds;
        Volatile.Write(ref totalFrames, sequence + 1);
    }

    public FrameTimingSnapshot Snapshot()
    {
        var total = Volatile.Read(ref totalFrames);
        var count = checked((int)Math.Min(total, samples.Length));
        if (count == 0) return new FrameTimingSnapshot(0, 0, 0, 0, 0);
        var copy = new double[count];
        var start = Math.Max(0, total - count);
        for (var index = 0; index < count; index++) copy[index] = samples[(start + index) % samples.Length];
        Array.Sort(copy);
        return new FrameTimingSnapshot(
            Percentile(copy, 0.50),
            Percentile(copy, 0.95),
            Percentile(copy, 0.99),
            maximumMs,
            total);
    }

    private static double Percentile(double[] sorted, double percentile)
    {
        var index = (int)Math.Ceiling(percentile * sorted.Length) - 1;
        return sorted[Math.Clamp(index, 0, sorted.Length - 1)];
    }
}

internal sealed record FrameTimingSnapshot(double P50Ms, double P95Ms, double P99Ms, double MaximumMs, long TotalFrames);

