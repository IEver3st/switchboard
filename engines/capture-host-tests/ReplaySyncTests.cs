using System.Diagnostics;
using System.Globalization;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Switchboard.CaptureHost;

internal static class ReplaySyncTests
{
    public static async Task RunAsync()
    {
        var clock = new AudioPacketTimeline(10_000_000, 48_000);
        Equal(24_000L, clock.Position(15_000_000, 480, false, 15_100_000), "Delayed audio startup must retain its clock offset.");
        Equal(144_000L, clock.Position(40_000_000, 480, false, 40_100_000), "Silence and dropped packets must not compress time.");
        Equal(144_480L, clock.Position(0, 480, true, 40_200_000), "An invalid device timestamp must continue the last sample clock.");
        Equal(240_000L, clock.Position(long.MaxValue, 480, false, 60_100_000), "An impossible device clock must fall back to packet arrival time.");
        Equal(240_480L, clock.Position(0, 480, false, 60_200_000), "Zero timestamps must keep audio flowing after a silence gap.");
        using var pcm = new MemoryStream();
        var writer = new AudioTimelineWriter(pcm, sizeof(short));
        await writer.WriteAsync(new byte[] { 1, 0, 2, 0 }, 3, default);
        await writer.WriteAsync(new byte[] { 3, 0, 4, 0 }, 7, default);
        await writer.WriteAsync(new byte[] { 5, 0, 6, 0 }, 8, default);
        var samples = MemoryMarshal.Cast<byte, short>(pcm.ToArray()).ToArray();
        if (!samples.SequenceEqual(new short[] { 0, 0, 0, 1, 2, 0, 0, 3, 4, 6 }))
            throw new Exception("PCM writing must preserve gaps and discard overlapping samples.");

        var root = Path.Combine(Path.GetTempPath(), $"switchboard-sync-unit-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var origin = DateTimeOffset.Parse("2026-09-07T12:00:00Z");
            File.WriteAllText(Path.Combine(root, "timeline-origin.txt"), origin.ToString("O"));
            foreach (var index in new[] { 40, 41, 42 })
            {
                var path = Path.Combine(root, $"system-{index:D9}.mka");
                File.WriteAllBytes(path, [1]);
                File.SetLastWriteTimeUtc(path, origin.AddHours(index).UtcDateTime);
            }
            File.WriteAllText(Path.Combine(root, "system-timeline.csv"),
                "system-000000040.mka,40.000,41.002667\nsystem-000000041.mka,41.002667,42.005333\n");
            var ring = new ReplaySegmentRing(root, 1);
            var segments = ring.List(root, true, "system-*.mka");
            Equal(2, segments.Count, "Only manifest-confirmed closed segments can be saved.");
            Equal(origin.AddSeconds(40), segments[0].StartedAt, "Ring wrap and flush times cannot move media timestamps.");
            Equal(origin.AddSeconds(42.005333), segments[1].EndedAt, "AAC packet boundaries must retain subsecond precision.");
            var expiredPath = Path.Combine(root, "system-000000001.mka");
            File.WriteAllBytes(expiredPath, [1]);
            ring.Evict(root, TimeSpan.FromSeconds(10), long.MaxValue, true, "system-*.mka");
            Equal(false, File.Exists(expiredPath), "Files older than the bounded manifest must still be evicted.");
            var selected = ring.SelectForWindow(segments, origin.AddSeconds(41), origin.AddSeconds(42));
            Equal(2, selected.Count, "Audio selection must intersect the video window, including an earlier AAC packet.");
            var snapshot = ring.Snapshot(selected);
            try
            {
                var concat = await ReplayEngine.WriteConcatFileAsync(snapshot, default);
                if (!File.ReadAllText(concat).Contains("duration 1.002667"))
                    throw new Exception("Concat must use the media duration rather than rounded container duration.");
            }
            finally { Directory.Delete(snapshot, true); }
        }
        finally { Directory.Delete(root, true); }
    }

