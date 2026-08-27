using System.IO.Pipes;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class NamedPipeAudioOutput : IDisposable
{
    public const string PipeName = "switchboard-audio-clip-v1";
    private const int FrameMilliseconds = 20;
    private const int FrameSamples = AudioConstants.SampleRate * AudioConstants.Channels * FrameMilliseconds / 1_000;
    private readonly ISampleProvider source;
    private readonly CancellationTokenSource lifetime = new();
    private Task? pump;
    private int started;
    private int disposed;

    public NamedPipeAudioOutput(ISampleProvider source) => this.source = source;

    public void Start()
    {
        if (Interlocked.Exchange(ref started, 1) != 0) return;
        pump = Task.Run(() => PumpAsync(lifetime.Token));
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        lifetime.Cancel();
        if (pump is not null)
        {
            try { pump.Wait(TimeSpan.FromSeconds(2)); } catch { }
        }
        lifetime.Dispose();
    }

    private async Task PumpAsync(CancellationToken cancellationToken)
    {
        var samples = new float[FrameSamples];
        var bytes = new byte[FrameSamples * sizeof(float)];
        NamedPipeServerStream? pipe = null;
        Task? connection = null;
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(FrameMilliseconds));
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                source.Read(samples);
                if (pipe is null)
                {
                    pipe = CreatePipe();
                    connection = pipe.WaitForConnectionAsync(cancellationToken);
                }
                if (connection is not { IsCompletedSuccessfully: true } || !pipe.IsConnected) continue;
                Buffer.BlockCopy(samples, 0, bytes, 0, bytes.Length);
                try
                {
                    await pipe.WriteAsync(bytes, cancellationToken);
                }
                catch (IOException)
                {
                    await pipe.DisposeAsync();
                    pipe = null;
                    connection = null;
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        finally
        {
            if (pipe is not null) await pipe.DisposeAsync();
        }
    }

    private static NamedPipeServerStream CreatePipe() => new(
        PipeName,
        PipeDirection.Out,
        1,
        PipeTransmissionMode.Byte,
        PipeOptions.Asynchronous,
        256 * 1024,
        256 * 1024);
}
