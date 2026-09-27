using System.IO.Pipes;
using Switchboard.CaptureHost;

internal static class ReplayAudioPipeTests
{
    public static async Task RunAsync()
    {
        var config = new CaptureSettings(CacheDirectory: Path.GetTempPath(), ClipsDirectory: Path.GetTempPath());
        foreach (var changed in new[] {
            config with { SystemAudioPipeName = "switchboard-audio-system-v2" },
            config with { ChatAudioPipeName = "switchboard-audio-chat-v2" },
            config with { MicrophonePipeName = "switchboard-audio-microphone-v2" } })
        {
            changed.Validate();
            if (!ReplayEngine.RequiresRestart(config, changed)) throw new Exception("Replay did not restart for a changed audio source.");
        }
        foreach (var bad in new[] { config with { SystemAudioPipeName = "arbitrary" }, config with { ChatAudioPipeName = "arbitrary" }, config with { MicrophonePipeName = "arbitrary" } })
        {
            try { bad.Validate(); throw new Exception("Untrusted pipe was accepted."); }
            catch (InvalidOperationException) { }
        }
        for (var run = 0; run < 3; run++)
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var name = $"switchboard-source-test-{Guid.NewGuid():N}";
            using var server = new NamedPipeServerStream(name, PipeDirection.Out, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            var observer = new Observer();
            await using var input = new AudioHostPipeInput(name, "Test microphone", observer);
            var start = input.ConnectAndStartAsync(deadline.Token);
            await server.WaitForConnectionAsync(deadline.Token);
            using var consumer = new NamedPipeClientStream(".", input.PipePath[9..], PipeDirection.In, PipeOptions.Asynchronous);
            await consumer.ConnectAsync(deadline.Token);
            await start;
            var expected = new byte[7680];
            for (var index = 0; index < expected.Length; index += 4) BitConverter.GetBytes(0.25f).CopyTo(expected, index);
            // Deliberately split a float between writes.
            await server.WriteAsync(expected.AsMemory(0, 3), deadline.Token);
            await server.WriteAsync(expected.AsMemory(3), deadline.Token);
            var actual = new byte[expected.Length];
            await consumer.ReadExactlyAsync(actual, deadline.Token);
            if (!actual.SequenceEqual(expected) || observer.Bytes != expected.Length) throw new Exception("PCM or reaction analysis lost frame alignment.");
            server.Dispose();
            while (input.Error is null) await Task.Delay(10, deadline.Token);
            await input.DisposeAsync();
            await input.DisposeAsync();
        }
        // Analysis-only does not need an encoder/client to begin consuming PCM.
        using (var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
        {
            var name = $"switchboard-analysis-test-{Guid.NewGuid():N}";
            using var server = new NamedPipeServerStream(name, PipeDirection.Out, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            var observer = new Observer();
            await using var input = new AudioHostPipeInput(name, "Reaction", observer);
            var start = input.StartAnalysisOnlyAsync();
            await server.WaitForConnectionAsync(deadline.Token);
            await start;
            await server.WriteAsync(new byte[7680], deadline.Token);
            while (observer.Bytes == 0) await Task.Delay(10, deadline.Token);
            if (input.WrittenBytes != 0) throw new Exception("Analysis-only input wrote a recording.");
        }
        Console.WriteLine("Replay pipe validation, PCM, reaction analysis, disconnect and disposal passed.");
    }

    private sealed class Observer : IAudioPacketObserver
    {
        public long Bytes;
        public void Observe(ReadOnlySpan<byte> buffer, bool silent, PcmSampleFormat format, int channels, int sampleRate)
        {
            if (buffer.Length % 8 != 0 || format != PcmSampleFormat.Float32 || channels != 2 || sampleRate != 48_000)
                throw new Exception("Unexpected recording format.");
            Interlocked.Add(ref Bytes, buffer.Length);
        }
    }
}
