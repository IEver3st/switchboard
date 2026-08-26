using System.Runtime.InteropServices;
using NAudio.Wave;

namespace Switchboard.AudioHost.Realtime;

internal sealed class RecordedWaveProvider(float[] samples, int sampleCount, float volume) : IWaveProvider
{
    private int position;

    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.ProcessingSampleRate, 1);
    public bool Completed => Volatile.Read(ref position) >= sampleCount;

    public int Read(byte[] buffer, int offset, int count)
    {
        var destination = MemoryMarshal.Cast<byte, float>(buffer.AsSpan(offset, count - count % sizeof(float)));
        var current = Volatile.Read(ref position);
        var available = Math.Min(destination.Length, Math.Max(0, sampleCount - current));
        if (available == 0) return 0;
        samples.AsSpan(current, available).CopyTo(destination);
        for (var index = 0; index < available; index++) destination[index] *= volume;
        Volatile.Write(ref position, current + available);
        return available * sizeof(float);
    }
}
