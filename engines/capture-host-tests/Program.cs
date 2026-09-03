using System.Diagnostics;
using System.Runtime.InteropServices;
using Switchboard.CaptureHost;

if (args.Contains("--job-child", StringComparer.Ordinal))
{
    await Task.Delay(TimeSpan.FromMinutes(5));
    return;
}
if (args.Contains("--remux-stdin-only", StringComparer.Ordinal))
{
    AssertRemuxStdinIsolation();
    Console.WriteLine("Capture.Host remux stdin isolation test passed.");
    return;
}

var start = DateTimeOffset.Parse("2026-08-26T00:00:00Z");
var segments = Enumerable.Range(0, 5)
    .Select(index => new ReplaySegmentInfo(
        $"segment-{index}.mkv",
        start.AddSeconds(index),
        start.AddSeconds(index + 1),
        100,
        Complete: index < 4))
    .ToArray();

AssertSequence(
    ReplaySegmentRing.SelectForReplayCore(segments, TimeSpan.FromSeconds(2)).Select(segment => segment.Path),
    ["segment-2.mkv", "segment-3.mkv"],
    "Replay selection must use the latest complete keyframe-aligned segments.");

AssertSequence(
    ReplaySegmentRing.SelectForWindowCore(segments, start.AddSeconds(1.2), start.AddSeconds(3.2)).Select(segment => segment.Path),
    ["segment-1.mkv", "segment-2.mkv", "segment-3.mkv"],
    "Replay window selection must preserve every completed keyframe segment intersecting the requested event range.");

AssertSequence(
    ReplaySegmentRing.SelectEvictionCandidates(segments, TimeSpan.FromSeconds(3), 250).Select(segment => segment.Path),
    ["segment-0.mkv", "segment-1.mkv"],
    "Eviction must satisfy duration and byte bounds.");

AssertEqual("FiveMpursuit", ClipFileNames.Sanitize("Five:M / pursuit*"), "Windows filename characters must be removed.");
AssertEqual("Capture", ClipFileNames.Sanitize("CON"), "Reserved Windows device names must be rejected.");

var validSettings = new CaptureSettings(
    Fps: 60,
    ReplaySeconds: 60,
    CacheDirectory: Path.GetTempPath(),
    ClipsDirectory: Path.GetTempPath());
_ = validSettings.Validate();
var nvencArguments = ReplayEngine.EncoderArguments(validSettings, "av1_nvenc").ToArray();
AssertValue(true, nvencArguments.Zip(nvencArguments.Skip(1)).Any(pair => pair.First == "-delay" && pair.Second == "0"),
    "NVENC capture must not retain the encoder's automatic frame-delay allocation.");
AssertThrows<ArgumentOutOfRangeException>(() => (validSettings with { Fps = 59 }).Validate(), "Unsupported FPS must fail validation.");
AssertThrows<InvalidOperationException>(() => (validSettings with { Source = "window", SourceId = null }).Validate(), "Window capture requires a target.");
AssertThrows<ArgumentOutOfRangeException>(() => (validSettings with { ReactionSensitivity = "maximum" }).Validate(),
    "Unknown reaction sensitivity must fail validation.");
AssertThrows<ArgumentOutOfRangeException>(() => (validSettings with { ReactionCooldownSeconds = 2 }).Validate(),
    "Reaction cooldown must remain inside the bounded range.");
AssertValue(true, ReplayEngine.RequiresRestart(validSettings, validSettings with { ClipMixPipeName = "switchboard-audio-clip-v1" }),
    "Switching replay system audio to the Audio.Host clip mix must rebuild the FFmpeg audio input.");
AssertValue(true, ReplayEngine.RequiresRestart(validSettings, validSettings with { ProcessedMicrophoneDeviceId = "processed-mic" }),
    "Switching replay microphone capture to the processed endpoint must rebuild the FFmpeg audio input.");
var selectedMicrophoneSettings = validSettings with { MicrophoneDeviceId = "hyperx-quadcast-endpoint" };
AssertEqual(
    "hyperx-quadcast-endpoint",
    ReplayEngine.ResolveMicrophoneEndpointId(selectedMicrophoneSettings) ?? "",
    "Replay capture must use the microphone selected in Switchboard instead of the Windows default input.");
