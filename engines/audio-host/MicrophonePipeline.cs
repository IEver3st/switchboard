using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Switchboard.AudioHost.NoiseSuppression;
using Switchboard.AudioHost.Realtime;

namespace Switchboard.AudioHost;

internal sealed class MicrophonePipeline : IDisposable
{
    private const int RepeatedFailureLimit = 3;
    private const int TestSampleCount = AudioConstants.ProcessingSampleRate * 2;
    private const int CaptureBacklogFrames = 4;
    private const int OutputBacklogFrames = 8;
    private readonly INoiseSuppressor suppressor;
    private readonly AudioGraph graph;
    private readonly BoundedFrameAdapter captureFrames;
    private readonly BoundedFrameAdapter processedSamples;
    private readonly SpscFloatRing virtualMicrophoneSamples;
    private readonly SpscFloatRing streamMicrophoneSamples;
    private readonly SpscFloatRing clipMicrophoneSamples;
    private readonly AutoResetEvent samplesAvailable = new(false);
    private readonly FrameTimingMetrics frameTimings = new();
    private readonly FrameTimingMetrics callbackTimings = new();
    private readonly MMDeviceEnumerator enumerator = new();
    private readonly WasapiRecorder capture;
    private readonly CaptureSampleConverter converter;
    private readonly float[] frame;
    private readonly float[] dryFrame;
    private readonly float[] testSamples = new float[TestSampleCount];
    private readonly Thread processingThread;
    private MicrophoneDspConfiguration configuration;
    private WasapiPlayer? monitorOutput;
    private ProcessedWaveProvider? monitorProvider;
    private volatile bool stopping;
    private volatile bool captureStopped;
    private string? lastError;
    private long captureOverruns;
    private long outputOverruns;
    private long bypassedFrames;
    private long recoveries;
    private int consecutiveFailures;
    private int consecutiveDeadlineMisses;
    private volatile bool suppressionBypassed;
    private int testState;
    private int testPosition;
    private string testOutputDeviceId = string.Empty;
    private float testOutputVolume;
    private float meterLevel;
    private float meterPeak;
    private float localSnr = float.NaN;

    public MicrophonePipeline(
        INoiseSuppressor suppressor,
        AudioHostSettings settings,
        MicrophoneDspConfiguration configuration)
    {
        this.suppressor = suppressor;
        this.configuration = configuration;
        graph = new AudioGraph(suppressor);
        captureFrames = new BoundedFrameAdapter(suppressor.FrameLength * CaptureBacklogFrames);
        processedSamples = new BoundedFrameAdapter(suppressor.FrameLength * OutputBacklogFrames);
        virtualMicrophoneSamples = new SpscFloatRing(suppressor.FrameLength * OutputBacklogFrames * AudioConstants.Channels);
        streamMicrophoneSamples = new SpscFloatRing(suppressor.FrameLength * OutputBacklogFrames * AudioConstants.Channels);
        clipMicrophoneSamples = new SpscFloatRing(suppressor.FrameLength * OutputBacklogFrames * AudioConstants.Channels);
        frame = new float[suppressor.FrameLength];
        dryFrame = new float[suppressor.FrameLength];
        var inputId = settings.MicrophoneBus?.DeviceId;
        if (string.IsNullOrWhiteSpace(inputId)) throw new InvalidOperationException("No physical microphone is selected.");
        InputDeviceId = inputId;
        var inputDevice = enumerator.GetDevice(inputId);
        if (inputDevice.State != DeviceState.Active) throw new InvalidOperationException("The selected microphone is not available.");
        capture = new WasapiRecorderBuilder()
            .WithDevice(inputDevice)
            .WithSharedMode()
            .WithEventSync()
            .WithBufferLength(20)
            .Build();
        converter = new CaptureSampleConverter(capture.WaveFormat);
        InputFormat = converter.Description;
        InputSampleRate = converter.InputSampleRate;
        capture.DataAvailable += OnDataAvailable;
        capture.RecordingStopped += OnRecordingStopped;
        processingThread = new Thread(ProcessFrames)
        {
            IsBackground = true,
            Name = "Switchboard microphone DSP",
            Priority = ThreadPriority.AboveNormal,
        };
        ConfigureMonitoring(settings);
    }

