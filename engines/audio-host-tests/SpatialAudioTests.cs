using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Numerics;
using NAudio.Wave;
using Switchboard.AudioHost;

internal static class SpatialAudioTests
{
    public static void Run()
    {
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
        var filters = KemarFilters.Instance;
        var l = new float[KemarFilters.Taps]; var r = new float[KemarFilters.Taps];
        var ml = new float[KemarFilters.Taps]; var mr = new float[KemarFilters.Taps];
        filters.Interpolate(KemarFilters.Position(60, 0), l, r);
        filters.Interpolate(KemarFilters.Position(-60, 0), ml, mr);
        Check(l.Zip(mr).Max(pair => Math.Abs(pair.First - pair.Second)) < 0.00001f, "HRTF mirror symmetry was lost.");
        Check(r.Sum(v => v * v) > l.Sum(v => v * v), "A right-hand source must be louder at the right ear.");
        Check(Array.IndexOf(r, r.Max()) < Array.IndexOf(l, l.Max()), "Measured interaural delay must be retained.");
        filters.Interpolate(KemarFilters.Position(60, 40), ml, mr);
        Check(!r.SequenceEqual(mr), "Elevation must change the measured response.");

        static float[] Render(SpatialSettings settings)
        {
            using var stage = new SpatialSession(); stage.Configure(settings);
            var output = stage.Wrap(new ToneSource(true)); var data = new float[960];
            for (var i = 0; i < 80; i++) output.Read(data);
            return data;
        }
        var room = new SpatialSettings { Enabled = true };
        var baseline = Render(room);
        Check(baseline.SequenceEqual(Render(room with { Speakers = room.Speakers.Reverse().ToArray() })), "Speaker JSON order must not change channel assignment.");
        foreach (var speaker in room.Speakers)
        {
            var isolated = room with { Speakers = room.Speakers.Select(s => s with { Enabled = s.Id == speaker.Id }).ToArray() };
            var original = Render(isolated);
            Check(original.Any(v => Math.Abs(v) > .00001), $"{speaker.Id} never reaches the renderer.");
            foreach (var changed in new[] { speaker with { Azimuth = speaker.Azimuth + 10 }, speaker with { Elevation = 45 }, speaker with { Distance = 2 }, speaker with { GainDb = -12 } })
            {
                var edited = Render(isolated with { Speakers = isolated.Speakers.Select(s => s.Id == speaker.Id ? changed : s).ToArray() });
                Check(original.Zip(edited).Any(p => Math.Abs(p.First - p.Second) > .00001), $"{speaker.Id} tuning did not alter rendered audio.");
                Check(edited.All(float.IsFinite), "Speaker tuning produced non-finite output.");
            }
        }
        Check(Render(room with { Speakers = room.Speakers.Select(s => s with { Enabled = false }).ToArray() }).All(v => Math.Abs(v) < .000001), "Muted speakers must be silent after the wet fade.");
        Check(!baseline.SequenceEqual(Render(room with { Immersion = 1, Distance = 2.2f })), "Room tuning must affect DSP.");
        Check(!Render(room with { Mode = "stereo", WidthDegrees = 30 }).SequenceEqual(Render(room with { Mode = "stereo", WidthDegrees = 150 })), "Stereo stage width must affect DSP.");
        try { (room with { Speakers = Enumerable.Repeat(room.Speakers[0], 7).ToArray() }).Validate(); throw new Exception("Duplicate speakers accepted."); } catch (InvalidOperationException) { }

        var sensorField = new Hid.ValueCap { BitSize = 16, ReportCount = 3, LogicalMin = -32767, LogicalMax = 32767, PhysicalMin = -314159265, PhysicalMax = 314159265, UnitsExponent = 8 };
        var packed = new byte[6]; BinaryPrimitives.WriteInt16LittleEndian(packed.AsSpan(2), 32767); BinaryPrimitives.WriteInt16LittleEndian(packed.AsSpan(4), -32767);
        Check(Math.Abs(HidHeadTrackingConnection.Decode(packed, sensorField, 0)) < 1e-6, "Zero rotation decode failed.");
        Check(Math.Abs(HidHeadTrackingConnection.Decode(packed, sensorField, 1) - MathF.PI) < 1e-6, "Positive rotation scaling failed.");
        Check(Math.Abs(HidHeadTrackingConnection.Decode(packed, sensorField, 2) + MathF.PI) < 1e-6, "Signed rotation scaling failed.");
        BinaryPrimitives.WriteInt16LittleEndian(packed, -32768);
        Check(float.IsNaN(HidHeadTrackingConnection.Decode(packed, sensorField, 0)), "Out-of-descriptor sensor value accepted.");
        Check(HidHeadTrackingConnection.SupportsAcl("#AndroidHeadTracker#1.0#") && HidHeadTrackingConnection.SupportsAcl("#AndroidHeadTracker#2.1#3#"), "Compatible head tracker protocol rejected.");
        Check(!HidHeadTrackingConnection.SupportsAcl("#AndroidHeadTracker#2.1#2#") && !HidHeadTrackingConnection.SupportsAcl("#AndroidHeadTracker#3.0#1#"), "Unsupported transport or protocol accepted.");
        Check(Vector3.Transform(Vector3.UnitZ, HidHeadTrackingConnection.AndroidRotation(new Vector3(0, 0, MathF.PI / 2))).X > .99, "Android reference-to-head rotation basis is incorrect.");
        var calibration = new SpatialSession.Configuration(room, null, null, Quaternion.CreateFromAxisAngle(Vector3.UnitY, 1), 10);
        Check(Math.Abs(SpatialSession.RelativeRotation(calibration, new(calibration.Center, Stopwatch.GetTimestamp(), 10)).W) > .999, "Calibration must apply within its sensor reference.");
        Check(Math.Abs(SpatialSession.RelativeRotation(calibration, new(Quaternion.Identity, Stopwatch.GetTimestamp(), 11)).W) > .999, "A sensor reset or reconnect must invalidate old calibration.");

        using var session = new SpatialSession();
        var source = new ToneSource();
        var renderer = session.Wrap(source);
        var buffer = new float[960];
        renderer.Read(buffer);
        Check(buffer.Where((_, i) => i % 2 == 1).All(v => v == 0), "Disabled spatial must preserve hard-left input.");
        session.Configure(new() { Enabled = true });
        for (var i = 0; i < 100; i++) renderer.Read(buffer);
        Check(buffer.Where((_, i) => i % 2 == 1).Any(v => Math.Abs(v) > 0.001), "Spatial convolution must reach the opposite ear.");
        Check(buffer.All(float.IsFinite), "HRTF output must remain finite.");
        var before = GC.GetAllocatedBytesForCurrentThread();
        var start = Stopwatch.GetTimestamp();
        for (var i = 0; i < 1000; i++) renderer.Read(buffer);
        var elapsed = Stopwatch.GetElapsedTime(start).TotalMilliseconds;
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Check(allocated == 0, $"Spatial callback allocated {allocated} bytes.");
        Console.WriteLine($"Spatial: {elapsed / 1000:F3} ms / 10 ms stereo frame; {allocated} callback bytes (synthetic).");
        session.Configure(new() { Enabled = false });
        for (var i = 0; i < 6; i++) renderer.Read(buffer);
        Check(buffer.Where((_, i) => i % 2 == 1).All(v => v == 0), "Bypass must finish its fade and remove old filter tails.");

        var packet = new byte[48];
        BinaryPrimitives.WriteDoubleLittleEndian(packet.AsSpan(24), 90);
        var pose = HeadTracker.Parse(packet)!;
        Check(Vector3.Transform(Vector3.UnitZ, pose.Rotation).X > .99f, "Positive OpenTrack yaw must rotate right.");
        Check(HeadTracker.Parse(new byte[47]) is null && HeadTracker.Parse(new byte[49]) is null, "Malformed packet sizes must be rejected.");
        BinaryPrimitives.WriteDoubleLittleEndian(packet.AsSpan(24), double.NaN);
        Check(HeadTracker.Parse(packet) is null, "Non-finite poses must be rejected.");
        BinaryPrimitives.WriteDoubleLittleEndian(packet.AsSpan(24), 60);
        using var probe = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        probe.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)probe.LocalEndPoint!).Port;
        probe.Dispose();
        var tracking = new SpatialSettings { Enabled = true, Mode = "stereo", TrackingSource = "opentrack", TrackingEnabled = true, TrackerPort = port };
        using var sender = new UdpClient();
        var endpoint = new IPEndPoint(IPAddress.Loopback, port);
        for (var cycle = 0; cycle < 4; cycle++)
        {
            session.Configure(tracking);
            Check(session.Snapshot().TrackingState == "waiting", "A newly opened tracker must wait for real packets.");
            sender.Send(packet, packet.Length, endpoint);
            Check(SpinWait.SpinUntil(() => session.Snapshot().TrackingState == "tracking", 1000), "Loopback tracker packet did not arrive.");
            var referencePose = session.Current.Tracker!.Latest;
            session.Recenter();
            Check(Math.Abs(Quaternion.Dot(session.Current.Center, referencePose!.Rotation)) > .999f, "Recenter must use the latest orientation.");
            renderer.Read(buffer);
            session.Configure(tracking with { TrackingEnabled = false });
            using var released = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            released.ExclusiveAddressUse = true;
            released.Bind(endpoint);
        }
        session.Configure(tracking);
        BinaryPrimitives.WriteDoubleLittleEndian(packet.AsSpan(24), -90);
        sender.Send(packet, packet.Length, endpoint);
        Check(SpinWait.SpinUntil(() => session.Snapshot().TrackingState == "tracking", 1000), "Reconnect failed.");
        for (var i = 0; i < 50; i++) renderer.Read(buffer);
        static double Energy(float[] samples, int ear) => samples.Where((_, i) => i % 2 == ear).Sum(v => (double)v * v);
        Check(Energy(buffer, 1) > Energy(buffer, 0), "Turning left must move the world-fixed left speaker to the right ear.");
        session.Recenter();
        for (var i = 0; i < 50; i++) renderer.Read(buffer);
        Check(Energy(buffer, 0) > Energy(buffer, 1), "Recenter must restore the original speaker perspective in real DSP.");
        Check(SpinWait.SpinUntil(() => session.Snapshot().TrackingState == "stale", 1200), "Missing packets must become stale.");
        sender.Send(packet, packet.Length, endpoint);
        Check(SpinWait.SpinUntil(() => session.Snapshot().TrackingState == "tracking", 1000), "Fresh packets must recover tracking.");
        using var occupied = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        occupied.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        var occupiedPort = ((IPEndPoint)occupied.LocalEndPoint!).Port;
        try { session.Configure(tracking with { TrackerPort = occupiedPort }); throw new Exception("Occupied tracker port was accepted."); }
        catch (SocketException) { }
        Check(session.Current.Settings.TrackerPort == port, "Rejected port change must retain confirmed native settings.");
        session.Dispose(); session.Dispose();
        Check(!session.Snapshot().Active && session.Current.Tracker is null, "Disposal must release tracking and DSP.");
        using var finalSocket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        finalSocket.Bind(endpoint);
        Console.WriteLine("Spatial HRTF, bypass, UDP validation, recenter, stale/reconnect and repeated lifecycle passed.");
    }
    private sealed class ToneSource(bool stereo = false) : ISampleProvider
    {
        private int frame;
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
        public int Read(Span<float> buffer)
        {
            for (var i = 0; i < buffer.Length; i += 2) { buffer[i] = .1f * MathF.Sin(2 * MathF.PI * 1000 * frame / 48000); buffer[i + 1] = stereo ? .08f * MathF.Sin(2 * MathF.PI * 733 * frame / 48000) : 0; frame++; }
            return buffer.Length;
        }
    }
}
