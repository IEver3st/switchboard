using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Numerics;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed record SpatialSettings
{
    public string Mode { get; init; } = "surround";
    public string TrackingSource { get; init; } = "headset";
    public float Immersion { get; init; } = 0.4f;
    public float Distance { get; init; } = 1.4f;
    public SpatialSpeaker[] Speakers { get; init; } = SpatialSpeaker.Defaults();
    public bool Enabled { get; init; }
    public float WidthDegrees { get; init; } = 60;
    public float Amount { get; init; } = 1;
    public bool TrackingEnabled { get; init; }
    public int TrackerPort { get; init; } = 4242;
    public SpatialSettings Validate()
    {
        if (Mode is not ("stereo" or "surround") || TrackingSource is not ("headset" or "opentrack")
            || !float.IsFinite(Immersion) || Immersion is < 0 or > 1 || !float.IsFinite(Distance) || Distance is < 0.5f or > 3f
            || Speakers is null || Speakers.Length != 7 || Speakers.Any(s => s is null) || !Speakers.Select(s => s.Id).Order().SequenceEqual(SpatialSpeaker.Ids.Order()))
            throw new InvalidOperationException("Invalid spatial stage configuration.");
        foreach (var speaker in Speakers) speaker.Validate();
        if (!float.IsFinite(WidthDegrees) || WidthDegrees is < 20 or > 180
            || !float.IsFinite(Amount) || Amount is < 0 or > 1 || TrackerPort is < 1024 or > 65535)
            throw new InvalidOperationException("Invalid headphone spatial settings.");
        return this;
    }
}

internal sealed record SpatialSpeaker(string Id, float Azimuth, float Elevation = 0, float Distance = 1, float GainDb = 0, bool Enabled = true)
{
    public static readonly string[] Ids = ["front-left", "front-right", "center", "side-left", "side-right", "rear-left", "rear-right"];
    public static SpatialSpeaker[] Defaults() => [new(Ids[0], -30), new(Ids[1], 30), new(Ids[2], 0), new(Ids[3], -90), new(Ids[4], 90), new(Ids[5], -150), new(Ids[6], 150)];
    public void Validate()
    {
        if (!float.IsFinite(Azimuth) || Azimuth is < -180 or > 180 || !float.IsFinite(Elevation) || Elevation is < -40 or > 90
            || !float.IsFinite(Distance) || Distance is < 0.5f or > 2 || !float.IsFinite(GainDb) || GainDb is < -24 or > 6)
            throw new InvalidOperationException("Invalid spatial speaker position or level.");
    }
}
internal sealed record SpatialRuntime(SpatialSettings Settings, bool Active, string TrackingState, string? Error, string? TrackerName = null);
internal sealed record HeadPose(Quaternion Rotation, long Timestamp);
internal interface IHeadPoseSource : IDisposable
{
    HeadPose? Latest { get; }
    string? Error { get; }
    string? Name { get; }
    void Refresh() { }
}

// OpenTrack UDP output: six little-endian doubles, x/y/z in cm followed by
// yaw/pitch/roll in degrees. Translation is intentionally ignored for this stage.
internal sealed class HeadTracker : IHeadPoseSource
{
    private readonly Socket socket;
    private readonly Thread receiver;
    private HeadPose? latest;
    private string? error;
    private int disposed;
    public HeadTracker(int port)
    {
        socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        try
        {
            socket.ExclusiveAddressUse = true;
            socket.Bind(new IPEndPoint(IPAddress.Loopback, port));
            receiver = new Thread(Receive) { IsBackground = true, Name = "Switchboard head pose" };
            receiver.Start();
        }
        catch { socket.Dispose(); throw; }
    }
    public HeadPose? Latest => Volatile.Read(ref latest);
    public string? Error => Volatile.Read(ref error);
    public string Name => "OpenTrack";
    public static bool Fresh(HeadPose? pose) => pose is not null && Stopwatch.GetElapsedTime(pose.Timestamp).TotalMilliseconds < 500;
    internal static HeadPose? Parse(ReadOnlySpan<byte> packet)
    {
        if (packet.Length != 48) return null;
        Span<double> values = stackalloc double[6];
        for (var i = 0; i < 6; i++)
        {
            values[i] = BinaryPrimitives.ReadDoubleLittleEndian(packet.Slice(i * 8, 8));
            if (!double.IsFinite(values[i]) || Math.Abs(values[i]) > (i < 3 ? 10000 : 360)) return null;
        }
        const float rad = MathF.PI / 180;
        // +Z forward, +X right, +Y up. Positive yaw turns right; positive pitch looks up.
        var rotation = Quaternion.CreateFromYawPitchRoll((float)values[3] * rad, -(float)values[4] * rad, -(float)values[5] * rad);
        return new HeadPose(rotation, Stopwatch.GetTimestamp());
    }
    private void Receive()
    {
        var buffer = new byte[49]; // Reject oversized datagrams, never accept a truncated valid prefix.
        EndPoint sender = new IPEndPoint(IPAddress.Any, 0);
        while (Volatile.Read(ref disposed) == 0)
        {
            try
            {
                var count = socket.ReceiveFrom(buffer, ref sender);
                if (sender is IPEndPoint { Address: var address } && IPAddress.IsLoopback(address)
                    && Parse(buffer.AsSpan(0, count)) is { } pose) Volatile.Write(ref latest, pose);
            }
            catch (SocketException ex) when (ex.SocketErrorCode == SocketError.MessageSize) { }
            catch (Exception ex) when (ex is SocketException or ObjectDisposedException)
            {
                if (Volatile.Read(ref disposed) == 0) Volatile.Write(ref error, "Head tracker disconnected. Toggle tracking to reconnect.");
                return;
            }
        }
    }
    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        socket.Dispose();
        receiver.Join();
    }
}

