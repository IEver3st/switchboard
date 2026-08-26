using System.Diagnostics;

namespace Switchboard.CaptureHost;

internal static class FfmpegLocator
{
    public static string? Find()
    {
        var configured = Environment.GetEnvironmentVariable("SWITCHBOARD_FFMPEG");
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured))
        {
            return configured;
        }

        var executable = OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg";
        foreach (var segment in (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var candidate = Path.Combine(segment, executable);
            if (File.Exists(candidate)) return candidate;
        }

        return null;
    }

    public static async Task<HashSet<string>> ReadEncodersAsync(string ffmpegPath, CancellationToken cancellationToken)
    {
        var start = new ProcessStartInfo(ffmpegPath)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        start.ArgumentList.Add("-hide_banner");
        start.ArgumentList.Add("-encoders");

        using var process = Process.Start(start) ?? throw new InvalidOperationException("Unable to start FFmpeg.");
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var text = string.Concat(await outputTask, "\n", await errorTask);

        var known = new[]
        {
            "av1_nvenc", "hevc_nvenc", "h264_nvenc",
            "av1_amf", "hevc_amf", "h264_amf",
            "av1_qsv", "hevc_qsv", "h264_qsv",
            "libsvtav1", "libx265", "libx264",
        };

        return known.Where(name => text.Contains(name, StringComparison.OrdinalIgnoreCase))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
