using System.Diagnostics;
using System.Text.Json;
using NAudio.Wave;
using Switchboard.AudioHost.NoiseSuppression;
using Switchboard.AudioHost.Realtime;

namespace Switchboard.AudioHost;

internal static class OfflineNoiseBenchmark
{
    public static Task<int> RunAsync(string[] args, JsonSerializerOptions jsonOptions)
    {
        var inputPath = Option(args, "--benchmark");
        var outputPath = Option(args, "--output");
        var amountText = Option(args, "--amount", required: false);
        var amount = amountText is null ? 55f : float.Parse(amountText, System.Globalization.CultureInfo.InvariantCulture);
        if (inputPath is null || outputPath is null) throw new ArgumentException("Use --benchmark <input.wav> --output <output.wav> [--amount 0..100].");
        if (amount is < 0 or > 100) throw new ArgumentOutOfRangeException(nameof(amount));

        using var reader = new WaveFileReader(inputPath);
        if (reader.WaveFormat.SampleRate != AudioConstants.ProcessingSampleRate || reader.WaveFormat.Channels != 1)
            throw new NotSupportedException("The benchmark input must be a 48 kHz mono WAV.");
        var sampleProvider = reader.ToSampleProvider();
        var modelDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Switchboard",
            "models",
            "deepfilternet");
        using var suppressor = NoiseSuppressorFactory.Create(AppContext.BaseDirectory, modelDirectory, out var selectionNote);
        if (!suppressor.IsAvailable) throw new InvalidOperationException(suppressor.LastError ?? "No noise-suppression backend is available.");
        suppressor.Configure(amount);
        var graph = new AudioGraph(suppressor);
        var configuration = new MicrophoneDspConfiguration(
            1,
            new NoiseSuppressionConfiguration(true, amount),
            new NoiseGateConfiguration(false, -48, 10, 180),
            new GainConfiguration(false, 0),
            new EqualizerConfiguration(false, []),
            new CompressorConfiguration(false, -18, 3, 12, 180, 2),
            new LimiterConfiguration(false, -1, 90));
        var frame = new float[suppressor.FrameLength];
        var timings = new FrameTimingMetrics();
        long processedSamples = 0;
        var startedAt = Stopwatch.GetTimestamp();
        using (var writer = new WaveFileWriter(outputPath, WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.ProcessingSampleRate, 1)))
        {
            while (true)
            {
                var read = sampleProvider.Read(frame);
                if (read == 0) break;
                if (read < frame.Length) Array.Clear(frame, read, frame.Length - read);
                var frameStartedAt = Stopwatch.GetTimestamp();
                graph.ProcessMicrophone(frame, configuration);
                timings.Record(Stopwatch.GetElapsedTime(frameStartedAt).TotalMilliseconds);
                writer.WriteSamples(frame, 0, read);
                processedSamples += read;
            }
        }
        var elapsed = Stopwatch.GetElapsedTime(startedAt);
        var audioDuration = TimeSpan.FromSeconds(processedSamples / (double)AudioConstants.ProcessingSampleRate);
        var frameStats = timings.Snapshot();
        var output = new
        {
            inputPath = Path.GetFullPath(inputPath),
            outputPath = Path.GetFullPath(outputPath),
            backend = suppressor.BackendName,
            modelIdentifier = suppressor.ModelIdentifier,
            modelHash = suppressor.ModelHash,
            nativeLibraryHash = suppressor.NativeLibraryHash,
            frameLength = suppressor.FrameLength,
            attenuationLimitDb = suppressor.AttenuationLimitDb,
            elapsedMs = elapsed.TotalMilliseconds,
            audioDurationMs = audioDuration.TotalMilliseconds,
            realTimeFactor = audioDuration.TotalMilliseconds <= 0 ? 0 : elapsed.TotalMilliseconds / audioDuration.TotalMilliseconds,
            averageFrameMs = frameStats.TotalFrames == 0 ? 0 : elapsed.TotalMilliseconds / frameStats.TotalFrames,
            p95FrameMs = frameStats.P95Ms,
            p99FrameMs = frameStats.P99Ms,
            peakFrameMs = frameStats.MaximumMs,
            selectionNote,
        };
        Console.WriteLine(JsonSerializer.Serialize(output, jsonOptions));
        return Task.FromResult(0);
    }

    private static string? Option(string[] args, string name, bool required = true)
    {
        var index = Array.FindIndex(args, value => value.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (index >= 0 && index + 1 < args.Length) return args[index + 1];
        if (required) throw new ArgumentException($"Missing {name} value.");
        return null;
    }
}
