using NAudio.Wave;
using Switchboard.AudioHost;

// Measures the settled linear response of the headphone stage from real renderer output.
internal static class SpatialResponse
{
    public static readonly double[] Bands = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 8000, 10000, 12500, 16000];

    // Impulse on (left, right) after the wet fade completes; returns the left and right ear responses.
    public static (float[] Left, float[] Right) Impulse(SpatialStage settings, float left, float right, int length = 8192)
    {
        using var session = new SpatialSession(); session.Configure(SpatialSettings.Uniform(settings));
        var source = new PulseSource(); var output = session.Wrap(source, "game");
        var buffer = new float[960];
        for (var i = 0; i < 200; i++) output.Read(buffer);
        source.Arm(left, right);
        var l = new float[length]; var r = new float[length];
        for (var frame = 0; frame < length;)
        {
            output.Read(buffer);
            for (var i = 0; i < buffer.Length && frame < length; i += 2, frame++) { l[frame] = buffer[i]; r[frame] = buffer[i + 1]; }
        }
        return (l, r);
    }

    // Third-octave-smoothed magnitude in dB at each band centre.
    public static double[] Magnitude(float[] response) => Bands.Select(centre =>
    {
        double energy = 0; var count = 0;
        for (var f = centre / 1.12; f <= centre * 1.12; f *= 1.01, count++)
        {
            double re = 0, im = 0; var w = 2 * Math.PI * f / 48000;
            for (var n = 0; n < response.Length; n++) { re += response[n] * Math.Cos(w * n); im -= response[n] * Math.Sin(w * n); }
            energy += re * re + im * im;
        }
        return 10 * Math.Log10(energy / count + 1e-20);
    }).ToArray();

    public static void Print()
    {
        void Row(string name, SpatialStage settings, float inL, float inR)
        {
            var (l, r) = Impulse(settings, inL, inR);
            Console.WriteLine($"{name,-34} L " + string.Join(" ", Magnitude(l).Select(v => $"{v,6:F1}")));
            Console.WriteLine($"{"",-34} R " + string.Join(" ", Magnitude(r).Select(v => $"{v,6:F1}")));
        }
        Console.WriteLine($"{"",-36} " + string.Join(" ", Bands.Select(b => $"{(b >= 1000 ? $"{b / 1000:0.#}k" : b.ToString()),6}")));
        var room = new SpatialStage { Enabled = true };
        Row("dry mono (reference)", room with { Enabled = false }, .5f, .5f);
        foreach (var preset in new[] { ("focused", .15f, 1f), ("natural", .4f, 1.4f), ("cinema", .8f, 2.2f) })
        {
            Row($"surround {preset.Item1} mono", room with { Immersion = preset.Item2, Distance = preset.Item3 }, .5f, .5f);
            Row($"surround {preset.Item1} hard-left", room with { Immersion = preset.Item2, Distance = preset.Item3 }, .5f, 0);
        }
        Row("stereo mono", room with { Mode = "stereo" }, .5f, .5f);
        Row("stereo hard-left", room with { Mode = "stereo" }, .5f, 0);
    }

    private sealed class PulseSource : ISampleProvider
    {
        private float left, right; private bool armed;
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
        public void Arm(float l, float r) { left = l; right = r; armed = true; }
        public int Read(Span<float> buffer)
        {
            buffer.Clear();
            if (armed) { buffer[0] = left; buffer[1] = right; armed = false; }
            return buffer.Length;
        }
    }
}
