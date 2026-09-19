using System.Buffers.Binary;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Switchboard.CaptureHost;

internal sealed record AudioSyncProfile(int AdvanceMs, string MicrophoneDeviceId, string OutputDeviceId, string MeasuredAt);
internal sealed record AudioSyncMeasurement(AudioSyncProfile Profile, int SpreadMs, int MatchedPulses);

// A bounded, on-demand acoustic measurement. No audio is written to disk or IPC.
internal static class AudioSyncCalibration
{
    internal const int DurationMs = 11_000;
    internal static readonly int[] PulseStarts = [1200, 2900, 4700, 6600, 8400];

    public static async Task RunCommandAsync()
    {
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        try
        {
            var line = await Console.In.ReadLineAsync() ?? throw new InvalidOperationException("Calibration settings are required.");
            if (line.Length > 4096) throw new InvalidOperationException("Invalid calibration settings.");
            var request = JsonSerializer.Deserialize<CalibrationRequest>(line, json)
                ?? throw new InvalidOperationException("Invalid calibration settings.");
            if (request.MicrophoneDeviceId is { Length: > 512 } || request.OutputDeviceId is { Length: > 512 })
                throw new InvalidOperationException("Invalid audio endpoint.");
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(18));
            // EOF is cancellation too, so a closed owner never leaves a test playing.
            _ = Task.Run(async () => { await Console.In.ReadLineAsync(); await timeout.CancelAsync(); });
            var result = await MeasureAsync(request, timeout.Token);
            Console.WriteLine(JsonSerializer.Serialize(result, json));
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error is OperationCanceledException ? "Calibration cancelled or timed out." : error.Message);
            Environment.ExitCode = 1;
        }
    }

    private sealed record CalibrationRequest(string? MicrophoneDeviceId, string? OutputDeviceId);

    private static async Task<AudioSyncMeasurement> MeasureAsync(CalibrationRequest request, CancellationToken token)
    {
        using var devices = new MMDeviceEnumerator();
        using var mic = request.MicrophoneDeviceId is { Length: > 0 } inputId
            ? devices.GetDevice(inputId) : devices.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia);
        using var output = request.OutputDeviceId is { Length: > 0 } outputId
            ? devices.GetDevice(outputId) : devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        if (mic.DataFlow != DataFlow.Capture || output.DataFlow != DataFlow.Render)
            throw new InvalidOperationException("Choose a microphone input and a playback output.");
        using var loopback = new WasapiRecorderBuilder().WithDevice(output).WithSharedMode().WithEventSync()
            .WithBufferLength(50).WithLoopbackCapture().Build();
        using var microphone = new WasapiRecorderBuilder().WithDevice(mic).WithSharedMode().WithEventSync()
            .WithBufferLength(50).Build();
        using var player = new WasapiPlayerBuilder().WithDevice(output).WithSharedMode().WithEventSync().WithLatency(50).Build();
        var origin = AudioPacketTimeline.QpcNow;
        var reference = new Envelope(loopback.WaveFormat, origin);
        var recorded = new Envelope(microphone.WaveFormat, origin);
        loopback.DataAvailable += reference.Observe;
        microphone.DataAvailable += recorded.Observe;
        Exception? deviceError = null;
        var referenceStopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var microphoneStopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        loopback.RecordingStopped += (_, e) => { if (e.Exception is not null) deviceError = e.Exception; referenceStopped.TrySetResult(); };
        microphone.RecordingStopped += (_, e) => { if (e.Exception is not null) deviceError = e.Exception; microphoneStopped.TrySetResult(); };
        player.PlaybackStopped += (_, e) => { if (e.Exception is not null) deviceError = e.Exception; };
        player.Init(new CalibrationTone());
        try
        {
            loopback.StartRecording();
            microphone.StartRecording();
            player.Play();
            await Task.Delay(DurationMs, token);
        }
        finally { player.Stop(); microphone.StopRecording(); loopback.StopRecording(); }
        await Task.WhenAll(referenceStopped.Task, microphoneStopped.Task).WaitAsync(TimeSpan.FromSeconds(2), token);
        token.ThrowIfCancellationRequested();
        if (request.MicrophoneDeviceId is null)
        {
            using var current = devices.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Multimedia);
            if (current.ID != mic.ID) throw new InvalidOperationException("The default microphone changed. Calibrate again.");
        }
        if (request.OutputDeviceId is null)
        {
            using var current = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            if (current.ID != output.ID) throw new InvalidOperationException("The default playback device changed. Calibrate again.");
        }
        if (deviceError is not null) throw new InvalidOperationException("An audio device disconnected during calibration.", deviceError);
        if (reference.Invalid || recorded.Invalid)
            throw new InvalidOperationException("Audio timing was interrupted. Reconnect the devices and retry.");
        var (advance, spread, count) = Analyze(reference.Values, recorded.Values);
        return new(new(advance, mic.ID, output.ID, DateTimeOffset.UtcNow.ToString("O")), spread, count);
    }

    // Compare short RMS envelopes, not carrier phase, so resampling and EQ do not
    // masquerade as latency. Require repeatable, unambiguous acoustic matches.
    internal static (int AdvanceMs, int SpreadMs, int Count) Analyze(double[] reference, double[] microphone)
    {
        var delays = new List<int>();
        foreach (var expected in PulseStarts)
        {
            var start = Math.Max(0, expected - 100);
            var stop = Math.Min(reference.Length - 350, expected + 600);
            var peak = start;
            for (var i = start; i < stop; i++) if (reference[i] > reference[peak]) peak = i;
            if (reference[peak] < 0.002) continue;
            start = Math.Max(0, peak - 300);
            const int width = 600;
            if (start + width + 1200 >= microphone.Length || start + width >= reference.Length) continue;
            var scores = new double[1201];
            var best = 0;
            for (var lag = 0; lag <= 1200; lag++)
            {
                double dot = 0, a = 0, b = 0, level = 0;
                for (var i = 0; i < width; i++)
                {
                    var x = reference[start + i]; var y = microphone[start + i + lag];
                    dot += x * y; a += x * x; b += y * y; level = Math.Max(level, y);
                }
                scores[lag] = level < 0.0005 || a * b <= 1e-16 ? 0 : dot / Math.Sqrt(a * b);
                if (scores[lag] > scores[best]) best = lag;
            }
            var alternative = scores.Where((_, i) => Math.Abs(i - best) > 50).DefaultIfEmpty(0).Max();
            if (scores[best] >= 0.75 && scores[best] - alternative >= 0.08 && best < 1195) delays.Add(best);
        }
        if (delays.Count < 4)
            throw new InvalidOperationException("Could not hear the test clearly. Pause other audio, hold one earcup close to the microphone, and retry. Sonar noise removal may suppress the test.");
        delays.Sort();
        var spread = delays[^1] - delays[0];
        if (spread > 20) throw new InvalidOperationException("The delay varied during the test. Keep the earcup still and retry; no correction was changed.");
        return (delays[delays.Count / 2], spread, delays.Count);
    }

    private sealed class Envelope
    {
        private readonly WaveFormat format;
        private readonly AudioPacketTimeline timeline;
        private readonly bool floating;
        public double[] Values { get; } = new double[DurationMs + 2000];
        public bool Invalid { get; private set; }
        public Envelope(WaveFormat format, long origin)
        {
            this.format = format;
            floating = format.Encoding == WaveFormatEncoding.IeeeFloat
                || format is WaveFormatExtensible ext && ext.SubFormat == new Guid("00000003-0000-0010-8000-00aa00389b71");
            if (format.BitsPerSample is not (16 or 24 or 32)) throw new NotSupportedException("Unsupported calibration audio format.");
            timeline = new(origin, format.SampleRate);
        }
        public void Observe(ReadOnlySpan<byte> data, AudioClientBufferFlags flags, long device, long qpc)
        {
            var frames = data.Length / format.BlockAlign;
            var badClock = (flags & AudioClientBufferFlags.TimestampError) != 0;
            if (badClock) Invalid = true;
            var first = timeline.Position(qpc, frames, badClock, AudioPacketTimeline.QpcNow, device,
                (flags & AudioClientBufferFlags.DataDiscontinuity) != 0);
            if ((flags & AudioClientBufferFlags.Silent) != 0) return;
            for (var frame = 0; frame < frames; frame++)
            {
                var ms = (int)((first + frame) * 1000 / format.SampleRate);
                if (ms < 0 || ms >= Values.Length) continue;
                double energy = 0;
                for (var channel = 0; channel < format.Channels; channel++)
                {
                    var bytes = data.Slice(frame * format.BlockAlign + channel * format.BitsPerSample / 8);
                    double sample = format.BitsPerSample switch
                    {
                        16 => BinaryPrimitives.ReadInt16LittleEndian(bytes) / 32768d,
                        24 => ((bytes[0] | bytes[1] << 8 | bytes[2] << 16) << 8 >> 8) / 8388608d,
                        _ when floating => BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes)),
                        _ => BinaryPrimitives.ReadInt32LittleEndian(bytes) / 2147483648d,
                    };
                    if (!double.IsFinite(sample)) { Invalid = true; continue; }
                    energy += sample * sample;
                }
                Values[ms] += energy / format.Channels * 1000 / format.SampleRate;
            }
        }
    }

    private sealed class CalibrationTone : IWaveProvider
    {
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
        private long position;
        public int Read(byte[] buffer, int offset, int count)
            => Read(buffer.AsSpan(offset, count));
        public int Read(Span<byte> buffer)
        {
            var frames = Math.Min(buffer.Length / 8, Math.Max(0, DurationMs * 48 - (int)position));
            for (var frame = 0; frame < frames; frame++, position++)
            {
                var ms = position / 48d;
                double value = 0;
                foreach (var start in PulseStarts)
                {
                    var t = (ms - start) / 1000;
                    if (t is < 0 or >= 0.18) continue;
                    var envelope = Math.Pow(Math.Sin(Math.PI * t / 0.18), 2) * (0.55 + 0.45 * Math.Sin(2 * Math.PI * 23 * t));
                    value = 0.18 * envelope * Math.Sin(2 * Math.PI * (700 * t + 3500 * t * t));
                }
                var bits = BitConverter.SingleToInt32Bits((float)value);
                BinaryPrimitives.WriteInt32LittleEndian(buffer[(frame * 8)..], bits);
                BinaryPrimitives.WriteInt32LittleEndian(buffer[(frame * 8 + 4)..], bits);
            }
            return frames * 8;
        }
    }
}