AssertEqual(
    "switchboard-processed-microphone",
    ReplayEngine.ResolveMicrophoneEndpointId(selectedMicrophoneSettings with
    {
        ProcessedMicrophoneDeviceId = "switchboard-processed-microphone",
    }) ?? "",
    "The processed microphone endpoint must take precedence when the virtual-audio path is available.");
AssertValue(true, ReplayEngine.RequiresRestart(validSettings, selectedMicrophoneSettings),
    "Changing the selected replay microphone must rebuild the FFmpeg audio input.");

var surroundSystemAudio = new TestAudioPipeInput(SampleRate: 96_000, Channels: 8);
var surroundSystemAudioArguments = ReplayEngine.BuildAudioArguments(
    validSettings,
    Path.GetTempPath(),
    surroundSystemAudio,
    "system",
    validSettings.SystemAudioBitrateBps,
    outputChannels: 2);
AssertSequence(
    ValuesFollowing(surroundSystemAudioArguments, "-ac"),
    ["8", "2"],
    "Surround loopback capture must read every source channel and encode a stereo system-audio track.");
AssertEqual(
    validSettings.SystemAudioBitrateBps.ToString(),
    ValuesFollowing(surroundSystemAudioArguments, "-b:a").Single(),
    "Stereo system audio must retain the configured AAC bitrate.");

AssertRemuxStdinIsolation();

var operations = new OperationTracker();
operations.Track(Task.CompletedTask);
await Task.Yield();
AssertValue(0, operations.Count, "Completed host requests must not remain tracked.");
AssertValue(false, ReplayEngine.IsHostActiveState("error"), "An errored capture engine must be restartable.");
AssertValue(true, ReplayEngine.IsHostActiveState("buffering"), "A buffering capture engine must remain active.");
TestReactionDetector();

var displaySource = new CaptureSource(
    "display:0", "display", "Display 1", null, null, "0", true, DisplayHandle: 12345);
var displayFilter = ReplayEngine.BuildCaptureFilter("Windows Graphics Capture", validSettings with
{
    Source = "display",
    DisplayIndex = 0,
}, displaySource);
AssertEqual(
    "gfxcapture=hmonitor=12345:capture_cursor=0:capture_border=0:display_border=0:max_framerate=60:width=2560:height=1440:resize_mode=scale_aspect:scale_mode=bilinear",
    displayFilter,
    "Display capture must bind the selected physical HMONITOR instead of relying on an unrelated FFmpeg index.");
if (OperatingSystem.IsWindows())
{
    var discoveredDisplays = new WindowsCaptureSources().ListSources()
        .Where(source => source.Type == "display")
        .ToArray();
    AssertValue(true, discoveredDisplays.Length > 0, "Windows capture must discover at least one display.");
    AssertValue(true, discoveredDisplays.All(source => source.DisplayHandle is not null),
        "Every discovered display must retain its physical HMONITOR inside Capture.Host.");
    AssertValue(discoveredDisplays.Length, discoveredDisplays.Select(source => source.DisplayHandle).Distinct().Count(),
        "Each discovered display must map to one distinct physical HMONITOR.");
}

var switchboardWindow = new WindowsCaptureSources.WindowInfo(
    100,
    1000,
    "Switchboard",
    @"C:\Program Files\Switchboard\Switchboard.exe",
    "switchboard",
    "Switchboard",
    "Chrome_WidgetWin_1",
    false,
    true);
var alreadyRunningGameWindow = new WindowsCaptureSources.WindowInfo(
    200,
    2000,
    "Existing Game",
    @"C:\Games\Steam\steamapps\common\Existing Game\game.exe",
    "game",
    "Existing Game",
    "GameWindow",
    true,
    true);
