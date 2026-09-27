using System.Numerics;
using NAudio.Wave;

namespace Switchboard.AudioHost;

// Renders the stereo mix as virtual speakers in a small virtual room. Every speaker, its feed and its
// first-order wall reflections are linear in the input, so they fold into ear filters (left->left ear,
// left->right ear, right->left ear, right->right ear) instead of one convolution pair per speaker.
// The front speakers form a full-band bank. Surround speakers and reflections form a second bank fed
// by a 200 Hz high-passed input: delayed copies of bass only cancel and boom, so bass stays direct.
internal sealed class SpatialSampleProvider : ISampleProvider
{
    // Filters rebuild at most once per 10.7 ms block and crossfade across it. Headset sensors report at
    // 25-100 Hz, so faster rebuilds only multiply callback cost while the head moves.
    private const int Block = 512, MaxTaps = 2048, HrirTaps = KemarFilters.Taps;
    private const float SamplesPerMetre = 48000f / 343;
    private const float Rebuild = .9999966f; // cos(0.15 deg): rebuild after ~0.3 deg of head rotation.
    private readonly ISampleProvider source;
    private readonly SpatialSession session;
    private readonly string channel;
    private readonly Bank direct = new(), ambience = new();
    private readonly float[] historyLeft = new float[MaxTaps * 2], historyRight = new float[MaxTaps * 2];
    private readonly float[] highLeft = new float[MaxTaps * 2], highRight = new float[MaxTaps * 2];
    private readonly float[] hrirLeft = new float[HrirTaps], hrirRight = new float[HrirTaps];
    private readonly int[] speakerIndices = new int[7];
    private readonly HighPass highPassLeft = new(), highPassRight = new();
    private SpatialStage? built;
    private Quaternion orientation = Quaternion.Identity, builtOrientation = Quaternion.Identity;
    private int cursor, blockFrame;
    private float wet;
    private bool active, blending;
    public SpatialSampleProvider(ISampleProvider source, SpatialSession session, string channel = "game")
    {
        this.channel = channel;
        if (source.WaveFormat.SampleRate != 48000 || source.WaveFormat.Channels != 2) throw new ArgumentException("Spatial audio requires 48 kHz stereo.");
        this.source = source; this.session = session;
    }
    public WaveFormat WaveFormat => source.WaveFormat;
    public int Read(Span<float> buffer)
    {
        var read = source.Read(buffer);
        var state = session.Current;
        var settings = state.Settings.Channels.For(channel)!;
        if (!settings.Enabled && wet <= 0)
        {
            if (active)
            {
                historyLeft.AsSpan().Clear(); historyRight.AsSpan().Clear(); highLeft.AsSpan().Clear(); highRight.AsSpan().Clear();
                highPassLeft.Reset(); highPassRight.Reset();
                active = false; blending = false; blockFrame = 0; built = null;
                orientation = builtOrientation = Quaternion.Identity;
            }
            return read;
        }
        var dataset = state.Filters;
        if (dataset is null && !active) return read;
        for (var i = 0; i + 1 < read; i += 2)
        {
            if (blockFrame == 0)
            {
                if (blending) { direct.Commit(); ambience.Commit(); blending = false; }
                orientation = Quaternion.Slerp(orientation, SpatialSession.RelativeRotation(state, state.Tracker?.Latest), .41f); // ~20 ms follow.
                // Disabling releases the dataset; the fade-out keeps rendering with the filters already built.
                if (dataset is not null && (!active || !ReferenceEquals(built, settings) || MathF.Abs(Quaternion.Dot(orientation, builtOrientation)) < Rebuild))
                {
                    Build(dataset, settings, Quaternion.Inverse(orientation));
                    built = settings; builtOrientation = orientation;
                    if (active) blending = true;
                    else { direct.Commit(); ambience.Commit(); active = true; }
                }
            }
            var dryLeft = buffer[i]; var dryRight = buffer[i + 1];
            cursor = cursor == 0 ? MaxTaps - 1 : cursor - 1;
            historyLeft[cursor] = historyLeft[cursor + MaxTaps] = dryLeft;
            historyRight[cursor] = historyRight[cursor + MaxTaps] = dryRight;
            highLeft[cursor] = highLeft[cursor + MaxTaps] = highPassLeft.Process(dryLeft);
            highRight[cursor] = highRight[cursor + MaxTaps] = highPassRight.Process(dryRight);
            var blend = blending ? (blockFrame + 1f) / Block : 0;
            var (left, right) = direct.Render(historyLeft.AsSpan(cursor, MaxTaps), historyRight.AsSpan(cursor, MaxTaps), blend);
            var (roomLeft, roomRight) = ambience.Render(highLeft.AsSpan(cursor, MaxTaps), highRight.AsSpan(cursor, MaxTaps), blend);
            left += roomLeft; right += roomRight;
            wet += Math.Clamp((settings.Enabled ? 1f : 0f) - wet, -1f / 960, 1f / 960);
            buffer[i] = Limit(dryLeft + (left - dryLeft) * wet);
            buffer[i + 1] = Limit(dryRight + (right - dryRight) * wet);
            blockFrame = (blockFrame + 1) % Block;
        }
        return read;
    }

