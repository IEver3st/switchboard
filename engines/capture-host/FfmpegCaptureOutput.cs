using System.Globalization;

namespace Switchboard.CaptureHost;

internal static class FfmpegCaptureOutput
{
    // FFmpeg shares pipe:2 between progress records and encoder/filter diagnostics.
    // Keep a bounded tail per process so a retry cannot report an earlier failure.
    internal const int MaximumLines = 12;
    internal const int MaximumLineLength = 320;

    public static async Task<string> ReadAsync(
        StreamReader reader,
        Action<long> onFrames,
        Action<int> onDroppedFrames,
        CancellationToken cancellationToken,
        Action<string>? onDiagnostic = null)
    {
        var diagnostics = new Queue<string>();
        try
        {
            while (await reader.ReadLineAsync(cancellationToken) is { } line)
            {
                var separator = line.IndexOf('=');
                if (separator > 0)
                {
                    var key = line[..separator];
                    var value = line[(separator + 1)..];
                    if (key == "frame" && long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var frames))
                        onFrames(frames);
                    if (key == "drop_frames" && int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var dropped))
                        onDroppedFrames(dropped);
                    if (IsProgressKey(key)) continue;
                }

                line = line.Trim();
                if (line.Length == 0) continue;
                onDiagnostic?.Invoke(line.Length > 4096 ? line[..4096] : line);
                diagnostics.Enqueue(line.Length > MaximumLineLength ? line[..MaximumLineLength] : line);
                if (diagnostics.Count > MaximumLines) diagnostics.Dequeue();
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (ObjectDisposedException) { }
        catch (IOException) { }
        return string.Join("\n", diagnostics);
    }

    public static string FailureMessage(int exitCode, string diagnostics, bool duringStartup) =>
        $"FFmpeg capture exited{(duringStartup ? " during startup" : "")} with code {exitCode}."
        + (string.IsNullOrWhiteSpace(diagnostics) ? string.Empty : $"\n{diagnostics}");

    private static bool IsProgressKey(string key) => key is
        "frame" or "fps" or "bitrate" or "total_size" or "out_time_us" or "out_time_ms"
        or "out_time" or "dup_frames" or "drop_frames" or "speed" or "progress"
        || key.StartsWith("stream_", StringComparison.Ordinal) && key.EndsWith("_q", StringComparison.Ordinal);
}