var automaticGameWindows = new Dictionary<nint, WindowsCaptureSources.WindowInfo>
{
    [switchboardWindow.Handle] = switchboardWindow,
    [alreadyRunningGameWindow.Handle] = alreadyRunningGameWindow,
};
var automaticGameBackgroundScans = 0;
var automaticGameSources = new WindowsCaptureSources(
    () => true,
    () => switchboardWindow.Handle,
    (handle, _) => automaticGameWindows.GetValueOrDefault(handle),
    _ =>
    {
        automaticGameBackgroundScans++;
        return automaticGameWindows.Values.ToArray();
    });
var automaticGameStartedAt = DateTimeOffset.UtcNow;
AssertValue(true, automaticGameSources.DetectAutomaticGame(automaticGameStartedAt) is null,
    "An already-running background game must pass the stability window before capture starts.");
AssertValue(
    true,
    automaticGameSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == alreadyRunningGameWindow.ProcessId,
    "Automatic capture must detect a game that was already running when Switchboard started.");
AssertValue(1, automaticGameBackgroundScans,
    "A stable background candidate must not trigger another full window inventory scan.");

var secondRunningGameWindow = alreadyRunningGameWindow with
{
    Handle = 300,
    ProcessId = 3000,
    Title = "Second Existing Game",
    ExecutablePath = @"C:\Games\Steam\steamapps\common\Second Existing Game\game.exe",
    ProductName = "Second Existing Game",
};
automaticGameWindows[secondRunningGameWindow.Handle] = secondRunningGameWindow;
var ambiguousAutomaticGameSources = new WindowsCaptureSources(
    () => true,
    () => switchboardWindow.Handle,
    (handle, _) => automaticGameWindows.GetValueOrDefault(handle),
    _ => automaticGameWindows.Values.ToArray());
AssertValue(true, ambiguousAutomaticGameSources.DetectAutomaticGame(automaticGameStartedAt) is null,
    "Automatic capture must not guess when more than one background game process is running.");
AssertValue(true, ambiguousAutomaticGameSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1)) is null,
    "Automatic capture must wait for foreground intent when background game identity is ambiguous.");

static WindowsCaptureSources CreateBackgroundSources(
    WindowsCaptureSources.WindowInfo foreground,
    params WindowsCaptureSources.WindowInfo[] windows)
{
    var table = windows.ToDictionary(window => window.Handle);
    table[foreground.Handle] = foreground;
    return new WindowsCaptureSources(
        () => true,
        () => foreground.Handle,
        (handle, _) => table.GetValueOrDefault(handle),
        _ => table.Values.ToArray());
}

var warThunderStandalone = new WindowsCaptureSources.WindowInfo(
    400,
    4000,
    "War Thunder",
    @"C:\WarThunder\win64\aces.exe",
    "aces",
    "War Thunder",
    "DagorWClass",
    true,
    false);
var warThunderSources = CreateBackgroundSources(switchboardWindow, warThunderStandalone);
AssertValue(true, warThunderSources.DetectAutomaticGame(automaticGameStartedAt) is null,
    "War Thunder standalone must pass the stability window before capture starts.");
AssertValue(true, warThunderSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 4000,
    "Automatic capture must detect War Thunder standalone installs outside steamapps.");

var warThunderBattlEye = warThunderStandalone with
{
    Handle = 401,
    ProcessId = 4001,
    ExecutablePath = @"D:\SteamLibrary\steamapps\common\War Thunder\win64\aces_BE.exe",
    ExecutableName = "aces_BE",
};
var warThunderBattlEyeSources = CreateBackgroundSources(switchboardWindow, warThunderBattlEye);
warThunderBattlEyeSources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, warThunderBattlEyeSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 4001,
    "Automatic capture must detect War Thunder BattlEye builds.");

var warThunderProtected = warThunderStandalone with
{
    Handle = 402,
    ProcessId = 4002,
    ExecutablePath = string.Empty,
    ExecutableName = "aces",
    ProductName = "aces",
    ClassName = string.Empty,
};
var warThunderProtectedSources = CreateBackgroundSources(switchboardWindow, warThunderProtected);
warThunderProtectedSources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, warThunderProtectedSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 4002,
    "Automatic capture must detect War Thunder when protected-process metadata hides its path.");