    // Speaker feed from the stereo input (left, right coefficients), level and Haas delay in samples.
    // Only the front pair carries the plain channels. Side and rear speakers take the stereo difference,
    // which holds width and ambience but no centre-panned vocals or bass, so those never smear.
    private static (float Left, float Right, float Level, float Delay) Feed(int speaker, SpatialStage settings)
    {
        if (speaker < 2) return speaker == 0 ? (1, 0, 1, 0) : (0, 1, 1, 0);
        if (settings.Mode == "stereo") return default;
        var immersion = settings.Immersion;
        return speaker switch
        {
            2 => (.5f, .5f, .2f, 0),
            3 => (.5f, -.5f, .3f + .5f * immersion, 288),
            4 => (-.5f, .5f, .3f + .5f * immersion, 288),
            5 => (.5f, -.5f, .2f + .45f * immersion, 576),
            _ => (-.5f, .5f, .2f + .45f * immersion, 576),
        };
    }

    private void Build(KemarFilters dataset, SpatialStage settings, Quaternion inverse)
    {
        direct.Begin(); ambience.Begin();
        for (var index = 0; index < 7; index++)
            for (var j = 0; j < 7; j++) if (settings.Speakers[j].Id == SpatialSpeaker.Ids[index]) speakerIndices[index] = j;
        // A rectangular room that always contains the speakers; Distance widens the room with the stage.
        var radius = 0f; var nearest = float.MaxValue;
        for (var s = 0; s < 7; s++)
        {
            var speaker = settings.Speakers[speakerIndices[s]]; var feed = Feed(s, settings);
            radius = MathF.Max(radius, settings.Distance * speaker.Distance);
            if (speaker.Enabled && feed.Level > 0) nearest = MathF.Min(nearest, settings.Distance * speaker.Distance * SamplesPerMetre + feed.Delay);
        }
        if (nearest == float.MaxValue) return;
        float halfWidth = radius + .6f, front = radius + .5f, back = radius + .9f, floor = 1.2f, ceiling = 1.5f;
        var reflection = .15f + .5f * settings.Immersion;
        Span<Vector3> images = stackalloc Vector3[6];
        float structural = 0; var dryOffset = 0;
        for (var s = 0; s < 7; s++)
        {
            var feed = Feed(s, settings);
            if (feed.Level == 0) continue;
            var speaker = settings.Speakers[speakerIndices[s]];
            var azimuth = settings.Mode == "stereo" ? (s == 0 ? -1 : 1) * settings.WidthDegrees / 2 : speaker.Azimuth;
            var distance = settings.Distance * speaker.Distance;
            var position = KemarFilters.Position(azimuth, speaker.Elevation) * distance;
            images[0] = position with { X = 2 * halfWidth - position.X }; images[1] = position with { X = -2 * halfWidth - position.X };
            images[2] = position with { Z = 2 * front - position.Z }; images[3] = position with { Z = -2 * back - position.Z };
            images[4] = position with { Y = 2 * ceiling - position.Y }; images[5] = position with { Y = -2 * floor - position.Y };
            // Level normalisation follows the layout and room, not per-speaker trims, so trims stay audible.
            float roomPower = 1;
            foreach (var image in images) roomPower += MathF.Pow(reflection * distance / image.Length(), 2);
            structural += feed.Level * feed.Level * (feed.Left * feed.Left + feed.Right * feed.Right) * roomPower;
            if (!speaker.Enabled) continue;
            var level = feed.Level * MathF.Pow(10, speaker.GainDb / 20) / MathF.Sqrt(speaker.Distance);
            var offset = Add(s < 3 ? direct : ambience, dataset, position, distance * SamplesPerMetre + feed.Delay - nearest, level, feed.Left, feed.Right, inverse, false);
            if (s == 0) dryOffset = offset;
            foreach (var image in images)
                Add(ambience, dataset, image, image.Length() * SamplesPerMetre + feed.Delay - nearest, level * reflection * distance / image.Length(), feed.Left, feed.Right, inverse, true);
        }
        // Scale to the power of the plain front pair so enabling the stage keeps the mix level.
        var scale = settings.Amount * MathF.Sqrt(2 / structural);
        direct.Scale(scale); ambience.Scale(scale);
        // Partial effect: plain channels aligned with the front speakers' arrival, not a zero-delay blend.
        if (settings.Amount < 1) direct.Impulse(dryOffset, 1 - settings.Amount);
    }

