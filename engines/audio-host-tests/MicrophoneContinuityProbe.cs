using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;

// Diagnostic (--microphone-continuity clean.wav noise.wav): mixes real speech with
// real room noise, runs the full microphone graph, and reports how often speech
// is chopped (10 ms frames at least 15 dB under the clean reference) and the
// tonal balance against the clean voice. Needs 48 kHz 16-bit WAVs.
internal static class MicrophoneContinuityProbe
{
    private const int Rate = 48_000;
    private const int Frame = 480;
    private static readonly int[] Bands = [120, 250, 500, 1_000, 2_000, 4_000, 8_000];

    public static void Run(string cleanPath, string noisePath)
    {
        var clean = ReadMono(cleanPath);
        var noise = ReadMono(noisePath);
        var cleanPeak = clean.Max(MathF.Abs);
        for (var i = 0; i < clean.Length; i++) clean[i] *= 0.3f / cleanPeak;
        var modelDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Switchboard", "models", "deepfilternet");
        var initialization = new NoiseSuppressorInitialization(AppContext.BaseDirectory, modelDirectory);
        foreach (var snrDb in new[] { 25f, 12f })
        {
            var input = Mix(clean, noise, snrDb);
            Console.WriteLine($"-- speech with room noise at {snrDb} dB SNR");
            foreach (var (name, create) in new (string, Func<INoiseSuppressor>)[]
                     {
                         ("RNNoise", () => new RnnoiseNoiseSuppressor()),
                         ("DeepFilterNet3", () => new DeepFilterNetNoiseSuppressor()),
                     })
            {
                foreach (var amount in new[] { 0f, 35f, 55f, 85f })
                {
                    using var suppressor = create();
                    if (!suppressor.Initialize(initialization))
                    {
                        Console.WriteLine($"{name}: unavailable ({suppressor.LastError})");
                        break;
                    }
                    var output = Process(suppressor, input, amount);
                    Report($"{name} amount {amount,3}", clean, output);
                }
            }
        }
    }

    internal static float[] Process(INoiseSuppressor suppressor, float[] input, float amount)
    {
        var graph = new AudioGraph(suppressor);
        var configuration = new MicrophoneDspConfiguration(
            1, new(amount > 0, amount), new(false, -60, 2, 300), new(true, 0),
            new(false, []), new(false, -16, 1.5f, 25, 250, 0), new(true, -1, 90));
        var length = suppressor.FrameLength;
        var output = new float[input.Length];
        var frame = new float[length];
        for (var offset = 0; offset + length <= input.Length; offset += length)
        {
            input.AsSpan(offset, length).CopyTo(frame);
            graph.ProcessMicrophone(frame, configuration);
            frame.CopyTo(output, offset);
        }
        return output;
    }

    public static void RunRegression(string cleanPath, string noisePath)
    {
        var clean = ReadMono(cleanPath);
        var noise = ReadMono(noisePath);
        var peak = clean.Max(MathF.Abs);
        if (peak == 0 || noise.All(sample => sample == 0)) throw new InvalidDataException("Speech/noise references must contain audio.");
        for (var i = 0; i < clean.Length; i++) clean[i] *= 0.3f / peak;
        var initialization = new NoiseSuppressorInitialization(AppContext.BaseDirectory, Path.GetTempPath());
        foreach (var scale in new[] { 1f, 0.1f, 0.03f })
        {
            var reference = clean.Select(sample => sample * scale).ToArray();
            var input = Mix(reference, noise, 12);
            using var model = new RnnoiseNoiseSuppressor();
            if (!model.Initialize(initialization)) throw new InvalidOperationException(model.LastError);
            var output = Process(model, input, 85);
            var chopped = Report($"RNNoise strong / input {scale:F2}", reference, output);
            if (chopped > 0.5) throw new InvalidOperationException($"Strong suppression chopped {chopped:F1}% of reference speech.");
        }
        var noisePeak = noise.Max(MathF.Abs);
        var noiseInput = noise.Select(sample => sample * 0.05f / noisePeak).ToArray();
        foreach (var amount in new[] { 80f, 100f })
        {
            using var model = new RnnoiseNoiseSuppressor();
            if (!model.Initialize(initialization)) throw new InvalidOperationException(model.LastError);
            var output = Process(model, noiseInput, amount);
            // Exclude startup; compare the same samples on the model's timeline.
            var count = Math.Min(noiseInput.Length, output.Length - model.OutputDelaySamples) - Rate;
            var reductionDb = 10 * Math.Log10(Energy(output, Rate + model.OutputDelaySamples, count) / Energy(noiseInput, Rate, count));
            Console.WriteLine($"Noise-only strength {amount}: {reductionDb:F1} dB level change.");
            if (reductionDb > -12) throw new InvalidOperationException("Strong cleanup lost meaningful background-noise reduction.");
        }
        Console.WriteLine("Reference speech and noise regressions passed; listening on the user's microphone remains separate.");
    }