var warThunderTitleOnly = warThunderStandalone with
{
    Handle = 403,
    ProcessId = 4003,
    ExecutablePath = string.Empty,
    ExecutableName = string.Empty,
    ProductName = "War Thunder",
    ClassName = string.Empty,
};
var warThunderTitleOnlySources = CreateBackgroundSources(switchboardWindow, warThunderTitleOnly);
warThunderTitleOnlySources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, warThunderTitleOnlySources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 4003,
    "Automatic capture must detect War Thunder by title when process metadata is fully blocked.");

var warThunderLauncher = new WindowsCaptureSources.WindowInfo(
    404,
    4004,
    "War Thunder Launcher",
    @"C:\WarThunder\launcher.exe",
    "launcher",
    "War Thunder Launcher",
    "Qt5152QWindowIcon",
    false,
    false);
var launcherOnlySources = CreateBackgroundSources(switchboardWindow, warThunderLauncher);
launcherOnlySources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, launcherOnlySources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(5.1)) is null,
    "The War Thunder launcher must not count as a game.");
var gamePlusLauncherSources = CreateBackgroundSources(switchboardWindow, warThunderStandalone, warThunderLauncher);
gamePlusLauncherSources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, gamePlusLauncherSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 4000,
    "An open launcher must not block War Thunder game detection.");

var wardogsClient = new WindowsCaptureSources.WindowInfo(
    500,
    5000,
    "Wardogs",
    @"C:\Program Files (x86)\Steam\steamapps\common\WARDOGS Playtest\Wardogs\Binaries\Win64\WardogsClient-Win64-Shipping.exe",
    "WardogsClient-Win64-Shipping",
    "Wardogs",
    "UnrealWindow",
    true,
    false);
var wardogsSources = CreateBackgroundSources(switchboardWindow, wardogsClient);
AssertValue(true, wardogsSources.DetectAutomaticGame(automaticGameStartedAt) is null,
    "WARDOGS must pass the stability window before capture starts.");
AssertValue(true, wardogsSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 5000,
    "Automatic capture must detect the WARDOGS client.");

var wardogsProtected = wardogsClient with
{
    Handle = 501,
    ProcessId = 5001,
    ExecutablePath = string.Empty,
    ExecutableName = "WardogsClient-Win64-Shipping",
    ProductName = "WardogsClient-Win64-Shipping",
    ClassName = string.Empty,
};
var wardogsProtectedSources = CreateBackgroundSources(switchboardWindow, wardogsProtected);
wardogsProtectedSources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, wardogsProtectedSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 5001,
    "Automatic capture must detect WARDOGS when anti-cheat hides its path.");

var wardogsTitleOnly = wardogsClient with
{
    Handle = 502,
    ProcessId = 5002,
    ExecutablePath = string.Empty,
    ExecutableName = string.Empty,
    ProductName = "Wardogs",
    ClassName = string.Empty,
};
var wardogsTitleOnlySources = CreateBackgroundSources(switchboardWindow, wardogsTitleOnly);
wardogsTitleOnlySources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, wardogsTitleOnlySources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 5002,
    "Automatic capture must detect WARDOGS by title when process metadata is fully blocked.");

var wardogsLauncher = new WindowsCaptureSources.WindowInfo(
    503,
    5003,
    "WARDOGS Launcher",
    @"C:\Program Files (x86)\Steam\steamapps\common\WARDOGS Playtest\WardogsLauncher-Shipping.exe",
    "WardogsLauncher-Shipping",
    "WARDOGS Launcher",
    "UnrealWindow",
    false,
    false);
var wardogsLauncherOnlySources = CreateBackgroundSources(switchboardWindow, wardogsLauncher);
wardogsLauncherOnlySources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, wardogsLauncherOnlySources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(5.1)) is null,
    "The WARDOGS launcher must not count as a game.");
var wardogsGamePlusLauncherSources = CreateBackgroundSources(switchboardWindow, wardogsClient, wardogsLauncher);
wardogsGamePlusLauncherSources.DetectAutomaticGame(automaticGameStartedAt);
AssertValue(true, wardogsGamePlusLauncherSources.DetectAutomaticGame(automaticGameStartedAt.AddSeconds(2.1))?.ProcessId == 5000,
    "An open launcher must not block WARDOGS game detection.");

