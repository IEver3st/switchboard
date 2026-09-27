using System.IO.Pipes;

namespace Switchboard.CaptureHost;

// Native-to-native PCM transport. Relaying gives replay an observable lifetime
// and lets reaction detection consume the same processed microphone as the clip.
internal sealed class AudioHostPipeInput : IAudioPipeInput
{
    private readonly string sourcePipeName;
    private readonly IAudioPacketObserver? observer;
    private readonly CancellationTokenSource lifetime = new();
    private NamedPipeClientStream? source;
    private NamedPipeServerStream? output;
    private Task? pump;
    private long capturedBytes;
    private long writtenBytes;
    private int disposed;
    private string? error;

    public AudioHostPipeInput(string pipeName, string label, IAudioPacketObserver? observer = null)
    {
        sourcePipeName = pipeName;
        Label = label;
        this.observer = observer;
        PipePath = $@"\\.\pipe\switchboard-replay-{Environment.ProcessId}-{Guid.NewGuid():N}";
    }

    public string Label { get; }
    public string PipePath { get; }
    public int SampleRate => 48_000;
    public int Channels => 2;
    public string FfmpegSampleFormat => "f32le";
    public long DroppedPackets => 0;
    public long CapturedBytes => Interlocked.Read(ref capturedBytes);
    public long WrittenBytes => Interlocked.Read(ref writtenBytes);
    public int BytesPerSecond => SampleRate * Channels * sizeof(float);
    public string? Error => Volatile.Read(ref error);

    public Task ConnectAndStartAsync(CancellationToken cancellationToken) => StartAsync(true, cancellationToken);
    public Task StartAnalysisOnlyAsync() => StartAsync(false, lifetime.Token);

    private async Task StartAsync(bool record, CancellationToken cancellationToken)
    {
        if (pump is not null) return;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, lifetime.Token);
        deadline.CancelAfter(TimeSpan.FromSeconds(5));
        try
        {
            source = new NamedPipeClientStream(".", sourcePipeName, PipeDirection.In, PipeOptions.Asynchronous);
            if (record)
                output = new NamedPipeServerStream(PipePath[9..], PipeDirection.Out, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly, 0, 48 * 1024);
            await source.ConnectAsync(deadline.Token);
            if (output is not null) await output.WaitForConnectionAsync(deadline.Token);
            pump = PumpAsync(lifetime.Token);
        }
        catch
        {
            source?.Dispose();
            output?.Dispose();
            throw;
        }
    }

    private async Task PumpAsync(CancellationToken cancellationToken)
    {
        var frame = new byte[BytesPerSecond / 50];
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        try
        {
            while (true)
            {
                // Exact frames preserve float alignment even when a pipe read is partial.
                deadline.CancelAfter(TimeSpan.FromSeconds(2));
                await source!.ReadExactlyAsync(frame, deadline.Token);
                Interlocked.Add(ref capturedBytes, frame.Length);
                observer?.Observe(frame, false, PcmSampleFormat.Float32, Channels, SampleRate);
                if (output is null) continue;
                await output.WriteAsync(frame, deadline.Token);
                Interlocked.Add(ref writtenBytes, frame.Length);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception failure) { Volatile.Write(ref error, $"{Label} disconnected: {failure.Message}"); }
        finally
        {
            source?.Dispose();
            output?.Dispose();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        lifetime.Cancel();
        source?.Dispose();
        output?.Dispose();
        if (pump is not null) await pump;
        lifetime.Dispose();
    }
}