internal sealed class SpatialSession : IDisposable
{
    internal sealed record Configuration(SpatialSettings Settings, KemarFilters? Filters, IHeadPoseSource? Tracker, Quaternion Center);
    private Configuration configuration = new(new(), null, null, Quaternion.Identity);
    internal Configuration Current => Volatile.Read(ref configuration);
    public void Configure(SpatialSettings settings)
    {
        settings.Validate();
        var old = Current;
        var filters = settings.Enabled ? KemarFilters.Instance : null; // Never load data on a realtime thread.
        var tracker = settings.Enabled && settings.TrackingEnabled
            ? old.Tracker is not null && settings.TrackingSource == old.Settings.TrackingSource
                && (settings.TrackingSource == "headset" || settings.TrackerPort == old.Settings.TrackerPort && old.Tracker.Error is null)
                ? old.Tracker : settings.TrackingSource == "headset" ? (IHeadPoseSource)new HeadsetHeadTracker() : new HeadTracker(settings.TrackerPort)
            : null;
        Volatile.Write(ref configuration, new(settings, filters, tracker, ReferenceEquals(tracker, old.Tracker) ? old.Center : Quaternion.Identity));
        if (!ReferenceEquals(tracker, old.Tracker)) old.Tracker?.Dispose();
    }
    public void Recenter()
    {
        var state = Current;
        var pose = state.Tracker?.Latest;
        if (!HeadTracker.Fresh(pose)) throw new InvalidOperationException("Connect a head tracker before centering the stage.");
        Volatile.Write(ref configuration, state with { Center = pose!.Rotation });
    }
    public SpatialRuntime Snapshot()
    {
        var state = Current;
        var pose = state.Tracker?.Latest;
        return new(state.Settings, state.Settings.Enabled, state.Tracker is null ? "off"
            : state.Tracker.Error is not null ? "error" : HeadTracker.Fresh(pose) ? "tracking" : pose is null ? "waiting" : "stale", state.Tracker?.Error, state.Tracker?.Name);
    }
    public void Refresh() => Current.Tracker?.Refresh();
    public ISampleProvider Wrap(ISampleProvider source) => new SpatialSampleProvider(source, this);
    public void Dispose()
    {
        var old = Interlocked.Exchange(ref configuration, new(new(), null, null, Quaternion.Identity));
        old.Tracker?.Dispose();
    }
}

internal sealed class KemarFilters
{
    public const int Taps = 160;
    private sealed record Direction(Vector3 Position, float[] Left, float[] Right);
    private readonly Direction[] directions;
    private static readonly Lazy<KemarFilters> singleton = new(() => new());
    public static KemarFilters Instance => singleton.Value;
    private KemarFilters()
    {
        using var stream = typeof(KemarFilters).Assembly.GetManifestResourceStream("Switchboard.Kemar")
            ?? throw new InvalidOperationException("The headphone HRTF resource is missing.");
        using var reader = new BinaryReader(stream);
        var count = reader.ReadInt32();
        if (count != 368 || reader.ReadInt32() != Taps) throw new InvalidDataException("Invalid HRTF data.");
        var rows = new List<Direction>(710);
        for (var i = 0; i < count; i++)
        {
            var elevation = reader.ReadSingle();
            var azimuth = reader.ReadSingle();
            var left = new float[Taps]; var right = new float[Taps];
            for (var j = 0; j < Taps; j++) left[j] = reader.ReadSingle();
            for (var j = 0; j < Taps; j++) right[j] = reader.ReadSingle();
            rows.Add(new(Position(azimuth, elevation), left, right));
            if (azimuth is > 0 and < 180) rows.Add(new(Position(-azimuth, elevation), right, left));
        }
        directions = rows.ToArray();
    }
    public static Vector3 Position(float azimuth, float elevation)
    {
        var az = azimuth * MathF.PI / 180; var el = elevation * MathF.PI / 180;
        return new(MathF.Sin(az) * MathF.Cos(el), MathF.Sin(el), MathF.Cos(az) * MathF.Cos(el));
    }
    public void Interpolate(Vector3 position, Span<float> left, Span<float> right)
    {
        // Three nearest spherical measurements, inverse angular-distance weighting.
        // No allocations, locks, I/O or reference publication in the audio callback.
        Span<int> indices = stackalloc int[3];
        Span<float> distances = stackalloc float[3] { float.MaxValue, float.MaxValue, float.MaxValue };
        for (var i = 0; i < directions.Length; i++)
        {
            var distance = Math.Max(0.000001f, 1 - Vector3.Dot(position, directions[i].Position));
            for (var slot = 0; slot < 3; slot++)
            {
                if (distance >= distances[slot]) continue;
                for (var j = 2; j > slot; j--) { distances[j] = distances[j - 1]; indices[j] = indices[j - 1]; }
                distances[slot] = distance; indices[slot] = i; break;
            }
        }
        left.Clear(); right.Clear();
        var sum = 1 / distances[0] + 1 / distances[1] + 1 / distances[2];
        for (var i = 0; i < 3; i++)
        {
            var weight = (1 / distances[i]) / sum;
            var row = directions[indices[i]];
            for (var j = 0; j < Taps; j++) { left[j] += row.Left[j] * weight; right[j] += row.Right[j] * weight; }
        }
    }
}
