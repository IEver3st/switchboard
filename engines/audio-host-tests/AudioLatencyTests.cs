using System.Runtime.InteropServices;
using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;
using Switchboard.AudioHost.Realtime;

internal static class AudioLatencyTests
{
    public static void Run()
    {
        LiveQueuesCatchUpWithoutChangingRecording();
        LiveQueuesAbsorbPacketJitter();
        PartialFramesPreserveDsp();
        SuppressionTransitionsKeepModelFrames();
        Console.WriteLine("Audio latency regressions passed: live queue recovery, recording continuity, partial DSP, model transitions and zero callback allocations.");
    }

    private static void LiveQueuesCatchUpWithoutChangingRecording()
    {
        // Half a second accumulated during a simulated playback stall. Capacity
        // alone is not steady-state latency; compare the age of the next sample.
        const int frames = 24_000, quantum = 480, retained = 960;
        var live = new SpscFloatRing(frames * 2, retained * 2);
        var recording = new SpscFloatRing(frames * 2);
        var sequence = Enumerable.Range(0, frames).Select(i => (float)i).ToArray();
        live.WriteMono(sequence);
        recording.WriteMono(sequence);
        var output = new float[quantum * 2];
        live.Read(output);
        Require(output[0] == frames - retained && output[1] == output[0], "Live queue did not skip old audio in stereo pairs");
        Require(live.DiscardedSamples == (frames - retained) * 2, "Live discard count lost samples");
        recording.Read(output);
        Require(output[0] == 0 && output[1] == 0 && recording.DiscardedSamples == 0, "Recording queue lost continuity");
        for (var position = quantum; position < frames; position += quantum)
        {
            recording.Read(output);
            for (var i = 0; i < output.Length; i++) Require(output[i] == position + i / 2, "Recording sample order changed");
        }

        // Wraparound after the skip, followed by a callback larger than the cap.
        live.WriteMono(sequence.AsSpan(0, retained));
        var large = new float[retained * 3];
        live.Read(large);
        Require(large[0] == frames - quantum && large[quantum * 2] == 0 && large[^1] == retained - 1,
            "Live wraparound or larger device callback was truncated");
        live.Read(output);
        Require(output.All(v => v == 0), "Underrun replayed old audio");

        var monitorRing = new BoundedFrameAdapter(frames);
        monitorRing.Write(sequence);
        var monitor = new ProcessedWaveProvider(monitorRing);
        var bytes = new byte[quantum * sizeof(float)];
        monitor.Read(bytes);
        Require(MemoryMarshal.Cast<byte, float>(bytes)[0] == frames - retained, "Monitor retained its stalled backlog");
        Require(monitor.DiscardedSamples == frames - retained, "Monitor discarded count incorrect");
        var direct = new FloatWaveProvider(live);
        for (var i = 0; i < 100; i++) { live.WriteMono(sequence.AsSpan(0, quantum)); direct.Read(bytes); monitor.Read(bytes); }
        var allocated = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 100; i++) { live.WriteMono(sequence.AsSpan(0, quantum)); direct.Read(bytes); monitor.Read(bytes); }
        Require(GC.GetAllocatedBytesForCurrentThread() == allocated, "Live read/copy path allocated");
        Console.WriteLine("Synthetic 500 ms playback backlog: next sample age 500 ms -> 20 ms; recording retained every sample.");
    }

    private static void LiveQueuesAbsorbPacketJitter()
    {
        // Ten seconds of 10 ms capture packets landing up to 5 ms late, drained
        // by a 3 ms low-latency output on a slightly faster clock. A ring without
        // a cushion underruns on almost every late packet.
        const int packet = 480, period = 144, seconds = 10, rate = 48_000;
        var ring = new SpscFloatRing(rate * 2 / 5,
            rate * 2 * AudioConstants.LiveQueueMilliseconds / 1_000);
        var monitorSource = new BoundedFrameAdapter(rate / 5);
        var monitor = new ProcessedWaveProvider(monitorSource);
        var random = new Random(5);
        var block = Enumerable.Repeat(0.25f, packet).ToArray();
        var output = new float[period * 2];
        var bytes = new byte[period * sizeof(float)];
        var nextPacket = 0.0;
        var written = 0;
        bool ringStarted = false, monitorStarted = false;
        int ringGaps = 0, monitorGaps = 0;
        for (var tick = 0; tick < rate * seconds / period; tick++)
        {
            var now = tick * period * 1.0003;
            while (nextPacket <= now)
            {
                ring.WriteMono(block);
                monitorSource.Write(block);
                written++;
                nextPacket = written * packet + random.Next(0, 240);
            }
            ring.Read(output);
            monitor.Read(bytes);
            // Every produced sample is non-zero: silence after playback starts is a dropout.
            if (ringStarted && output.Contains(0f)) ringGaps++;
            ringStarted |= output[^1] != 0f;
            var monitored = MemoryMarshal.Cast<byte, float>(bytes);
            if (monitorStarted && monitored.Contains(0f)) monitorGaps++;
            monitorStarted |= monitored[^1] != 0f;
        }
        // One clock-drift correction is allowed; ordinary jitter is not.
        Require(ringGaps <= 1, $"Live ring dropped out {ringGaps} times on ordinary packet jitter.");
        Require(monitorGaps <= 1, $"Monitor dropped out {monitorGaps} times on ordinary packet jitter.");
        Console.WriteLine($"Jittered 10 ms packets into a 3 ms output for {seconds} s: {ringGaps} ring and {monitorGaps} monitor dropouts.");
    }

    private static MicrophoneDspConfiguration Configuration() => new(1,
        new(false, 45), new(true, -54, 4, 220), new(true, 1.5f),
        new(true, [new(true, "bell", 2_800, 2, 1)]),
        new(true, -18, 2, 18, 200, 1.5f), new(true, -1, 90));

    private static void PartialFramesPreserveDsp()
    {
        using var fullModel = new FrameCheckingSuppressor();
        using var partialModel = new FrameCheckingSuppressor();
        var fullGraph = new AudioGraph(fullModel);
        var partialGraph = new AudioGraph(partialModel);
        var full = Enumerable.Range(0, 4_800).Select(i => 0.3f * MathF.Sin(i * 0.13f)).ToArray();
        var partial = full.ToArray();
        var settings = Configuration();
        for (var i = 0; i < full.Length; i += 480) fullGraph.ProcessMicrophone(full.AsSpan(i, 480), settings);
        for (var i = 0; i < partial.Length; i += 120) partialGraph.ProcessMicrophone(partial.AsSpan(i, 120), settings);
        Require(full.SequenceEqual(partial), "Partial frames changed EQ, gate, compression or limiter output");
        Require(partialModel.Calls == 0 && !partialGraph.RequiresSuppressionFrame(settings), "Bypass still waited for a model frame");
        var chunk = partial.AsSpan(0, 120);
        for (var i = 0; i < 100; i++) partialGraph.ProcessMicrophone(chunk, settings);
        var allocated = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 100; i++) partialGraph.ProcessMicrophone(chunk, settings);
        Require(GC.GetAllocatedBytesForCurrentThread() == allocated, "Partial microphone DSP allocated");
        Console.WriteLine("Bypassed noise removal: 120-sample packets process at 2.5 ms instead of waiting for 480 samples / 10 ms.");
    }

    private static void SuppressionTransitionsKeepModelFrames()
    {
        using var model = new FrameCheckingSuppressor();
        var graph = new AudioGraph(model);
        var settings = Configuration();
        var enabled = settings with { Version = 2, NoiseSuppression = new(true, 45) };
        var disabled = settings with { Version = 3 };
        var frame = new float[480];
        Require(graph.RequiresSuppressionFrame(enabled), "Enabling model accepted a partial frame");
        graph.ProcessMicrophone(frame.AsSpan(0, 120), enabled);
        Require(model.Calls == 0, "Partial frame reached model");
        graph.ProcessMicrophone(frame, enabled);
        graph.ProcessMicrophone(frame, enabled);
        Require(graph.RequiresSuppressionFrame(disabled), "Fade-out abandoned model frame size");
        graph.ProcessMicrophone(frame, disabled);
        graph.ProcessMicrophone(frame, disabled);
        Require(!graph.RequiresSuppressionFrame(disabled), "Completed fade-out retained frame latency");
        graph.ProcessMicrophone(frame.AsSpan(0, 120), disabled);
        Require(model.Calls == 4, "Bypassed partial frame called model");
        graph.ProcessMicrophone(frame, enabled);
        graph.BypassNoiseSuppression();
        // The remaining fade is completed before returning to partial reads.
        graph.ProcessMicrophone(frame, enabled);
        Require(!graph.RequiresSuppressionFrame(enabled), "Failure bypass left fixed-frame latency active");
    }

    private static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    private sealed class FrameCheckingSuppressor : INoiseSuppressor
    {
        public int Calls;
        public bool IsAvailable => true;
        public string BackendName => "latency-test";
        public string ModelIdentifier => "latency-test";
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
            Require(input.Length == FrameLength, "Neural model received partial input");
            Calls++;
            input.CopyTo(output);
            localSnrDb = 0;
            return true;
        }
        public bool Reset() => true;
        public void Dispose() { }
    }
}
