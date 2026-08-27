using NAudio.Wave;

namespace Switchboard.AudioHost.Realtime;

internal sealed class CaptureSampleConverter
{
    private static readonly Guid PcmSubFormat = new("00000001-0000-0010-8000-00aa00389b71");
    private static readonly Guid FloatSubFormat = new("00000003-0000-0010-8000-00aa00389b71");
    private readonly int sampleRate;
    private readonly int channels;
    private readonly int bitsPerSample;
    private readonly int bytesPerSample;
    private readonly bool isFloat;
    private readonly double outputStep;
    private long inputIndex;
    private double nextOutputPosition;
    private float previousSample;
    private bool hasPreviousSample;

    public CaptureSampleConverter(WaveFormat format)
    {
        sampleRate = format.SampleRate;
        channels = format.Channels;
        bitsPerSample = format.BitsPerSample;
        bytesPerSample = bitsPerSample / 8;
        var extensible = format as WaveFormatExtensible;
        isFloat = format.Encoding == WaveFormatEncoding.IeeeFloat || extensible?.SubFormat == FloatSubFormat;
        var isPcm = format.Encoding == WaveFormatEncoding.Pcm || extensible?.SubFormat == PcmSubFormat;
        if (sampleRate <= 0 || channels <= 0) throw new NotSupportedException("The microphone format is invalid.");
        if (!(isFloat && bitsPerSample == 32) && !(isPcm && bitsPerSample is 16 or 24 or 32))
            throw new NotSupportedException($"Unsupported microphone format: {format.Encoding}, {bitsPerSample}-bit.");
        outputStep = sampleRate / (double)AudioConstants.ProcessingSampleRate;
    }

    public int InputSampleRate => sampleRate;
    public int Channels => channels;
    public string Description => $"{sampleRate} Hz {bitsPerSample}-bit {(isFloat ? "float" : "PCM")} {channels}ch";

    public int ConvertAndWrite(
        ReadOnlySpan<byte> source,
        BoundedFrameAdapter destination,
        out int droppedSamples,
        bool silent = false)
    {
        var blockAlign = bytesPerSample * channels;
        var frameCount = source.Length / blockAlign;
        var written = 0;
        droppedSamples = 0;
        for (var frame = 0; frame < frameCount; frame++)
        {
            var offset = frame * blockAlign;
            var sum = 0f;
            if (!silent)
            {
                for (var channel = 0; channel < channels; channel++)
                    sum += ReadSample(source, offset + channel * bytesPerSample);
            }
            var current = Math.Clamp(sum / channels, -1f, 1f);

            if (sampleRate == AudioConstants.ProcessingSampleRate)
            {
                if (destination.TryWriteSample(current)) written++;
                else droppedSamples++;
                continue;
            }

            if (!hasPreviousSample)
            {
                previousSample = current;
                hasPreviousSample = true;
                inputIndex = 0;
                nextOutputPosition = 0;
            }

            while (nextOutputPosition <= inputIndex)
            {
                var fraction = inputIndex == 0 ? 1d : nextOutputPosition - (inputIndex - 1d);
                var output = inputIndex == 0
                    ? current
                    : previousSample + (current - previousSample) * (float)Math.Clamp(fraction, 0d, 1d);
                if (destination.TryWriteSample(output)) written++;
                else droppedSamples++;
                nextOutputPosition += outputStep;
            }
            previousSample = current;
            inputIndex++;
        }
        return written;
    }

    private float ReadSample(ReadOnlySpan<byte> source, int offset)
    {
        if (isFloat) return BitConverter.Int32BitsToSingle(ReadInt32(source, offset));
        return bitsPerSample switch
        {
            16 => (short)(source[offset] | source[offset + 1] << 8) / 32768f,
            24 => ReadInt24(source, offset) / 8_388_608f,
            32 => ReadInt32(source, offset) / 2_147_483_648f,
            _ => 0f,
        };
    }

    private static int ReadInt24(ReadOnlySpan<byte> source, int offset)
    {
        var value = source[offset] | source[offset + 1] << 8 | source[offset + 2] << 16;
        return (value & 0x800000) != 0 ? value | unchecked((int)0xff000000) : value;
    }

    private static int ReadInt32(ReadOnlySpan<byte> source, int offset) =>
        source[offset] | source[offset + 1] << 8 | source[offset + 2] << 16 | source[offset + 3] << 24;
}