    public string InputDeviceId { get; }
    public string InputFormat { get; }
    public int InputSampleRate { get; }
    public string? MonitoringDeviceId { get; private set; }
    public bool CaptureStopped => captureStopped;
    public string? LastError => Volatile.Read(ref lastError) ?? suppressor.LastError;
    public float MeterLevel => Volatile.Read(ref meterLevel);
    public float MeterPeak => Volatile.Read(ref meterPeak);
    public long CaptureOverruns => Interlocked.Read(ref captureOverruns);
    public long MonitorOverruns => Interlocked.Read(ref outputOverruns);
    public long MonitorUnderruns => monitorProvider?.Underruns ?? 0;
    public long DroppedOrBypassedFrames => Interlocked.Read(ref bypassedFrames);
    public long RecoveryCount => Interlocked.Read(ref recoveries);
    public float LocalSnr => Volatile.Read(ref localSnr);
    public bool SuppressionBypassed => suppressionBypassed;
    public bool CanRunMicrophoneTest => !string.IsNullOrWhiteSpace(Volatile.Read(ref testOutputDeviceId));
    public ISampleProvider VirtualMicrophoneSource => virtualMicrophoneSamples;
    public ISampleProvider StreamMicrophoneSource => streamMicrophoneSamples;
    public ISampleProvider ClipMicrophoneSource => clipMicrophoneSamples;
    public FrameTimingSnapshot FrameTimings => frameTimings.Snapshot();
    public FrameTimingSnapshot CallbackTimings => callbackTimings.Snapshot();

    public void Start()
    {
        processingThread.Start();
        monitorOutput?.Play();
        capture.StartRecording();
    }

    public void UpdateConfiguration(AudioHostSettings settings, MicrophoneDspConfiguration nextConfiguration)
    {
        Volatile.Write(ref configuration, nextConfiguration);
        ConfigureMonitoring(settings);
    }

    public void MarkRecovery() => Interlocked.Increment(ref recoveries);

