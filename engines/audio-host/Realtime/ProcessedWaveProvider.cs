using System.Runtime.InteropServices;
using NAudio.Wave;

namespace Switchboard.AudioHost.Realtime;

internal sealed class ProcessedWaveProvider(BoundedFrameAdapter source) : IWaveProvider
{
    private float volume = 1f;
    private long underruns;

    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.ProcessingSampleRate, 1);
    public long Underruns => Interlocked.Read(ref underruns);

    public void SetVolume(float value) => Volatile.Write(ref volume, Math.Clamp(value, 0f, 1f));

    public int Read(byte[] buffer, int offset, int count)
    {
        var alignedCount = count - count % sizeof(float);
        var destination = MemoryMarshal.Cast<byte, float>(buffer.AsSpan(offset, alignedCount));
        var read = source.Read(destination);
        var gain = Volatile.Read(ref volume);
        for (var index = 0; index < read; index++) destination[index] *= gain;
        if (read < destination.Length)
        {
            destination[read..].Clear();
            Interlocked.Increment(ref underruns);
        }
        if (alignedCount < count) buffer.AsSpan(offset + alignedCount, count - alignedCount).Clear();
        return count;
    }
}

