using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.AudioHost;

// A fixed-capacity single-producer/single-consumer ring. Capture callbacks only copy
// into preallocated storage; playback callbacks only copy out and zero-fill underruns.
internal sealed class SpscFloatRing : ISampleProvider
{
    private readonly float[] samples;
    private long readSequence;
    private long writeSequence;
    private long droppedSamples;

    public SpscFloatRing(int capacitySamples)
    {
        if (capacitySamples <= 0) throw new ArgumentOutOfRangeException(nameof(capacitySamples));
        samples = new float[capacitySamples];
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.SampleRate, AudioConstants.Channels);
    }

    public WaveFormat WaveFormat { get; }
    public long DroppedSamples => Volatile.Read(ref droppedSamples);

    public void WriteFloat32(byte[] source, int byteCount)
    {
        var incoming = Math.Min(byteCount / sizeof(float), samples.Length);
        if (incoming <= 0) return;
        var write = Volatile.Read(ref writeSequence);
        var read = Volatile.Read(ref readSequence);
        var free = samples.Length - Math.Min(samples.Length, checked((int)(write - read)));
        var accepted = Math.Min(incoming, free);
        if (accepted <= 0)
        {
            Interlocked.Add(ref droppedSamples, incoming);
            return;
        }

        var destination = checked((int)(write % samples.Length));
        var first = Math.Min(accepted, samples.Length - destination);
        Buffer.BlockCopy(source, 0, samples, destination * sizeof(float), first * sizeof(float));
        var second = accepted - first;
        if (second > 0) Buffer.BlockCopy(source, first * sizeof(float), samples, 0, second * sizeof(float));
        Volatile.Write(ref writeSequence, write + accepted);
        if (accepted < incoming) Interlocked.Add(ref droppedSamples, incoming - accepted);
    }

    public void WriteMono(ReadOnlySpan<float> source)
    {
        var incoming = Math.Min(source.Length * AudioConstants.Channels, samples.Length);
        if (incoming <= 0) return;
        var write = Volatile.Read(ref writeSequence);
        var read = Volatile.Read(ref readSequence);
        var free = samples.Length - Math.Min(samples.Length, checked((int)(write - read)));
        var accepted = Math.Min(incoming, free) & ~1;
        for (var output = 0; output < accepted; output += 2)
        {
            var sample = source[output / 2];
            samples[checked((int)((write + output) % samples.Length))] = sample;
            samples[checked((int)((write + output + 1) % samples.Length))] = sample;
        }
        Volatile.Write(ref writeSequence, write + accepted);
        if (accepted < incoming) Interlocked.Add(ref droppedSamples, incoming - accepted);
    }

    public int Read(float[] buffer, int offset, int count)
    {
        var read = Volatile.Read(ref readSequence);
        var write = Volatile.Read(ref writeSequence);
        var available = Math.Min(count, checked((int)Math.Min(samples.Length, write - read)));
        var source = checked((int)(read % samples.Length));
        var first = Math.Min(available, samples.Length - source);
        if (first > 0) Array.Copy(samples, source, buffer, offset, first);
        var second = available - first;
        if (second > 0) Array.Copy(samples, 0, buffer, offset + first, second);
        if (available < count) Array.Clear(buffer, offset + available, count - available);
        Volatile.Write(ref readSequence, read + available);
        return count;
    }
}

internal sealed class SilentSampleProvider : ISampleProvider
{
    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(
        AudioConstants.SampleRate,
        AudioConstants.Channels);

    public int Read(float[] buffer, int offset, int count)
    {
        Array.Clear(buffer, offset, count);
        return count;
    }
}

internal sealed class CaptureFanOut : IDisposable
{
    private readonly WasapiCapture capture;
    private readonly SpscFloatRing[] destinations;
    private int stopping;

    public CaptureFanOut(MMDevice device, bool loopback, params SpscFloatRing[] destinations)
    {
        this.destinations = destinations;
        capture = loopback ? new WasapiLoopbackCapture(device) : new WasapiCapture(device, true, AudioConstants.LatencyMilliseconds);
        capture.WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.SampleRate, AudioConstants.Channels);
        capture.DataAvailable += OnDataAvailable;
        capture.RecordingStopped += OnRecordingStopped;
    }

    public event Action<Exception>? Failed;
    public void Start() => capture.StartRecording();

    private void OnDataAvailable(object? sender, WaveInEventArgs eventArgs)
    {
        for (var index = 0; index < destinations.Length; index++)
        {
            destinations[index].WriteFloat32(eventArgs.Buffer, eventArgs.BytesRecorded);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs eventArgs)
    {
        if (eventArgs.Exception is not null && Volatile.Read(ref stopping) == 0) Failed?.Invoke(eventArgs.Exception);
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref stopping, 1) != 0) return;
        capture.DataAvailable -= OnDataAvailable;
        capture.RecordingStopped -= OnRecordingStopped;
        capture.Dispose();
    }
}

