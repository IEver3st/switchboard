using System.Buffers.Binary;
using System.Diagnostics;

namespace Switchboard.CaptureHost;

internal enum PcmSampleFormat
{
    Float32,
    Signed16,
    Signed24,
    Signed32,
}

internal interface IAudioPacketObserver
{
    void Observe(
        ReadOnlySpan<byte> buffer,
        bool silent,
        PcmSampleFormat format,
        int channels,
        int sampleRate);
}

internal readonly record struct ReactionDetection(
    long Timestamp,
    double Confidence,
    double LevelDb,
    double BaselineDb);

internal sealed record ReactionDetectionRuntime(
    string State,
    double InputLevelDb,
    double NoiseFloorDb,
    double TriggerThresholdDb,
    int ReactionsDetected,
    long AnalyzedFrames,
    double AnalysisAverageMs,
    int CooldownRemainingSeconds,
    long? LastReactionAt,
    string? Message = null);

internal sealed class ReactionDetector : IAudioPacketObserver
{
    private const double SilenceDb = -96;
    private const double InitialNoiseFloorDb = -60;
    private const double InitialSpeechBaselineDb = -30;
    private const int CalibrationMilliseconds = 1_500;
    private const int RearmMilliseconds = 750;

    private readonly Func<long> now;
    private ReactionDetectorConfiguration configuration = ReactionDetectorConfiguration.Disabled;
    private long firstFrameAt;
    private long lastReactionAt;
    private long pendingReactionAt;
    private double pendingConfidence;
    private double pendingLevelDb;
    private double pendingBaselineDb;
    private double inputLevelDb = SilenceDb;
    private double noiseFloorDb = InitialNoiseFloorDb;
    private double speechBaselineDb = InitialSpeechBaselineDb;
    private double triggerThresholdDb = -18;
    private double excitedMilliseconds;
    private double settledMilliseconds;
    private bool reactionArmed = true;
    private bool hasSpeechBaseline;
    private int reactionsDetected;
    private long analyzedFrames;
    private long analysisTicks;

