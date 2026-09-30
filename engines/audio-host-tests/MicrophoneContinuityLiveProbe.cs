using NAudio.Wave;
using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;

// Diagnostic (--live-microphone-continuity [seconds]): runs the QuadCast 2 through
// the real MicrophonePipeline with RNNoise and renders the virtual-microphone
// source to the idle "Switchboard Mixer" cable on its real clock. Counts output
// callbacks containing a run of exact zeros, which a live microphone never
// produces. Nothing is recorded or played on a physical output.
internal static class MicrophoneContinuityLiveProbe
{
    public static void Run(int seconds)
    {
        using var endpoints = new EndpointService();
        var inventory = endpoints.List();
        var input = inventory.First(endpoint => endpoint.Flow == "capture" && endpoint.InterfaceName == "HyperX QuadCast 2");
        var sink = CableEndpointCatalog.FindInput(inventory) ?? throw new InvalidOperationException("The Switchboard Mixer cable is required.");
        var settings = new AudioHostSettings
        {
            Enabled = true,
            AutomaticApplicationRouting = false,
            MonitoringEnabled = false,
            Buses = [new AudioBusConfiguration { Id = "mic", DeviceId = input.Id }],
        };
        var configuration = new MicrophoneDspConfiguration(1, new(true, 85), new(false, -60, 2, 300), new(true, 0),
            new(false, []), new(false, -16, 1.5f, 25, 250, 0), new(true, -1, 90));
        using var suppressor = new RnnoiseNoiseSuppressor();
        if (!suppressor.Initialize(new(AppContext.BaseDirectory, Path.GetTempPath()))) throw new InvalidOperationException(suppressor.LastError);
        using var pipeline = new MicrophonePipeline(suppressor, settings, configuration);
        var counter = new GapCounter(pipeline.VirtualMicrophoneSource);
        using var device = endpoints.Open(sink.Id);
        using var output = new AudioOutput(device, counter);
        pipeline.Start();
        output.Start();
        Thread.Sleep(1_000);
        counter.Reset();
        Thread.Sleep(seconds * 1_000);
        Console.WriteLine($"{seconds} s live QuadCast -> RNNoise -> virtual mic ring -> {sink.Name} ({output.LatencyMilliseconds} ms period, low latency {output.LowLatencyActive}): "
            + $"{counter.Callbacks} callbacks, {counter.Gaps} with dropouts, {counter.ZeroSamples} zero samples.");
    }

    private sealed class GapCounter(ISampleProvider source) : ISampleProvider
    {
        private long callbacks, gaps, zeroSamples;
        public WaveFormat WaveFormat => source.WaveFormat;
        public long Callbacks => Interlocked.Read(ref callbacks);
        public long Gaps => Interlocked.Read(ref gaps);
        public long ZeroSamples => Interlocked.Read(ref zeroSamples);
        public void Reset() { Interlocked.Exchange(ref callbacks, 0); Interlocked.Exchange(ref gaps, 0); Interlocked.Exchange(ref zeroSamples, 0); }

        public int Read(Span<float> buffer)
        {
            var count = source.Read(buffer);
            int run = 0, zeros = 0;
            var gap = false;
            for (var i = 0; i < count; i++)
            {
                if (buffer[i] == 0f) { zeros++; if (++run >= 16) gap = true; }
                else run = 0;
            }
            Interlocked.Increment(ref callbacks);
            Interlocked.Add(ref zeroSamples, zeros);
            if (gap) Interlocked.Increment(ref gaps);
            return count;
        }
    }
}
