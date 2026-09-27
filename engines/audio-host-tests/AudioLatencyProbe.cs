using System.Diagnostics;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Switchboard.AudioHost;
using Switchboard.AudioHost.Realtime;
using Switchboard.AudioHost.NoiseSuppression;

internal static class AudioLatencyProbe
{
    // Shared input capture and silent render only. No route/default/volume changes,
    // recorded media, or acoustic latency claim. Compare the same devices in one run.
    public static void Run()
    {
        using var endpoints = new EndpointService();
        var physical = endpoints.List().Where(endpoint => !CableEndpointCatalog.IsVirtual(endpoint)).ToArray();
        var inputEndpoint = physical.Where(endpoint => endpoint.Flow == "capture")
            .OrderByDescending(endpoint => endpoint.InterfaceName == "HyperX QuadCast 2").First();
        var outputEndpoint = physical.Where(endpoint => endpoint.Flow == "render")
            .OrderByDescending(endpoint => endpoint.Name.Contains("WH-1000XM6", StringComparison.OrdinalIgnoreCase)).First();
        using var input = endpoints.Open(inputEndpoint.Id);
        using var output = endpoints.Open(outputEndpoint.Id);
        foreach (var lowLatency in new[] { false, true })
        {
            var callbackIntervals = new FrameTimingMetrics();
            long lastCallback = 0;
            long frames = 0;
            Exception? failure = null;
            var builder = new WasapiRecorderBuilder().WithDevice(input).WithSharedMode().WithEventSync()
                .WithBufferLength(lowLatency ? 10 : 20).WithMmcssThreadPriority("Pro Audio");
            if (lowLatency) builder.WithLowLatency();
            using var capture = builder.Build();
            capture.DataAvailable += (ReadOnlySpan<byte> bytes, AudioClientBufferFlags flags, long position, long qpc) =>
            {
                var now = Stopwatch.GetTimestamp();
                if (lastCallback != 0) callbackIntervals.Record(Stopwatch.GetElapsedTime(lastCallback, now).TotalMilliseconds);
                lastCallback = now;
                frames += bytes.Length / capture.WaveFormat.BlockAlign;
            };
            capture.RecordingStopped += (_, e) => failure = e.Exception;
            var playerBuilder = new WasapiPlayerBuilder().WithDevice(output).WithSharedMode().WithEventSync()
                .WithLatency(lowLatency ? 10 : 20).WithMmcssThreadPriority("Pro Audio");
            if (lowLatency) playerBuilder.WithLowLatency();
            using var player = playerBuilder.Build();
            var silence = new SilentProbeProvider();
            player.PlaybackStopped += (_, e) => failure = e.Exception;
            player.Init(silence);
            capture.StartRecording();
            player.Play();
            Thread.Sleep(2_000);
            player.Stop();
            capture.StopRecording();
            if (failure is not null) throw new Exception("Shared audio latency probe failed", failure);
            if (frames == 0 || silence.Reads == 0) throw new Exception("Shared latency probe received no callbacks");
            Console.WriteLine(JsonSerializer.Serialize(new {
                mode = lowLatency ? "minimum-period" : "baseline-20ms", input = input.FriendlyName,
                output = output.FriendlyName, capture.LowLatencyActive, capture.LatencyMilliseconds,
                capture.LowLatencyUnavailableReason, frames, captureCallbackMs = callbackIntervals.Snapshot(),
                outputLowLatencyActive = player.LowLatencyActive, outputPeriodMs = player.LatencyMilliseconds,
                outputFallback = player.LowLatencyUnavailableReason, outputReads = silence.Reads,
                largestOutputRequestMs = silence.MaximumFrames * 1_000d / 48_000
            }));
        }
        RunPipeline(inputEndpoint.Id, outputEndpoint.Id);
        // A resampling route must still work when IAudioClient3 cannot be used.
        using var client = output.CreateAudioClient();
        using var fallback = new WasapiPlayerBuilder().WithDevice(output).WithSharedMode().WithEventSync()
            .WithLatency(AudioConstants.LatencyMilliseconds).WithLowLatency().Build();
        var mismatched = new SilentProbeProvider(client.MixFormat.SampleRate == 48_000 ? 44_100 : 48_000);
        fallback.Init(mismatched);
        if (fallback.LowLatencyActive || fallback.LowLatencyUnavailableReason is null)
            throw new Exception("A sample-rate mismatch did not fall back to standard shared mode");
        fallback.Play();
        Thread.Sleep(250);
        fallback.Stop();
        if (mismatched.Reads == 0) throw new Exception("Fallback playback did not render");
        Console.WriteLine(JsonSerializer.Serialize(new { fallback = "passed", reason = fallback.LowLatencyUnavailableReason }));
    }

