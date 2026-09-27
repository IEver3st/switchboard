using NAudio.CoreAudioApi;
using NAudio.Wave;
using Switchboard.AudioHost;
using Switchboard.AudioHost.Realtime;

internal static class MicrophoneCableTests
{
    // Run the test apphost under the Audio.Host.exe name in an isolated directory
    // so a separately running automatic mixer excludes this synthetic source.
    public static async Task RunLiveAsync()
    {
        if (!string.Equals(Path.GetFileName(Environment.ProcessPath), "Audio.Host.exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Run the isolated test apphost named Audio.Host.exe to avoid automatic app routing.");
        using var endpoints = new EndpointService();
        var before = endpoints.List().Where(e => e.IsDefault).Select(e => e.Id).Order().ToArray();
        var receiver = MicrophoneCableCatalog.Find(endpoints.List(), "capture")
            ?? throw new InvalidOperationException("Hi-Fi Cable is not installed.");
        using var device = endpoints.Open(receiver.Id);
        using var sendDevice = endpoints.Open(MicrophoneCableCatalog.Find(endpoints.List(), "render")!.Id);
        using var recording = new WasapiRecorderBuilder().WithDevice(device).WithSharedMode()
            .WithEventSync().WithBufferLength(20).Build();
        var converter = new CaptureSampleConverter(recording.WaveFormat);
        var ring = new BoundedFrameAdapter(48000);
        var samples = new float[48000];
        double rms = 0;
        long frames = 0;
        recording.DataAvailable += (ReadOnlySpan<byte> data, AudioClientBufferFlags flags, long _, long __) =>
        {
            converter.ConvertAndWrite(data, ring, out var dropped, (flags & AudioClientBufferFlags.Silent) != 0);
            var count = ring.Read(samples);
            double sum = 0;
            for (var i = 0; i < count; i++) sum += samples[i] * samples[i];
            Volatile.Write(ref rms, count > 0 ? Math.Sqrt(sum / count) : 0);
            Interlocked.Add(ref frames, count);
        };
        recording.StartRecording();
        async Task<double> Measure()
        {
            var start = Interlocked.Read(ref frames);
            await Task.Delay(500);
            if (Interlocked.Read(ref frames) - start < 4800) throw new Exception("No live microphone transport PCM.");
            return Volatile.Read(ref rms);
        }
        var results = new List<object>();
        for (var cycle = 0; cycle < 3; cycle++)
        {
            var tone = new Tone();
            using var output = new MicrophoneCableOutput(endpoints, tone, enabled: true);
            if (!output.Running) throw new Exception(output.Snapshot().Error);
            var full = await Measure();
            var sendPeak = sendDevice.AudioMeterInformation.MasterPeakValue;
            tone.Gain = 0.25f;
            var reduced = await Measure();
            output.SetEnabled(false);
            var muted = await Measure();
            output.SetEnabled(true);
            var resumed = await Measure();
            if (full < 0.05 || Math.Abs(reduced / full - 0.25) > 0.04 || muted > 0.0001 || Math.Abs(resumed / full - 0.25) > 0.04)
                throw new Exception($"Transport gain/mute failed: {full}, {reduced}, {muted}, {resumed}; source samples {tone.SamplesRead}; render peak {sendPeak}; output {output.Snapshot()}");
            output.Dispose();
            output.Dispose();
            var stopped = await Measure();
            if (stopped > 0.0001) throw new Exception("Disposed microphone output retained signal.");
            results.Add(new { cycle, full, reduced, muted, resumed, stopped });
        }
        var after = endpoints.List().Where(e => e.IsDefault).Select(e => e.Id).Order().ToArray();
        if (!before.SequenceEqual(after)) throw new Exception("Transport changed Windows defaults.");
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { microphoneCable = "passed", defaultsUnchanged = true, results }));
    }

    private sealed class Tone : ISampleProvider
    {
        private long position;
        private float gain = 1;
        public long SamplesRead => Interlocked.Read(ref position);
        public float Gain { set => Volatile.Write(ref gain, value); }
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
        public int Read(Span<float> buffer)
        {
            var amplitude = 0.1f * Volatile.Read(ref gain);
            for (var i = 0; i < buffer.Length; i += 2)
                buffer[i] = buffer[i + 1] = amplitude * (float)Math.Sin(2 * Math.PI * 997 * position++ / 48000);
            return buffer.Length;
        }
    }
}
