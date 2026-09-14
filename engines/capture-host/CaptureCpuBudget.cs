using System.Globalization;

namespace Switchboard.CaptureHost;

internal static class CaptureCpuBudget
{
    // Leave scheduling headroom for the foreground app. These limit FFmpeg
    // worker pools, not the process's total CPU usage or its affinity.
    internal static int EncoderThreads(int processors) => Math.Clamp(processors / 2, 1, 8);
    internal static int FilterThreads(int processors) => Math.Clamp(processors / 2, 1, 2);

    internal static IEnumerable<string> SoftwareEncoderArguments(string encoder)
    {
        if (!encoder.StartsWith("lib", StringComparison.OrdinalIgnoreCase)) yield break;
        var threads = EncoderThreads(Environment.ProcessorCount).ToString(CultureInfo.InvariantCulture);
        yield return "-threads:v"; yield return threads;
        // These encoders own additional pools that do not obey -threads alone.
        if (encoder == "libx265") {
            yield return "-x265-params"; yield return $"pools={threads}:frame-threads={Math.Min(2, EncoderThreads(Environment.ProcessorCount))}";
        } else if (encoder == "libsvtav1") {
            yield return "-svtav1-params"; yield return $"lp={threads}";
        }
    }
}
