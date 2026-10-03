using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;

internal static class MicrophoneQualityTests
{
    // Explicit opt-in: shared-mode input only, no playback, routes, saved settings,
    // or audio files. Exercise the real pipeline without competing for its cable.
    public static void RunLive(string model = NoiseSuppressionModels.Standard)
    {
        using var endpoints = new EndpointService();
        var input = endpoints.List().Single(endpoint => endpoint.Flow == "capture"
            && endpoint.InterfaceName == "HyperX QuadCast 2");
        var settings = new AudioHostSettings
        {
            Enabled = true,
            AutomaticApplicationRouting = false,
            MonitoringEnabled = false,
            Buses = [new AudioBusConfiguration { Id = "mic", DeviceId = input.Id }],
        };
        var configuration = Configuration() with
        {
            NoiseSuppression = new(true, 45),
            NoiseGate = new(true, -48, 10, 180),
            Limiter = new(true, -1, 90),
        };
        for (var cycle = 0; cycle < 3; cycle++)
        {
            using var suppressor = NoiseSuppressorFactory.Create(model, AppContext.BaseDirectory, Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Switchboard", "models", "deepfilternet"), out var note);
            Require(suppressor.IsAvailable && note is null, $"{model} could not start: {note ?? suppressor.LastError}");
            using var pipeline = new MicrophonePipeline(suppressor, settings, configuration);
            pipeline.Start();
            Thread.Sleep(1_000);
            pipeline.UpdateConfiguration(settings, configuration with { Version = 2, NoiseSuppression = new(true, 80) });
            Thread.Sleep(cycle == 2 ? 5_000 : 1_000);
            Require(!pipeline.CaptureStopped && !pipeline.SuppressionBypassed && pipeline.LastError is null,
                $"Live microphone pipeline failed: {pipeline.LastError}");
            var timings = pipeline.FrameTimings;
            Require(timings.TotalFrames >= 100 && pipeline.CaptureOverruns == 0 && pipeline.DroppedOrBypassedFrames == 0,
                "Live microphone frames were missing, dropped or bypassed.");
            Console.WriteLine($"QuadCast 2 {suppressor.BackendName} cycle {cycle + 1}: {pipeline.InputFormat}; {timings.TotalFrames} frames; "
                + $"DSP p99 {timings.P99Ms:F3} ms; capture overruns {pipeline.CaptureOverruns}; bypasses {pipeline.DroppedOrBypassedFrames}.");
            pipeline.Dispose();
            pipeline.Dispose();
        }
    }

    public static void Run()
    {
        var failures = new List<Exception>();
        foreach (var test in new Action[] { AlignedSuppressionTransitions, NativeSuppressionLifecycle, SpeechProtectionPreservesWords, SpeechPreservingModelKeepsCleanupWhileTalking, ExplicitModelSelectionFallsBack, GatePreservesSpeech, FailedFrameDoesNotReplay, TestPlaybackUsesCurrentOutput })
        {
            try { test(); Console.WriteLine($"PASS {test.Method.Name}"); }
            catch (Exception error) { failures.Add(error); Console.WriteLine($"FAIL {test.Method.Name}: {error.Message}"); }
        }
        if (failures.Count > 0) throw new AggregateException(failures);
    }

    private static void SpeechProtectionPreservesWords()
    {
        using var model = new DelayedPassThrough { Gain = 0 };
        var graph = new AudioGraph(model);
        var configuration = Configuration() with { NoiseSuppression = new(true, 100) };
        var frame = new float[480];
        // A model can mistake an entire quiet syllable for noise. Even at maximum
        // strength, original speech must remain above the chopped-word threshold.
        for (var i = 0; i < 6; i++)
        {
            Array.Fill(frame, 0.05f);
            graph.ProcessMicrophone(frame, configuration);
        }
        Require(frame.All(x => x >= 0.00999f), "Maximum cleanup erased model-misclassified speech.");
        model.Probability = 0;
        for (var i = 0; i < 20; i++)
        {
            Array.Fill(frame, 0.05f);
            graph.ProcessMicrophone(frame, configuration);
            Require(frame.All(x => x >= 0.00999f), "A consonant/word tail lost the original speech contribution.");
        }
        for (var i = 0; i < 40; i++)
        {
            Array.Fill(frame, 0.05f);
            graph.ProcessMicrophone(frame, configuration);
        }
        Require(frame.All(x => x is > 0 and < 0.001f), "Strong room cleanup was lost or hard-muted audio.");
        // If the neural output is intact, low VAD must not impose another gate.
        model.Gain = 1;
        Array.Fill(frame, 0.05f);
        graph.ProcessMicrophone(frame, configuration);
        Require(frame.All(x => Math.Abs(x - 0.05f) < 0.00001f), "An extra VAD gate changed intact model output.");
        var allocated = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 100; i++) graph.ProcessMicrophone(frame, configuration);
        Require(GC.GetAllocatedBytesForCurrentThread() == allocated, "Speech cleanup allocated on the DSP thread.");
    }

