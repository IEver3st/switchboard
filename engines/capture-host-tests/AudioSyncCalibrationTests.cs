using System.Runtime.InteropServices;
using Switchboard.CaptureHost;

internal static class AudioSyncCalibrationTests
{
    public static async Task RunAsync()
    {
        foreach (var delay in new[] { 0, 37, 185, 750, 1180 })
        {
            var (reference, mic) = Signals([delay, delay + 1, delay, delay + 2, delay]);
            var measured = AudioSyncCalibration.Analyze(reference, mic);
            if (Math.Abs(measured.AdvanceMs - delay) > 2 || measured.Count != 5)
                throw new Exception($"Calibration did not recover a {delay} ms acoustic delay: {measured}.");
        }
        var unstable = Signals([100, 170, 210, 260, 300]);
        Reject(() => AudioSyncCalibration.Analyze(unstable.Reference, unstable.Mic));
        Reject(() => AudioSyncCalibration.Analyze(new double[13000], new double[13000]));
        var quiet = Signals([185, 185, 185, 185, 185]);
        Reject(() => AudioSyncCalibration.Analyze(quiet.Reference, new double[13000]));
        // Constant noise has no distinctive envelope and must not look like a match.
        Reject(() => AudioSyncCalibration.Analyze(quiet.Reference, Enumerable.Repeat(0.02, 13000).ToArray()));
        var echo = quiet.Mic.ToArray();
        for (var i = 200; i < echo.Length; i++) echo[i] += quiet.Mic[i - 200];
        Reject(() => AudioSyncCalibration.Analyze(quiet.Reference, echo));

        using var pcm = new MemoryStream();
        var writer = new AudioTimelineWriter(pcm, sizeof(short));
        await writer.WriteAsync(MemoryMarshal.AsBytes(new short[] { 1, 2 }.AsSpan()).ToArray(), -4, default);
        await writer.WriteAsync(MemoryMarshal.AsBytes(new short[] { 3, 4, 5, 6 }.AsSpan()).ToArray(), -2, default);
        await writer.WriteAsync(MemoryMarshal.AsBytes(new short[] { 7, 8 }.AsSpan()).ToArray(), 2, default);
        if (!MemoryMarshal.Cast<byte, short>(pcm.ToArray()).SequenceEqual(new short[] { 5, 6, 7, 8 }))
            throw new Exception("Advanced microphone packets must trim only samples before zero, with no repeated or lost later samples.");

        var origin = DateTimeOffset.UtcNow;
        var video = Enumerable.Range(0, 6).Select(i => new ReplaySegmentInfo("fixture", origin.AddSeconds(i), origin.AddSeconds(i + 1), 1, true)).ToArray();
        var audio = new[] { new ReplaySegmentInfo("mic", origin, origin.AddSeconds(4.8), 1, true) };
        if (ReplayEngine.CompleteWithMicrophone(video, audio).Count != 4
            || ReplayEngine.CompleteWithMicrophone(video, []).Count != 0)
            throw new Exception("A calibrated replay must not include video ahead of its completed microphone audio.");
        var settings = new CaptureSettings();
        var calibrated = settings with { MicrophoneSync = new(185, "mic", "output", DateTimeOffset.UtcNow.ToString("O")) };
        if (ReplayEngine.ResolveMicrophoneAdvanceMs(calibrated, "mic", "output") != 185
            || ReplayEngine.ResolveMicrophoneAdvanceMs(calibrated, "other", "output") != 0
            || ReplayEngine.ResolveMicrophoneAdvanceMs(calibrated, "mic", "other") != 0
            || ReplayEngine.ResolveMicrophoneAdvanceMs(calibrated, "mic", null) != 0
            || ReplayEngine.ResolveMicrophoneAdvanceMs(calibrated with { SystemAudioMode = "game" }, "mic", "output") != 0)
            throw new Exception("Only the calibrated microphone and system output may use the correction.");
        if (!ReplayEngine.RequiresRestart(settings, settings with { MicrophoneSync = new(185, "mic", "output", DateTimeOffset.UtcNow.ToString("O")) }))
            throw new Exception("Changing microphone timing must start a fresh replay buffer.");
        Console.WriteLine("Audio calibration: delay detection, noise/echo rejection, timing trim, and completed-tail checks passed.");
    }

    private static (double[] Reference, double[] Mic) Signals(int[] delays)
    {
        var reference = new double[13000]; var microphone = new double[13000];
        var random = new Random(42);
        for (var i = 0; i < microphone.Length; i++) microphone[i] = random.NextDouble() * 0.00002;
        for (var pulse = 0; pulse < AudioSyncCalibration.PulseStarts.Length; pulse++)
        for (var t = 0; t < 180; t++)
        {
            var envelope = Math.Pow(Math.Sin(Math.PI * t / 180), 4) * Math.Pow(0.55 + 0.45 * Math.Sin(2 * Math.PI * 23 * t / 1000), 2);
            var index = AudioSyncCalibration.PulseStarts[pulse] + t;
            reference[index] = envelope * 0.02;
            microphone[index + delays[pulse]] += envelope * 0.005;
        }
        return (reference, microphone);
    }
    private static void Reject(Action operation)
    {
        try { operation(); } catch (InvalidOperationException) { return; }
        throw new Exception("An unreliable calibration was accepted.");
    }
}