using (var childJob = new WindowsChildProcessJob())
using (var child = childJob.Start(
           new ProcessStartInfo(Environment.ProcessPath!, "--job-child")
           {
               UseShellExecute = false,
               CreateNoWindow = true,
           },
           "capture cleanup test child"))
{
    childJob.Dispose();
    using var childExitTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    await child.WaitForExitAsync(childExitTimeout.Token);
    AssertValue(true, child.HasExited, "Closing the capture process job must terminate child encoders.");
}

var cleanupRoot = Path.Combine(Path.GetTempPath(), $"switchboard-ring-cleanup-{Guid.NewGuid():N}");
try
{
    var abandoned = Path.Combine(cleanupRoot, "session-abandoned");
    Directory.CreateDirectory(abandoned);
    File.WriteAllText(Path.Combine(abandoned, "segment-000000000.mkv"), "encoded-test-data");
    new ReplaySegmentRing(cleanupRoot, 1).CleanupAbandonedSessions(TimeSpan.Zero);
    if (Directory.Exists(abandoned))
        throw new InvalidOperationException("Abandoned replay sessions must be removed before a new host session starts.");
}
finally
{
    if (Directory.Exists(cleanupRoot)) Directory.Delete(cleanupRoot, recursive: true);
}

Console.WriteLine("Capture.Host deterministic tests passed.");

static void TestReactionDetector()
{
    long now = 1_000;
    var detector = new ReactionDetector(() => now);
    detector.Configure(enabled: true, sensitivity: "balanced", cooldownSeconds: 15);

    for (var index = 0; index < 34; index++) FeedTone(detector, ref now, rmsDb: -30);
    for (var index = 0; index < 20; index++) FeedTone(detector, ref now, rmsDb: -29);
    AssertValue(false, detector.TryTakeDetection(out _),
        "Ordinary speech near the learned baseline must not create a reaction.");

    FeedTone(detector, ref now, rmsDb: -8);
    FeedSilence(detector, ref now);
    AssertValue(false, detector.TryTakeDetection(out _),
        "A single loud transient must not pass the reaction sustain gate.");

    for (var index = 0; index < 5; index++) FeedTone(detector, ref now, rmsDb: -8);
    AssertValue(true, detector.TryTakeDetection(out var first),
        "A sustained voice-shaped burst above the learned baseline must create a reaction.");
    AssertValue(true, first.Confidence >= 0.58 && first.Confidence <= 0.98,
        "Reaction confidence must remain bounded.");

    for (var index = 0; index < 20; index++) FeedTone(detector, ref now, rmsDb: -7);
    AssertValue(false, detector.TryTakeDetection(out _),
        "The detector cooldown must suppress repeated clips from one loud exchange.");

    now += 16_000;
    for (var index = 0; index < 5; index++) FeedTone(detector, ref now, rmsDb: -8);
    AssertValue(true, detector.TryTakeDetection(out _),
        "Reaction detection must resume after the bounded cooldown.");

    var runtime = detector.Snapshot(inputActive: true);
    AssertValue(true, runtime.AnalyzedFrames >= 80,
        "Reaction diagnostics must count analyzed microphone frames.");
    AssertValue(true, runtime.AnalysisAverageMs < 5,
        "Reaction analysis must remain well below one 50 ms callback budget in the deterministic host test.");
    Console.WriteLine($"Reaction detector analyzed {runtime.AnalyzedFrames:N0} frames at {runtime.AnalysisAverageMs:F4} ms average.");

    detector.Configure(enabled: false, sensitivity: "balanced", cooldownSeconds: 15);
    AssertEqual("disabled", detector.Snapshot(inputActive: false).State,
        "Disabling reaction clipping must release the detector state.");
}