    private static void SpeechPreservingModelKeepsCleanupWhileTalking()
    {
        // Keyboard clicks during speech: the model removes them, so recognized speech
        // must not reinsert the raw microphone signal that still contains them.
        using var model = new DelayedPassThrough { Gain = 0, Probability = 1, Preserves = true };
        var graph = new AudioGraph(model);
        var configuration = Configuration() with { NoiseSuppression = new(true, 100) };
        var frame = new float[480];
        for (var i = 0; i < 12; i++)
        {
            Array.Fill(frame, 0.05f);
            graph.ProcessMicrophone(frame, configuration);
        }
        Require(frame.All(x => x is > 0 and < 0.001f), "A speech-preserving model reinserted raw audio during speech.");
    }

    private static void ExplicitModelSelectionFallsBack()
    {
        Require(NoiseSuppressionModels.Parse("deepfilternet3") == NoiseSuppressionModels.DeepFilterNet3
            && NoiseSuppressionModels.Parse("unknown") == NoiseSuppressionModels.Standard
            && NoiseSuppressionModels.Parse(null) == NoiseSuppressionModels.Standard, "Model choices did not parse.");
        var empty = Directory.CreateTempSubdirectory("switchboard-no-model-");
        try
        {
            using var standard = NoiseSuppressorFactory.Create(NoiseSuppressionModels.Standard, AppContext.BaseDirectory, empty.FullName, out var standardNote);
            Require(standard.BackendName == "RNNoise" && standardNote is null, "The default model changed without a choice.");
            using var fallback = NoiseSuppressorFactory.Create(NoiseSuppressionModels.DeepFilterNet3, AppContext.BaseDirectory, empty.FullName, out var note);
            Require(fallback.BackendName == "RNNoise" && fallback.IsAvailable && note?.Contains("standard noise removal") == true,
                "A missing DeepFilterNet3 model must fall back to RNNoise and report why.");
        }
        finally { empty.Delete(recursive: true); }
    }

    private static void TestPlaybackUsesCurrentOutput()
    {
        // A disabled monitor can retain an old display/speaker endpoint while the
        // main output has moved to headphones. The test must use today's output.
        var settings = new AudioHostSettings
        {
            MonitoringEnabled = false,
            MonitoringDeviceId = "old-display-speakers",
            Buses = [new AudioBusConfiguration { Id = "game", DeviceId = "current-headphones" }],
        };
        Require(MicrophonePipeline.SelectTestOutputDeviceId(settings) == "current-headphones",
            "The microphone test must follow the current output when monitoring is off.");
        Require(settings.MonitoringDeviceId == "old-display-speakers",
            "Choosing a test output must preserve the separately saved monitor preference.");
        var explicitMonitor = new AudioHostSettings
        {
            MonitoringEnabled = true,
            MonitoringDeviceId = "dedicated-monitor",
            Buses = settings.Buses,
        };
        Require(MicrophonePipeline.SelectTestOutputDeviceId(explicitMonitor) == "dedicated-monitor",
            "An enabled monitor must remain the explicit microphone test destination.");
        Require(MicrophonePipeline.SelectTestOutputDeviceId(new AudioHostSettings
        {
            MonitoringDeviceId = "old-display-speakers",
        }) == string.Empty, "A missing main output must not silently send the test to an old speaker.");
    }

