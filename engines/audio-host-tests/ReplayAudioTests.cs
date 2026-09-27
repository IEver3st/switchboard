using System.IO.Pipes;
using NAudio.Wave;
using Switchboard.AudioHost;

internal static class ReplayAudioTests
{
    public static async Task RunAsync()
    {
        var graph = new RoutingControlGraph();
        AudioHostSettings Settings(bool chatEnabled = true, bool masterEnabled = true) => new()
        {
            ChatMix = 1, // Personal listening balance must not change recorded samples.
            Buses = new[] { "game", "chat", "media", "mic" }.Select(id => new AudioBusConfiguration { Id = id }).ToArray(),
            Mixes = [new() { Id = "clip", Master = new() { Gain = 0.5f, Enabled = masterEnabled },
                Buses = new[] { "game", "chat", "media", "mic" }.Select(id => new AudioMixBusConfiguration {
                    Id = id, Gain = id == "chat" ? 0.5f : 1f, Enabled = id != "chat" || chatEnabled }).ToArray() }],
        };
        graph.Configure(Settings());
        var sources = new ReplayTrackSources();
        foreach (var (id, value) in new[] { ("game", 0.1f), ("media", 0.2f), ("chat", 0.8f) })
            sources.Add(id, new ProcessedSampleProvider(new Constant(value), graph.CreateProcessor("clip", id)));
        var system = sources.System;
        var chat = sources.Chat;
        var mic = new ProcessedSampleProvider(new Constant(0.4f), graph.CreateProcessor("clip", "mic"));
        CheckSamples(system, 0.15f);
        CheckSamples(chat, 0.2f);
        CheckSamples(mic, 0.2f);
        graph.Configure(Settings(chatEnabled: false));
        CheckSamples(system, 0.15f);
        CheckSamples(chat, 0);
        graph.Configure(Settings(masterEnabled: false));
        CheckSamples(system, 0);
        CheckSamples(chat, 0);
        CheckSamples(mic, 0);

        // Real Windows pipes with synthetic PCM: reconnect, cancellation while
        // waiting, and duplicate disposal. No endpoint or user audio is opened.
        for (var run = 0; run < 3; run++)
        {
            var name = $"switchboard-replay-test-{Guid.NewGuid():N}";
            using var output = new NamedPipeAudioOutput(new Constant(0.125f), name);
            output.Start();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            for (var connection = 0; connection < 2; connection++)
            {
                using var client = new NamedPipeClientStream(".", name, PipeDirection.In, PipeOptions.Asynchronous);
                await client.ConnectAsync(timeout.Token);
                var bytes = new byte[7680];
                await client.ReadExactlyAsync(bytes, timeout.Token);
                if (BitConverter.ToSingle(bytes) != 0.125f) throw new Exception("Replay pipe corrupted PCM.");
                client.Dispose();
                await Task.Delay(100, timeout.Token);
            }
            output.Dispose();
            output.Dispose();
            if (output.IsHealthy) throw new Exception("Disposed recording output retained its pump.");
        }
        Console.WriteLine("Replay mix isolation, mute/gain, and native pipe lifecycle passed.");
    }

    private static void CheckSamples(ISampleProvider source, float expected)
    {
        var samples = new float[960];
        source.Read(samples);
        if (samples.Any(sample => Math.Abs(sample - expected) > 0.00001f)) throw new Exception("Replay tracks leaked or ignored recording controls.");
    }

    private sealed class Constant(float value) : ISampleProvider
    {
        public WaveFormat WaveFormat => WaveFormat.CreateIeeeFloatWaveFormat(48_000, 2);
        public int Read(Span<float> buffer) { buffer.Fill(value); return buffer.Length; }
    }
}
