using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace Switchboard.CaptureHost;

internal sealed record MediaInfo(long DurationMs, int Width, int Height, double Fps, string? Codec);

internal static class MediaProbe
{
    public static async Task<MediaInfo> ProbeAsync(
        string ffprobePath,
        string mediaPath,
        CancellationToken cancellationToken)
    {
        var start = new ProcessStartInfo(ffprobePath)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in new[]
                 {
                     "-v", "error", "-print_format", "json", "-show_entries",
                     "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate", mediaPath,
                 })
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start) ?? throw new InvalidOperationException("Unable to start ffprobe.");
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var output = await outputTask;
        var error = await errorTask;
        if (process.ExitCode != 0) throw new InvalidOperationException($"ffprobe failed: {error.Trim()}");

        using var document = JsonDocument.Parse(output);
        var video = document.RootElement.GetProperty("streams")
            .EnumerateArray()
            .FirstOrDefault(stream => stream.TryGetProperty("codec_type", out var type) && type.GetString() == "video");
        if (video.ValueKind == JsonValueKind.Undefined) throw new InvalidDataException("Saved replay has no video stream.");
        var durationText = document.RootElement.GetProperty("format").GetProperty("duration").GetString() ?? "0";
        _ = double.TryParse(durationText, NumberStyles.Float, CultureInfo.InvariantCulture, out var durationSeconds);
        var frameRateText = video.TryGetProperty("avg_frame_rate", out var rate) ? rate.GetString() : null;
        var fps = ParseRate(frameRateText);

        return new MediaInfo(
            (long)Math.Round(durationSeconds * 1000),
            video.TryGetProperty("width", out var width) ? width.GetInt32() : 0,
            video.TryGetProperty("height", out var height) ? height.GetInt32() : 0,
            fps,
            video.TryGetProperty("codec_name", out var codec) ? codec.GetString() : null);
    }

    private static double ParseRate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        var pieces = value.Split('/', 2);
        if (!double.TryParse(pieces[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var numerator)) return 0;
        if (pieces.Length == 1) return numerator;
        if (!double.TryParse(pieces[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var denominator)
            || denominator == 0) return 0;
        return Math.Round(numerator / denominator, 3);
    }
}
