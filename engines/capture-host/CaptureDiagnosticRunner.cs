using System.Diagnostics;
using System.Text;
using NAudio.CoreAudioApi;

namespace Switchboard.CaptureHost;

internal sealed record DiagnosticCheck(string Id, string Label, string Status, string Detail, double? DurationMs = null);

internal static class CaptureDiagnosticRunner
{
    internal static readonly string[] EncoderNames = [
        "h264_nvenc", "h264_amf", "h264_qsv", "libx264",
        "hevc_nvenc", "hevc_amf", "hevc_qsv", "libx265",
        "av1_nvenc", "av1_amf", "av1_qsv", "libsvtav1",
    ];

    public static async Task RunAsync(CaptureSettings settings, bool recording, Action<DiagnosticCheck> emit, CancellationToken cancellationToken)
    {
        var sources = new WindowsCaptureSources();
        var inventory = sources.ListSources();
        emit(new("sources", "Capture sources", "pass",
            $"{inventory.Count(source => source.Type == "display")} displays and {inventory.Count(source => source.Type == "window")} eligible windows. Window titles are omitted."));
        var game = sources.InspectAutomaticGame();
        emit(new("game-detection", "Automatic game detection", game.Source is null ? "warning" : "pass",
            game.Source is not null
                ? $"An eligible game window was found. Foreground recognized: {game.ForegroundRecognized}. Recognized game processes: {game.Candidates}."
                : game.Candidates > 1
                    ? "Several eligible games are open. Bring the intended game to the foreground, or select its window explicitly."
                    : "No eligible game window was found. Keep the game open and unminimized, or select a window or display. Changing codecs does not resolve missing game detection."));

        foreach (var (id, label, path) in new[] {
            ("storage.cache", "Replay cache", settings.CacheDirectory),
            ("storage.clips", "Clip storage", settings.ClipsDirectory),
        })
        {
            cancellationToken.ThrowIfCancellationRequested();
            var temporary = Path.Combine(path, $".switchboard-diagnostic-{Guid.NewGuid():N}.tmp");
            try
            {
                Directory.CreateDirectory(path);
                await File.WriteAllTextAsync(temporary, "Switchboard diagnostic write test", cancellationToken);
                var drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(path))!);
                emit(new(id, label, drive.AvailableFreeSpace < 1_073_741_824 ? "warning" : "pass",
                    $"Write access confirmed. {drive.AvailableFreeSpace / 1_073_741_824d:F1} GiB available."));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception error) { emit(new(id, label, "fail", error.Message)); }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }

        CheckEndpoint("audio.system", "Game audio endpoint", settings.IncludeSystemAudio, settings.SystemAudioDeviceId, DataFlow.Render, emit);
        CheckEndpoint("audio.microphone", "Microphone endpoint", settings.IncludeMic, ReplayEngine.ResolveMicrophoneEndpointId(settings), DataFlow.Capture, emit);
        CheckEndpoint("audio.chat", "Chat audio endpoint", settings.IncludeChatAudio, settings.ChatAudioDeviceId, DataFlow.Render, emit);
        if (recording)
        {
            emit(new("capture.active", "Capture probes", "skipped", "Replay is recording. Encoder and capture probes were skipped to keep the recording running. Endpoint checks do not test recorded audio."));
            return;
        }

        emit(new("ffmpeg", "FFmpeg installation", "running", "Checking the packaged capture tools."));
        var ffmpeg = FfmpegLocator.FindFfmpeg();
        var ffprobe = FfmpegLocator.FindFfprobe(ffmpeg);
        var version = await RunProcessAsync(ffmpeg, ["-version"], cancellationToken);
        var probeVersion = await RunProcessAsync(ffprobe, ["-version"], cancellationToken);
        emit(new("ffmpeg", "FFmpeg installation", version.ExitCode == 0 && probeVersion.ExitCode == 0 ? "pass" : "fail",
            version.Output.Split('\n')[0] + "\n" + probeVersion.Output.Split('\n')[0]));
        var compiled = await RunProcessAsync(ffmpeg, ["-hide_banner", "-encoders"], cancellationToken);
        var filters = await RunProcessAsync(ffmpeg, ["-hide_banner", "-filters"], cancellationToken);
        var working = new List<string>();
        foreach (var encoder in EncoderNames)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!compiled.Output.Contains(encoder, StringComparison.Ordinal)) continue;
            var id = $"encoder.{encoder}";
            emit(new(id, encoder, "running", "Testing a synthetic frame; no screen content is used."));
            try
            {
                var probe = await RunProcessAsync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "color=size=640x360:rate=1", "-frames:v", "1", "-c:v", encoder, "-f", "null", "-"], cancellationToken);
                if (probe.ExitCode == 0) working.Add(encoder);
                emit(new(id, encoder, probe.ExitCode == 0 ? "pass" : "skipped",
                    probe.ExitCode == 0 ? "Synthetic encoding passed. Live capture is tested separately." : $"Unavailable on this system; excluded from automatic selection.\n{probe.Output}", probe.DurationMs));
            }
            catch (TimeoutException error) { emit(new(id, encoder, "warning", error.Message)); }
        }

        string selected;
        try
        {
            selected = ReplayEngine.SelectEncoder(settings, working);
            emit(new("encoder-selection", "Current codec and encoder", "pass", $"The current preference resolves to {selected}."));
        }
        catch (Exception error)
        {
            emit(new("encoder-selection", "Current codec and encoder", "fail", error.Message + " Choose Automatic to use a working encoder."));
            selected = working.FirstOrDefault() ?? string.Empty;
        }
        var gfx = filters.Output.Contains("gfxcapture", StringComparison.Ordinal);
        var dda = filters.Output.Contains("ddagrab", StringComparison.Ordinal);
        if (!gfx && !dda)
        {
            emit(new("capture.filters", "Windows capture backend", "fail", "This FFmpeg build has neither Windows Graphics Capture nor Desktop Duplication."));
            return;
        }
        var backend = gfx ? "Windows Graphics Capture" : "Desktop Duplication";
        var currentSource = settings.Source == "automatic-game" ? game.Source : sources.ResolveExplicit(settings);
        if (currentSource?.Available == true && selected.Length > 0 && (gfx || currentSource.Type == "display"))
            await CaptureProbe("capture.current", "Current source and settings", ffmpeg, settings, currentSource, backend, selected, emit, cancellationToken);
        else emit(new("capture.current", "Current source and settings", "skipped", "No supported current source/encoder pair is available. Display tests below isolate capture from game detection."));

        var displaySettings = settings with { Source = "display", SourceId = null, Resolution = "1080p", Fps = 30, Codec = "h264", Encoder = "auto" };
        var display = sources.ResolveExplicit(displaySettings);
        if (display?.Available != true)
        {
            emit(new("capture.display", "Selected display", "fail", "The selected display is unavailable. Choose a connected display."));
            return;
        }
        var hardware = working.FirstOrDefault(name => name.StartsWith("h264_", StringComparison.Ordinal));
        if (hardware is not null)
            await CaptureProbe("capture.hardware", "Display · hardware H.264", ffmpeg, displaySettings, display, backend, hardware, emit, cancellationToken);
        if (working.Contains("libx264"))
        {
            await CaptureProbe("capture.software", "Display · software H.264", ffmpeg, displaySettings, display, backend, "libx264", emit, cancellationToken);
            if (gfx && dda)
                await CaptureProbe("capture.duplication", "Display · Desktop Duplication", ffmpeg, displaySettings, display, "Desktop Duplication", "libx264", emit, cancellationToken);
        }
        emit(new("capture.scope", "Test coverage", "skipped", "Capture probes encode three frames to a discard sink. No recording is saved. Replay ring saves, long-running stability, and recorded audio are not tested."));
    }

    private static void CheckEndpoint(string id, string label, bool enabled, string? endpointId, DataFlow flow, Action<DiagnosticCheck> emit)
    {
        if (!enabled) { emit(new(id, label, "skipped", "This track is disabled.")); return; }
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var device = endpointId is { Length: > 0 } ? enumerator.GetDevice(endpointId) : enumerator.GetDefaultAudioEndpoint(flow, Role.Multimedia);
            emit(new(id, label, device.State == DeviceState.Active && device.DataFlow == flow ? "pass" : "fail",
                $"Endpoint state: {device.State}; direction: {device.DataFlow}. Audio signal and recording are not sampled."));
        }
        catch (Exception error) { emit(new(id, label, "fail", error.Message)); }
    }

    private static async Task CaptureProbe(string id, string label, string ffmpeg, CaptureSettings settings, CaptureSource source,
        string backend, string encoder, Action<DiagnosticCheck> emit, CancellationToken cancellationToken)
    {
        emit(new(id, label, "running", $"Testing {backend} with {encoder}; frames will be discarded."));
        try
        {
            var result = await RunProcessAsync(ffmpeg, ReplayEngine.BuildVideoArguments(settings, source, backend, encoder, "", diagnosticProbe: true), cancellationToken);
            var passed = result.ExitCode == 0 && result.Frames > 0;
            emit(new(id, label, passed ? "pass" : "fail", passed
                ? $"{result.Frames} frames encoded by {encoder} through {backend}. No recording saved."
                : $"{backend} / {encoder} failed (exit {result.ExitCode}, frames {result.Frames}).\n{result.Output}", result.DurationMs));
        }
        catch (TimeoutException error) { emit(new(id, label, "fail", error.Message)); }
    }

    internal sealed record ProcessResult(int ExitCode, string Output, long Frames, double DurationMs);

    internal static async Task<ProcessResult> RunProcessAsync(string executable, IEnumerable<string> arguments, CancellationToken cancellationToken,
        int timeoutMs = 5000)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(timeoutMs);
        using var job = new WindowsChildProcessJob();
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        var started = Stopwatch.GetTimestamp();
        using var process = job.Start(start, "diagnostic probe");
        process.StandardInput.Close();
        var stdout = ReadBoundedAsync(process.StandardOutput);
        long frames = 0;
        var stderr = FfmpegCaptureOutput.ReadAsync(process.StandardError, value => frames = value, _ => { }, CancellationToken.None);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            return new(process.ExitCode, string.Concat(await stdout, "\n", await stderr).Trim(), frames, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"The probe exceeded {timeoutMs / 1000d:g} seconds and was stopped.");
        }
        finally
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync(CancellationToken.None);
            await Task.WhenAll(stdout, stderr);
        }
    }

    private static async Task<string> ReadBoundedAsync(StreamReader reader)
    {
        var output = new StringBuilder();
        var buffer = new char[4096];
        int read;
        while ((read = await reader.ReadAsync(buffer)) > 0)
            if (output.Length < 65536) output.Append(buffer, 0, Math.Min(read, 65536 - output.Length));
        return output.ToString();
    }
}
