using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Numerics;
using Complex = System.Numerics.Complex;
using NAudio.Wave;

namespace Switchboard.AudioHost;

// One stage per personal-listening channel. Game, Chat and Media each render their own virtual
// speakers and room before the channels are mixed; head tracking is shared because there is one head.
internal sealed record SpatialStage
{
    public bool Enabled { get; init; }
    public string Mode { get; init; } = "surround";
    public float Immersion { get; init; } = 0.4f;
    public float Distance { get; init; } = 1.4f;
    public SpatialSpeaker[] Speakers { get; init; } = SpatialSpeaker.Defaults();
    public float WidthDegrees { get; init; } = 60;
    public float Amount { get; init; } = 1;
    public void Validate()
    {
        if (Mode is not ("stereo" or "surround")
            || !float.IsFinite(Immersion) || Immersion is < 0 or > 1 || !float.IsFinite(Distance) || Distance is < 0.5f or > 3f
            || Speakers is null || Speakers.Length != 7 || Speakers.Any(s => s is null) || !Speakers.Select(s => s.Id).Order().SequenceEqual(SpatialSpeaker.Ids.Order())
            || !float.IsFinite(WidthDegrees) || WidthDegrees is < 20 or > 180 || !float.IsFinite(Amount) || Amount is < 0 or > 1)
            throw new InvalidOperationException("Invalid spatial stage configuration.");
        foreach (var speaker in Speakers) speaker.Validate();
    }
}

internal sealed record SpatialChannels
{
    public static readonly string[] Ids = ["game", "chat", "media"];
    public SpatialStage Game { get; init; } = new();
    public SpatialStage Chat { get; init; } = new();
    public SpatialStage Media { get; init; } = new();
    public SpatialStage? For(string channel) => channel switch { "game" => Game, "chat" => Chat, "media" => Media, _ => null };
    public bool AnyEnabled => Game.Enabled || Chat.Enabled || Media.Enabled;
}

internal sealed record SpatialSettings
{
    public SpatialChannels Channels { get; init; } = new();
    public string TrackingSource { get; init; } = "headset";
    public bool TrackingEnabled { get; init; }
    public int TrackerPort { get; init; } = 4242;
    // Input for Switchboard's managed OpenTrack: webcam face tracking or a phone app over the network.
    public string OpenTrackInput { get; init; } = "webcam";
    public bool AnyEnabled => Channels.AnyEnabled;
    // Test and diagnostic convenience: the same stage on every channel.
    public static SpatialSettings Uniform(SpatialStage stage) => new() { Channels = new() { Game = stage, Chat = stage, Media = stage } };
    public SpatialSettings Validate()
    {
        if (Channels is null || Channels.Game is null || Channels.Chat is null || Channels.Media is null)
            throw new InvalidOperationException("Spatial channel settings are required.");
        Channels.Game.Validate(); Channels.Chat.Validate(); Channels.Media.Validate();
        if (TrackingSource is not ("headset" or "opentrack") || TrackerPort is < 1024 or > 65535 || TrackerPort == ManagedOpenTrack.PhonePort
            || OpenTrackInput is not ("webcam" or "phone"))
            throw new InvalidOperationException("Invalid head tracking settings.");
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
internal sealed record SpatialRuntime(SpatialSettings Settings, bool Active, string TrackingState, string? Error, string? TrackerName = null, string? TrackerAction = null);
internal sealed record HeadPose(Quaternion Rotation, long Timestamp, long ReferenceId = 0);
internal interface IHeadPoseSource : IDisposable
{
    HeadPose? Latest { get; }
    string? Error { get; }
    string? Name { get; }
    /// <summary>A user-approved step the tracker cannot take by itself, or null.</summary>
    string? RequiredAction => null;
    void Refresh() { }
}

// OpenTrack UDP output: six little-endian doubles, x/y/z in cm followed by
// yaw/pitch/roll in degrees. Translation is intentionally ignored for this stage.
internal sealed class HeadTracker : IHeadPoseSource
{
    private readonly Socket socket;
    private readonly Thread receiver;
    private readonly ManagedOpenTrack? openTrack;
    private HeadPose? latest;
    private string? error;
    private int disposed;
    // With input set, Switchboard also runs its managed OpenTrack copy when installed. Without it (tests),
    // or before installation, any OpenTrack the user runs can still send to this port.
    public HeadTracker(int port, string? input = null)
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
        if (input is not null) { openTrack = new ManagedOpenTrack(port, input); openTrack.Ensure(); }
    }
    public HeadPose? Latest => Volatile.Read(ref latest);
    public string? Error => Volatile.Read(ref error) ?? openTrack?.Error;
    public string Name => openTrack?.Running == true ? "OpenTrack (managed)" : "OpenTrack";
    public void Refresh() => openTrack?.Ensure();
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
        openTrack?.Dispose();
        socket.Dispose();
        receiver.Join();
    }
}