static void FeedTone(ReactionDetector detector, ref long now, double rmsDb)
{
    const int sampleRate = 48_000;
    const int milliseconds = 50;
    var samples = new float[sampleRate * milliseconds / 1_000];
    var peak = Math.Min(0.95, Math.Pow(10, rmsDb / 20) * Math.Sqrt(2));
    for (var index = 0; index < samples.Length; index++)
        samples[index] = (float)(Math.Sin(2 * Math.PI * 220 * index / sampleRate) * peak);
    now += milliseconds;
    detector.Observe(
        MemoryMarshal.AsBytes(samples.AsSpan()),
        silent: false,
        PcmSampleFormat.Float32,
        channels: 1,
        sampleRate);
}

static void FeedSilence(ReactionDetector detector, ref long now)
{
    const int sampleRate = 48_000;
    const int milliseconds = 50;
    var samples = new float[sampleRate * milliseconds / 1_000];
    now += milliseconds;
    detector.Observe(
        MemoryMarshal.AsBytes(samples.AsSpan()),
        silent: true,
        PcmSampleFormat.Float32,
        channels: 1,
        sampleRate);
}

static void AssertSequence(IEnumerable<string> actual, IReadOnlyList<string> expected, string message)
{
    if (!actual.SequenceEqual(expected)) throw new InvalidOperationException(message);
}

static void AssertRemuxStdinIsolation()
{
    var arguments = ReplayEngine.BuildRemuxArguments(
        "video-concat.txt",
        "system-concat.txt",
        "microphone-concat.txt",
        "clip.mp4.clip-writing",
        TimeSpan.FromSeconds(22),
        "Game",
        "Microphone");
    AssertValue(true, arguments.Contains("-nostdin"),
        "Replay remux must not inherit Capture.Host stdin and consume shortcut commands.");
    AssertValue(false, arguments.Any(argument => argument.Contains("amix")),
        "Replay inputs must stay on separate tracks so the microphone can be muted without losing game audio.");
    AssertSequence(
        ValuesFollowing(arguments, "-map"),
        ["0:v:0", "1:a:0", "2:a:0"],
        "A saved clip must expose game and microphone as separate audio tracks.");
    var chatArguments = ReplayEngine.BuildRemuxArguments(
        "video-concat.txt",
        "system-concat.txt",
        "chat-concat.txt",
        "microphone-concat.txt",
        "clip.mp4.clip-writing",
        TimeSpan.FromSeconds(22),
        "Game",
        "Chat",
        "Microphone");
    AssertSequence(
        ValuesFollowing(chatArguments, "-map"),
        ["0:v:0", "1:a:0", "2:a:0", "3:a:0"],
        "Game, chat, and microphone must each keep their own clip track when chat capture is enabled.");
}

static void AssertEqual(string expected, string actual, string message)
{
    if (!string.Equals(expected, actual, StringComparison.Ordinal))
        throw new InvalidOperationException($"{message} Expected '{expected}', got '{actual}'.");
}

static void AssertValue<T>(T expected, T actual, string message) where T : IEquatable<T>
{
    if (!actual.Equals(expected))
        throw new InvalidOperationException($"{message} Expected '{expected}', got '{actual}'.");
}

static void AssertThrows<T>(Action operation, string message) where T : Exception
{
    try { operation(); }
    catch (T) { return; }
    throw new InvalidOperationException(message);
}

static IEnumerable<string> ValuesFollowing(IReadOnlyList<string> arguments, string option)
{
    for (var index = 0; index < arguments.Count - 1; index++)
        if (arguments[index] == option) yield return arguments[index + 1];
}

internal sealed class TestAudioPipeInput(int SampleRate, int Channels) : IAudioPipeInput
{
    public string Label => "Test system audio";
    public string PipePath => @"\\.\pipe\switchboard-capture-test";
    public int SampleRate { get; } = SampleRate;
    public int Channels { get; } = Channels;
    public string FfmpegSampleFormat => "f32le";
    public long DroppedPackets => 0;
    public long CapturedBytes => 0;
    public long WrittenBytes => 0;
    public int BytesPerSecond => SampleRate * Channels * sizeof(float);
    public string? Error => null;
    public Task ConnectAndStartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
