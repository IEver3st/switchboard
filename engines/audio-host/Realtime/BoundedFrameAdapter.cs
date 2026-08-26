namespace Switchboard.AudioHost.Realtime;

/// <summary>A bounded single-producer/single-consumer float ring.</summary>
internal sealed class BoundedFrameAdapter
{
    private readonly float[] buffer;
    private long readSequence;
    private long writeSequence;

    public BoundedFrameAdapter(int capacity)
    {
        if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
        buffer = new float[capacity];
    }

    public int Capacity => buffer.Length;
    public int Count => checked((int)Math.Min(buffer.Length, Math.Max(0, Volatile.Read(ref writeSequence) - Volatile.Read(ref readSequence))));

    public int Write(ReadOnlySpan<float> samples)
    {
        var write = writeSequence;
        var read = Volatile.Read(ref readSequence);
        var writable = checked((int)Math.Min(samples.Length, buffer.Length - (write - read)));
        for (var index = 0; index < writable; index++) buffer[(write + index) % buffer.Length] = samples[index];
        Volatile.Write(ref writeSequence, write + writable);
        return writable;
    }

    public bool TryWriteSample(float sample)
    {
        var write = writeSequence;
        var read = Volatile.Read(ref readSequence);
        if (write - read >= buffer.Length) return false;
        buffer[write % buffer.Length] = sample;
        Volatile.Write(ref writeSequence, write + 1);
        return true;
    }

    public bool TryReadFrame(Span<float> frame)
    {
        if (frame.Length == 0) return true;
        var read = readSequence;
        var write = Volatile.Read(ref writeSequence);
        if (write - read < frame.Length) return false;
        for (var index = 0; index < frame.Length; index++) frame[index] = buffer[(read + index) % buffer.Length];
        Volatile.Write(ref readSequence, read + frame.Length);
        return true;
    }

    public int Read(Span<float> destination)
    {
        var read = readSequence;
        var write = Volatile.Read(ref writeSequence);
        var readable = checked((int)Math.Min(destination.Length, write - read));
        for (var index = 0; index < readable; index++) destination[index] = buffer[(read + index) % buffer.Length];
        Volatile.Write(ref readSequence, read + readable);
        return readable;
    }

    public void Clear()
    {
        Array.Clear(buffer);
        readSequence = 0;
        writeSequence = 0;
    }
}

