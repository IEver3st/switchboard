using System.IO.Pipes;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class NamedPipeAudioOutput : IDisposable
{
    public const string SystemPipeName = "switchboard-audio-system-v2";
    public const string ChatPipeName = "switchboard-audio-chat-v2";
    public const string MicrophonePipeName = "switchboard-audio-microphone-v2";
    public bool IsHealthy => pump is { IsCompleted: false };
    public event Action<Exception>? Failed;
    private const int FrameMilliseconds = 20;
    private const int FrameSamples = AudioConstants.SampleRate * AudioConstants.Channels * FrameMilliseconds / 1_000;
    private readonly ISampleProvider source;
    private readonly string pipeName;
    private readonly CancellationTokenSource lifetime = new();
    private Task? pump;
    private int started;
    private int disposed;

    public NamedPipeAudioOutput(ISampleProvider source, string pipeName)
    {
        this.source = source;
        this.pipeName = pipeName;
    }

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
        CancellationTokenSource? writeDeadline = null;
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(FrameMilliseconds));
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                source.Read(samples);
                if (pipe is null)
                {
                    pipe = CreatePipe();
                    writeDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    connection = pipe.WaitForConnectionAsync(cancellationToken);
                }
                if (connection is { IsFaulted: true }) await connection;
                if (connection is not { IsCompletedSuccessfully: true } || !pipe.IsConnected) continue;
                Buffer.BlockCopy(samples, 0, bytes, 0, bytes.Length);
                try
                {
                    writeDeadline!.CancelAfter(TimeSpan.FromSeconds(2));
                    await pipe.WriteAsync(bytes, writeDeadline.Token);
                    writeDeadline.CancelAfter(Timeout.InfiniteTimeSpan);
                }
                catch (Exception error) when (error is IOException
                    || error is OperationCanceledException && !cancellationToken.IsCancellationRequested)
                {
                    await pipe.DisposeAsync();
                    writeDeadline?.Dispose();
                    writeDeadline = null;
                    pipe = null;
                    connection = null;
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception error) { Failed?.Invoke(error); }
        finally
        {
            if (pipe is not null) await pipe.DisposeAsync();
            writeDeadline?.Dispose();
        }
    }

    private NamedPipeServerStream CreatePipe() => new(
        pipeName,
        PipeDirection.Out,
        1,
        PipeTransmissionMode.Byte,
        PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly,
        0,
        48 * 1024);
}