    public ReactionDetector(Func<long>? now = null)
    {
        this.now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    public void Configure(bool enabled, string sensitivity, int cooldownSeconds)
    {
        var next = new ReactionDetectorConfiguration(enabled, sensitivity, cooldownSeconds).Validate();
        Volatile.Write(ref configuration, next);
        if (!next.Enabled) Pause();
    }

    public void Observe(
        ReadOnlySpan<byte> buffer,
        bool silent,
        PcmSampleFormat format,
        int channels,
        int sampleRate)
    {
        var currentConfiguration = Volatile.Read(ref configuration);
        if (!currentConfiguration.Enabled || channels <= 0 || sampleRate <= 0) return;
        var analysisStartedAt = Stopwatch.GetTimestamp();

        var bytesPerSample = format switch
        {
            PcmSampleFormat.Signed16 => 2,
            PcmSampleFormat.Signed24 => 3,
            _ => 4,
        };
        var frameStride = bytesPerSample * channels;
        var frameCount = buffer.Length / frameStride;
        if (frameCount < 16) return;

        var levelDb = SilenceDb;
        var zeroCrossingRate = 0d;
        var crestDb = 0d;
        if (!silent)
        {
            double sumSquares = 0;
            var peak = 0d;
            var crossings = 0;
            var previous = 0d;
            for (var frame = 0; frame < frameCount; frame++)
            {
                var sample = ReadSample(buffer, frame * frameStride, format);
                var magnitude = Math.Abs(sample);
                sumSquares += sample * sample;
                peak = Math.Max(peak, magnitude);
                if (frame > 0 && (sample >= 0) != (previous >= 0)) crossings++;
                previous = sample;
            }

            var rms = Math.Sqrt(sumSquares / frameCount);
            levelDb = Math.Clamp(20 * Math.Log10(Math.Max(0.0000158489, rms)), SilenceDb, 0);
            zeroCrossingRate = crossings / (double)Math.Max(1, frameCount - 1);
            crestDb = 20 * Math.Log10(Math.Max(1, peak / Math.Max(rms, 0.0000158489)));
        }

        var timestamp = now();
        var frameMilliseconds = Math.Clamp(frameCount * 1_000d / sampleRate, 1, 250);
        if (firstFrameAt == 0)
        {
            firstFrameAt = timestamp;
        }

        Volatile.Write(ref inputLevelDb, levelDb);
        var calibrating = timestamp - firstFrameAt < CalibrationMilliseconds;
        var voiceFloor = Math.Max(-50, Volatile.Read(ref noiseFloorDb) + 8);
        var voiceShaped = !silent
                          && levelDb >= voiceFloor
                          && zeroCrossingRate is >= 0.003 and <= 0.35
                          && crestDb is >= 2 and <= 20;

        UpdateNoiseFloor(levelDb, voiceShaped, frameMilliseconds, calibrating);
        // Learn the user's actual voice level rather than assuming microphone
        // gain. This also covers the first speech after a silent calibration.
        if (voiceShaped && !hasSpeechBaseline)
        {
            Volatile.Write(ref speechBaselineDb, levelDb);
            hasSpeechBaseline = true;
        }
        if (calibrating)
        {
            if (voiceShaped) UpdateSpeechBaseline(levelDb, frameMilliseconds, timeConstantMilliseconds: 2_500);
            excitedMilliseconds = 0;
            UpdateThreshold(currentConfiguration);
            RecordAnalysis(analysisStartedAt);
            return;
        }

        var profile = SensitivityProfile.For(currentConfiguration.Sensitivity);
        var baseline = Volatile.Read(ref speechBaselineDb);
        var relativeGainDb = levelDb - baseline;
        var candidate = voiceShaped
                        && levelDb >= profile.AbsoluteThresholdDb
                        && relativeGainDb >= profile.RelativeThresholdDb;

        // A cooldown limits frequency; it does not prove the previous reaction
        // ended. Require a settled interval before accepting another burst.
        if (!reactionArmed)
        {
            var settled = !voiceShaped || levelDb < Math.Max(
                profile.AbsoluteThresholdDb - 3, baseline + profile.RelativeThresholdDb / 2);
            settledMilliseconds = settled ? settledMilliseconds + frameMilliseconds : 0;
            if (settledMilliseconds >= RearmMilliseconds)
            {
                reactionArmed = true;
                settledMilliseconds = 0;
            }
        }

        var inCooldown = lastReactionAt > 0
                         && timestamp - lastReactionAt < currentConfiguration.CooldownSeconds * 1_000L;
        if (inCooldown || !reactionArmed)
        {
            excitedMilliseconds = 0;
        }
        else if (candidate)
        {
            excitedMilliseconds = Math.Min(1_000, excitedMilliseconds + frameMilliseconds);
        }
        else
        {
            excitedMilliseconds = Math.Max(0, excitedMilliseconds - frameMilliseconds * 1.75);
            if (voiceShaped) UpdateSpeechBaseline(levelDb, frameMilliseconds, timeConstantMilliseconds: 12_000);
        }

        if (!inCooldown && reactionArmed && excitedMilliseconds >= profile.MinimumSustainMilliseconds)
        {
            var loudnessMargin = levelDb - profile.AbsoluteThresholdDb;
            var relativeMargin = relativeGainDb - profile.RelativeThresholdDb;
            var evidence = Math.Min(loudnessMargin, relativeMargin);
            var confidence = Math.Clamp(0.58 + Math.Max(0, evidence) / 22, 0.58, 0.98);
            pendingConfidence = confidence;
            pendingLevelDb = levelDb;
            pendingBaselineDb = baseline;
            Interlocked.Exchange(ref pendingReactionAt, timestamp);
            Interlocked.Exchange(ref lastReactionAt, timestamp);
            Interlocked.Increment(ref reactionsDetected);
            excitedMilliseconds = 0;
            reactionArmed = false;
            settledMilliseconds = 0;
        }

        UpdateThreshold(currentConfiguration);
        RecordAnalysis(analysisStartedAt);
    }

    public bool TryTakeDetection(out ReactionDetection detection)
    {
        var timestamp = Interlocked.Exchange(ref pendingReactionAt, 0);
        if (timestamp == 0)
        {
            detection = default;
            return false;
        }
        detection = new ReactionDetection(
            timestamp,
            Volatile.Read(ref pendingConfidence),
            Volatile.Read(ref pendingLevelDb),
            Volatile.Read(ref pendingBaselineDb));
        return true;
    }

    public ReactionDetectionRuntime Snapshot(bool inputActive, string? unavailableReason = null)
    {
        var currentConfiguration = Volatile.Read(ref configuration);
        var timestamp = now();
        var lastDetectedAt = Interlocked.Read(ref lastReactionAt);
        var frameCount = Math.Max(0, Interlocked.Read(ref analyzedFrames));
        var averageMilliseconds = frameCount == 0
            ? 0
            : Interlocked.Read(ref analysisTicks) * 1_000d / Stopwatch.Frequency / frameCount;
        var cooldownRemaining = !currentConfiguration.Enabled || lastDetectedAt == 0
            ? 0
            : Math.Max(0, (int)Math.Ceiling(
                (currentConfiguration.CooldownSeconds * 1_000L - (timestamp - lastDetectedAt)) / 1_000d));
        var state = !currentConfiguration.Enabled
            ? "disabled"
            : unavailableReason is not null
                ? "unavailable"
                : !inputActive
                    ? "waiting"
                    : firstFrameAt == 0 || timestamp - firstFrameAt < CalibrationMilliseconds
                        ? "calibrating"
                        : cooldownRemaining > 0 ? "cooldown" : "listening";
        return new ReactionDetectionRuntime(
            state,
            Math.Round(Volatile.Read(ref inputLevelDb), 1),
            Math.Round(Volatile.Read(ref noiseFloorDb), 1),
            Math.Round(Volatile.Read(ref triggerThresholdDb), 1),
            Math.Max(0, Volatile.Read(ref reactionsDetected)),
            frameCount,
            Math.Round(Math.Max(0, averageMilliseconds), 4),
            cooldownRemaining,
            lastDetectedAt > 0 ? lastDetectedAt : null,
            unavailableReason);
    }

    public void Pause(bool resetCounters = false)
    {
        firstFrameAt = 0;
        Interlocked.Exchange(ref pendingReactionAt, 0);
        Interlocked.Exchange(ref lastReactionAt, 0);
        excitedMilliseconds = 0;
        settledMilliseconds = 0;
        reactionArmed = true;
        hasSpeechBaseline = false;
        Volatile.Write(ref inputLevelDb, SilenceDb);
        Volatile.Write(ref noiseFloorDb, InitialNoiseFloorDb);
        Volatile.Write(ref speechBaselineDb, InitialSpeechBaselineDb);
        UpdateThreshold(Volatile.Read(ref configuration));
        if (resetCounters) Interlocked.Exchange(ref reactionsDetected, 0);
    }

    private void RecordAnalysis(long startedAt)
    {
        Interlocked.Add(ref analysisTicks, Math.Max(0, Stopwatch.GetTimestamp() - startedAt));
        Interlocked.Increment(ref analyzedFrames);
    }

    private void UpdateNoiseFloor(double levelDb, bool voiceShaped, double frameMilliseconds, bool calibrating)
    {
        if (voiceShaped) return;
        var current = Volatile.Read(ref noiseFloorDb);
        if (levelDb > current + 10 && !calibrating) return;
        var timeConstant = calibrating ? 1_500 : levelDb < current ? 3_000 : 8_000;
        var alpha = 1 - Math.Exp(-frameMilliseconds / timeConstant);
        Volatile.Write(ref noiseFloorDb, Math.Clamp(current + (levelDb - current) * alpha, SilenceDb, -20));
    }

    private void UpdateSpeechBaseline(double levelDb, double frameMilliseconds, double timeConstantMilliseconds)
    {
        var current = Volatile.Read(ref speechBaselineDb);
        var alpha = 1 - Math.Exp(-frameMilliseconds / timeConstantMilliseconds);
        Volatile.Write(ref speechBaselineDb, Math.Clamp(current + (levelDb - current) * alpha, -50, -8));
    }

    private void UpdateThreshold(ReactionDetectorConfiguration currentConfiguration)
    {
        var profile = SensitivityProfile.For(currentConfiguration.Sensitivity);
        var threshold = Math.Max(
            profile.AbsoluteThresholdDb,
            Volatile.Read(ref speechBaselineDb) + profile.RelativeThresholdDb);
        Volatile.Write(ref triggerThresholdDb, Math.Clamp(threshold, SilenceDb, 0));
    }

    private static double ReadSample(ReadOnlySpan<byte> buffer, int offset, PcmSampleFormat format) => format switch
    {
        PcmSampleFormat.Float32 => Math.Clamp(BitConverter.Int32BitsToSingle(
            BinaryPrimitives.ReadInt32LittleEndian(buffer.Slice(offset, 4))), -1f, 1f),
        PcmSampleFormat.Signed16 => BinaryPrimitives.ReadInt16LittleEndian(buffer.Slice(offset, 2)) / 32768d,
        PcmSampleFormat.Signed24 => ReadSigned24(buffer.Slice(offset, 3)) / 8388608d,
        PcmSampleFormat.Signed32 => BinaryPrimitives.ReadInt32LittleEndian(buffer.Slice(offset, 4)) / 2147483648d,
        _ => 0,
    };

    private static int ReadSigned24(ReadOnlySpan<byte> bytes)
    {
        var value = bytes[0] | bytes[1] << 8 | bytes[2] << 16;
        return (value & 0x0080_0000) == 0 ? value : value | unchecked((int)0xff00_0000);
    }

    private sealed record ReactionDetectorConfiguration(bool Enabled, string Sensitivity, int CooldownSeconds)
    {
        public static readonly ReactionDetectorConfiguration Disabled = new(false, "balanced", 15);

        public ReactionDetectorConfiguration Validate()
        {
            if (Sensitivity is not ("low" or "balanced" or "high"))
                throw new ArgumentOutOfRangeException(nameof(Sensitivity));
            if (CooldownSeconds is < 5 or > 120)
                throw new ArgumentOutOfRangeException(nameof(CooldownSeconds));
            return this;
        }
    }

    private readonly record struct SensitivityProfile(
        double AbsoluteThresholdDb,
        double RelativeThresholdDb,
        double MinimumSustainMilliseconds)
    {
        public static SensitivityProfile For(string sensitivity) => sensitivity switch
        {
            "low" => new(-13, 10, 260),
            "high" => new(-23, 5, 120),
            _ => new(-18, 7, 180),
        };
    }
}