    // Read live loopback only into a discard sink. No media file or window.
    public static async Task RunLoopbackAsync()
    {
        for (var cycle = 0; cycle < 3; cycle++)
        {
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var input = AudioPipeCapture.CreateSystemLoopback();
            var origin = DateTimeOffset.UtcNow;
            input.SetTimelineOrigin(origin);
            var start = input.ConnectAndStartAsync(cancellation.Token);
            await using var pipe = new NamedPipeClientStream(".", input.PipeName, PipeDirection.In, PipeOptions.Asynchronous);
            await pipe.ConnectAsync(cancellation.Token);
            var drain = pipe.CopyToAsync(Stream.Null, cancellation.Token);
            try
            {
                await start;
                await Task.Delay(3000, cancellation.Token);
                var elapsed = (DateTimeOffset.UtcNow - origin).TotalSeconds;
                var written = input.WrittenBytes / (double)input.BytesPerSecond;
                Console.WriteLine($"Loopback cycle {cycle + 1}: clock {elapsed:F3}s, PCM {written:F3}s, dropped {input.DroppedPackets}.");
                if (Math.Abs(elapsed - written) > 0.3 || input.Error is not null)
                    throw new Exception($"Live loopback timeline mismatch: {input.Error}");
            }
            finally { await input.DisposeAsync(); }
            await drain;
        }
    }