internal sealed class SpatialSession : IDisposable
{
    internal sealed record Configuration(SpatialSettings Settings, KemarFilters? Filters, IHeadPoseSource? Tracker, Quaternion Center, long CenterReference = 0);
    private Configuration configuration = new(new(), null, null, Quaternion.Identity);
    internal Configuration Current => Volatile.Read(ref configuration);
    public void Configure(SpatialSettings settings)
    {
        settings.Validate();
        var old = Current;
        var filters = settings.AnyEnabled ? KemarFilters.Instance : null; // Never load data on a realtime thread.
        var tracker = settings.AnyEnabled && settings.TrackingEnabled
            ? old.Tracker is not null && settings.TrackingSource == old.Settings.TrackingSource
                && (settings.TrackingSource == "headset" || settings.TrackerPort == old.Settings.TrackerPort
                    && settings.OpenTrackInput == old.Settings.OpenTrackInput && old.Tracker.Error is null)
                ? old.Tracker : settings.TrackingSource == "headset" ? (IHeadPoseSource)new HeadsetHeadTracker() : new HeadTracker(settings.TrackerPort, settings.OpenTrackInput)
            : null;
        Volatile.Write(ref configuration, new(settings, filters, tracker, ReferenceEquals(tracker, old.Tracker) ? old.Center : Quaternion.Identity, ReferenceEquals(tracker, old.Tracker) ? old.CenterReference : 0));
        if (!ReferenceEquals(tracker, old.Tracker)) old.Tracker?.Dispose();
    }
    public void Recenter()
    {
        var state = Current;
        var pose = state.Tracker?.Latest;
        if (!HeadTracker.Fresh(pose)) throw new InvalidOperationException("Connect a head tracker before centering the stage.");
        Volatile.Write(ref configuration, state with { Center = pose!.Rotation, CenterReference = pose.ReferenceId });
    }
    internal static Quaternion RelativeRotation(Configuration state, HeadPose? pose)
    {
        if (!HeadTracker.Fresh(pose)) return Quaternion.Identity;
        var center = pose!.ReferenceId == state.CenterReference ? state.Center : Quaternion.Identity;
        return Quaternion.Normalize(Quaternion.Inverse(center) * pose.Rotation);
    }
    public SpatialRuntime Snapshot()
    {
        var state = Current;
        var pose = state.Tracker?.Latest;
        return new(state.Settings, state.Settings.AnyEnabled, state.Tracker is null ? "off"
            : state.Tracker.Error is not null ? "error" : HeadTracker.Fresh(pose) ? "tracking" : pose is null ? "waiting" : "stale", state.Tracker?.Error, state.Tracker?.Name, state.Tracker?.RequiredAction);
    }
    public void Refresh() => Current.Tracker?.Refresh();
    // Aux and any non-personal channel pass through untouched.
    public ISampleProvider Wrap(ISampleProvider source, string channel) => SpatialChannels.Ids.Contains(channel) ? new SpatialSampleProvider(source, this, channel) : source;
    public void Dispose()
    {
        var old = Interlocked.Exchange(ref configuration, new(new(), null, null, Quaternion.Identity));
        old.Tracker?.Dispose();
    }
}