    // Adds one source direction to a bank; returns its left-ear offset in samples.
    private int Add(Bank bank, KemarFilters dataset, Vector3 position, float delay, float level, float fromLeft, float fromRight, Quaternion inverse, bool reflection)
    {
        dataset.Interpolate(Vector3.Normalize(Vector3.Transform(position, inverse)), hrirLeft, hrirRight, out var delayLeft, out var delayRight);
        var offsetLeft = (int)MathF.Round(delay + delayLeft); var offsetRight = (int)MathF.Round(delay + delayRight);
        if (Math.Max(offsetLeft, offsetRight) + HrirTaps + 2 > MaxTaps) return offsetLeft;
        bank.Place(hrirLeft, offsetLeft, level, fromLeft, fromRight, 0, reflection);
        bank.Place(hrirRight, offsetRight, level, fromLeft, fromRight, 1, reflection);
        return offsetLeft;
    }

    // Soft knee above -2 dBFS instead of a hard clamp; transparent at normal levels.
    private static float Limit(float sample)
    {
        const float knee = .8f;
        var magnitude = MathF.Abs(sample);
        if (magnitude <= knee) return sample;
        return MathF.CopySign(knee + (1 - knee) * MathF.Tanh((magnitude - knee) / (1 - knee)), sample);
    }

