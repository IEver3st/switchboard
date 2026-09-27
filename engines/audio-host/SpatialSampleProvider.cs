using System.Numerics;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class SpatialSampleProvider : ISampleProvider
{
    private const int Taps = KemarFilters.Taps, Block = 128, DelayLength = 4096;
    private readonly ISampleProvider source;
    private readonly SpatialSession session;
    private readonly float[][] history = Enumerable.Range(0, 7).Select(_ => new float[Taps * 2]).ToArray();
    private readonly float[][] filters = Enumerable.Range(0, 14).Select(_ => new float[Taps]).ToArray();
    private readonly float[][] target = Enumerable.Range(0, 14).Select(_ => new float[Taps]).ToArray();
    private readonly float[] leftDelay = new float[DelayLength], rightDelay = new float[DelayLength];
    private readonly float[] delays = new float[7], gains = new float[7], nextGains = new float[7];
    private readonly int[] speakerIndices = new int[7];
    private SpatialSettings? prepared;
    private Quaternion orientation = Quaternion.Identity;
    private int cursor, delayCursor, blockFrame;
    private float wet;
    private bool active;
    public SpatialSampleProvider(ISampleProvider source, SpatialSession session)
    {
        if (source.WaveFormat.SampleRate != 48000 || source.WaveFormat.Channels != 2) throw new ArgumentException("Spatial audio requires 48 kHz stereo.");
        this.source = source; this.session = session;
    }
    public WaveFormat WaveFormat => source.WaveFormat;
    public int Read(Span<float> buffer)
    {
        var read = source.Read(buffer);
        var state = session.Current;
        if (!state.Settings.Enabled && wet <= 0)
        {
            if (active)
            {
                foreach (var channel in history) channel.AsSpan().Clear();
                leftDelay.AsSpan().Clear(); rightDelay.AsSpan().Clear();
                active = false; blockFrame = 0; orientation = Quaternion.Identity;
            }
            return read;
        }
        var settings = state.Settings;
        if (!ReferenceEquals(prepared, settings))
        {
            for (var index = 0; index < 7; index++)
            {
                // Settings are validated once on the control plane; order in JSON is not significant.
                for (var j = 0; j < 7; j++) if (settings.Speakers[j].Id == SpatialSpeaker.Ids[index]) speakerIndices[index] = j;
            }
            prepared = settings;
        }
        for (var i = 0; i + 1 < read; i += 2)
        {
            if (blockFrame == 0)
            {
                for (var f = 0; f < 14; f++) target[f].CopyTo(filters[f], 0);
                if (state.Filters is { } dataset)
                {
                    var pose = state.Tracker?.Latest;
                    var rotation = SpatialSession.RelativeRotation(state, pose);
                    orientation = Quaternion.Slerp(orientation, rotation, .125f);
                    var inverse = Quaternion.Inverse(orientation);
                    for (var s = 0; s < 7; s++)
                    {
                        var speaker = settings.Speakers[speakerIndices[s]];
                        gains[s] = nextGains[s];
                        var strength = settings.Mode == "stereo" ? (s < 2 ? 1 : 0)
                            : s < 2 ? 1 : s == 2 ? .25f : s < 5 ? .15f + settings.Immersion * .45f : .1f + settings.Immersion * .4f;
                        var distance = speaker.Distance * settings.Distance;
                        nextGains[s] = speaker.Enabled ? strength * MathF.Pow(10, speaker.GainDb / 20) / MathF.Sqrt(distance) : 0;
                        var azimuth = settings.Mode == "stereo" && s < 2 ? (s == 0 ? -1 : 1) * settings.WidthDegrees / 2 : speaker.Azimuth;
                        if (strength > 0)
                            dataset.Interpolate(Vector3.Transform(KemarFilters.Position(azimuth, speaker.Elevation), inverse), target[s * 2], target[s * 2 + 1]);
                        else { target[s * 2].AsSpan().Clear(); target[s * 2 + 1].AsSpan().Clear(); }
                        if (!active) { target[s * 2].CopyTo(filters[s * 2], 0); target[s * 2 + 1].CopyTo(filters[s * 2 + 1], 0); gains[s] = nextGains[s]; delays[s] = Delay(s, settings); }
                    }
                    active = true;
                }
            }
            var dryLeft = buffer[i]; var dryRight = buffer[i + 1];
            leftDelay[delayCursor] = dryLeft; rightDelay[delayCursor] = dryRight;
            cursor = cursor == 0 ? Taps - 1 : cursor - 1;
            var blend = (blockFrame + 1f) / Block;
            float left = 0, right = 0;
            for (var s = 0; s < 7; s++)
            {
                // Slew fractional propagation/early-reflection delay to avoid a discontinuous sample jump.
                delays[s] += Math.Clamp(Delay(s, settings) - delays[s], -.025f, .025f);
                var l = Delayed(leftDelay, delays[s]); var r = Delayed(rightDelay, delays[s]);
                var sample = s switch
                {
                    0 => l, 1 => r, 2 => (l + r) * .5f,
                    3 => (l - r) * .5f, 4 => (r - l) * .5f,
                    5 => .7f * l - .3f * r, _ => .7f * r - .3f * l,
                };
                history[s][cursor] = history[s][cursor + Taps] = sample;
                var gain = gains[s] + (nextGains[s] - gains[s]) * blend;
                if (gain == 0) continue;
                left += Convolve(history[s], s * 2, blend) * gain;
                right += Convolve(history[s], s * 2 + 1, blend) * gain;
            }
            var desired = settings.Enabled ? settings.Amount : 0;
            wet += Math.Clamp(desired - wet, -1f / 960, 1f / 960);
            // Conservative stereo-to-room headroom plus a final peak guard.
            var headroom = settings.Mode == "stereo" ? .5f : .42f;
            buffer[i] = Math.Clamp(dryLeft * (1 - wet) + left * headroom * wet, -.999f, .999f);
            buffer[i + 1] = Math.Clamp(dryRight * (1 - wet) + right * headroom * wet, -.999f, .999f);
            delayCursor = (delayCursor + 1) & (DelayLength - 1);
            blockFrame = (blockFrame + 1) % Block;
        }
        return read;
    }
    private float Delay(int speaker, SpatialSettings settings) => settings.Speakers[speakerIndices[speaker]].Distance * settings.Distance * (48000f / 343)
        + (settings.Mode == "surround" && speaker >= 5 ? (speaker == 5 ? 480 : 624) * settings.Immersion : 0);
    private float Delayed(float[] samples, float delay)
    {
        var whole = (int)delay; var fraction = delay - whole;
        var index = (delayCursor - whole) & (DelayLength - 1);
        return samples[index] * (1 - fraction) + samples[(index - 1) & (DelayLength - 1)] * fraction;
    }
    private float Convolve(float[] samples, int index, float blend) => Dot(samples.AsSpan(cursor, Taps), filters[index]) * (1 - blend) + Dot(samples.AsSpan(cursor, Taps), target[index]) * blend;
    private static float Dot(ReadOnlySpan<float> a, ReadOnlySpan<float> b)
    {
        var sum = Vector<float>.Zero; var i = 0;
        for (; i <= a.Length - Vector<float>.Count; i += Vector<float>.Count) sum += new Vector<float>(a.Slice(i)) * new Vector<float>(b.Slice(i));
        var result = Vector.Sum(sum);
        for (; i < a.Length; i++) result += a[i] * b[i];
        return result;
    }
}