    public async Task RunMicrophoneTestAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.CompareExchange(ref testState, 1, 0) != 0)
            throw new InvalidOperationException("A microphone test is already running.");
        try
        {
            Volatile.Write(ref testPosition, 0);
            while (Volatile.Read(ref testState) == 1)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (stopping || captureStopped) throw new InvalidOperationException("The microphone stopped during the test.");
                await Task.Delay(20, cancellationToken);
            }

            var outputId = Volatile.Read(ref testOutputDeviceId);
            if (string.IsNullOrWhiteSpace(outputId)) throw new InvalidOperationException("Select a monitoring output before testing the microphone.");
            using var playbackEnumerator = new MMDeviceEnumerator();
            using var outputDevice = playbackEnumerator.GetDevice(outputId);
            if (outputDevice.State != DeviceState.Active) throw new InvalidOperationException("The selected microphone test output is unavailable.");
            if (EndpointCatalog.IsSwitchboard(outputDevice.FriendlyName, outputDevice.DeviceFriendlyName))
                throw new InvalidOperationException("Choose a physical output for microphone testing.");

            var provider = new RecordedWaveProvider(testSamples, TestSampleCount, Volatile.Read(ref testOutputVolume));
            using var output = new WasapiPlayerBuilder()
                .WithDevice(outputDevice)
                .WithSharedMode()
                .WithEventSync()
                .WithLatency(20)
                .Build();
            output.Init(provider);
            output.Play();
            while (!provider.Completed)
            {
                cancellationToken.ThrowIfCancellationRequested();
                await Task.Delay(20, cancellationToken);
            }
            await Task.Delay(40, cancellationToken);
            output.Stop();
        }
        finally
        {
            Volatile.Write(ref testState, 0);
        }
    }

    public void Dispose()
    {
        if (stopping) return;
        stopping = true;
        samplesAvailable.Set();
        try { capture.StopRecording(); } catch { }
        if (processingThread.IsAlive) processingThread.Join(TimeSpan.FromSeconds(2));
        StopMonitoring();
        capture.DataAvailable -= OnDataAvailable;
        capture.RecordingStopped -= OnRecordingStopped;
        capture.Dispose();
        enumerator.Dispose();
        samplesAvailable.Dispose();
    }

    private void OnDataAvailable(
        ReadOnlySpan<byte> buffer,
        AudioClientBufferFlags flags,
        long devicePosition,
        long qpcPosition)
    {
        var startedAt = Stopwatch.GetTimestamp();
        if (!buffer.IsEmpty)
        {
            converter.ConvertAndWrite(
                buffer,
                captureFrames,
                out var dropped,
                (flags & AudioClientBufferFlags.Silent) != 0);
            if (dropped > 0) Interlocked.Add(ref captureOverruns, dropped);
            samplesAvailable.Set();
        }
        callbackTimings.Record(Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs eventArgs)
    {
        if (stopping) return;
        Volatile.Write(ref lastError, eventArgs.Exception?.Message ?? "The microphone stopped unexpectedly.");
        captureStopped = true;
        samplesAvailable.Set();
    }

    private void ProcessFrames()
    {
        var deadlineMs = suppressor.FrameLength * 1_000d / AudioConstants.ProcessingSampleRate;
        while (!stopping)
        {
            if (!captureFrames.TryReadFrame(frame))
            {
                samplesAvailable.WaitOne(20);
                continue;
            }

            var startedAt = Stopwatch.GetTimestamp();
            MicrophoneFrameResult result;
            frame.CopyTo(dryFrame, 0);
            try
            {
                result = graph.ProcessMicrophone(frame, Volatile.Read(ref configuration));
            }
            catch
            {
                graph.BypassNoiseSuppression();
                suppressionBypassed = true;
                Interlocked.Increment(ref bypassedFrames);
                Volatile.Write(ref lastError, "Noise removal failed and was bypassed. Microphone audio is still available.");
                dryFrame.CopyTo(frame, 0);
                var peak = 0f;
                var sumSquares = 0d;
                for (var index = 0; index < frame.Length; index++)
                {
                    var sample = float.IsFinite(frame[index]) ? Math.Clamp(frame[index], -1f, 1f) : 0f;
                    frame[index] = sample;
                    peak = Math.Max(peak, MathF.Abs(sample));
                    sumSquares += sample * sample;
                }
                result = new MicrophoneFrameResult(true, false, float.NaN, peak, (float)Math.Sqrt(sumSquares / frame.Length));
            }
            var elapsedMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
            frameTimings.Record(elapsedMs);

            if (result.SuppressionAttempted && !result.SuppressionSucceeded)
            {
                consecutiveFailures++;
                Interlocked.Increment(ref bypassedFrames);
            }
            else
            {
                consecutiveFailures = 0;
            }
            consecutiveDeadlineMisses = elapsedMs >= deadlineMs ? consecutiveDeadlineMisses + 1 : 0;
            if (consecutiveFailures >= RepeatedFailureLimit || consecutiveDeadlineMisses >= RepeatedFailureLimit)
            {
                graph.BypassNoiseSuppression();
                suppressionBypassed = true;
                Volatile.Write(ref lastError, consecutiveDeadlineMisses >= RepeatedFailureLimit
                    ? "Noise removal missed its audio deadline and was safely bypassed."
                    : "Noise removal failed repeatedly and was safely bypassed.");
            }

            Volatile.Write(ref meterLevel, result.Rms);
            Volatile.Write(ref meterPeak, result.Peak);
            Volatile.Write(ref localSnr, result.LocalSnrDb);
            CaptureTestFrame(frame);
            virtualMicrophoneSamples.WriteMono(frame);
            streamMicrophoneSamples.WriteMono(frame);
            clipMicrophoneSamples.WriteMono(frame);
            if (monitorOutput is not null)
            {
                var written = processedSamples.Write(frame);
                if (written < frame.Length) Interlocked.Add(ref outputOverruns, frame.Length - written);
            }
        }
    }

    private void ConfigureMonitoring(AudioHostSettings settings)
    {
        Volatile.Write(ref testOutputDeviceId, settings.MonitoringDeviceId);
        Volatile.Write(ref testOutputVolume, Math.Clamp(settings.Monitoring, 0f, 1f));
        if (!settings.MonitoringEnabled || string.IsNullOrWhiteSpace(settings.MonitoringDeviceId))
        {
            StopMonitoring();
            return;
        }
        if (monitorOutput is not null && string.Equals(MonitoringDeviceId, settings.MonitoringDeviceId, StringComparison.OrdinalIgnoreCase))
        {
            monitorProvider?.SetVolume(settings.Monitoring);
            return;
        }

        StopMonitoring();
        var outputDevice = enumerator.GetDevice(settings.MonitoringDeviceId);
        if (outputDevice.State != DeviceState.Active) throw new InvalidOperationException("The selected monitoring output is not available.");
        processedSamples.Clear();
        var provider = new ProcessedWaveProvider(processedSamples);
        provider.SetVolume(settings.Monitoring);
        var output = new WasapiPlayerBuilder()
            .WithDevice(outputDevice)
            .WithSharedMode()
            .WithEventSync()
            .WithLatency(20)
            .Build();
        output.Init(provider);
        monitorProvider = provider;
        monitorOutput = output;
        MonitoringDeviceId = settings.MonitoringDeviceId;
        if (processingThread.IsAlive) output.Play();
    }

    private void CaptureTestFrame(ReadOnlySpan<float> processedFrame)
    {
        if (Volatile.Read(ref testState) != 1) return;
        var position = Volatile.Read(ref testPosition);
        var count = Math.Min(processedFrame.Length, TestSampleCount - position);
        if (count <= 0)
        {
            Volatile.Write(ref testState, 2);
            return;
        }
        processedFrame[..count].CopyTo(testSamples.AsSpan(position, count));
        position += count;
        Volatile.Write(ref testPosition, position);
        if (position >= TestSampleCount) Volatile.Write(ref testState, 2);
    }

    private void StopMonitoring()
    {
        var output = monitorOutput;
        monitorOutput = null;
        monitorProvider = null;
        MonitoringDeviceId = null;
        if (output is null) return;
        try { output.Stop(); } catch { }
        output.Dispose();
        processedSamples.Clear();
    }
}