    // Four ear filters with a crossfade target. Only the non-zero span is convolved, so a room bank
    // whose first reflection arrives late does not pay for its leading silence.
    private sealed class Bank
    {
        private readonly float[][] current = Enumerable.Range(0, 4).Select(_ => new float[MaxTaps]).ToArray();
        private readonly float[][] target = Enumerable.Range(0, 4).Select(_ => new float[MaxTaps]).ToArray();
        private int currentStart, currentEnd, targetStart, targetEnd;
        public void Begin()
        {
            for (var f = 0; f < 4; f++) target[f].AsSpan(0, Math.Max(targetEnd, currentEnd)).Clear();
            targetStart = MaxTaps; targetEnd = 0;
        }
        public void Place(float[] hrir, int offset, float level, float fromLeft, float fromRight, int ear, bool reflection)
        {
            var leftFilter = target[ear]; var rightFilter = target[2 + ear];
            for (var k = 0; k < HrirTaps; k++)
            {
                var value = hrir[k] * level;
                if (reflection)
                {
                    // Wall absorption: a gentle [1 2 1]/4 low-pass keeps reflections soft and out of the presence band.
                    for (var t = 0; t < 3; t++)
                    {
                        var tap = value * (t == 1 ? .5f : .25f);
                        leftFilter[offset + k + t] += fromLeft * tap; rightFilter[offset + k + t] += fromRight * tap;
                    }
                }
                else { leftFilter[offset + k] += fromLeft * value; rightFilter[offset + k] += fromRight * value; }
            }
            Extend(offset, offset + HrirTaps + (reflection ? 2 : 0));
        }
        public void Impulse(int offset, float value) { target[0][offset] += value; target[3][offset] += value; Extend(offset, offset + 1); }
        public void Scale(float scale)
        {
            if (targetEnd <= targetStart) return;
            for (var f = 0; f < 4; f++) foreach (ref var tap in target[f].AsSpan(targetStart, targetEnd - targetStart)) tap *= scale;
        }
        public void Commit()
        {
            for (var f = 0; f < 4; f++) target[f].AsSpan(0, Math.Max(targetEnd, currentEnd)).CopyTo(current[f]);
            currentStart = targetStart; currentEnd = targetEnd;
        }
        public (float Left, float Right) Render(ReadOnlySpan<float> left, ReadOnlySpan<float> right, float blend)
        {
            var (l, r) = Render(current, currentStart, currentEnd, left, right);
            if (blend == 0) return (l, r);
            var (tl, tr) = Render(target, targetStart, targetEnd, left, right);
            return (l + (tl - l) * blend, r + (tr - r) * blend);
        }
        private static (float, float) Render(float[][] filters, int start, int end, ReadOnlySpan<float> left, ReadOnlySpan<float> right)
        {
            if (end <= start) return (0, 0);
            return (Dot(left, filters[0], start, end) + Dot(right, filters[2], start, end), Dot(left, filters[1], start, end) + Dot(right, filters[3], start, end));
        }
        private void Extend(int start, int end)
        {
            targetStart = Math.Min(targetStart, start / Vector<float>.Count * Vector<float>.Count);
            targetEnd = Math.Min(MaxTaps, Math.Max(targetEnd, (end + Vector<float>.Count - 1) / Vector<float>.Count * Vector<float>.Count));
        }
        private static float Dot(ReadOnlySpan<float> samples, float[] filter, int start, int end)
        {
            var a = samples[start..end]; var b = filter.AsSpan(start, end - start);
            var sum = Vector<float>.Zero; var i = 0;
            for (; i <= a.Length - Vector<float>.Count; i += Vector<float>.Count) sum += new Vector<float>(a[i..]) * new Vector<float>(b[i..]);
            var result = Vector.Sum(sum);
            for (; i < a.Length; i++) result += a[i] * b[i];
            return result;
        }
    }

    // Second-order Butterworth high-pass at 200 Hz (RBJ biquad, transposed direct form II).
    private sealed class HighPass
    {
        private static readonly float B0, B1, B2, A1, A2;
        private float z1, z2;
        static HighPass()
        {
            var w = 2 * Math.PI * 200 / 48000; var alpha = Math.Sin(w) / (2 * Math.Sqrt(.5)); var a0 = 1 + alpha;
            B0 = (float)((1 + Math.Cos(w)) / 2 / a0); B1 = (float)(-(1 + Math.Cos(w)) / a0); B2 = B0;
            A1 = (float)(-2 * Math.Cos(w) / a0); A2 = (float)((1 - alpha) / a0);
        }
        public float Process(float input)
        {
            var output = B0 * input + z1;
            z1 = B1 * input - A1 * output + z2; z2 = B2 * input - A2 * output;
            if (MathF.Abs(z1) < 1e-20f) { z1 = 0; z2 = 0; } // No denormal decay after silence.
            return output;
        }
        public void Reset() { z1 = 0; z2 = 0; }
    }
}
