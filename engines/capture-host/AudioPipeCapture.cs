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

    private readonly WasapiRecorder capture;
    private readonly MMDevice? heldEndpoint;
    private readonly IAudioPacketObserver? observer;
    private readonly PcmSampleFormat sampleFormat;
    private NamedPipeServerStream? pipe;
    private readonly Channel<AudioPacket> packets;
    private readonly CancellationTokenSource lifetime = new();
    private Task? writerTask;
    private bool started;
    private int forwardPackets;
    private long droppedPackets;
    private long capturedPackets;
    private long writtenPackets;
    private long capturedBytes;
    private long writtenBytes;
    private AudioPacketTimeline? timeline;

    private AudioPipeCapture(
        WasapiRecorder capture,
        string label,
        MMDevice? heldEndpoint = null,
        IAudioPacketObserver? observer = null)
    {
        this.capture = capture;
        this.heldEndpoint = heldEndpoint;
        this.observer = observer;
        sampleFormat = GetSampleFormat(capture.WaveFormat);
        Label = label;
        PipeName = $"switchboard-capture-{Environment.ProcessId}-{Guid.NewGuid():N}";
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

    public static async Task<AudioPipeCapture> CreateProcessLoopbackAsync(int processId, CancellationToken cancellationToken)
    {
        if (processId <= 0) throw new InvalidOperationException("The capture source has no running process.");
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 20348))
            throw new PlatformNotSupportedException("Game-only audio requires Windows build 20348 or later.");
        var activation = new WasapiRecorderBuilder()
            .WithSharedMode().WithEventSync().WithBufferLength(50)
            .WithProcessLoopback((uint)processId, ProcessLoopbackMode.IncludeTargetProcessTree)
            .BuildAsync();
        WasapiRecorder recorder;
        try { recorder = await activation.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken); }
        catch
        {
            // COM activation cannot be cancelled. Release a late result instead of leaking its client.
            _ = activation.ContinueWith(task => { if (task.Status == TaskStatus.RanToCompletion) task.Result.Dispose();
                else _ = task.Exception; }, TaskScheduler.Default);
            throw;
        }
        return new AudioPipeCapture(recorder, "Game audio only");
    }

    public static AudioPipeCapture CreateLoopbackEndpoint(string endpointId, string label)
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
                .WithLoopbackCapture()
                .Build();
            return new AudioPipeCapture(capture, label, endpoint);
        }
        catch
        {
            endpoint.Dispose();
            throw;
        }
    }

    public static AudioPipeCapture CreateDefaultMicrophone(IAudioPacketObserver? observer = null)
    {
        using var enumerator = new MMDeviceEnumerator();
        var endpoint = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia);
        var capture = new WasapiRecorderBuilder()
            .WithDevice(endpoint)
            .WithSharedMode()
            .WithEventSync()
            .WithBufferLength(50)
            .Build();
        return new AudioPipeCapture(capture, "Microphone", endpoint, observer);
    }

    public static AudioPipeCapture CreateEndpoint(
        string endpointId,
        string label,
        IAudioPacketObserver? observer = null)
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
            return new AudioPipeCapture(capture, label, endpoint, observer);
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
        var output = new NamedPipeServerStream(
            PipeName,
            PipeDirection.Out,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            512 * 1024,
            512 * 1024);
        pipe = output;
        await output.WaitForConnectionAsync(cancellationToken);
        writerTask = WritePacketsAsync(output, lifetime.Token);
        Volatile.Write(ref forwardPackets, 1);
        capture.StartRecording();
        started = true;
    }

    public void SetTimelineOrigin(DateTimeOffset origin)
    {
        var qpcNow = AudioPacketTimeline.QpcNow;
        timeline = new AudioPacketTimeline(qpcNow - (DateTimeOffset.UtcNow - origin).Ticks, SampleRate);
    }

    public Task StartAnalysisOnlyAsync()
    {
        if (started) return Task.CompletedTask;
        capture.StartRecording();
        started = true;
        return Task.CompletedTask;
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
        if (pipe is not null) await pipe.DisposeAsync();
        lifetime.Dispose();
    }

    private void OnDataAvailable(
        ReadOnlySpan<byte> buffer,
        AudioClientBufferFlags flags,
        long devicePosition,
        long qpcPosition)
    {
        if (buffer.IsEmpty) return;
        observer?.Observe(
            buffer,
            (flags & AudioClientBufferFlags.Silent) != 0,
            sampleFormat,
            capture.WaveFormat.Channels,
            capture.WaveFormat.SampleRate);
        if (Volatile.Read(ref forwardPackets) == 0) return;
        Interlocked.Increment(ref capturedPackets);
        Interlocked.Add(ref capturedBytes, buffer.Length);
        var rented = ArrayPool<byte>.Shared.Rent(buffer.Length);
        var destination = rented.AsSpan(0, buffer.Length);
        if ((flags & AudioClientBufferFlags.Silent) != 0) destination.Clear();
        else buffer.CopyTo(destination);
        var framePosition = timeline?.Position(qpcPosition, buffer.Length / capture.WaveFormat.BlockAlign,
            (flags & AudioClientBufferFlags.TimestampError) != 0, AudioPacketTimeline.QpcNow,
            devicePosition, (flags & AudioClientBufferFlags.DataDiscontinuity) != 0) ?? -1;
        var packet = new AudioPacket(rented, buffer.Length, framePosition);
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

    private async Task WritePacketsAsync(NamedPipeServerStream output, CancellationToken cancellationToken)
    {
        var blockAlign = capture.WaveFormat.BlockAlign;
        var writer = new AudioTimelineWriter(output, blockAlign);
        try
        {
            var ready = packets.Reader.WaitToReadAsync(cancellationToken).AsTask();
            while (true)
            {
                try
                {
                    if (!await ready.WaitAsync(TimeSpan.FromMilliseconds(50), cancellationToken)) break;
                }
                catch (TimeoutException)
                {
                    // Loopback may emit no callbacks during silence. Advance at
                    // 50 ms only while connected, with 100 ms callback headroom,
                    // so a long quiet period never creates an hours-long backlog.
                    if (timeline is not null)
                    {
                        var before = writer.WrittenFrames;
                        await writer.WriteAsync(ReadOnlyMemory<byte>.Empty, timeline.SilenceFrame, cancellationToken);
                        Interlocked.Add(ref writtenBytes, (writer.WrittenFrames - before) * blockAlign);
                    }
                    continue;
                }
                while (packets.Reader.TryRead(out var packet))
                {
                    try
                    {
                        var before = writer.WrittenFrames;
                        await writer.WriteAsync(packet.Buffer.AsMemory(0, packet.Length), packet.FramePosition, cancellationToken);
                        Interlocked.Add(ref writtenBytes, (writer.WrittenFrames - before) * blockAlign);
                    }
                    finally
                    {
                        packet.Return();
                        Interlocked.Increment(ref writtenPackets);
                    }
                }
                ready = packets.Reader.WaitToReadAsync(cancellationToken).AsTask();
            }
            await output.FlushAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (IOException error)
        {
            Error = error.Message;
        }
    }

    private static string GetFfmpegSampleFormat(WaveFormat format)
        => GetSampleFormat(format) switch
        {
            PcmSampleFormat.Float32 => "f32le",
            PcmSampleFormat.Signed16 => "s16le",
            PcmSampleFormat.Signed24 => "s24le",
            PcmSampleFormat.Signed32 => "s32le",
            _ => throw new NotSupportedException($"Unsupported {format.BitsPerSample}-bit {format.Encoding} audio format."),
        };

    private static PcmSampleFormat GetSampleFormat(WaveFormat format)
    {
        var isFloat = format.Encoding == WaveFormatEncoding.IeeeFloat
                      || format is WaveFormatExtensible extensible && extensible.SubFormat == IeeeFloatSubFormat;
        if (isFloat && format.BitsPerSample == 32) return PcmSampleFormat.Float32;
        if (format.BitsPerSample == 16) return PcmSampleFormat.Signed16;
        if (format.BitsPerSample == 24) return PcmSampleFormat.Signed24;
        if (format.BitsPerSample == 32) return PcmSampleFormat.Signed32;
        throw new NotSupportedException($"Unsupported {format.BitsPerSample}-bit {format.Encoding} audio format.");
    }

    private sealed record AudioPacket(byte[] Buffer, int Length, long FramePosition)
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