internal sealed class ProcessedSampleProvider : ISampleProvider
{
    private readonly ISampleProvider source;
    private readonly RoutingBusProcessor processor;
    private readonly RealtimeMeter? meter;

    public ProcessedSampleProvider(
        ISampleProvider source,
        RoutingBusProcessor processor,
        RealtimeMeter? meter = null)
    {
        this.source = source;
        this.processor = processor;
        this.meter = meter;
    }

    public WaveFormat WaveFormat => source.WaveFormat;

    public int Read(float[] buffer, int offset, int count)
    {
        var read = source.Read(buffer, offset, count);
        var span = buffer.AsSpan(offset, read);
        processor.Process(span);
        meter?.Observe(span);
        return read;
    }
}

internal sealed class FixedMixer : ISampleProvider
{
    private const int MaximumCallbackSamples = AudioConstants.SampleRate * AudioConstants.Channels / 2;
    private readonly ISampleProvider[] sources;
    private readonly float[] scratch = new float[MaximumCallbackSamples];

    public FixedMixer(IEnumerable<ISampleProvider> sources)
    {
        this.sources = sources.ToArray();
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.SampleRate, AudioConstants.Channels);
        if (this.sources.Any(source => source.WaveFormat.SampleRate != WaveFormat.SampleRate || source.WaveFormat.Channels != WaveFormat.Channels))
            throw new ArgumentException("Every mixer source must be 48 kHz stereo.", nameof(sources));
    }

    public WaveFormat WaveFormat { get; }

    public int Read(float[] buffer, int offset, int count)
    {
        if (count > scratch.Length) throw new InvalidOperationException("WASAPI requested an unexpectedly large audio buffer.");
        Array.Clear(buffer, offset, count);
        for (var sourceIndex = 0; sourceIndex < sources.Length; sourceIndex++)
        {
            var read = sources[sourceIndex].Read(scratch, 0, count);
            for (var sample = 0; sample < read; sample++) buffer[offset + sample] += scratch[sample];
        }
        for (var sample = 0; sample < count; sample++) buffer[offset + sample] = Math.Clamp(buffer[offset + sample], -0.999f, 0.999f);
        return count;
    }
}

internal sealed class FloatWaveProvider : IWaveProvider
{
    private const int MaximumCallbackSamples = AudioConstants.SampleRate * AudioConstants.Channels / 2;
    private readonly ISampleProvider source;
    private readonly float[] scratch = new float[MaximumCallbackSamples];

    public FloatWaveProvider(ISampleProvider source) => this.source = source;
    public WaveFormat WaveFormat => source.WaveFormat;

    public int Read(byte[] buffer, int offset, int count)
    {
        var requested = count / sizeof(float);
        if (requested > scratch.Length) throw new InvalidOperationException("WASAPI requested an unexpectedly large audio buffer.");
        var read = source.Read(scratch, 0, requested);
        Buffer.BlockCopy(scratch, 0, buffer, offset, read * sizeof(float));
        return read * sizeof(float);
    }
}

internal sealed class RealtimeMeter
{
    private float level;
    private float peak;
    private int clipping;

    public void Observe(ReadOnlySpan<float> samples)
    {
        if (samples.IsEmpty)
        {
            Volatile.Write(ref level, 0f);
            Volatile.Write(ref peak, 0f);
            Volatile.Write(ref clipping, 0);
            return;
        }
        double sum = 0;
        var maximum = 0f;
        for (var index = 0; index < samples.Length; index++)
        {
            var magnitude = MathF.Abs(samples[index]);
            maximum = Math.Max(maximum, magnitude);
            sum += samples[index] * samples[index];
        }
        Volatile.Write(ref level, Math.Clamp((float)Math.Sqrt(sum / samples.Length), 0f, 1f));
        Volatile.Write(ref peak, Math.Clamp(maximum, 0f, 1f));
        Volatile.Write(ref clipping, maximum >= 0.985f ? 1 : 0);
    }

    public MeterValue Snapshot() => new(
        Volatile.Read(ref level),
        Volatile.Read(ref peak),
        Volatile.Read(ref clipping) != 0);
}

internal sealed class AudioOutput : IDisposable
{
    private readonly WasapiOut output;
    private int disposed;

    public AudioOutput(MMDevice endpoint, ISampleProvider source)
    {
        output = new WasapiOut(endpoint, AudioClientShareMode.Shared, true, AudioConstants.LatencyMilliseconds);
        output.Init(new FloatWaveProvider(source));
        output.PlaybackStopped += OnPlaybackStopped;
    }

    public event Action<Exception>? Failed;
    public void Start() => output.Play();

    private void OnPlaybackStopped(object? sender, StoppedEventArgs eventArgs)
    {
        if (eventArgs.Exception is not null && Volatile.Read(ref disposed) == 0) Failed?.Invoke(eventArgs.Exception);
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        output.PlaybackStopped -= OnPlaybackStopped;
        output.Dispose();
    }
}