    private static void RunPipeline(string inputId, string outputId)
    {
        var settings = new AudioHostSettings {
            Enabled = true, MonitoringEnabled = true, Monitoring = 0, MonitoringDeviceId = outputId,
            Buses = [new AudioBusConfiguration { Id = "mic", DeviceId = inputId }]
        };
        var config = new MicrophoneDspConfiguration(1, new(true, 45), new(true, -54, 4, 220), new(true, 0),
            new(true, [new(true, "bell", 2_800, 2, 1)]), new(true, -18, 2, 18, 200, 1.5f), new(true, -1, 90));
        using var suppressor = new RnnoiseNoiseSuppressor();
        if (!suppressor.Initialize(new(AppContext.BaseDirectory, Path.GetTempPath()))) throw new Exception("RNNoise unavailable");
        using var pipeline = new MicrophonePipeline(suppressor, settings, config);
        pipeline.Start();
        foreach (var phase in new[] { "suppression", "bypass", "monitor-restart", "suppression-restored" })
        {
            if (phase == "bypass") config = config with { Version = 2, NoiseSuppression = new(false, 45) };
            if (phase == "monitor-restart")
            {
                pipeline.UpdateConfiguration(new AudioHostSettings { Enabled = true, MonitoringEnabled = false,
                    Monitoring = 0, MonitoringDeviceId = outputId, Buses = settings.Buses }, config);
                if (pipeline.MonitoringDeviceId is not null) throw new Exception("Disabled monitor retained its endpoint");
            }
            if (phase == "suppression-restored") config = config with { Version = 3, NoiseSuppression = new(true, 45) };
            pipeline.UpdateConfiguration(settings, config);
            Thread.Sleep(1_500);
            if (pipeline.LastError is not null || pipeline.CaptureStopped || pipeline.SuppressionBypassed
                || pipeline.CaptureOverruns != 0 || pipeline.DroppedOrBypassedFrames != 0)
                throw new Exception($"Microphone lifecycle failed in {phase}: {pipeline.LastError}");
            Console.WriteLine(JsonSerializer.Serialize(new { phase, pipeline.CaptureLowLatencyActive,
                pipeline.CaptureLatencyMilliseconds, pipeline.MonitoringLowLatencyActive, pipeline.MonitoringLatencyMilliseconds,
                pipeline.DspMultimediaSchedulingActive, pipeline.CaptureOverruns, pipeline.MonitorOverruns,
                pipeline.MonitorUnderruns, pipeline.MonitorDiscardedSamples, dsp = pipeline.FrameTimings }));
        }
        pipeline.Dispose();
        pipeline.Dispose();
    }

    private sealed class SilentProbeProvider(int sampleRate = 48_000) : IWaveProvider
    {
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(sampleRate, 2);
        public long Reads;
        public int MaximumFrames;
        public int Read(Span<byte> buffer)
        {
            buffer.Clear();
            MaximumFrames = Math.Max(MaximumFrames, buffer.Length / WaveFormat.BlockAlign);
            Interlocked.Increment(ref Reads);
            return buffer.Length;
        }
    }
}