    // Returns the chopped-speech percentage for regression checks.
    internal static double Report(string label, float[] clean, float[] output)
    {
        var lag = BestLag(clean, output, 4_000);
        var frames = (Math.Min(clean.Length, output.Length - lag)) / Frame;
        var energies = new double[frames];
        for (var f = 0; f < frames; f++) energies[f] = Energy(clean, f * Frame, Frame);
        var loudest = energies.Max();
        int speech = 0, chopped = 0;
        double cleanPower = 0, outputPower = 0;
        var speechFrames = new bool[frames];
        for (var f = 0; f < frames; f++)
        {
            // Speech frames: within 30 dB of the loudest clean frame.
            if (energies[f] < loudest * 0.001) continue;
            speechFrames[f] = true;
            speech++;
            var processed = Energy(output, f * Frame + lag, Frame);
            cleanPower += energies[f];
            outputPower += processed;
            if (processed < energies[f] * 0.0316) chopped++;
        }
        var gainDb = 10 * Math.Log10(outputPower / cleanPower);
        Console.Write($"  {label}: lag {lag,4} | chopped speech {100.0 * chopped / speech,5:F1}% | level {gainDb,5:F1} dB | tone ");
        foreach (var hz in Bands)
        {
            var reference = BandEnergy(clean, 0, hz, speechFrames);
            var processed = BandEnergy(output, lag, hz, speechFrames);
            Console.Write($"{hz}Hz {10 * Math.Log10(processed / reference) - gainDb,5:F1} ");
        }
        Console.WriteLine();
        return 100.0 * chopped / speech;
    }

    private static float[] Mix(float[] clean, float[] noise, float snrDb)
    {
        var speechPower = Energy(clean, 0, clean.Length) / clean.Length;
        var noisePower = Energy(noise, 0, noise.Length) / noise.Length;
        var scale = (float)Math.Sqrt(speechPower / noisePower / Math.Pow(10, snrDb / 10));
        var mixed = new float[clean.Length];
        for (var i = 0; i < mixed.Length; i++) mixed[i] = clean[i] + noise[i % noise.Length] * scale;
        return mixed;
    }

    private static double BandEnergy(float[] signal, int offset, int hz, bool[] frames)
    {
        // RBJ constant-peak band-pass, about one octave wide.
        var w = 2 * Math.PI * hz / Rate;
        var alpha = Math.Sin(w) / (2 * 1.4);
        var a0 = 1 + alpha;
        double b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.Cos(w) / a0, a2 = (1 - alpha) / a0;
        double x1 = 0, x2 = 0, y1 = 0, y2 = 0, energy = 0;
        for (var i = offset; i < Math.Min(signal.Length, offset + frames.Length * Frame); i++)
        {
            var x = signal[i];
            var y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            if (frames[(i - offset) / Frame]) energy += y * y;
        }
        return energy + 1e-18;
    }

    private static double Energy(float[] signal, int start, int count)
    {
        double sum = 0;
        for (var i = start; i < Math.Min(signal.Length, start + count); i++) sum += signal[i] * signal[i];
        return sum;
    }

    private static int BestLag(float[] reference, float[] signal, int maximumLag)
    {
        var start = Rate;
        var length = Math.Min(Rate * 2, reference.Length - start - maximumLag);
        var best = 0;
        var bestScore = double.MinValue;
        for (var lag = 0; lag <= maximumLag; lag += 1)
        {
            double score = 0;
            for (var i = start; i < start + length; i += 2) score += reference[i] * signal[i + lag];
            if (score > bestScore) { bestScore = score; best = lag; }
        }
        return best;
    }

    internal static float[] ReadMono(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var position = 12;
        var channels = 1;
        while (position + 8 <= bytes.Length)
        {
            var id = System.Text.Encoding.ASCII.GetString(bytes, position, 4);
            var size = BitConverter.ToInt32(bytes, position + 4);
            if (id == "fmt ")
            {
                channels = BitConverter.ToInt16(bytes, position + 10);
                if (BitConverter.ToInt16(bytes, position + 8) != 1 || BitConverter.ToInt32(bytes, position + 12) != Rate || BitConverter.ToInt16(bytes, position + 22) != 16)
                    throw new InvalidDataException("Expected a 48 kHz 16-bit PCM WAV.");
            }
            if (id == "data")
            {
                var frames = size / 2 / channels;
                var samples = new float[frames];
                for (var i = 0; i < frames; i++)
                {
                    var sum = 0f;
                    for (var c = 0; c < channels; c++) sum += BitConverter.ToInt16(bytes, position + 8 + (i * channels + c) * 2) / 32_768f;
                    samples[i] = sum / channels;
                }
                return samples;
            }
            position += 8 + size + (size & 1);
        }
        throw new InvalidDataException("The WAV has no data chunk.");
    }
}
