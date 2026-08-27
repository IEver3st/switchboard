using System.Buffers;
using System.IO.Pipes;
using System.Threading.Channels;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.CaptureHost;

internal interface IAudioPipeInput : IAsyncDisposable
{
    string Label { get; }
    string PipePath { get; }
    int SampleRate { get; }
    int Channels { get; }
    string FfmpegSampleFormat { get; }
    long DroppedPackets { get; }
    long CapturedBytes { get; }
    long WrittenBytes { get; }
    int BytesPerSecond { get; }
    string? Error { get; }
    Task ConnectAndStartAsync(CancellationToken cancellationToken);
}

internal sealed class AudioPipeCapture : IAudioPipeInput
{
    private static readonly Guid IeeeFloatSubFormat = new("00000003-0000-0010-8000-00aa00389b71");

    private readonly IWaveIn capture;
    private readonly MMDevice? heldEndpoint;
    private readonly NamedPipeServerStream pipe;
    private readonly Channel<AudioPacket> packets;
    private readonly CancellationTokenSource lifetime = new();
    private Task? writerTask;
    private bool started;
    private long droppedPackets;
    private long capturedPackets;
    private long writtenPackets;
    private long capturedBytes;
    private long writtenBytes;

    private AudioPipeCapture(IWaveIn capture, string label, MMDevice? heldEndpoint = null)
    {
        this.capture = capture;
        this.heldEndpoint = heldEndpoint;
        Label = label;
        PipeName = $"switchboard-capture-{Environment.ProcessId}-{Guid.NewGuid():N}";
        pipe = new NamedPipeServerStream(
            PipeName,
            PipeDirection.Out,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            512 * 1024,
            512 * 1024);
        packets = Channel.CreateBounded<AudioPacket>(new BoundedChannelOptions(256)
        {
            SingleReader = true,
            SingleWriter = true,
            // TryWrite must report backpressure so the realtime callback can return
            // its ArrayPool buffer. DropWrite reports success even when it drops the
            // new item, which would leak one rented buffer per overrun.
            FullMode = BoundedChannelFullMode.Wait,
        });
        capture.DataAvailable += OnDataAvailable;
        capture.RecordingStopped += OnRecordingStopped;
    }

    public string Label { get; }
    public string PipeName { get; }
    public string PipePath => $@"\\.\pipe\{PipeName}";
    public int SampleRate => capture.WaveFormat.SampleRate;
    public int Channels => capture.WaveFormat.Channels;
    public string FfmpegSampleFormat => GetFfmpegSampleFormat(capture.WaveFormat);
    public long DroppedPackets => Interlocked.Read(ref droppedPackets);
    public long CapturedPackets => Interlocked.Read(ref capturedPackets);
    public long WrittenPackets => Interlocked.Read(ref writtenPackets);
    public long CapturedBytes => Interlocked.Read(ref capturedBytes);
    public long WrittenBytes => Interlocked.Read(ref writtenBytes);
    public int BytesPerSecond => capture.WaveFormat.AverageBytesPerSecond;
    public string? Error { get; private set; }

    public static AudioPipeCapture CreateSystemLoopback()
    {
        var capture = new WasapiRecorderBuilder()
            .WithSharedMode()
            .WithEventSync()
            .WithBufferLength(50)
            .WithLoopbackCapture()
            .Build();
        return new AudioPipeCapture(capture, "System audio");
    }