    private static void AlignedSuppressionTransitions()
    {
        using var model = new DelayedPassThrough();
        var graph = new AudioGraph(model);
        var frame = new float[480];
        var previous = new float[480];
        var input = new float[480];
        var random = new Random(3821);
        for (var block = 0; block < 100; block++)
        {
            for (var i = 0; i < frame.Length; i++) frame[i] = (float)(random.NextDouble() - 0.5) * 0.4f;
            frame.CopyTo(input, 0);
            model.Fail = block == 40;
            model.Throw = block == 41;
            model.Corrupt = block == 42;
            var configuration = Configuration() with { NoiseSuppression = new(block % 12 is >= 3 and < 9, block % 2 == 0 ? 25 : 100) };
            var result = graph.ProcessMicrophone(frame, configuration);
            if (model.Fail || model.Throw || model.Corrupt)
                Require(result.SuppressionAttempted && !result.SuppressionSucceeded, "Invalid native output was accepted as healthy processing.");
            for (var i = 0; i < frame.Length; i++)
                Require(Math.Abs(frame[i] - previous[i]) < 0.00001f,
                    $"Suppression toggle/strength edit mixed different moments in time at block {block}.");
            input.CopyTo(previous, 0);
        }
        graph.Reset();
        Array.Fill(frame, 0.1f);
        graph.ProcessMicrophone(frame, Configuration());
        Require(frame.All(x => x == 0), "Reset replayed microphone samples from the previous session.");
    }

    private sealed class DelayedPassThrough : INoiseSuppressor
    {
        private readonly float[] history = new float[480];
        public bool IsAvailable => true;
        public string BackendName => "test";
        public string ModelIdentifier => "test";
        public string? ModelHash => null;
        public string? NativeLibraryHash => null;
        public int SampleRate => 48_000;
        public int FrameLength => 480;
        public int OutputDelaySamples => 480;
        public float Probability { get; set; } = 1;
        public float Gain { get; set; } = 1;
        public bool Fail { get; set; }
        public bool Throw { get; set; }
        public bool Corrupt { get; set; }
        public float SpeechProbability => Probability;
        public bool Preserves { get; set; }
        public bool PreservesSpeech => Preserves;
        public double AlgorithmicLatencyMs => 20;
        public string? LastError => null;
        public bool Initialize(NoiseSuppressorInitialization initialization) => true;
        public bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
        {
            localSnrDb = float.NaN;
            if (Throw) throw new InvalidOperationException("Injected model exception.");
            if (Fail) return false;
            for (var i = 0; i < history.Length; i++) output[i] = history[i] * Gain;
            if (Corrupt) output[0] = float.NaN;
            input.CopyTo(history);
            return true;
        }
        public bool Reset() { Array.Clear(history); return true; }
        public void Dispose() { }
    }

