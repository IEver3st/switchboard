using System.Runtime.InteropServices;
using NAudio.Wave;

namespace Switchboard.AudioHost.Realtime;

internal sealed class ProcessedWaveProvider(BoundedFrameAdapter source) : IWaveProvider
{
    private const int PrimeSamples = AudioConstants.ProcessingSampleRate * AudioConstants.LivePrimeMilliseconds / 1_000;
    private const int MaximumSamples = AudioConstants.ProcessingSampleRate * AudioConstants.LiveQueueMilliseconds / 1_000;
    private float volume = 1f;
    private long underruns;
    private long discardedSamples;
    // Consumer-owned jitter-buffer state; see AudioConstants.LivePrimeMilliseconds.
    private bool primed;

    public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(AudioConstants.ProcessingSampleRate, 1);
    public long Underruns => Interlocked.Read(ref underruns);
    public long DiscardedSamples => Interlocked.Read(ref discardedSamples);

    public void SetVolume(float value) => Volatile.Write(ref volume, Math.Clamp(value, 0f, 1f));

    public int Read(Span<byte> buffer)
    {
        var count = buffer.Length;
        var alignedCount = count - count % sizeof(float);
        var destination = MemoryMarshal.Cast<byte, float>(buffer[..alignedCount]);
        var read = 0;
        if (!destination.IsEmpty)
        {
            var prime = Math.Max(PrimeSamples, destination.Length);
            if (!primed && source.Count >= prime) primed = true;
            if (primed)
            {
                if (source.Count > Math.Max(MaximumSamples, prime + destination.Length))
                {
                    var skipped = source.DiscardOldestExcept(prime);
                    if (skipped > 0) Interlocked.Add(ref discardedSamples, skipped);
                }
                read = source.Read(destination);
                if (read < destination.Length)
                {
                    primed = false;
                    Interlocked.Increment(ref underruns);
                }
            }
        }
        var gain = Volatile.Read(ref volume);
        for (var index = 0; index < read; index++) destination[index] *= gain;
        if (read < destination.Length) destination[read..].Clear();
        if (alignedCount < count) buffer[alignedCount..].Clear();
        return count;
    }
}
