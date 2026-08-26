using Switchboard.CaptureHost;

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

static void AssertThrows<T>(Action operation, string message) where T : Exception
{
    try { operation(); }
    catch (T) { return; }
    throw new InvalidOperationException(message);
}
