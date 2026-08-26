namespace Switchboard.CaptureHost;

internal sealed record CaptureSettings(
    int DisplayIndex = 0,
    int FramesPerSecond = 60,
    string Resolution = "1440p",
    string Codec = "av1",
    string Encoder = "auto",
    int Quality = 4,
    int ReplaySeconds = 60,
    bool IncludeCursor = false)
{
    public int SegmentSeconds => 2;
    public int SegmentCount => Math.Max(8, (int)Math.Ceiling(ReplaySeconds / (double)SegmentSeconds) + 2);
}

internal sealed record CaptureStatus(
    string State,
    bool Simulation,
    int? ProcessId,
    double MemoryMb,
    double BufferedSeconds,
    int SegmentCount,
    string Encoder,
    string? Message = null);

internal sealed record SavedReplay(
    string Name,
    string Path,
    int DurationSeconds,
    double SizeMb,
    DateTimeOffset CreatedAt,
    bool Prototype);
