using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;

// Diagnostic (--microphone-timbre): for each available noise backend, measures
// the wet-path delay, per-frame DSP cost, the tonal balance of the full graph at
// each strength on a synthetic voice, and keyboard-like click leakage in pauses.
internal static class MicrophoneTimbreProbe
{
    private const int Rate = 48_000;

    public static void Run()
    {
        // Pass a 48 kHz mono 16-bit WAV path to measure real speech instead of the synthetic voice.
        var wavePath = Environment.GetCommandLineArgs().SkipWhile(arg => arg != "--microphone-timbre").Skip(1).FirstOrDefault();
        var voice = wavePath is null ? SyntheticVoice(Rate * 6) : ReadWave(wavePath);
        var clicks = ClickTrack(voice);
        var modelDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Switchboard", "models", "deepfilternet");
        var initialization = new NoiseSuppressorInitialization(AppContext.BaseDirectory, modelDirectory);
        var backends = new (string Name, Func<INoiseSuppressor> Create)[]
        {
            ("RNNoise", () => new RnnoiseNoiseSuppressor()),
            ("DeepFilterNet3", () => new DeepFilterNetNoiseSuppressor()),
        };
        foreach (var (name, create) in backends)
        {
            using (var probe = create())
            {
                if (!probe.Initialize(initialization))
                {
                    Console.WriteLine($"{name}: unavailable ({probe.LastError})");
                    continue;
                }
                var (wet, timings) = Process(probe, voice, 100f);
                Array.Sort(timings);
                Console.WriteLine($"{name}: wet lag {BestLag(voice, wet, 4_000)} samples | DSP per 10 ms frame p50 {timings[timings.Length / 2]:F2} ms p99 {timings[timings.Length * 99 / 100]:F2} ms");
            }

            foreach (var amount in new[] { 10f, 30f, 55f, 80f, 100f })
            {
                using var suppressor = create();
                suppressor.Initialize(initialization);
                var (processed, _) = Process(suppressor, voice, amount);
                var lag = BestLag(voice, processed, 4_000);
                Console.Write($"  amount {amount,3}: ");
                foreach (var hz in new[] { 150, 300, 600, 1_200, 2_400, 4_800, 9_600 })
                    Console.Write($"{hz}Hz {BandDb(voice, processed, lag, hz),5:F1}  ");
                Console.WriteLine($"| ripple {Ripple(voice, processed, lag):F1} dB");

                using var clickSuppressor = create();
                clickSuppressor.Initialize(initialization);
                var (clickOutput, _) = Process(clickSuppressor, clicks, amount);
                var onset = clicks.Length - Rate;
                Console.WriteLine($"              clicks in pauses {SegmentDb(clicks, clickOutput, lag, voice.Length + Rate / 2, onset - Rate / 10),6:F1} dB"
                    + $" | voice {SegmentDb(clicks, clickOutput, lag, Rate, voice.Length - Rate),5:F1} dB"
                    + $" | first 80 ms after pause {SegmentDb(clicks, clickOutput, lag, onset, onset + Rate * 8 / 100),5:F1} dB");
            }
        }
    }

    private static float[] ReadWave(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var position = 12;
        while (position + 8 <= bytes.Length)
        {
            var id = System.Text.Encoding.ASCII.GetString(bytes, position, 4);
            var size = BitConverter.ToInt32(bytes, position + 4);
            if (id == "fmt " && (BitConverter.ToInt16(bytes, position + 10) != 1 || BitConverter.ToInt32(bytes, position + 12) != Rate || BitConverter.ToInt16(bytes, position + 22) != 16))
                throw new InvalidDataException("Expected a 48 kHz mono 16-bit WAV.");
            if (id == "data")
                return Enumerable.Range(0, size / 2).Select(i => BitConverter.ToInt16(bytes, position + 8 + i * 2) / 32_768f).ToArray();
            position += 8 + size + (size & 1);
        }
        throw new InvalidDataException("The WAV has no data chunk.");
    }

