using System.Diagnostics;

namespace Switchboard.CaptureHost;

internal static class FfmpegLocator
{
    public static string FindFfmpeg() => FindExecutable("SWITCHBOARD_FFMPEG", "ffmpeg")
        ?? throw new FileNotFoundException(
            "FFmpeg was not found. Install the Capture module or set SWITCHBOARD_FFMPEG to ffmpeg.exe.");

    public static string FindFfprobe(string ffmpegPath)
    {
        var configured = FindExecutable("SWITCHBOARD_FFPROBE", "ffprobe");
        if (configured is not null) return configured;
        var besideFfmpeg = Path.Combine(Path.GetDirectoryName(ffmpegPath)!, "ffprobe.exe");
        if (File.Exists(besideFfmpeg)) return besideFfmpeg;
        throw new FileNotFoundException("ffprobe.exe was not found beside FFmpeg or on PATH.");
    }

    public static async Task<HashSet<string>> ReadEncodersAsync(string ffmpegPath, CancellationToken cancellationToken)
    {
        var text = await RunForTextAsync(ffmpegPath, ["-hide_banner", "-encoders"], cancellationToken);
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

    public static async Task<HashSet<string>> ReadCaptureFiltersAsync(string ffmpegPath, CancellationToken cancellationToken)
    {
        var text = await RunForTextAsync(ffmpegPath, ["-hide_banner", "-filters"], cancellationToken);
        return new[] { "gfxcapture", "ddagrab" }
            .Where(name => text.Contains(name, StringComparison.OrdinalIgnoreCase))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public static async Task<bool> ProbeEncoderAsync(
        string ffmpegPath,
        string encoder,
        CancellationToken cancellationToken)
    {
        var arguments = new[]
        {
            "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "color=size=128x72:rate=1",
            "-frames:v", "1", "-c:v", encoder, "-f", "null", "-",
        };
        using var process = CreateProcess(ffmpegPath, arguments);
        process.Start();
        await process.StandardOutput.ReadToEndAsync(cancellationToken);
        await process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        return process.ExitCode == 0;
    }

    private static string? FindExecutable(string environmentVariable, string baseName)
    {
        var configured = Environment.GetEnvironmentVariable(environmentVariable);
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return Path.GetFullPath(configured);

        var executable = OperatingSystem.IsWindows() ? $"{baseName}.exe" : baseName;
        var localCandidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, executable),
            Path.Combine(AppContext.BaseDirectory, "ffmpeg", executable),
            Path.Combine(AppContext.BaseDirectory, "..", "ffmpeg", executable),
        };
        foreach (var candidate in localCandidates)
        {
            if (File.Exists(candidate)) return Path.GetFullPath(candidate);
        }

        foreach (var segment in (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var candidate = Path.Combine(segment, executable);
            if (File.Exists(candidate)) return Path.GetFullPath(candidate);
        }
        return null;
    }

    private static async Task<string> RunForTextAsync(
        string executable,
        IEnumerable<string> arguments,
        CancellationToken cancellationToken)
    {
        using var process = CreateProcess(executable, arguments);
        process.Start();
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        return string.Concat(await outputTask, "\n", await errorTask);
    }

    private static Process CreateProcess(string executable, IEnumerable<string> arguments)
    {
        var start = new ProcessStartInfo(executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        return new Process { StartInfo = start };
    }
}
