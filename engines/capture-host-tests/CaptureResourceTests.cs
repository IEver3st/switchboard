using System.Diagnostics;
using System.Text.Json;
using Switchboard.CaptureHost;

internal static class CaptureResourceTests
{
    private static readonly CaptureSettings Settings = new(CacheDirectory: Path.GetTempPath(), ClipsDirectory: Path.GetTempPath());
    private static readonly CaptureSource Source = new("fixture", "display", "Synthetic", null, null, null, true);

    public static void AssertArguments()
    {
        foreach (var processors in new[] { 1, 2, 4, 8, 24, 32, 64 }) {
            var encoderThreads = CaptureCpuBudget.EncoderThreads(processors);
            if (encoderThreads < 1 || encoderThreads > Math.Max(1, processors / 2) || encoderThreads > 8)
                throw new Exception("Software encode must leave CPU headroom at each processor count.");
        }
        foreach (var encoder in new[] { "h264_qsv", "hevc_qsv", "av1_qsv", "libx264", "libx265", "libsvtav1" })
        foreach (var backend in new[] { "Windows Graphics Capture", "Desktop Duplication" })
        foreach (var diagnostic in new[] { false, true })
        {
            var args = ReplayEngine.BuildVideoArguments(Settings, Source, backend, encoder, "", diagnostic).ToArray();
            if (!int.TryParse(Value(args, "-filter_threads"), out var filters) || filters is < 1 or > 2)
                throw new Exception("Replay conversion must use a bounded filter pool.");
            if (encoder.EndsWith("_qsv") && Value(args, "-vf") != "hwdownload,format=bgra,format=nv12")
                throw new Exception("QSV must receive NV12 rather than capture-owned BGRA textures.");
            if (encoder.StartsWith("lib") && (!int.TryParse(Value(args, "-threads:v"), out var threads) || threads is < 1 or > 8))
                throw new Exception("Software replay must bound encoder workers.");
        }
        foreach (var encoder in new[] { "libx264", "libx265", "libsvtav1" }) {
            var probe = FfmpegLocator.BuildEncoderProbeArguments(encoder).ToArray();
            if (Value(probe, "-filter_threads") != "1" || Value(probe, "-threads:v") is null)
                throw new Exception("A single-frame software probe must bound filter and codec workers.");
            var option = encoder == "libx265" ? "-x265-params" : "-svtav1-params";
            if (encoder != "libx264" && Value(probe, option) is null)
                throw new Exception("Encoder-owned worker pools must also be bounded.");
        }
        AssertEvictionAccounting();
    }

    private static void AssertEvictionAccounting()
    {
        var root = Path.Combine(Path.GetTempPath(), "switchboard-eviction-" + Guid.NewGuid().ToString("N"));
        try {
            var ring = new ReplaySegmentRing(root, 1);
            for (var index = 0; index < 3; index++) File.WriteAllBytes(Path.Combine(root, $"segment-{index:D9}.mkv"), new byte[10]);
            using (var locked = new FileStream(Path.Combine(root, "segment-000000000.mkv"), FileMode.Open, FileAccess.Read, FileShare.Read)) {
                if (ring.Evict(root, TimeSpan.FromSeconds(1), long.MaxValue, false) != 20)
                    throw new Exception("Ring accounting must retain bytes when a deletion fails.");
            }
            if (ring.Evict(root, TimeSpan.FromSeconds(1), long.MaxValue, false) != 10 || ring.List(root, false).Count != 1)
                throw new Exception("Ring eviction must recover after a locked file is released.");
        } finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    public static async Task ProbeSoftwareAsync()
    {
        foreach (var encoder in new[] { "libx264", "libx265", "libsvtav1" }) {
            if (!await FfmpegLocator.ProbeEncoderAsync(FfmpegLocator.FindFfmpeg(), encoder, CancellationToken.None))
                throw new Exception($"Bounded {encoder} probe failed.");
            Console.WriteLine($"Bounded {encoder} probe passed.");
        }
    }

    // Fixed synthetic BGRA workload, no display/audio access. Four logical CPUs
    // constrain scheduling but do not emulate a particular low-end processor.
    public static async Task BenchmarkAsync()
    {
        foreach (var legacy in new[] { true, false })
        {
            var args = ReplayEngine.BuildVideoArguments(Settings, Source, "Windows Graphics Capture", "libx264", "", true).ToList();
            args[args.IndexOf("-i") + 1] = "testsrc2=size=1920x1080:rate=60,format=bgra";
            args[args.IndexOf("-vf") + 1] = "format=yuv420p";
            args[args.IndexOf("-frames:v") + 1] = "600";
            if (legacy)
                foreach (var option in new[] { "-filter_threads", "-threads:v" })
                    if (args.IndexOf(option) is var index && index >= 0) args.RemoveRange(index, 2);
            var start = new ProcessStartInfo(FfmpegLocator.FindFfmpeg()) {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            };
            foreach (var arg in args) start.ArgumentList.Add(arg);
            using var job = new WindowsChildProcessJob();
            using var process = job.Start(start, "synthetic CPU comparison");
            process.StandardInput.Close();
            if (Environment.ProcessorCount >= 4) process.ProcessorAffinity = (nint)15;
            var output = process.StandardError.ReadToEndAsync();
            var stdout = process.StandardOutput.ReadToEndAsync();
            var clock = Stopwatch.StartNew();
            var samples = new List<(double Memory, int Threads)>();
            try {
                while (!process.HasExited && clock.Elapsed < TimeSpan.FromMinutes(2)) {
                    process.Refresh();
                    if (!process.HasExited) samples.Add((process.PrivateMemorySize64 / 1048576d, process.Threads.Count));
                    await Task.Delay(50);
                }
                if (!process.HasExited) throw new TimeoutException("Synthetic encode exceeded two minutes.");
                clock.Stop();
                var diagnostics = await output;
                await stdout;
                if (process.ExitCode != 0 || !diagnostics.Contains("frame=600")) throw new Exception(diagnostics);
                Console.WriteLine(JsonSerializer.Serialize(new {
                    policy = legacy ? "previous-auto-threads" : "bounded-threads", frames = 600,
                    elapsedSeconds = clock.Elapsed.TotalSeconds, cpuSeconds = process.TotalProcessorTime.TotalSeconds,
                    peakPrivateMb = samples.Max(item => item.Memory), peakThreads = samples.Max(item => item.Threads),
                }));
            } finally {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync();
            }
        }
    }

    private static string? Value(string[] args, string option) => Array.IndexOf(args, option) is var index && index >= 0 ? args[index + 1] : null;
}