    private static (float[] Output, double[] TimingsMs) Process(INoiseSuppressor suppressor, float[] input, float amount)
    {
        var graph = new AudioGraph(suppressor);
        var configuration = new MicrophoneDspConfiguration(
            1, new(true, amount), new(false, -48, 10, 180), new(false, 0),
            new(false, []), new(false, -18, 4, 12, 180, 2), new(false, -1, 90));
        var length = suppressor.FrameLength;
        var output = new float[input.Length];
        var frame = new float[length];
        var timings = new List<double>();
        for (var offset = 0; offset + length <= input.Length; offset += length)
        {
            input.AsSpan(offset, length).CopyTo(frame);
            var started = System.Diagnostics.Stopwatch.GetTimestamp();
            graph.ProcessMicrophone(frame, configuration);
            timings.Add(System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            frame.CopyTo(output, offset);
        }
        return (output, timings.Skip(20).ToArray());
    }

    private static double SegmentDb(float[] input, float[] output, int lag, int from, int to)
    {
        double inputPower = 0, outputPower = 0;
        for (var i = from; i < to; i++)
        {
            inputPower += input[i] * input[i];
            outputPower += output[i + lag] * output[i + lag];
        }
        return 10 * Math.Log10(outputPower / inputPower + 1e-18);
    }

    internal static float[] ClickTrack(float[] voice)
    {
        var random = new Random(11);
        var samples = new float[voice.Length + Rate * 5];
        voice.CopyTo(samples, 0);
        // Resume with a real word onset: start 20 ms before the first loud sample after 1 s.
        var peak = voice.Max(MathF.Abs);
        var onset = Rate;
        while (onset < voice.Length - Rate && MathF.Abs(voice[onset]) < peak * 0.1f) onset++;
        voice.AsSpan(onset - Rate / 50, Rate).CopyTo(samples.AsSpan(samples.Length - Rate));
        for (var i = voice.Length; i < samples.Length - Rate; i++) samples[i] = (float)(random.NextDouble() - 0.5) * 0.0004f;
        for (var start = voice.Length + Rate / 2; start + 2_000 < samples.Length - Rate; start += Rate * 17 / 100)
            for (var i = 0; i < 1_200; i++)
                samples[start + i] += (float)(random.NextDouble() - 0.5) * 0.6f * MathF.Exp(-i / 180f);
        return samples;
    }

    internal static float[] SyntheticVoice(int length)
    {
        var random = new Random(7);
        var samples = new float[length];
        double phase = 0;
        var f1 = new Resonator(700, 110);
        var f2 = new Resonator(1_220, 140);
        var f3 = new Resonator(2_600, 220);
        for (var i = 0; i < length; i++)
        {
            var t = (double)i / Rate;
            var f0 = 110 + 60 * Math.Sin(2 * Math.PI * 0.37 * t) + random.NextDouble() * 2;
            phase += f0 / Rate;
            var pulse = 0f;
            if (phase >= 1) { phase -= 1; pulse = 1f; }
            var excitation = pulse + (float)(random.NextDouble() - 0.5) * 0.02f;
            var voiced = f1.Process(excitation) + 0.6f * f2.Process(excitation) + 0.3f * f3.Process(excitation);
            var envelope = 0.55f + 0.45f * MathF.Sin(2 * MathF.PI * 3.1f * (float)t);
            samples[i] = voiced * envelope * 0.08f + (float)(random.NextDouble() - 0.5) * 0.0004f;
        }
        return samples;
    }

    private static int BestLag(float[] reference, float[] signal, int maximumLag)
    {
        var best = 0;
        var bestScore = double.MinValue;
        for (var lag = 0; lag <= maximumLag; lag++)
        {
            double score = 0;
            for (var i = Rate; i < reference.Length - maximumLag; i += 3) score += reference[i] * signal[i + lag];
            if (score > bestScore) { bestScore = score; best = lag; }
        }
        return best;
    }

    private static double BandDb(float[] reference, float[] signal, int lag, double hz)
    {
        double input = 0, output = 0;
        for (var offset = hz * 0.84; offset <= hz * 1.19; offset += hz * 0.035)
        {
            input += Power(reference, 0, offset);
            output += Power(signal, lag, offset);
        }
        return 10 * Math.Log10(output / input);
    }

    private static double Ripple(float[] reference, float[] signal, int lag)
    {
        var values = new List<double>();
        for (var hz = 300.0; hz <= 3_000; hz += 12.5)
            values.Add(10 * Math.Log10(Power(signal, lag, hz) / Power(reference, 0, hz)));
        var smoothed = values.Select((_, i) => values.Skip(Math.Max(0, i - 8)).Take(17).Average()).ToArray();
        return Math.Sqrt(values.Select((v, i) => Math.Pow(v - smoothed[i], 2)).Average());
    }

    private static double Power(float[] samples, int start, double hz)
    {
        double real = 0, imaginary = 0;
        var from = Rate + start;
        var count = samples.Length - Rate - 2_000;
        for (var i = 0; i < count; i++)
        {
            var window = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / count);
            var angle = 2 * Math.PI * hz * i / Rate;
            real += samples[from + i] * window * Math.Cos(angle);
            imaginary += samples[from + i] * window * Math.Sin(angle);
        }
        return real * real + imaginary * imaginary + 1e-18;
    }

    private sealed class Resonator(double frequency, double bandwidth)
    {
        private readonly double r = Math.Exp(-Math.PI * bandwidth / Rate);
        private readonly double c = Math.Cos(2 * Math.PI * frequency / Rate);
        private double y1, y2;

        public float Process(float x)
        {
            var y = x + 2 * r * c * y1 - r * r * y2;
            y2 = y1;
            y1 = y;
            return (float)(y * (1 - r));
        }
    }
}
