using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;

internal static class MicrophoneQualityTests
{
    // Explicit opt-in: shared-mode input only, no playback, routes, saved settings,
    // or audio files. Exercise the real pipeline without competing for its cable.
    public static void RunLive()
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
            using var suppressor = new RnnoiseNoiseSuppressor();
            Require(suppressor.Initialize(new(AppContext.BaseDirectory, Path.GetTempPath())), "Native RNNoise could not start.");
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
            Console.WriteLine($"QuadCast 2 cycle {cycle + 1}: {pipeline.InputFormat}; {timings.TotalFrames} frames; "
                + $"DSP p99 {timings.P99Ms:F3} ms; capture overruns {pipeline.CaptureOverruns}; bypasses {pipeline.DroppedOrBypassedFrames}.");
            pipeline.Dispose();
            pipeline.Dispose();
        }
    }

    public static void Run()
    {
        var failures = new List<Exception>();
        foreach (var test in new Action[] { RnnoiseStrengthAlignment, GatePreservesSpeech, FailedFrameDoesNotReplay })
        {
            try { test(); Console.WriteLine($"PASS {test.Method.Name}"); }
            catch (Exception error) { failures.Add(error); Console.WriteLine($"FAIL {test.Method.Name}: {error.Message}"); }
        }
        if (failures.Count > 0) throw new AggregateException(failures);
    }

    private static void RnnoiseStrengthAlignment()
    {
        using var full = new RnnoiseNoiseSuppressor();
        using var light = new RnnoiseNoiseSuppressor();
        var initialization = new NoiseSuppressorInitialization(AppContext.BaseDirectory, Path.GetTempPath());
        Require(full.Initialize(initialization) && light.Initialize(initialization), "Native RNNoise must be available.");
        full.Configure(100);
        var input = new float[480];
        var previous = new float[480];
        var wet = new float[480];
        var mixed = new float[480];
        var random = new Random(1729);
        // Two identical native models isolate the raw contribution from the neural
        // output. RNNoise's overlap-add returns the preceding 480-sample frame.
        foreach (var amount in new[] { 25f, 45f, 55f, 80f, 100f, 25f })
        {
            light.Configure(amount);
            var floor = NoiseStrengthMapping.ToDryFloor(amount);
            for (var frame = 0; frame < 8; frame++)
            {
                for (var i = 0; i < input.Length; i++) input[i] = (float)(random.NextDouble() - 0.5) * 0.2f;
                Require(full.Process(input, wet, out _) && light.Process(input, mixed, out _), "Native frame failed.");
                var error = 0f;
                for (var i = 0; i < input.Length; i++)
                    error = Math.Max(error, Math.Abs(mixed[i] - (wet[i] * (1 - floor) + previous[i] * floor)));
                Require(error < 0.00001f, $"Strength {amount} mixed different moments in time (maximum error {error:F6}).");
                input.CopyTo(previous, 0);
            }
        }
        Require(full.Reset() && light.Reset(), "Native reset failed.");
        light.Configure(25);
        Array.Clear(input);
        Require(light.Process(input, mixed, out _), "Reset frame failed.");
        Require(mixed.All(x => Math.Abs(x) < 0.00001f), "Reset replayed the previous raw frame.");
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
        public double AttenuationLimitDb => 0;
        public string? LastError => null;
        public bool Initialize(NoiseSuppressorInitialization initialization) => true;
        public void Configure(float amount) { }
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