    public static AudioPipeCapture CreateDefaultMicrophone()
    {
        using var enumerator = new MMDeviceEnumerator();
        var endpoint = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia);
        var capture = new WasapiRecorderBuilder()
            .WithDevice(endpoint)
            .WithSharedMode()
            .WithEventSync()
            .WithBufferLength(50)
            .Build();
        return new AudioPipeCapture(capture, "Microphone", endpoint);
    }

    public static AudioPipeCapture CreateEndpoint(string endpointId, string label)
    {
        using var enumerator = new MMDeviceEnumerator();
        var endpoint = enumerator.GetDevice(endpointId);
        try
        {
            var capture = new WasapiRecorderBuilder()
                .WithDevice(endpoint)
                .WithSharedMode()
                .WithEventSync()
                .WithBufferLength(50)
                .Build();
            return new AudioPipeCapture(capture, label, endpoint);
        }
        catch
        {
            endpoint.Dispose();
            throw;
        }
    }

    public async Task ConnectAndStartAsync(CancellationToken cancellationToken)
    {
        if (started) return;
        await pipe.WaitForConnectionAsync(cancellationToken);
        writerTask = WritePacketsAsync(lifetime.Token);
        capture.StartRecording();
        started = true;
    }

    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel();
        packets.Writer.TryComplete();
        if (started)
        {
            try { capture.StopRecording(); } catch { }
        }
        if (writerTask is not null)
        {
            try { await writerTask.WaitAsync(TimeSpan.FromSeconds(2)); } catch { }
        }
        while (packets.Reader.TryRead(out var packet)) packet.Return();
        capture.DataAvailable -= OnDataAvailable;
        capture.RecordingStopped -= OnRecordingStopped;
        capture.Dispose();
        heldEndpoint?.Dispose();
        await pipe.DisposeAsync();
        lifetime.Dispose();
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs eventArgs)
    {
        if (eventArgs.BytesRecorded <= 0) return;
        Interlocked.Increment(ref capturedPackets);
        Interlocked.Add(ref capturedBytes, eventArgs.BytesRecorded);
        var rented = ArrayPool<byte>.Shared.Rent(eventArgs.BytesRecorded);
        Buffer.BlockCopy(eventArgs.Buffer, 0, rented, 0, eventArgs.BytesRecorded);
        var packet = new AudioPacket(rented, eventArgs.BytesRecorded);
        if (!packets.Writer.TryWrite(packet))
        {
            packet.Return();
            Interlocked.Increment(ref droppedPackets);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs eventArgs)
    {
        Error = eventArgs.Exception?.Message ?? $"{Label} device stopped.";
        packets.Writer.TryComplete();
    }

    private async Task WritePacketsAsync(CancellationToken cancellationToken)
    {
        var batch = ArrayPool<byte>.Shared.Rent(512 * 1024);
        try
        {
            while (await packets.Reader.WaitToReadAsync(cancellationToken))
            {
                var length = 0;
                while (packets.Reader.TryRead(out var packet))
                {
                    try
                    {
                        if (packet.Length > batch.Length)
                        {
                            if (length > 0)
                            {
                                await pipe.WriteAsync(batch.AsMemory(0, length), cancellationToken);
                                Interlocked.Add(ref writtenBytes, length);
                                length = 0;
                            }
                            await pipe.WriteAsync(packet.Buffer.AsMemory(0, packet.Length), cancellationToken);
                            Interlocked.Add(ref writtenBytes, packet.Length);
                            continue;
                        }
                        if (length + packet.Length > batch.Length)
                        {
                            await pipe.WriteAsync(batch.AsMemory(0, length), cancellationToken);
                            Interlocked.Add(ref writtenBytes, length);
                            length = 0;
                        }
                        Buffer.BlockCopy(packet.Buffer, 0, batch, length, packet.Length);
                        length += packet.Length;
                    }
                    finally
                    {
                        packet.Return();
                        Interlocked.Increment(ref writtenPackets);
                    }
                }
                if (length > 0)
                {
                    await pipe.WriteAsync(batch.AsMemory(0, length), cancellationToken);
                    Interlocked.Add(ref writtenBytes, length);
                }
            }
            await pipe.FlushAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (IOException error)
        {
            Error = error.Message;
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(batch);
        }
    }

    private static string GetFfmpegSampleFormat(WaveFormat format)
    {
        var isFloat = format.Encoding == WaveFormatEncoding.IeeeFloat
                      || format is WaveFormatExtensible extensible && extensible.SubFormat == IeeeFloatSubFormat;
        if (isFloat && format.BitsPerSample == 32) return "f32le";
        if (format.BitsPerSample == 16) return "s16le";
        if (format.BitsPerSample == 24) return "s24le";
        if (format.BitsPerSample == 32) return "s32le";
        throw new NotSupportedException($"Unsupported {format.BitsPerSample}-bit {format.Encoding} audio format.");
    }

    private sealed record AudioPacket(byte[] Buffer, int Length)
    {
        public void Return() => ArrayPool<byte>.Shared.Return(Buffer);
    }
}

internal sealed class AudioHostPipeInput(string pipeName, string label) : IAudioPipeInput
{
    public string Label { get; } = label;
    public string PipePath { get; } = $@"\\.\pipe\{pipeName}";
    public int SampleRate => 48_000;
    public int Channels => 2;
    public string FfmpegSampleFormat => "f32le";
    public long DroppedPackets => 0;
    public long CapturedBytes => 0;
    public long WrittenBytes => 0;
    public int BytesPerSecond => SampleRate * Channels * sizeof(float);
    public string? Error => null;
    public Task ConnectAndStartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