    // Real FFmpeg, synthetic media only: no screen, microphone, or device access.
    public static async Task RunMediaAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), $"switchboard-sync-media-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var ffmpeg = FfmpegLocator.FindFfmpeg();
        try
        {
            var origin = DateTimeOffset.UtcNow;
            File.WriteAllText(Path.Combine(root, "timeline-origin.txt"), origin.ToString("O"));
            var settings = new CaptureSettings(ReplaySeconds: 6, Fps: 30, CacheDirectory: root, ClipsDirectory: root);
            var source = new CaptureSource("fixture", "display", "Synthetic", null, null, null, true);
            var videoArgs = ReplayEngine.BuildVideoArguments(settings, source, "Desktop Duplication", "libx264", root,
                timelineOrigin: origin).ToList();
            videoArgs[videoArgs.IndexOf("-i") + 1] =
                "color=c=black:s=160x90:r=30:d=12,drawbox=c=white:t=fill:enable='between(t,1.633333,1.733333)+between(t,5.633333,5.733333)+between(t,9.633333,9.733333)'";
            // Model a first video frame arriving 367 ms after the common origin.
            // The production conversion is for GPU textures; this fixture is CPU.
            videoArgs[videoArgs.IndexOf("-vf") + 1] = "setpts=PTS+0.366666667/TB";
            await RunProcess(ffmpeg, videoArgs);

            var raw = Path.Combine(root, "input.f32");
            await using (var stream = File.Create(raw))
            {
                var writer = new AudioTimelineWriter(stream, sizeof(float));
                var clock = new AudioPacketTimeline(10_000_000, 48_000);
                for (var frame = 12_000; frame < 12 * 48_000; frame += 480)
                {
                    // A 250 ms startup delay and two seconds without callbacks.
                    if (frame >= 3 * 48_000 && frame < 5 * 48_000) continue;
                    var samples = new float[480];
                    for (var index = 0; index < samples.Length; index++)
                    {
                        var time = (frame + index) / 48_000.0;
                        if (time % 4 >= 2 && time % 4 < 2.1)
                            samples[index] = (float)(0.8 * Math.Sin(time * 2 * Math.PI * 1000));
                    }
                    var bytes = MemoryMarshal.AsBytes(samples.AsSpan()).ToArray();
                    var position = clock.Position(10_000_000 + frame * 10_000_000L / 48_000, 480, false, 10_000_000 + (frame + 480) * 10_000_000L / 48_000);
                    await writer.WriteAsync(bytes, position, default);
                }
            }
            await RunProcess(ffmpeg, ReplayEngine.BuildAudioArguments(settings, root, new FileAudioInput(raw), "system", 128_000));
            var ring = new ReplaySegmentRing(root, 1);
            var video = ring.List(root, false);
            var audio = ring.List(root, false, "system-*.mka");
            // Make the newest audio segment unavailable, as happens while the
            // independent audio encoder is still closing its current segment.
            File.Delete(audio[^1].Path);
            audio = ring.List(root, false, "system-*.mka");
            foreach (var (name, from, to) in new[] { ("startup", 0d, 4d), ("wrapped", 5d, 11d) })
            {
                var selectedVideo = ring.SelectForWindow(video, origin.AddSeconds(from), origin.AddSeconds(to));
                var selectedAudio = ring.SelectForWindow(audio, selectedVideo[0].StartedAt, selectedVideo[^1].EndedAt);
                var videoSnapshot = ring.Snapshot(selectedVideo);
                var audioSnapshot = ring.Snapshot(selectedAudio);
                try
                {
                    var videoConcat = await ReplayEngine.WriteConcatFileAsync(videoSnapshot, default);
                    var audioConcat = await ReplayEngine.WriteConcatFileAsync(audioSnapshot, default);
                    var output = Path.Combine(root, $"{name}.mp4");
                    await RunProcess(ffmpeg, ReplayEngine.BuildRemuxArguments(videoConcat, audioConcat, null, null, output,
                        selectedVideo[^1].EndedAt - selectedVideo[0].StartedAt, "Game", "Chat", "Microphone",
                        selectedAudio[0].StartedAt - selectedVideo[0].StartedAt));
                    var error = await MeasureMarkerError(ffmpeg, root, output, name);
                    Console.WriteLine($"Replay sync {name}: maximum flash/tone difference {error * 1000:F1} ms.");
                    if (error > 0.080) throw new Exception($"{name} audio/video sync exceeded 80 ms: {error:F3} s.");
                    // The previous remux reset every selected input to zero.
                    if (name == "wrapped")
                    {
                        var oldOutput = Path.Combine(root, "old-offset.mp4");
                        await RunProcess(ffmpeg, ReplayEngine.BuildRemuxArguments(videoConcat, audioConcat, null, null, oldOutput,
                            selectedVideo[^1].EndedAt - selectedVideo[0].StartedAt, "Game", "Chat", "Microphone"));
                        var oldError = await MeasureMarkerError(ffmpeg, root, oldOutput, "old-offset");
                        Console.WriteLine($"Previous zero-offset remux: maximum flash/tone difference {oldError * 1000:F1} ms.");
                        if (oldError < 0.5) throw new Exception("Sync fixture failed to reproduce the previous offset defect.");
                    }
                }
                finally { Directory.Delete(videoSnapshot, true); Directory.Delete(audioSnapshot, true); }
                ring.Evict(root, TimeSpan.FromSeconds(8), long.MaxValue, false);
                ring.Evict(root, TimeSpan.FromSeconds(8), long.MaxValue, false, "system-*.mka");
                video = ring.List(root, false);
                audio = ring.List(root, false, "system-*.mka");
            }
            // Exercise the actual first-frame expression, in addition to the
            // deterministic offset above. Both native and pipe-mix inputs use it.
            var clockRoot = Path.Combine(root, "clock");
            Directory.CreateDirectory(clockRoot);
            var clockOrigin = DateTimeOffset.UtcNow.AddMilliseconds(-250);
            File.WriteAllText(Path.Combine(clockRoot, "timeline-origin.txt"), clockOrigin.ToString("O"));
            var clockVideo = ReplayEngine.BuildVideoArguments(settings, source, "Desktop Duplication", "libx264", clockRoot,
                timelineOrigin: clockOrigin).ToList();
            clockVideo[clockVideo.IndexOf("-i") + 1] = "color=c=black:s=160x90:r=30:d=0.2";
            clockVideo[clockVideo.IndexOf("-vf") + 1] = $"setpts={ReplayEngine.SharedClockFilter(clockOrigin)}";
            await RunProcess(ffmpeg, clockVideo);
            var clockEnd = ring.List(clockRoot, false)[^1].EndedAt;
            if (clockEnd < clockOrigin.AddSeconds(0.4) || clockEnd > DateTimeOffset.UtcNow.AddSeconds(0.3))
                throw new Exception("The video first-frame clock did not retain its startup delay.");
            var mixOrigin = DateTimeOffset.UtcNow.AddMilliseconds(-250);
            var mixArgs = ReplayEngine.BuildAudioArguments(settings, clockRoot, new AudioHostPipeInput("fixture", "Mix"),
                "mix", 128_000, timelineOrigin: mixOrigin).ToList();
            mixArgs[mixArgs.IndexOf("-i") + 1] = raw;
            // File fixture is mono; the actual Audio.Host pipe remains stereo.
            mixArgs[mixArgs.IndexOf("-ac") + 1] = "1";
            await RunProcess(ffmpeg, mixArgs);
            File.WriteAllText(Path.Combine(clockRoot, "timeline-origin.txt"), mixOrigin.ToString("O"));
            var mixEnd = ring.List(clockRoot, false, "mix-*.mka")[^1].EndedAt;
            if (mixEnd < mixOrigin.AddSeconds(12.2) || mixEnd > DateTimeOffset.UtcNow.AddSeconds(12.2))
                throw new Exception("The clip-mix first-frame clock did not retain its startup delay.");
            Console.WriteLine("Production first-frame clock expressions passed for video and the Audio.Host pipe mix.");
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task<double> MeasureMarkerError(string ffmpeg, string root, string clip, string name)
    {
        var pixels = Path.Combine(root, $"{name}.gray");
        var sound = Path.Combine(root, $"{name}.f32");
        await RunProcess(ffmpeg, ["-v", "error", "-i", clip, "-map", "0:v:0", "-vf", "scale=1:1,format=gray", "-fps_mode", "cfr", "-r", "30", "-f", "rawvideo", pixels]);
        await RunProcess(ffmpeg, ["-v", "error", "-i", clip, "-map", "0:a:0", "-ar", "48000", "-ac", "1", "-f", "f32le", sound]);
        var video = File.ReadAllBytes(pixels);
        var audio = MemoryMarshal.Cast<byte, float>(File.ReadAllBytes(sound)).ToArray();
        var flashes = new List<double>();
        var tones = new List<double>();
        for (var index = 0; index < video.Length; index++)
            if (video[index] > 128 && (index == 0 || video[index - 1] <= 128)) flashes.Add(index / 30.0);
        var lastTone = -1d;
        for (var index = 0; index < audio.Length; index++)
            if (Math.Abs(audio[index]) > 0.2 && index / 48_000.0 - lastTone > 0.5)
            {
                lastTone = index / 48_000.0;
                tones.Add(lastTone);
            }
        if (flashes.Count == 0 || flashes.Count != tones.Count)
            throw new Exception($"{name} marker count mismatch: {flashes.Count} flashes, {tones.Count} tones.");
        Console.WriteLine($"{name} flashes: {string.Join(", ", flashes.Select(t => t.ToString("F3")))}; tones: {string.Join(", ", tones.Select(t => t.ToString("F3")))}");
        return flashes.Zip(tones, (flash, tone) => Math.Abs(flash - tone)).Max();
    }

    private static async Task RunProcess(string executable, IEnumerable<string> arguments)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardError = true, RedirectStandardOutput = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = Process.Start(start)!;
        var stderr = process.StandardError.ReadToEndAsync();
        var stdout = process.StandardOutput.ReadToEndAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(45)); }
        catch { process.Kill(true); throw; }
        await stdout;
        if (process.ExitCode != 0) throw new Exception(await stderr);
    }

    private static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"{message} Expected {expected}, got {actual}.");
    }

    private sealed class FileAudioInput(string path) : IAudioPipeInput
    {
        public string Label => "Synthetic";
        public string PipePath => path;
        public int SampleRate => 48_000;
        public int Channels => 1;
        public string FfmpegSampleFormat => "f32le";
        public long DroppedPackets => 0;
        public long CapturedBytes => 0;
        public long WrittenBytes => 0;
        public int BytesPerSecond => 192_000;
        public string? Error => null;
        public Task ConnectAndStartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
