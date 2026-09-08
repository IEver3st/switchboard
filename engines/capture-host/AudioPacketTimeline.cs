using System.Diagnostics;

namespace Switchboard.CaptureHost;

// WASAPI QPC positions are in 100 ns units, not Stopwatch frequency units.
// Keep this clock on the producer; the pipe writer may run seconds later.
internal sealed class AudioPacketTimeline(long originQpc, int sampleRate)
{
    private long nextFrame;
    private long lastQpc;
    private long nextDeviceFrame = -1;
    private bool hasPackets;

    public long SilenceFrame => Math.Max(0, (long)((QpcNow - originQpc) * (double)sampleRate / TimeSpan.TicksPerSecond) - sampleRate / 10);
    public static long QpcNow => (long)(Stopwatch.GetTimestamp() * (double)TimeSpan.TicksPerSecond / Stopwatch.Frequency);

    public long Position(long qpcPosition, int frames, bool timestampError, long receivedQpc,
        long devicePosition = -1, bool discontinuity = false)
    {
        // Some shared-mode drivers return zero or stale positions without the
        // error flag. Reject impossible clocks before they can create silence
        // far into the future or permanently discard packets as overlaps.
        var invalid = timestampError || qpcPosition <= lastQpc
            || qpcPosition > receivedQpc + TimeSpan.TicksPerMillisecond * 10
            || receivedQpc - qpcPosition > TimeSpan.TicksPerSecond * 2;
        var clockPosition = invalid
            ? Math.Max(nextFrame, ToFrame(receivedQpc) - frames)
            : ToFrame(qpcPosition);
        long position;
        var validDevice = !timestampError && devicePosition >= 0;
        if (hasPackets && validDevice && nextDeviceFrame >= 0 && devicePosition >= nextDeviceFrame
            && devicePosition - nextDeviceFrame <= Math.Max(0, ToFrame(receivedQpc) - nextFrame) + sampleRate / 100)
        {
            // QPC anchors startup to video, but device positions own sample
            // continuity. Re-rounding QPC on every packet inserts zeroes and
            // drops real samples even on a lossless stream (notably Sonar).
            position = nextFrame + devicePosition - nextDeviceFrame;
            // Some virtual devices stop their sample clock during silence.
            // Re-anchor only a reported discontinuity with a substantial gap.
            if (discontinuity && clockPosition - position > sampleRate / 10)
                position = clockPosition;
        }
        else
        {
            // Invalid/reset device clocks use QPC or arrival time to recover.
            // Small timestamp/callback jitter must not splice continuous PCM.
            position = hasPackets && clockPosition - nextFrame <= sampleRate / 10
                ? nextFrame : clockPosition;
        }
        if (!invalid) lastQpc = qpcPosition;
        nextFrame = position + frames;
        nextDeviceFrame = validDevice ? devicePosition + frames : -1;
        hasPackets = true;
        return position;
    }

    private long ToFrame(long qpc) => Math.Max(0,
        (long)Math.Round((qpc - originQpc) * (double)sampleRate / TimeSpan.TicksPerSecond));
}

internal sealed class AudioTimelineWriter(Stream output, int blockAlign)
{
    private readonly byte[] silence = new byte[48 * 1024];
    public long WrittenFrames { get; private set; }

    public async Task WriteAsync(ReadOnlyMemory<byte> packet, long position, CancellationToken cancellationToken)
    {
        if (position < 0) position = WrittenFrames;
        // Missing packets must leave time in the stream, rather than moving all
        // subsequent sound earlier. This also accounts for delayed device startup.
        while (WrittenFrames < position)
        {
            var frames = (int)Math.Min(position - WrittenFrames, silence.Length / blockAlign);
            await output.WriteAsync(silence.AsMemory(0, frames * blockAlign), cancellationToken);
            WrittenFrames += frames;
        }
        var skipFrames = Math.Min(WrittenFrames - position, packet.Length / blockAlign);
        var skip = (int)skipFrames * blockAlign;
        if (skip < packet.Length)
        {
            await output.WriteAsync(packet[skip..], cancellationToken);
            WrittenFrames += (packet.Length - skip) / blockAlign;
        }
    }
}
