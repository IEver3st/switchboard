using System.Diagnostics;
using System.Globalization;

namespace Switchboard.CaptureHost;

internal sealed class ReplayEngine : IAsyncDisposable
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string ringDirectory;
    private Process? ffmpeg;
    private CaptureSettings settings = new();
    private string encoderName = "simulation";
    private DateTimeOffset? startedAt;
    private bool simulation = true;

    public ReplayEngine()
    {
        ringDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Switchboard",
            "ReplayRing");
    }

    public async Task<CaptureStatus> StartAsync(CaptureSettings next, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            settings = next;
            if (ffmpeg is { HasExited: false }) return GetStatus();

            Directory.CreateDirectory(ringDirectory);
            DeleteFiles(ringDirectory, "segment-*.mkv");

            var ffmpegPath = FfmpegLocator.Find();
            var realCaptureRequested = string.Equals(
                Environment.GetEnvironmentVariable("SWITCHBOARD_REAL_CAPTURE"),
                "1",
                StringComparison.Ordinal);

            if (!OperatingSystem.IsWindows() || ffmpegPath is null || !realCaptureRequested)
            {
                simulation = true;
                encoderName = "simulation";
                startedAt = DateTimeOffset.UtcNow;
                return GetStatus("Set SWITCHBOARD_REAL_CAPTURE=1 and SWITCHBOARD_FFMPEG to exercise the Windows FFmpeg path.");
            }

            var encoders = await FfmpegLocator.ReadEncodersAsync(ffmpegPath, cancellationToken);
            encoderName = SelectEncoder(settings, encoders);
            ffmpeg = StartFfmpeg(ffmpegPath, settings, encoderName);
            simulation = false;
            startedAt = DateTimeOffset.UtcNow;
            return GetStatus();
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<CaptureStatus> StopAsync(CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (ffmpeg is { HasExited: false })
            {
                try
                {
                    ffmpeg.StandardInput.WriteLine("q");
                    await ffmpeg.WaitForExitAsync(cancellationToken).WaitAsync(TimeSpan.FromSeconds(3), cancellationToken);
                }
                catch
                {
                    ffmpeg.Kill(entireProcessTree: true);
                }
            }

            ffmpeg?.Dispose();
            ffmpeg = null;
            startedAt = null;
            return GetStatus();
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task ConfigureAsync(CaptureSettings next, CancellationToken cancellationToken)
    {
        var wasRunning = startedAt is not null;
        settings = next;
        if (!wasRunning) return;
        await StopAsync(cancellationToken);
        await StartAsync(next, cancellationToken);
    }

    public async Task<SavedReplay> SaveReplayAsync(string outputDirectory, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(outputDirectory);
        var createdAt = DateTimeOffset.Now;
        var safeStamp = createdAt.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture);

        if (simulation)
        {
            var path = Path.Combine(outputDirectory, $"Switchboard_{safeStamp}.prototype.json");
            var estimatedSize = Math.Round(settings.ReplaySeconds * 3.75, 1);
            await File.WriteAllTextAsync(
                path,
                $$"""
                {
                  "prototype": true,
                  "durationSeconds": {{settings.ReplaySeconds}},
                  "estimatedSizeMb": {{estimatedSize.ToString(CultureInfo.InvariantCulture)}},
                  "createdAt": "{{createdAt:O}}",
                  "note": "Capture control path is working; real FFmpeg capture is opt-in for this prototype."
                }
                """,
                cancellationToken);
            return new SavedReplay($"Prototype replay · {settings.ReplaySeconds}s", path, settings.ReplaySeconds, estimatedSize, createdAt, true);
        }

        var ffmpegPath = FfmpegLocator.Find() ?? throw new InvalidOperationException("FFmpeg disappeared while capture was active.");
        var segments = Directory.GetFiles(ringDirectory, "segment-*.mkv")
            .Select(path => new FileInfo(path))
            .Where(file => file.Length > 0)
            .OrderBy(file => file.LastWriteTimeUtc)
            .ToArray();
        if (segments.Length == 0) throw new InvalidOperationException("Replay ring contains no completed segments yet.");

        var snapshotDirectory = Path.Combine(ringDirectory, $"snapshot-{Guid.NewGuid():N}");
        Directory.CreateDirectory(snapshotDirectory);
        try
        {
            var copied = new List<string>(segments.Length);
            for (var index = 0; index < segments.Length; index++)
            {
                var destination = Path.Combine(snapshotDirectory, $"{index:D4}.mkv");
                File.Copy(segments[index].FullName, destination, overwrite: true);
                copied.Add(destination);
            }

            var concatPath = Path.Combine(snapshotDirectory, "concat.txt");
            await File.WriteAllLinesAsync(
                concatPath,
                copied.Select(path => $"file '{path.Replace("'", "'\\''")}'"),
                cancellationToken);

            var outputPath = Path.Combine(outputDirectory, $"Switchboard_{safeStamp}.mp4");
            await RunRemuxAsync(ffmpegPath, concatPath, outputPath, cancellationToken);
            var sizeMb = Math.Round(new FileInfo(outputPath).Length / 1024d / 1024d, 1);
            return new SavedReplay($"Replay · {settings.ReplaySeconds}s", outputPath, settings.ReplaySeconds, sizeMb, createdAt, false);
        }
        finally
        {
            try { Directory.Delete(snapshotDirectory, recursive: true); } catch { }
        }
    }

    public CaptureStatus GetStatus(string? message = null)
    {
        var running = startedAt is not null;
        var buffered = running
            ? Math.Min(settings.ReplaySeconds, (DateTimeOffset.UtcNow - startedAt!.Value).TotalSeconds)
            : 0;
        var segmentCount = simulation
            ? (int)Math.Ceiling(buffered / settings.SegmentSeconds)
            : Directory.Exists(ringDirectory) ? Directory.GetFiles(ringDirectory, "segment-*.mkv").Length : 0;

        return new CaptureStatus(
            running ? "running" : "stopped",
            simulation,
            ffmpeg is { HasExited: false } ? ffmpeg.Id : null,
            Math.Round(Environment.WorkingSet / 1024d / 1024d, 1),
            Math.Round(buffered, 1),
            segmentCount,
            encoderName,
            message);
    }

    public async ValueTask DisposeAsync()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await StopAsync(timeout.Token);
        gate.Dispose();
    }

    private Process StartFfmpeg(string ffmpegPath, CaptureSettings capture, string encoder)
    {
        var start = new ProcessStartInfo(ffmpegPath)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        foreach (var argument in BuildArguments(capture, encoder)) start.ArgumentList.Add(argument);
        var process = Process.Start(start) ?? throw new InvalidOperationException("Unable to launch FFmpeg capture.");
        _ = DrainAsync(process.StandardOutput);
        _ = DrainAsync(process.StandardError);
        return process;
    }

    private IEnumerable<string> BuildArguments(CaptureSettings capture, string encoder)
    {
        yield return "-hide_banner";
        yield return "-loglevel";
        yield return "warning";
        yield return "-f";
        yield return "lavfi";
        yield return "-i";
        yield return $"ddagrab=output_idx={capture.DisplayIndex}:framerate={capture.FramesPerSecond}:draw_mouse={(capture.IncludeCursor ? 1 : 0)}";
        if (encoder.StartsWith("lib", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-vf";
            yield return "hwdownload,format=bgra";
        }
        yield return "-c:v";
        yield return encoder;

        if (encoder.Contains("nvenc", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-preset";
            yield return "p4";
            yield return "-tune";
            yield return "hq";
            yield return "-cq";
            yield return Math.Clamp(26 - capture.Quality * 2, 14, 24).ToString(CultureInfo.InvariantCulture);
            yield return "-b:v";
            yield return "0";
        }
        else if (encoder.StartsWith("lib", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-crf";
            yield return Math.Clamp(30 - capture.Quality * 2, 16, 28).ToString(CultureInfo.InvariantCulture);
            yield return "-preset";
            yield return "veryfast";
        }

        yield return "-g";
        yield return (capture.FramesPerSecond * capture.SegmentSeconds).ToString(CultureInfo.InvariantCulture);
        yield return "-f";
        yield return "segment";
        yield return "-segment_time";
        yield return capture.SegmentSeconds.ToString(CultureInfo.InvariantCulture);
        yield return "-segment_wrap";
        yield return capture.SegmentCount.ToString(CultureInfo.InvariantCulture);
        yield return "-reset_timestamps";
        yield return "1";
        yield return Path.Combine(ringDirectory, "segment-%03d.mkv");
    }

    private static string SelectEncoder(CaptureSettings capture, HashSet<string> available)
    {
        IEnumerable<string> preferred = capture.Codec switch
        {
            "av1" => ["av1_nvenc", "av1_amf", "av1_qsv", "libsvtav1"],
            "hevc" => ["hevc_nvenc", "hevc_amf", "hevc_qsv", "libx265"],
            _ => ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"],
        };

        if (capture.Encoder is not "auto")
        {
            preferred = preferred.OrderByDescending(name => name.Contains(capture.Encoder, StringComparison.OrdinalIgnoreCase));
        }

        return preferred.FirstOrDefault(available.Contains)
               ?? throw new InvalidOperationException($"No encoder is available for codec '{capture.Codec}'.");
    }

    private static async Task RunRemuxAsync(string ffmpegPath, string concatPath, string outputPath, CancellationToken cancellationToken)
    {
        var start = new ProcessStartInfo(ffmpegPath)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in new[] { "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", "-movflags", "+faststart", outputPath })
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start) ?? throw new InvalidOperationException("Unable to launch FFmpeg remux.");
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var error = await errorTask;
        if (process.ExitCode != 0) throw new InvalidOperationException($"FFmpeg remux failed: {error.Trim()}");
    }

    private static async Task DrainAsync(StreamReader reader)
    {
        while (await reader.ReadLineAsync() is not null) { }
    }

    private static void DeleteFiles(string directory, string pattern)
    {
        if (!Directory.Exists(directory)) return;
        foreach (var path in Directory.GetFiles(directory, pattern))
        {
            try { File.Delete(path); } catch { }
        }
    }
}
