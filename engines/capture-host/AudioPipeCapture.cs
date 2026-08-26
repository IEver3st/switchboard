using System.Buffers;
using System.IO.Pipes;
using System.Threading.Channels;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.CaptureHost;

internal sealed class AudioPipeCapture : IAsyncDisposable
{
    private static readonly Guid IeeeFloatSubFormat = new("00000003-0000-0010-8000-00aa00389b71");

    private readonly IWaveIn capture;
    private readonly NamedPipeServerStream pipe;
    private readonly Channel<AudioPacket> packets;
    private readonly CancellationTokenSource lifetime = new();
    private Task? writerTask;
    private bool started;
    private long droppedPackets;

    private AudioPipeCapture(IWaveIn capture, string label)
    {
        this.capture = capture;
        Label = label;
        PipeName = $"switchboard-capture-{Environment.ProcessId}-{Guid.NewGuid():N}";
        pipe = new NamedPipeServerStream(
            PipeName,
            PipeDirection.Out,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            64 * 1024,
            64 * 1024);
        packets = Channel.CreateBounded<AudioPacket>(new BoundedChannelOptions(192)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropWrite,
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
    public string? Error { get; private set; }

    public static AudioPipeCapture CreateSystemLoopback()
    {
        var capture = new WasapiLoopbackCapture();
        return new AudioPipeCapture(capture, "System audio");
    }

    public static AudioPipeCapture CreateDefaultMicrophone()
    {
        using var enumerator = new MMDeviceEnumerator();
        var endpoint = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia);
        var capture = new WasapiCapture(endpoint, useEventSync: true, audioBufferMillisecondsLength: 50);
        return new AudioPipeCapture(capture, "Microphone");
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
        await pipe.DisposeAsync();
        lifetime.Dispose();
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs eventArgs)
    {
        if (eventArgs.BytesRecorded <= 0) return;
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
        try
        {
            await foreach (var packet in packets.Reader.ReadAllAsync(cancellationToken))
            {
                try
                {
                    await pipe.WriteAsync(packet.Buffer.AsMemory(0, packet.Length), cancellationToken);
                }
                finally
                {
                    packet.Return();
                }
            }
            await pipe.FlushAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (IOException error)
        {
            Error = error.Message;
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
