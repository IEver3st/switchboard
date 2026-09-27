using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using NAudio.Wave;
using Switchboard.AudioHost;

// Measures callback cost while the head is moving continuously (live OpenTrack-style UDP poses).
internal static class SpatialMotion
{
    public static void Run()
    {
        using var probe = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        probe.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)probe.LocalEndPoint!).Port; probe.Dispose();
        foreach (var (name, settings) in new[] {
            ("stereo", SpatialSettings.Uniform(new() { Enabled = true, Mode = "stereo" }) with { TrackingEnabled = true, TrackingSource = "opentrack", TrackerPort = port }),
            ("7 natural", SpatialSettings.Uniform(new() { Enabled = true }) with { TrackingEnabled = true, TrackingSource = "opentrack", TrackerPort = port }),
            ("7 cinema", SpatialSettings.Uniform(new() { Enabled = true, Immersion = .9f, Distance = 2.2f }) with { TrackingEnabled = true, TrackingSource = "opentrack", TrackerPort = port }) })
        {
            using var session = new SpatialSession(); session.Configure(settings);
            var output = session.Wrap(new Tone(), "game");
            using var sender = new UdpClient(); var endpoint = new IPEndPoint(IPAddress.Loopback, port);
            var packet = new byte[48]; var buffer = new float[960];
            double worst = 0, total = 0; var frames = 0; float peak = 0, jump = 0, previous = 0; var clicks = 0;
            for (var i = 0; i < 300; i++)
            {
                BinaryPrimitives.WriteDoubleLittleEndian(packet.AsSpan(24), 40 * Math.Sin(i * 0.15)); // ~2.4 Hz head sway, +/-40 deg
                sender.Send(packet, packet.Length, endpoint); Thread.Sleep(1);
                var start = Stopwatch.GetTimestamp();
                output.Read(buffer);
                var ms = Stopwatch.GetElapsedTime(start).TotalMilliseconds;
                if (i > 20)
                {
                    worst = Math.Max(worst, ms); total += ms; frames++; peak = Math.Max(peak, buffer.Max(MathF.Abs));
                    // A 500 Hz tone at this level changes by at most ~0.03 per sample (plus HRTF gain); larger steps are clicks.
                    for (var k = 0; k < buffer.Length; k += 2) { var d = MathF.Abs(buffer[k] - previous); jump = MathF.Max(jump, d); if (d > .08f) clicks++; previous = buffer[k]; }
                }
                else previous = buffer[^2];
            }
            Console.WriteLine($"{name,-10} moving: mean {total / frames:F3} ms, worst {worst:F3} ms per 10 ms frame, peak {peak:F2}, largest step {jump:F3}, clicks {clicks}");
        }
    }
    private sealed class Tone : ISampleProvider
    {
        private int frame;
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
        public int Read(Span<float> buffer)
        {
            for (var i = 0; i < buffer.Length; i += 2) { buffer[i] = .3f * MathF.Sin(2 * MathF.PI * 500 * frame / 48000); buffer[i + 1] = .3f * MathF.Sin(2 * MathF.PI * 500 * frame / 48000 + 1); frame++; }
            return buffer.Length;
        }
    }
}
