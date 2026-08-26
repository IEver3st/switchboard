using System.Diagnostics;
using System.Globalization;

namespace Switchboard.CaptureHost;

internal sealed class ReplayEngine : IAsyncDisposable
{
    private readonly SemaphoreSlim lifecycleGate = new(1, 1);
    private readonly SemaphoreSlim saveGate = new(1, 1);
    private readonly WindowsCaptureSources sourceService = new();
    private readonly CancellationTokenSource lifetime = new();
    private Process? ffmpeg;
    private AudioPipeCapture? systemAudio;
    private AudioPipeCapture? microphoneAudio;
    private ReplaySegmentRing? ring;
    private CaptureSettings? settings;
    private CaptureSource? activeSource;
    private CaptureSource? lastCaptureSource;
    private CaptureCapabilities capabilities = new("unavailable", [], [], 60, false, false);
    private CancellationTokenSource? monitorCancellation;
    private Task? monitorTask;
    private string? sessionDirectory;
    private string ffmpegPath = string.Empty;
    private string ffprobePath = string.Empty;
    private string encoderName = "Not selected";
    private string backendName = "Unavailable";
    private string operationalState = "stopped";
    private string? warning;
    private string? error;
    private DateTimeOffset? startedAt;
    private DateTimeOffset? lastSavedAt;
    private long encodedFrames;
    private int droppedFrames;
    private int audioSyncCorrections;
    private int saveQueueDepth;
    private int restartAttempts;
    private IReadOnlyList<CaptureSource> cachedSources = [];
    private DateTimeOffset lastSourceRefresh;

    public event Action<CaptureHostSnapshot>? SnapshotChanged;

    public int? FfmpegProcessId => ffmpeg is { HasExited: false } ? ffmpeg.Id : null;
    public bool HostActive => operationalState is not "stopped";
    public TimeSpan Uptime => startedAt is null ? TimeSpan.Zero : DateTimeOffset.UtcNow - startedAt.Value;

    public async Task<CaptureHostSnapshot> StartAsync(CaptureSettings next, CancellationToken cancellationToken)
    {
        await lifecycleGate.WaitAsync(cancellationToken);
        try
        {
            if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Capture.Host requires Windows 10 1903 or newer.");
            next = next.Validate();
            if (HostActive)
            {
                settings = next;
                return GetSnapshot();
            }

            settings = next;
            operationalState = "starting";
            error = null;
            warning = null;
            startedAt = DateTimeOffset.UtcNow;
            EmitSnapshot();

            PrepareStorage(next);
            await ProbeCapabilitiesAsync(next, cancellationToken);
            EnsureStorageHeadroom(next, preventStart: true);

            if (next.Source == "automatic-game")
            {
                operationalState = "waiting";
                activeSource = null;
            }
            else
            {
                var source = sourceService.ResolveExplicit(next);
                if (source is null || !source.Available)
                    throw new InvalidOperationException("The selected capture source is no longer available.");
                await StartFfmpegInternalAsync(source, cancellationToken);
            }

            StartMonitor();
            EmitSnapshot();
            return GetSnapshot();
        }
        catch (Exception startError)
        {
            operationalState = "error";
            error = startError.Message;
            await StopFfmpegInternalAsync(CancellationToken.None, preserveRing: true);
            EmitSnapshot();
            throw;
        }
        finally
        {
            lifecycleGate.Release();
        }
    }

    public async Task<CaptureHostSnapshot> ConfigureAsync(CaptureSettings next, CancellationToken cancellationToken)
    {
        next = next.Validate();
        await lifecycleGate.WaitAsync(cancellationToken);
        try
        {
            var previous = settings;
            settings = next;
            if (!HostActive) return GetSnapshot();
            if (previous is null || RequiresRestart(previous, next))
            {
                operationalState = "recovering";
                EmitSnapshot();
                await StopFfmpegInternalAsync(cancellationToken, preserveRing: false);
                PrepareStorage(next);
                await ProbeCapabilitiesAsync(next, cancellationToken);
                EnsureStorageHeadroom(next, preventStart: true);
                if (next.Source == "automatic-game")
                {
                    activeSource = null;
                    operationalState = "waiting";
                }
                else
                {
                    var source = sourceService.ResolveExplicit(next);
                    if (source is null || !source.Available)
                        throw new InvalidOperationException("The selected capture source is no longer available.");
                    await StartFfmpegInternalAsync(source, cancellationToken);
                }
            }
            else if (sessionDirectory is not null)
            {
                ring?.Evict(
                    sessionDirectory,
                    TimeSpan.FromSeconds(next.SegmentRetentionSeconds),
                    next.MaximumCacheBytes,
                    captureRunning: ffmpeg is { HasExited: false });
            }
            EmitSnapshot();
            return GetSnapshot();
        }
        catch (Exception configureError)
        {
            operationalState = "error";
            error = configureError.Message;
            EmitSnapshot();
            throw;
        }
        finally
        {
            lifecycleGate.Release();
        }
    }

