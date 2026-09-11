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
        CancellationToken cancellationToken,
        Action<string>? onDiagnostic = null)
    {
        var arguments = new[]
        {
            "-nostdin", "-hide_banner", "-loglevel", "error",
            // Current NVIDIA encoders reject dimensions below their hardware minimum.
            // Probe at a small, universally useful encode size instead of producing a
            // false negative that silently selects the software fallback.
            "-f", "lavfi", "-i", "color=size=640x360:rate=1",
            "-frames:v", "1", "-c:v", encoder, "-f", "null", "-",
        };
        // Startup probes must never inherit the host's JSON command input. Reuse
        // the isolated, bounded runner so cancellation also reaps the child.
        // Cold driver initialization can take several seconds; keep a 15-second
        // startup allowance rather than mistaking it for unsupported hardware.
        var result = await CaptureDiagnosticRunner.RunProcessAsync(ffmpegPath, arguments, cancellationToken, timeoutMs: 15_000);
        if (!string.IsNullOrWhiteSpace(result.Output)) onDiagnostic?.Invoke(result.Output[..Math.Min(4096, result.Output.Length)]);
        return result.ExitCode == 0;
    }

    public static async Task<string> ReadVersionAsync(string ffmpegPath, CancellationToken cancellationToken)
    {
        var text = await RunForTextAsync(ffmpegPath, ["-version"], cancellationToken);
        var summary = string.Join("\n", text.Split('\n').Take(3)).Trim();
        return summary[..Math.Min(4096, summary.Length)];
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
        var result = await CaptureDiagnosticRunner.RunProcessAsync(executable, arguments, cancellationToken, timeoutMs: 15_000);
        return result.Output;
    }
}
