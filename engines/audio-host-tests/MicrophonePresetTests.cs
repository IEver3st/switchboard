using System.Text.Json;
using NAudio.Wave;
using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;

internal static class MicrophonePresetTests
{
    private const int Rate = 48_000;

    public static void Run(string path, string? speechPath)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var speech = speechPath is null ? MicrophoneTimbreProbe.SyntheticVoice(Rate * 4) : ReadSpeech(speechPath);
        // Normalize the fixture once, never each processed result. Quiet and
        // normal comparisons therefore retain the actual gain differences.
        var peak = speech.Max(MathF.Abs);
        Require(peak > 0, "Empty speech fixture.");
        for (var i = 0; i < speech.Length; i++) speech[i] *= 0.25f / peak;
        foreach (var preset in document.RootElement.EnumerateArray())
        {
            var id = preset.GetProperty("id").GetString()!;
            var processors = JsonSerializer.Deserialize<MicrophoneProcessorSettings[]>(
                preset.GetProperty("processors"), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            var configuration = MicrophoneDspConfiguration.From(new AudioHostSettings { MicProcessors = processors }, 1);
            using var suppressor = new RnnoiseNoiseSuppressor();
            Require(suppressor.Initialize(new(AppContext.BaseDirectory, Path.GetTempPath())), "Native RNNoise unavailable.");

            // Measure actual cascaded native filters at low level, independently
            // of nonlinear cleanup/dynamics, against the curve shown in the UI.
            var toneConfig = configuration with { NoiseSuppression = new(false, 0), NoiseGate = new(false, -60, 2, 300),
                Compressor = new(false, -18, 2, 25, 280, 0), Gain = new(false, 0) };
            foreach (var point in preset.GetProperty("response").EnumerateArray())
            {
                var frequency = point.GetProperty("frequency").GetDouble();
                var tone = Enumerable.Range(0, Rate).Select(i => (float)(0.01 * Math.Sin(2 * Math.PI * frequency * i / Rate))).ToArray();
                var output = Process(tone, new AudioGraph(suppressor), toneConfig);
                var measured = LevelChange(tone, output, Rate / 2);
                Require(Math.Abs(measured - point.GetProperty("db").GetDouble()) < 0.12,
                    $"{id}: native EQ disagrees with displayed response at {frequency} Hz ({measured:F2} dB).");
            }

            var levels = new List<double>();
            foreach (var scale in new[] { 1f, 0.1f })
            {
                Require(suppressor.Reset(), "RNNoise reset failed.");
                var input = speech.Select(x => x * scale).ToArray();
                var graph = new AudioGraph(suppressor);
                var output = Process(input, graph, configuration);
                Require(output.All(float.IsFinite), $"{id}: non-finite output.");
                Require(output.Max(MathF.Abs) <= MathF.Pow(10, configuration.Limiter.ThresholdDb / 20) + 0.00001,
                    $"{id}: peak ceiling exceeded.");
                var change = LevelChange(input, output, Rate / 2);
                Require(change > -9 && change < 5, $"{id}: speech lost or excessive gain ({change:F2} dB, scale {scale}).");
                if (id == "mic-studio") Require(input.SequenceEqual(output), "Studio is not transparent below its limiter.");
                if (id == "mic-natural-voice") Require(Math.Abs(change) < 1, "Natural voice changed speech level by more than 1 dB.");
                levels.Add(change);
                // A configured callback must not allocate, including active AI.
                var frame = new float[480];
                var allocated = GC.GetAllocatedBytesForCurrentThread();
                for (var i = 0; i < 100; i++) graph.ProcessMicrophone(frame, configuration);
                Require(GC.GetAllocatedBytesForCurrentThread() == allocated, $"{id}: callback allocation.");
                graph.Reset();
                Require(suppressor.Reset(), "RNNoise restart failed.");
                Require(output.SequenceEqual(Process(input, graph, configuration)), $"{id}: reset retained signal history.");
            }
            // Overload through the entire chain, with AI bypassed so model
            // attenuation cannot conceal a broken emergency limiter.
            var overload = Enumerable.Range(0, Rate).Select(i => (float)(2 * Math.Sin(2 * Math.PI * 180 * i / Rate))).ToArray();
            var limited = Process(overload, new AudioGraph(suppressor), configuration with { NoiseSuppression = new(false, 0) });
            Require(limited.All(x => float.IsFinite(x) && MathF.Abs(x) <= MathF.Pow(10, configuration.Limiter.ThresholdDb / 20) + 0.00001),
                $"{id}: overload escaped limiter.");
            Console.WriteLine($"{id}: native curve, ceiling, reset and allocation checks passed; speech change {levels[0]:F2} dB / quiet {levels[1]:F2} dB.");
        }
        Console.WriteLine(speechPath is null ? "Synthetic speech fixture only." : "Offline speech fixture; not user microphone or listening validation.");
    }

    private static float[] Process(float[] input, AudioGraph graph, MicrophoneDspConfiguration configuration)
    {
        var output = input.ToArray();
        for (var i = 0; i < output.Length; i += 480) graph.ProcessMicrophone(output.AsSpan(i, 480), configuration);
        return output;
    }

    private static double LevelChange(float[] input, float[] output, int skip) =>
        10 * Math.Log10(output.Skip(skip).Sum(x => (double)x * x) / input.Skip(skip).Sum(x => (double)x * x));

    private static float[] ReadSpeech(string path)
    {
        using var reader = new AudioFileReader(path);
        Require(reader.WaveFormat.SampleRate == Rate && reader.WaveFormat.Channels == 1, "Use 48 kHz mono speech.");
        var samples = new float[checked((int)(reader.Length / sizeof(float)))];
        var read = ((ISampleProvider)reader).Read(samples.AsSpan());
        Require(read >= Rate * 2, "Use at least two seconds of speech.");
        return samples[..(read / 480 * 480)];
    }

    private static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
}