    public async Task<CaptureHostSnapshot> StopAsync(CancellationToken cancellationToken)
    {
        await lifecycleGate.WaitAsync(cancellationToken);
        try
        {
            monitorCancellation?.Cancel();
            await StopFfmpegInternalAsync(cancellationToken, preserveRing: false);
            operationalState = "stopped";
            activeSource = null;
            lastCaptureSource = null;
            startedAt = null;
            error = null;
            warning = null;
            EmitSnapshot();
            return GetSnapshot();
        }
        finally
        {
            lifecycleGate.Release();
        }
    }

    public async Task<SavedReplay> SaveReplayAsync(CancellationToken cancellationToken)
    {
        CaptureSettings capture;
        string snapshotDirectory;
        CaptureSource? clipSource;

        await lifecycleGate.WaitAsync(cancellationToken);
        try
        {
            capture = settings ?? throw new InvalidOperationException("Instant Replay is not configured.");
            if (!HostActive) throw new InvalidOperationException("Enable Instant Replay before saving a clip.");
            if (ring is null || sessionDirectory is null)
                throw new InvalidOperationException("Replay is waiting for a capture source.");
            EnsureStorageHeadroom(capture, preventStart: false);
            var segments = ring.List(sessionDirectory, captureRunning: ffmpeg is { HasExited: false });
            var selected = ring.SelectForReplay(segments, TimeSpan.FromSeconds(capture.ReplaySeconds));
            if (selected.Count == 0) throw new InvalidOperationException("Replay has not buffered a complete segment yet.");
            snapshotDirectory = ring.Snapshot(selected);
            clipSource = activeSource ?? lastCaptureSource;
            Interlocked.Increment(ref saveQueueDepth);
            EmitSnapshot();
        }
        finally
        {
            lifecycleGate.Release();
        }

        await saveGate.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(capture.ClipsDirectory);
            var createdAt = DateTimeOffset.Now;
            var outputPath = ClipFileNames.CreateUniquePath(capture.ClipsDirectory, clipSource?.Name, createdAt);
            var temporaryPath = $"{outputPath}.clip-writing";
            try
            {
                var concatPath = await WriteConcatFileAsync(snapshotDirectory, cancellationToken);
                await RunRemuxAsync(concatPath, temporaryPath, capture.ReplaySeconds, cancellationToken);
                await FlushFileAsync(temporaryPath, cancellationToken);
                File.Move(temporaryPath, outputPath);
                var media = await MediaProbe.ProbeAsync(ffprobePath, outputPath, cancellationToken);
                var file = new FileInfo(outputPath);
                lastSavedAt = createdAt;
                return new SavedReplay(
                    outputPath,
                    Path.GetFileNameWithoutExtension(outputPath),
                    clipSource?.Name,
                    createdAt.ToUnixTimeMilliseconds(),
                    media.DurationMs,
                    file.Length,
                    media.Width,
                    media.Height,
                    media.Fps,
                    media.Codec);
            }
            catch
            {
                try { if (File.Exists(temporaryPath)) File.Delete(temporaryPath); } catch { }
                throw;
            }
        }
        finally
        {
            saveGate.Release();
            ReplaySegmentRing.TryDeleteDirectory(snapshotDirectory);
            Interlocked.Decrement(ref saveQueueDepth);
            EmitSnapshot();
        }
    }

    public IReadOnlyList<CaptureSource> ListSources()
    {
        cachedSources = sourceService.ListSources();
        lastSourceRefresh = DateTimeOffset.UtcNow;
        return cachedSources;
    }

    public CaptureHostSnapshot GetSnapshot()
    {
        var capture = settings;
        var segments = capture is not null && ring is not null && sessionDirectory is not null
            ? ring.List(sessionDirectory, captureRunning: ffmpeg is { HasExited: false })
            : [];
        var complete = segments.Where(segment => segment.Complete).ToArray();
        var cacheBytes = complete.Sum(segment => segment.SizeBytes);
        var bufferedSeconds = complete.Length == 0
            ? 0
            : Math.Min(capture?.ReplaySeconds ?? 0, (complete[^1].EndedAt - complete[0].StartedAt).TotalSeconds);
        var observedBitrate = bufferedSeconds >= 5 ? cacheBytes * 8d / bufferedSeconds : 0;
        var storage = GetStorageStatus(capture, cacheBytes);
        var state = Volatile.Read(ref saveQueueDepth) > 0 && operationalState is "buffering" or "waiting"
            ? "saving"
            : operationalState;
        var audioWarning = microphoneAudio?.Error ?? systemAudio?.Error;

        return new CaptureHostSnapshot(
            new CaptureRuntime(
                state,
                Math.Round(bufferedSeconds, 1),
                complete.Length,
                cacheBytes,
                Math.Round(observedBitrate),
                FriendlyEncoderName(encoderName),
                backendName,
                droppedFrames,
                encodedFrames,
                audioSyncCorrections,
                activeSource,
                Math.Max(0, Volatile.Read(ref saveQueueDepth)),
                Warning: warning ?? audioWarning,
                Error: error,
                LastSavedAt: lastSavedAt),
            storage,
            capabilities,
            GetCachedSources());
    }

    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try { await StopAsync(timeout.Token); } catch { }
        if (monitorTask is not null)
        {
            try { await monitorTask.WaitAsync(TimeSpan.FromSeconds(2)); } catch { }
        }
        monitorCancellation?.Dispose();
        lifetime.Dispose();
        lifecycleGate.Dispose();
        saveGate.Dispose();
    }

    private void PrepareStorage(CaptureSettings capture)
    {
        Directory.CreateDirectory(capture.CacheDirectory);
        Directory.CreateDirectory(capture.ClipsDirectory);
        if (!string.IsNullOrWhiteSpace(capture.ThumbnailDirectory)) Directory.CreateDirectory(capture.ThumbnailDirectory);
        ring = new ReplaySegmentRing(capture.CacheDirectory, capture.SegmentSeconds);
        ring.CleanupAbandonedSessions(TimeSpan.FromHours(24));
    }

    private async Task ProbeCapabilitiesAsync(CaptureSettings capture, CancellationToken cancellationToken)
    {
        ffmpegPath = FfmpegLocator.FindFfmpeg();
        ffprobePath = FfmpegLocator.FindFfprobe(ffmpegPath);
        var filters = await FfmpegLocator.ReadCaptureFiltersAsync(ffmpegPath, cancellationToken);
        if (!filters.Contains("gfxcapture") && !filters.Contains("ddagrab"))
            throw new InvalidOperationException("This FFmpeg build has no Windows Graphics Capture or Desktop Duplication filter.");
        backendName = filters.Contains("gfxcapture") ? "Windows Graphics Capture" : "Desktop Duplication";

        var compiled = await FfmpegLocator.ReadEncodersAsync(ffmpegPath, cancellationToken);
        var candidates = EncoderCandidates(capture.Codec).Where(compiled.Contains).ToArray();
        var working = new List<string>();
        foreach (var candidate in candidates)
        {
            if (await FfmpegLocator.ProbeEncoderAsync(ffmpegPath, candidate, cancellationToken)) working.Add(candidate);
        }

        encoderName = SelectEncoder(capture, working);
        var codecs = new List<string>();
        if (working.Any(name => name.StartsWith("h264", StringComparison.OrdinalIgnoreCase) || name == "libx264")) codecs.Add("h264");
        if (working.Any(name => name.StartsWith("hevc", StringComparison.OrdinalIgnoreCase) || name == "libx265")) codecs.Add("hevc");
        if (working.Any(name => name.StartsWith("av1", StringComparison.OrdinalIgnoreCase) || name == "libsvtav1")) codecs.Add("av1");
        if (!codecs.Contains(capture.Codec)) codecs.Add(capture.Codec);
        var hardwareAvailable = working.Any(name => !name.StartsWith("lib", StringComparison.OrdinalIgnoreCase));
        capabilities = new CaptureCapabilities(
            filters.Contains("gfxcapture") ? "windows-graphics-capture" : "desktop-duplication",
            working,
            codecs,
            hardwareAvailable ? 120 : 60,
            SystemAudio: true,
            MicrophoneAudio: true);
    }

    private async Task StartFfmpegInternalAsync(CaptureSource source, CancellationToken cancellationToken)
    {
        var capture = settings ?? throw new InvalidOperationException("Capture settings are missing.");
        if (ring is null) throw new InvalidOperationException("Replay ring is not initialized.");
        EnsureStorageHeadroom(capture, preventStart: true);
        sessionDirectory = ring.CreateSessionDirectory();

        try
        {
            systemAudio = capture.IncludeSystemAudio ? AudioPipeCapture.CreateSystemLoopback() : null;
            try
            {
                microphoneAudio = capture.IncludeMic ? AudioPipeCapture.CreateDefaultMicrophone() : null;
            }
            catch (Exception microphoneError)
            {
                microphoneAudio = null;
                warning = $"Microphone track unavailable: {microphoneError.Message}";
            }

            var start = BuildStartInfo(capture, source, sessionDirectory, systemAudio, microphoneAudio);
            ffmpeg = Process.Start(start) ?? throw new InvalidOperationException("Unable to launch FFmpeg capture.");
            _ = ReadProgressAsync(ffmpeg.StandardError, lifetime.Token);
            _ = DrainAsync(ffmpeg.StandardOutput, lifetime.Token);

            using var pipeTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            pipeTimeout.CancelAfter(TimeSpan.FromSeconds(8));
            var audioConnections = new[] { systemAudio, microphoneAudio }
                .Where(input => input is not null)
                .Select(input => input!.ConnectAndStartAsync(pipeTimeout.Token));
            await Task.WhenAll(audioConnections);

            await Task.Delay(350, cancellationToken);
            if (ffmpeg.HasExited)
                throw new InvalidOperationException($"FFmpeg capture exited during startup with code {ffmpeg.ExitCode}.");
            activeSource = source;
            lastCaptureSource = source;
            operationalState = "buffering";
            error = null;
            restartAttempts = 0;
        }
        catch
        {
            await StopFfmpegInternalAsync(CancellationToken.None, preserveRing: false);
            throw;
        }
    }

    private ProcessStartInfo BuildStartInfo(
        CaptureSettings capture,
        CaptureSource source,
        string outputDirectory,
        AudioPipeCapture? loopback,
        AudioPipeCapture? microphone)
    {
        var start = new ProcessStartInfo(ffmpegPath)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        var arguments = BuildArguments(capture, source, outputDirectory, loopback, microphone);
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        return start;
    }

    private IEnumerable<string> BuildArguments(
        CaptureSettings capture,
        CaptureSource source,
        string outputDirectory,
        AudioPipeCapture? loopback,
        AudioPipeCapture? microphone)
    {
        yield return "-hide_banner";
        yield return "-loglevel";
        yield return "warning";
        yield return "-nostats";
        yield return "-progress";
        yield return "pipe:2";
        yield return "-thread_queue_size";
        yield return "256";
        yield return "-f";
        yield return "lavfi";
        yield return "-i";
        yield return BuildCaptureFilter(capture, source);

        var audioInputs = new[] { loopback, microphone }.Where(input => input is not null).Cast<AudioPipeCapture>().ToArray();
        foreach (var input in audioInputs)
        {
            yield return "-thread_queue_size";
            yield return "512";
            yield return "-f";
            yield return input.FfmpegSampleFormat;
            yield return "-ar";
            yield return input.SampleRate.ToString(CultureInfo.InvariantCulture);
            yield return "-ac";
            yield return input.Channels.ToString(CultureInfo.InvariantCulture);
            yield return "-use_wallclock_as_timestamps";
            yield return "1";
            yield return "-i";
            yield return input.PipePath;
        }

        yield return "-map";
        yield return "0:v:0";
        for (var index = 0; index < audioInputs.Length; index++)
        {
            yield return "-map";
            yield return $"{index + 1}:a:0";
        }

        if (encoderName.StartsWith("lib", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-vf";
            yield return "hwdownload,format=bgra,format=yuv420p";
        }
        yield return "-c:v";
        yield return encoderName;
        foreach (var argument in EncoderArguments(capture, encoderName)) yield return argument;
        yield return "-g";
        yield return (capture.Fps * capture.SegmentSeconds).ToString(CultureInfo.InvariantCulture);
        yield return "-keyint_min";
        yield return (capture.Fps * capture.SegmentSeconds).ToString(CultureInfo.InvariantCulture);
        yield return "-force_key_frames";
        yield return $"expr:gte(t,n_forced*{capture.SegmentSeconds})";

        if (audioInputs.Length > 0)
        {
            yield return "-c:a";
            yield return "aac";
            yield return "-ar";
            yield return "48000";
            yield return "-af";
            yield return "aresample=async=1000:first_pts=0";
            for (var index = 0; index < audioInputs.Length; index++)
            {
                yield return $"-b:a:{index}";
                var bitrate = audioInputs[index] == loopback
                    ? capture.SystemAudioBitrateBps
                    : capture.MicrophoneBitrateBps;
                yield return bitrate.ToString(CultureInfo.InvariantCulture);
                yield return $"-metadata:s:a:{index}";
                yield return $"title={audioInputs[index].Label}";
            }
        }

        yield return "-max_interleave_delta";
        yield return "0";
        yield return "-f";
        yield return "segment";
        yield return "-segment_time";
        yield return capture.SegmentSeconds.ToString(CultureInfo.InvariantCulture);
        yield return "-segment_format";
        yield return "matroska";
        yield return "-reset_timestamps";
        yield return "1";
        yield return "-avoid_negative_ts";
        yield return "make_zero";
        yield return Path.Combine(outputDirectory, "segment-%09d.mkv");
    }

    private string BuildCaptureFilter(CaptureSettings capture, CaptureSource source)
    {
        var options = new List<string>();
        if (backendName == "Windows Graphics Capture")
        {
            if (source.WindowHandle is not null) options.Add($"hwnd={source.WindowHandle}");
            else options.Add($"monitor_idx={capture.DisplayIndex}");
            options.Add($"capture_cursor={(capture.IncludeCursor ? 1 : 0)}");
            options.Add("capture_border=0");
            options.Add("display_border=0");
            options.Add($"max_framerate={capture.Fps}");
            var dimensions = ResolutionDimensions(capture.Resolution);
            if (dimensions is not null)
            {
                options.Add($"width={dimensions.Value.Width}");
                options.Add($"height={dimensions.Value.Height}");
                options.Add("resize_mode=scale_aspect");
                options.Add("scale_mode=bilinear");
            }
            return $"gfxcapture={string.Join(':', options)}";
        }

        return $"ddagrab=output_idx={capture.DisplayIndex}:framerate={capture.Fps}:draw_mouse={(capture.IncludeCursor ? 1 : 0)}";
    }

    private static IEnumerable<string> EncoderArguments(CaptureSettings capture, string encoder)
    {
        var target = capture.TargetVideoBitrateBps.ToString(CultureInfo.InvariantCulture);
        var maximum = capture.MaximumVideoBitrateBps.ToString(CultureInfo.InvariantCulture);
        if (encoder.Contains("nvenc", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-preset"; yield return "p4";
            yield return "-tune"; yield return "hq";
            yield return "-rc"; yield return "vbr";
            yield return "-cq"; yield return Math.Clamp(27 - capture.Quality * 2, 15, 25).ToString(CultureInfo.InvariantCulture);
        }
        else if (encoder.Contains("amf", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-quality"; yield return "balanced";
            yield return "-rc"; yield return "vbr_peak";
        }
        else if (encoder.Contains("qsv", StringComparison.OrdinalIgnoreCase))
        {
            yield return "-preset"; yield return "medium";
            yield return "-global_quality"; yield return Math.Clamp(28 - capture.Quality * 2, 16, 26).ToString(CultureInfo.InvariantCulture);
        }
        else
        {
            yield return "-preset"; yield return "veryfast";
            yield return "-crf"; yield return Math.Clamp(30 - capture.Quality * 2, 18, 28).ToString(CultureInfo.InvariantCulture);
        }
        yield return "-b:v"; yield return target;
        yield return "-maxrate"; yield return maximum;
        yield return "-bufsize"; yield return (capture.MaximumVideoBitrateBps * 2L).ToString(CultureInfo.InvariantCulture);
    }

    private async Task StopFfmpegInternalAsync(CancellationToken cancellationToken, bool preserveRing)
    {
        var process = ffmpeg;
        ffmpeg = null;
        if (process is { HasExited: false })
        {
            try
            {
                await process.StandardInput.WriteLineAsync("q".AsMemory(), cancellationToken);
                await process.WaitForExitAsync(cancellationToken).WaitAsync(TimeSpan.FromSeconds(4), cancellationToken);
            }
            catch
            {
                try { process.Kill(entireProcessTree: true); } catch { }
            }
        }
        process?.Dispose();
        if (systemAudio is not null) await systemAudio.DisposeAsync();
        if (microphoneAudio is not null) await microphoneAudio.DisposeAsync();
        systemAudio = null;
        microphoneAudio = null;
        activeSource = null;
        if (!preserveRing && sessionDirectory is not null)
        {
            ReplaySegmentRing.TryDeleteDirectory(sessionDirectory);
            sessionDirectory = null;
        }
    }

    private void StartMonitor()
    {
        monitorCancellation?.Cancel();
        monitorCancellation?.Dispose();
        monitorCancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        monitorTask = MonitorAsync(monitorCancellation.Token);
    }

    private async Task MonitorAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                await lifecycleGate.WaitAsync(cancellationToken);
                try
                {
                    var capture = settings;
                    if (capture is null || !HostActive) continue;

                    if (sessionDirectory is not null && ring is not null)
                    {
                        ring.Evict(
                            sessionDirectory,
                            TimeSpan.FromSeconds(capture.SegmentRetentionSeconds),
                            capture.MaximumCacheBytes,
                            captureRunning: ffmpeg is { HasExited: false });
                    }

                    var storage = GetStorageStatus(capture, GetReplayCacheBytes());
                    warning = storage.LowSpace ? storage.Warning : microphoneAudio?.Error ?? systemAudio?.Error;
                    if (storage.CriticalSpace && ffmpeg is { HasExited: false })
                    {
                        await StopFfmpegInternalAsync(CancellationToken.None, preserveRing: true);
                        operationalState = "error";
                        error = "Instant Replay stopped before the cache could exhaust available disk space.";
                    }

                    if (ffmpeg is { HasExited: true } && operationalState == "buffering")
                    {
                        await RecoverCaptureAsync(capture, cancellationToken);
                    }
                    else if (activeSource is not null && !sourceService.IsAvailable(activeSource))
                    {
                        await StopFfmpegInternalAsync(CancellationToken.None, preserveRing: true);
                        operationalState = capture.Source == "automatic-game" ? "waiting" : "error";
                        error = capture.Source == "automatic-game" ? null : "The selected capture source closed.";
                    }
                    else if (capture.Source == "automatic-game" && ffmpeg is null && operationalState == "waiting")
                    {
                        var detected = sourceService.DetectAutomaticGame(DateTimeOffset.UtcNow);
                        if (detected is not null) await StartFfmpegInternalAsync(detected, cancellationToken);
                    }
                }
                catch (Exception monitorError)
                {
                    operationalState = "error";
                    error = monitorError.Message;
                }
                finally
                {
                    lifecycleGate.Release();
                    EmitSnapshot();
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private async Task RecoverCaptureAsync(CaptureSettings capture, CancellationToken cancellationToken)
    {
        restartAttempts++;
        await StopFfmpegInternalAsync(CancellationToken.None, preserveRing: true);
        if (restartAttempts > 3)
        {
            operationalState = "error";
            error = "Capture failed repeatedly and automatic recovery was stopped.";
            return;
        }

        operationalState = "recovering";
        EmitSnapshot();
        await Task.Delay(TimeSpan.FromSeconds(restartAttempts), cancellationToken);
        var source = capture.Source == "automatic-game"
            ? sourceService.DetectAutomaticGame(DateTimeOffset.UtcNow)
            : sourceService.ResolveExplicit(capture);
        if (source is null || !source.Available)
        {
            operationalState = capture.Source == "automatic-game" ? "waiting" : "error";
            return;
        }
        await StartFfmpegInternalAsync(source, cancellationToken);
    }

    private CaptureStorageStatus GetStorageStatus(CaptureSettings? capture, long cacheBytes)
    {
        if (capture is null)
            return new CaptureStorageStatus(string.Empty, string.Empty, 0, 0, cacheBytes, false, false);
        long available = 0;
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(capture.CacheDirectory));
            if (!string.IsNullOrWhiteSpace(root)) available = new DriveInfo(root).AvailableFreeSpace;
        }
        catch { }
        var lowThreshold = Math.Max(5L * 1024 * 1024 * 1024, capture.EstimatedReplayBytes * 4);
        var criticalThreshold = Math.Max(1L * 1024 * 1024 * 1024, capture.EstimatedReplayBytes * 2);
        var clipsBytes = DirectorySize(capture.ClipsDirectory, "*.mp4");
        var critical = available > 0 && available < criticalThreshold;
        var low = available > 0 && available < lowThreshold;
        var storageWarning = critical
            ? "Storage is critically low. Correct the Clips location before recording continues."
            : low ? "Storage is running low." : null;
        return new CaptureStorageStatus(
            capture.ClipsDirectory,
            capture.CacheDirectory,
            available,
            clipsBytes,
            cacheBytes,
            low,
            critical,
            storageWarning);
    }

    private void EnsureStorageHeadroom(CaptureSettings capture, bool preventStart)
    {
        var status = GetStorageStatus(capture, GetReplayCacheBytes());
        if (!status.CriticalSpace) return;
        var action = preventStart ? "start" : "save";
        throw new IOException($"Not enough disk space to {action} Instant Replay safely.");
    }

    private long GetReplayCacheBytes()
    {
        if (ring is null || sessionDirectory is null) return 0;
        return ring.List(sessionDirectory, captureRunning: ffmpeg is { HasExited: false })
            .Where(segment => segment.Complete)
            .Sum(segment => segment.SizeBytes);
    }

    private async Task<string> WriteConcatFileAsync(string snapshotDirectory, CancellationToken cancellationToken)
    {
        var segments = Directory.EnumerateFiles(snapshotDirectory, "*.mkv").OrderBy(path => path).ToArray();
        var concatPath = Path.Combine(snapshotDirectory, "concat.txt");
        await File.WriteAllLinesAsync(
            concatPath,
            segments.Select(path => $"file '{path.Replace("\\", "/").Replace("'", "'\\''")}'"),
            cancellationToken);
        return concatPath;
    }

    private async Task RunRemuxAsync(
        string concatPath,
        string temporaryOutputPath,
        int replaySeconds,
        CancellationToken cancellationToken)
    {
        var start = new ProcessStartInfo(ffmpegPath)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in new[]
                 {
                     "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatPath,
                     "-map", "0", "-c", "copy", "-t", replaySeconds.ToString(CultureInfo.InvariantCulture),
                     "-movflags", "+faststart", "-f", "mp4", temporaryOutputPath,
                 })
        {
            start.ArgumentList.Add(argument);
        }
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Unable to launch FFmpeg remux.");
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        await outputTask;
        var remuxError = await errorTask;
        if (process.ExitCode != 0) throw new InvalidOperationException($"FFmpeg remux failed: {remuxError.Trim()}");
    }

    private async Task ReadProgressAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        try
        {
            while (await reader.ReadLineAsync(cancellationToken) is { } line)
            {
                var separator = line.IndexOf('=');
                if (separator <= 0) continue;
                var key = line[..separator];
                var value = line[(separator + 1)..];
                if (key == "frame" && long.TryParse(value, out var frames)) encodedFrames = frames;
                if (key == "drop_frames" && int.TryParse(value, out var dropped)) droppedFrames = dropped;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (ObjectDisposedException) { }
    }

    private static async Task DrainAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        try { while (await reader.ReadLineAsync(cancellationToken) is not null) { } }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (ObjectDisposedException) { }
    }

    private void EmitSnapshot()
    {
        try { SnapshotChanged?.Invoke(GetSnapshot()); } catch { }
    }

    private IReadOnlyList<CaptureSource> GetCachedSources()
    {
        if (cachedSources.Count == 0 || DateTimeOffset.UtcNow - lastSourceRefresh > TimeSpan.FromSeconds(5))
            return ListSources();
        return cachedSources;
    }

    private static bool RequiresRestart(CaptureSettings previous, CaptureSettings next) =>
        previous.Source != next.Source
        || previous.SourceId != next.SourceId
        || previous.DisplayIndex != next.DisplayIndex
        || previous.Fps != next.Fps
        || previous.Resolution != next.Resolution
        || previous.Codec != next.Codec
        || previous.Encoder != next.Encoder
        || previous.Quality != next.Quality
        || previous.IncludeMic != next.IncludeMic
        || previous.IncludeSystemAudio != next.IncludeSystemAudio
        || previous.IncludeCursor != next.IncludeCursor
        || previous.TargetVideoBitrateBps != next.TargetVideoBitrateBps
        || previous.MaximumVideoBitrateBps != next.MaximumVideoBitrateBps
        || previous.SystemAudioBitrateBps != next.SystemAudioBitrateBps
        || previous.MicrophoneBitrateBps != next.MicrophoneBitrateBps
        || previous.CacheDirectory != next.CacheDirectory;

    private static IEnumerable<string> EncoderCandidates(string codec) => codec switch
    {
        "av1" => ["av1_nvenc", "av1_amf", "av1_qsv", "libsvtav1"],
        "hevc" => ["hevc_nvenc", "hevc_amf", "hevc_qsv", "libx265"],
        _ => ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"],
    };

    private static string SelectEncoder(CaptureSettings capture, IReadOnlyList<string> working)
    {
        IEnumerable<string> candidates = EncoderCandidates(capture.Codec);
        if (capture.Encoder != "auto")
        {
            candidates = capture.Encoder == "software"
                ? candidates.Where(name => name.StartsWith("lib", StringComparison.OrdinalIgnoreCase))
                : candidates.Where(name => name.Contains(capture.Encoder, StringComparison.OrdinalIgnoreCase));
        }
        return candidates.FirstOrDefault(working.Contains)
               ?? throw new InvalidOperationException($"No working {capture.Encoder} encoder is available for {capture.Codec.ToUpperInvariant()}.");
    }

    private static (int Width, int Height)? ResolutionDimensions(string resolution) => resolution switch
    {
        "720p" => (1280, 720),
        "1080p" => (1920, 1080),
        "1440p" => (2560, 1440),
        "2160p" => (3840, 2160),
        _ => null,
    };

    private static string FriendlyEncoderName(string encoder) => encoder switch
    {
        "h264_nvenc" => "NVIDIA NVENC H.264",
        "hevc_nvenc" => "NVIDIA NVENC HEVC",
        "av1_nvenc" => "NVIDIA NVENC AV1",
        "h264_amf" => "AMD AMF H.264",
        "hevc_amf" => "AMD AMF HEVC",
        "av1_amf" => "AMD AMF AV1",
        "h264_qsv" => "Intel Quick Sync H.264",
        "hevc_qsv" => "Intel Quick Sync HEVC",
        "av1_qsv" => "Intel Quick Sync AV1",
        "libx264" => "Software H.264",
        "libx265" => "Software HEVC",
        "libsvtav1" => "Software AV1",
        _ => encoder,
    };

    private static long DirectorySize(string directory, string pattern)
    {
        try
        {
            return Directory.Exists(directory)
                ? Directory.EnumerateFiles(directory, pattern, SearchOption.TopDirectoryOnly)
                    .Sum(path => new FileInfo(path).Length)
                : 0;
        }
        catch { return 0; }
    }

    private static async Task FlushFileAsync(string path, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.ReadWrite,
            FileShare.None,
            4096,
            FileOptions.Asynchronous | FileOptions.WriteThrough);
        await stream.FlushAsync(cancellationToken);
        stream.Flush(flushToDisk: true);
    }
}