internal sealed class KemarFilters
{
    // Measured responses are stored as minimum-phase filters plus a separate arrival delay per ear.
    // Aligned minimum-phase responses interpolate without the comb artifacts of blending raw
    // impulse responses whose onsets differ, and the delays keep the measured interaural timing.
    public const int Taps = 128;
    private const int SourceTaps = 160, Fft = 2048, SampleRate = 48000;
    // Most music is centre-panned (vocals, kick, bass), so the frontal reference leans towards the
    // coherent sum. The flat low-frequency level gives unity for that same reference.
    private const double CoherentWeight = .75;
    private static readonly double LowFrequencyLevel = 1 / Math.Pow(2, CoherentWeight + (1 - CoherentWeight) / 2);
    private sealed record Direction(Vector3 Position, float[] Left, float[] Right, float DelayLeft, float DelayRight);
    private readonly Direction[] directions;
    private static readonly Lazy<KemarFilters> singleton = new(() => new());
    public static KemarFilters Instance => singleton.Value;
    private KemarFilters()
    {
        using var stream = typeof(KemarFilters).Assembly.GetManifestResourceStream("Switchboard.Kemar")
            ?? throw new InvalidOperationException("The headphone HRTF resource is missing.");
        using var reader = new BinaryReader(stream);
        var count = reader.ReadInt32();
        if (count != 368 || reader.ReadInt32() != SourceTaps) throw new InvalidDataException("Invalid HRTF data.");
        var raw = new List<(float Azimuth, float Elevation, float[] Left, float[] Right)>(710);
        for (var i = 0; i < count; i++)
        {
            var elevation = reader.ReadSingle();
            var azimuth = reader.ReadSingle();
            var left = new float[SourceTaps]; var right = new float[SourceTaps];
            for (var j = 0; j < SourceTaps; j++) left[j] = reader.ReadSingle();
            for (var j = 0; j < SourceTaps; j++) right[j] = reader.ReadSingle();
            raw.Add((azimuth, elevation, left, right));
            if (azimuth is > 0 and < 180) raw.Add((-azimuth, elevation, right, left));
        }
        var equalizer = FrontalEqualizer(raw);
        var onsets = raw.Select(row => (Left: Onset(row.Left), Right: Onset(row.Right))).ToArray();
        var earliest = onsets.Min(o => Math.Min(o.Left, o.Right));
        directions = raw.Select((row, i) => new Direction(Position(row.Azimuth, row.Elevation),
            MinimumPhase(row.Left, equalizer), MinimumPhase(row.Right, equalizer),
            onsets[i].Left - earliest, onsets[i].Right - earliest)).ToArray();
    }
    public static Vector3 Position(float azimuth, float elevation)
    {
        var az = azimuth * MathF.PI / 180; var el = elevation * MathF.PI / 180;
        return new(MathF.Sin(az) * MathF.Cos(el), MathF.Sin(el), MathF.Cos(az) * MathF.Cos(el));
    }
    public void Interpolate(Vector3 position, Span<float> left, Span<float> right, out float delayLeft, out float delayRight)
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
        left.Clear(); right.Clear(); delayLeft = 0; delayRight = 0;
        var sum = 1 / distances[0] + 1 / distances[1] + 1 / distances[2];
        for (var i = 0; i < 3; i++)
        {
            var weight = (1 / distances[i]) / sum;
            var row = directions[indices[i]];
            for (var j = 0; j < Taps; j++) { left[j] += row.Left[j] * weight; right[j] += row.Right[j] * weight; }
            delayLeft += row.DelayLeft * weight; delayRight += row.DelayRight * weight;
        }
    }

    // Arrival time: first sample within -20 dB of the response peak.
    private static float Onset(float[] response)
    {
        var peak = response.Max(MathF.Abs);
        for (var i = 0; i < response.Length; i++) if (MathF.Abs(response[i]) >= peak * .1f) return i;
        return 0;
    }

    // Correction so music through the front stereo pair keeps the timbre of the source. The
    // reference is a weighted geometric mean of the coherent (centre-panned) and power (hard-panned)
    // sums at one ear, third-octave smoothed. The generic KEMAR pinna notches
    // and the diffuse-field archive's peaks otherwise read as a scooped, boxy sound on music.
    private static double[] FrontalEqualizer(List<(float Azimuth, float Elevation, float[] Left, float[] Right)> raw)
    {
        float[] LeftEar(float azimuth) => raw.Where(r => r.Elevation == 0).MinBy(r => Math.Abs(r.Azimuth - azimuth)).Left;
        var near = Spectrum(LeftEar(-30)); var far = Spectrum(LeftEar(30));
        var reference = new double[Fft / 2 + 1];
        for (var k = 0; k <= Fft / 2; k++)
        {
            var coherent = (near[k] + far[k]).Magnitude;
            var power = Math.Sqrt(near[k].Magnitude * near[k].Magnitude + far[k].Magnitude * far[k].Magnitude);
            reference[k] = Math.Pow(Math.Max(coherent, 1e-6), CoherentWeight) * Math.Pow(Math.Max(power, 1e-6), 1 - CoherentWeight);
        }
        return Smooth(reference, 1 / 3.0).Select(value => Math.Clamp(1 / value, .25, 4)).ToArray(); // +/-12 dB limit.
    }

    private static float[] MinimumPhase(float[] response, double[] equalizer)
    {
        var spectrum = Spectrum(response);
        var magnitude = new double[Fft];
        for (var k = 0; k <= Fft / 2; k++)
        {
            var frequency = k * (double)SampleRate / Fft;
            // The 1994 measurement loudspeaker rolled off in the bass while the head is acoustically
            // transparent there: 150 Hz and below is flat, 150-300 Hz blends into the measurement.
            var blend = frequency <= 150 ? 0 : frequency >= 300 ? 1 : .5 - .5 * Math.Cos(Math.PI * (frequency - 150) / 150);
            var measured = Math.Max(spectrum[k].Magnitude * equalizer[k], 1e-5);
            var value = Math.Exp(Math.Log(LowFrequencyLevel) * (1 - blend) + Math.Log(measured) * blend);
            magnitude[k] = value; if (k > 0 && k < Fft / 2) magnitude[Fft - k] = value;
        }
        // Folding the real cepstrum yields the causal minimum-phase response with this magnitude.
        var data = new Complex[Fft];
        for (var k = 0; k < Fft; k++) data[k] = Math.Log(magnitude[k]);
        Transform(data, true);
        for (var n = 1; n < Fft / 2; n++) { data[n] *= 2; data[Fft - n] = 0; }
        Transform(data, false);
        for (var k = 0; k < Fft; k++) data[k] = Complex.Exp(data[k]);
        Transform(data, true);
        var output = new float[Taps];
        const int fade = 24;
        for (var n = 0; n < Taps; n++)
        {
            var window = n < Taps - fade ? 1 : .5 + .5 * Math.Cos(Math.PI * (n - (Taps - fade)) / fade);
            output[n] = (float)(data[n].Real * window);
        }
        return output;
    }

    private static Complex[] Spectrum(float[] response)
    {
        var data = new Complex[Fft];
        for (var i = 0; i < response.Length; i++) data[i] = response[i];
        Transform(data, false);
        return data;
    }

    private static double[] Smooth(double[] magnitude, double octaves)
    {
        var result = new double[magnitude.Length];
        var ratio = Math.Pow(2, octaves / 2);
        for (var k = 1; k < magnitude.Length; k++)
        {
            int low = Math.Max(1, (int)Math.Floor(k / ratio)), high = Math.Min(magnitude.Length - 1, (int)Math.Ceiling(k * ratio));
            double power = 0;
            for (var j = low; j <= high; j++) power += magnitude[j] * magnitude[j];
            result[k] = Math.Sqrt(power / (high - low + 1));
        }
        result[0] = result[1];
        return result;
    }

    // In-place iterative radix-2 FFT; the inverse is scaled by 1/N. Load-time only.
    private static void Transform(Complex[] data, bool inverse)
    {
        var n = data.Length;
        for (int i = 1, j = 0; i < n; i++)
        {
            var bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) (data[i], data[j]) = (data[j], data[i]);
        }
        for (var length = 2; length <= n; length <<= 1)
        {
            var angle = 2 * Math.PI / length * (inverse ? 1 : -1);
            var step = new Complex(Math.Cos(angle), Math.Sin(angle));
            for (var i = 0; i < n; i += length)
            {
                var w = Complex.One;
                for (var j = 0; j < length / 2; j++)
                {
                    var u = data[i + j]; var v = data[i + j + length / 2] * w;
                    data[i + j] = u + v; data[i + j + length / 2] = u - v; w *= step;
                }
            }
        }
        if (inverse) for (var i = 0; i < n; i++) data[i] /= n;
    }
}
