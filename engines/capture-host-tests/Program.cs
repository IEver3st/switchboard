using System.Diagnostics;
using Switchboard.CaptureHost;

if (args.Contains("--job-child", StringComparer.Ordinal))
{
    await Task.Delay(TimeSpan.FromMinutes(5));
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
AssertThrows<ArgumentOutOfRangeException>(() => (validSettings with { Fps = 59 }).Validate(), "Unsupported FPS must fail validation.");
AssertThrows<InvalidOperationException>(() => (validSettings with { Source = "window", SourceId = null }).Validate(), "Window capture requires a target.");

var operations = new OperationTracker();
operations.Track(Task.CompletedTask);
await Task.Yield();
AssertValue(0, operations.Count, "Completed host requests must not remain tracked.");
AssertValue(false, ReplayEngine.IsHostActiveState("error"), "An errored capture engine must be restartable.");
AssertValue(true, ReplayEngine.IsHostActiveState("buffering"), "A buffering capture engine must remain active.");

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

static void AssertSequence(IEnumerable<string> actual, IReadOnlyList<string> expected, string message)
{
    if (!actual.SequenceEqual(expected)) throw new InvalidOperationException(message);
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