    private static void NativeSuppressionLifecycle()
    {
        using var model = NoiseSuppressorFactory.Create(AppContext.BaseDirectory, Path.GetTempPath(), out var fallbackReason);
        Require(model.IsAvailable && model.BackendName == "RNNoise" && fallbackReason is null, "Packaged RNNoise must be the live default.");
        var graph = new AudioGraph(model);
        var configuration = Configuration() with { NoiseSuppression = new(true, 85) };
        var frame = new float[480];
        for (var i = 0; i < frame.Length; i++) frame[i] = MathF.Sin(i * 0.045f) * 0.1f;
        for (var i = 0; i < 100; i++) graph.ProcessMicrophone(frame, configuration);
        var allocated = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 100; i++) graph.ProcessMicrophone(frame, configuration);
        Require(GC.GetAllocatedBytesForCurrentThread() == allocated, "Native suppression allocated in the processing path.");
        Require(model.Reset(), "Native reset failed.");
        graph.Reset();
        Array.Clear(frame);
        for (var i = 0; i < 6; i++)
        {
            Require(graph.ProcessMicrophone(frame, configuration).SuppressionSucceeded, "Reset native frame failed.");
            Require(frame.All(x => Math.Abs(x) < 0.00001f), "Reset replayed voice from the previous session.");
        }
        model.Dispose();
        model.Dispose();
        Require(!model.IsAvailable, "Disposal retained a native noise state.");
    }

    private static void GatePreservesSpeech()
    {
        using var suppressor = new BypassNoiseSuppressor();
        var graph = new AudioGraph(suppressor);
        var configuration = Configuration() with { NoiseGate = new(true, -30f, 10f, 100f) };
        var input = new float[480];
        var output = new float[480];
        double inputPower = 0, outputPower = 0, errorPower = 0;
        // A low voice fundamental just above the opening threshold must not be
        // repeatedly gated at its zero crossings.
        for (var frame = 0; frame < 100; frame++)
        {
            for (var i = 0; i < input.Length; i++) input[i] = 0.04f * MathF.Sin(2 * MathF.PI * 110 * (frame * 480 + i) / 48_000);
            input.CopyTo(output, 0);
            graph.ProcessMicrophone(output, configuration);
            if (frame < 50) continue;
            for (var i = 0; i < input.Length; i++)
            {
                inputPower += input[i] * input[i];
                outputPower += output[i] * output[i];
                errorPower += Math.Pow(input[i] - output[i], 2);
            }
        }
        var retained = Math.Sqrt(outputPower / inputPower);
        Require(retained > 0.99 && errorPower / inputPower < 0.0001,
            $"Gate altered sustained speech above threshold (retained amplitude {retained:P2}).");
        // A short syllable gap stays open; sustained room noise still closes.
        Array.Fill(output, 0.001f);
        graph.ProcessMicrophone(output, configuration);
        Require(output.Min() > 0.00099f, "Gate chopped a short speech gap.");
        for (var frame = 0; frame < 100; frame++)
        {
            Array.Fill(output, 0.001f);
            graph.ProcessMicrophone(output, configuration);
        }
        Require(output.Max() < 0.000001f, "Gate did not close on sustained background noise.");
        var allocated = GC.GetAllocatedBytesForCurrentThread();
        for (var frame = 0; frame < 100; frame++) graph.ProcessMicrophone(output, configuration);
        Require(GC.GetAllocatedBytesForCurrentThread() == allocated, "Gate allocated on the processing thread.");
    }

    private static void FailedFrameDoesNotReplay()
    {
        using var suppressor = new IntermittentSuppressor();
        var graph = new AudioGraph(suppressor);
        var configuration = Configuration() with { NoiseSuppression = new(true, 55) };
        var frame = new float[480];
        for (var i = 0; i < 4; i++) graph.ProcessMicrophone(frame, configuration);
        suppressor.Fail = true;
        Array.Fill(frame, 0.02f);
        var result = graph.ProcessMicrophone(frame, configuration);
        Require(!result.SuppressionSucceeded && frame.All(x => x == 0.02f),
            "A failed model frame replayed stale audio instead of the current raw microphone.");
    }

    private static MicrophoneDspConfiguration Configuration() => new(
        1, new(false, 55), new(false, -48, 10, 180), new(false, 0),
        new(false, []), new(false, -18, 3, 12, 180, 0), new(false, -1, 90));

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private sealed class IntermittentSuppressor : INoiseSuppressor
    {
        public bool Fail { get; set; }
        public bool IsAvailable => true;
        public string BackendName => "test";
        public string ModelIdentifier => "test";
        public string? ModelHash => null;
        public string? NativeLibraryHash => null;
        public int SampleRate => 48_000;
        public int FrameLength => 480;
        public double AlgorithmicLatencyMs => 0;
        public string? LastError => null;
        public bool Initialize(NoiseSuppressorInitialization initialization) => true;
        public bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
        {
            localSnrDb = float.NaN;
            if (Fail) return false;
            output.Fill(0.25f);
            return true;
        }
        public bool Reset() => true;
        public void Dispose() { }
    }
}
