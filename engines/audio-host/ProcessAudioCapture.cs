using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.AudioHost;

internal sealed class ProcessAudioCapture : IDisposable
{
    private readonly WasapiRecorder capture;
    private int stopped;
    private int enabled;
    private Exception? failure;
    public readonly SpscFloatRing Personal = new(AudioConstants.SampleRate * AudioConstants.Channels / 10,
        AudioConstants.SampleRate * AudioConstants.Channels * AudioConstants.LiveQueueMilliseconds / 1_000);
    public readonly SpscFloatRing Clip = new(AudioConstants.SampleRate * AudioConstants.Channels / 10);
    public Exception? Failure => Volatile.Read(ref failure);
    public bool Enabled => Volatile.Read(ref enabled) != 0;

    public ProcessAudioCapture(int processId)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 20348))
            throw new PlatformNotSupportedException("Application capture requires Windows build 20348 or later.");
        var activation = new WasapiRecorderBuilder().WithSharedMode().WithEventSync().WithBufferLength(AudioConstants.LatencyMilliseconds)
            .WithMmcssThreadPriority("Pro Audio")
            .WithFormat(WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.SampleRate, AudioConstants.Channels))
            .WithProcessLoopback((uint)processId, ProcessLoopbackMode.IncludeTargetProcessTree).BuildAsync();
        try { capture = activation.WaitAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult(); }
        catch
        {
            // COM activation cannot be cancelled; a late result must be released.
            _ = activation.ContinueWith(task => { if (task.IsCompletedSuccessfully) task.Result.Dispose(); else _ = task.Exception; }, TaskScheduler.Default);
            throw;
        }
        var floatFormat = capture.WaveFormat.Encoding == WaveFormatEncoding.IeeeFloat
            || capture.WaveFormat is WaveFormatExtensible extensible && extensible.SubFormat == new Guid("00000003-0000-0010-8000-00aa00389b71");
        if (!floatFormat || capture.WaveFormat.SampleRate != AudioConstants.SampleRate || capture.WaveFormat.Channels != AudioConstants.Channels || capture.WaveFormat.BitsPerSample != 32)
        {
            capture.Dispose();
            throw new InvalidOperationException("Process loopback did not negotiate 48 kHz stereo PCM32.");
        }
        capture.DataAvailable += OnDataAvailable;
        capture.RecordingStopped += OnStopped;
    }

    public void Start() => capture.StartRecording();
    public void SetEnabled(bool value) => Volatile.Write(ref enabled, value ? 1 : 0);

    private void OnDataAvailable(ReadOnlySpan<byte> bytes, AudioClientBufferFlags flags, long position, long qpc)
    {
        if (!Enabled) return;
        var silent = (flags & AudioClientBufferFlags.Silent) != 0;
        Personal.WriteFloat32(bytes, silent);
        Clip.WriteFloat32(bytes, silent);
    }

    private void OnStopped(object? sender, StoppedEventArgs args)
    {
        if (Volatile.Read(ref stopped) == 0)
            Volatile.Write(ref failure, args.Exception ?? new InvalidOperationException("Application audio capture stopped."));
    }

    public ISampleProvider PersonalSource => new GatedSource(this, Personal);
    public ISampleProvider ClipSource => new GatedSource(this, Clip);

    public void Dispose()
    {
        if (Interlocked.Exchange(ref stopped, 1) != 0) return;
        SetEnabled(false);
        capture.DataAvailable -= OnDataAvailable;
        capture.RecordingStopped -= OnStopped;
        capture.Dispose();
    }

    private sealed class GatedSource(ProcessAudioCapture owner, SpscFloatRing source) : ISampleProvider
    {
        public WaveFormat WaveFormat => source.WaveFormat;
        public int Read(Span<float> buffer)
        {
            if (owner.Enabled) return source.Read(buffer);
            // Only the consumer discards: preserve the single-reader ring contract.
            source.DiscardBufferedSamples();
            buffer.Clear();
            return buffer.Length;
        }
    }
}

// Control-rate publication; realtime callbacks take one immutable snapshot and
// use preallocated scratch storage, without locks or allocation.
internal sealed class DynamicAudioMixer : ISampleProvider
{
    private ISampleProvider[] sources = [];
    private readonly float[] scratch = new float[AudioConstants.SampleRate * AudioConstants.Channels / 2];
    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.SampleRate, AudioConstants.Channels);
    public void SetSources(IEnumerable<ISampleProvider> next)
    {
        var array = next.ToArray();
        if (array.Length > 32 || array.Any(source => source.WaveFormat.SampleRate != AudioConstants.SampleRate || source.WaveFormat.Channels != AudioConstants.Channels))
            throw new InvalidOperationException("Application mixing requires at most 32 stereo 48 kHz sources.");
        Volatile.Write(ref sources, array);
    }
    public int Read(Span<float> buffer)
    {
        if (buffer.Length > scratch.Length) throw new InvalidOperationException("Audio callback exceeded the bounded mixer buffer.");
        buffer.Clear();
        foreach (var source in Volatile.Read(ref sources))
        {
            var read = source.Read(scratch.AsSpan(0, buffer.Length));
            for (var i = 0; i < read; i++) buffer[i] += scratch[i];
        }
        return buffer.Length;
    }
}
