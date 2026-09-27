using System.Diagnostics;
using System.Text.Json;
using Switchboard.AudioHost;

internal static class EqualizerCapacityTests
{
    public static void Run()
    {
        var bands = Enumerable.Range(0, AudioConstants.MaximumProcessorBands)
            .Select(i => new EqualizerBandConfiguration(true, "bell", 1_000f, i == AudioConstants.MaximumProcessorBands - 1 ? -6f : 0f, 1f)).ToArray();
        var settings = new ChannelProcessingSettings
        {
            Equalizer = new ChannelEqualizerSettings
            {
                Enabled = true,
                Bands = bands.Select(b => new EqualizerBandSettings { Enabled = b.Enabled, Type = b.Type, Frequency = b.Frequency, GainDb = b.GainDb, Q = b.Q }).ToArray()
            }
        };
        var channel = ChannelDspConfiguration.From(settings, 1);
        if (channel.Equalizer.Bands.Count != bands.Length) throw new Exception("Output parser truncated expanded EQ.");
        var mic = MicrophoneDspConfiguration.From(new AudioHostSettings { MicProcessors = [new MicrophoneProcessorSettings
        {
            Id = "equalizer", Enabled = true,
            Parameters = JsonSerializer.SerializeToElement(new { bands = bands.Select(b => new { enabled = b.Enabled, type = b.Type, frequency = b.Frequency, gainDb = b.GainDb, q = b.Q }) })
        }, .. new[] { "noise-suppression", "noise-gate", "gain", "compressor", "limiter" }.Select(id => new MicrophoneProcessorSettings { Id = id, Enabled = false, Parameters = JsonSerializer.SerializeToElement(new { }) })] }, 1);
        if (mic.Equalizer.Bands.Count != bands.Length) throw new Exception("Microphone parser truncated expanded EQ.");
        using var suppressor = new ControlAwareSuppressor();
        var graph = new AudioGraph(suppressor);
        var mono = Enumerable.Range(0, 480).Select(i => MathF.Sin(2 * MathF.PI * 1_000 * i / AudioConstants.ProcessingSampleRate) * 0.1f).ToArray();
        var monoInput = mono.ToArray();
        graph.ProcessMicrophone(mono, mic);
        var monoRatio = Math.Sqrt(mono.Skip(240).Sum(x => (double)x * x) / monoInput.Skip(240).Sum(x => (double)x * x));
        if (Math.Abs(monoRatio - Math.Pow(10, -6.0 / 20)) > 0.02) throw new Exception("Band 64 did not process microphone audio.");
        mono = monoInput.ToArray();
        graph.ProcessMicrophone(mono, mic with { Version = 2, Equalizer = new EqualizerConfiguration(true, []) });
        if (!mono.SequenceEqual(monoInput)) throw new Exception("Removing microphone bands retained filtering.");

        var eq = new StereoParametricEqualizer();
        eq.Configure(channel.Equalizer.Bands);
        var input = Enumerable.Range(0, 9_600).Select(i => MathF.Sin(2 * MathF.PI * 1_000 * (i / 2) / AudioConstants.SampleRate) * 0.1f).ToArray();
        var output = input.ToArray();
        eq.Process(output);
        var ratio = Math.Sqrt(output.Skip(4_800).Sum(x => (double)x * x) / input.Skip(4_800).Sum(x => (double)x * x));
        if (Math.Abs(ratio - Math.Pow(10, -6.0 / 20)) > 0.01) throw new Exception("Band 64 did not process stereo audio.");
        eq.Configure([]);
        output = input.ToArray();
        eq.Process(output);
        if (!output.SequenceEqual(input)) throw new Exception("Removing all EQ bands retained filtering.");

        // Synthetic callback cost and allocation evidence, not a live-device budget.
        eq.Configure(bands.Select((b, i) => b with { Frequency = 40f * MathF.Pow(400, i / 63f), GainDb = i % 2 == 0 ? 1f : -1f }).ToArray());
        var frame = new float[960];
        for (var i = 0; i < 100; i++) eq.Process(frame);
        var timer = Stopwatch.StartNew();
        var allocated = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 1_000; i++) eq.Process(frame);
        allocated = GC.GetAllocatedBytesForCurrentThread() - allocated;
        timer.Stop();
        if (allocated != 0) throw new Exception($"EQ callback allocated {allocated} bytes.");
        Console.WriteLine($"64-band stereo EQ: {timer.Elapsed.TotalMilliseconds / 1_000:F3} ms per 10 ms synthetic frame, {allocated} callback bytes.");
    }
}
