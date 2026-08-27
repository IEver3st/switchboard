using System.Text.Json.Serialization;

namespace Switchboard.CaptureHost;

internal sealed record CaptureSettings(
    bool Enabled = true,
    string Source = "automatic-game",
    string? SourceId = null,
    int DisplayIndex = 0,
    int Fps = 60,
    string Resolution = "1440p",
    string Codec = "h264",
    string Encoder = "auto",
    int Quality = 4,
    int ReplaySeconds = 60,
    bool IncludeMic = true,
    bool IncludeSystemAudio = true,
    bool IncludeCursor = false,
    int TargetVideoBitrateBps = 35_000_000,
    int MaximumVideoBitrateBps = 44_800_000,
    int SystemAudioBitrateBps = 192_000,
    int MicrophoneBitrateBps = 128_000,
    string CacheDirectory = "",
    string ClipsDirectory = "",
    string ThumbnailDirectory = "")
{
    public int SegmentSeconds => 1;
    public int SegmentRetentionSeconds => ReplaySeconds + SegmentSeconds * 3;
    public long EstimatedReplayBytes => (long)Math.Ceiling(
        (TargetVideoBitrateBps + SystemAudioBitrateBps + (IncludeMic ? MicrophoneBitrateBps : 0))
        * ReplaySeconds / 8d * 1.2);
    public long MaximumCacheBytes => Math.Max(256L * 1024 * 1024, EstimatedReplayBytes * 2);

    public CaptureSettings Validate()
    {
        if (Source is not ("automatic-game" or "window" or "display"))
            throw new ArgumentOutOfRangeException(nameof(Source));
        if (Source == "window" && string.IsNullOrWhiteSpace(SourceId))
            throw new InvalidOperationException("Select a window before starting window capture.");
        if (Fps is not (30 or 60 or 120)) throw new ArgumentOutOfRangeException(nameof(Fps));
        if (Resolution is not ("720p" or "1080p" or "1440p" or "2160p" or "native"))
            throw new ArgumentOutOfRangeException(nameof(Resolution));
        if (Codec is not ("h264" or "hevc" or "av1")) throw new ArgumentOutOfRangeException(nameof(Codec));
        if (Encoder is not ("auto" or "nvenc" or "amf" or "qsv" or "software"))
            throw new ArgumentOutOfRangeException(nameof(Encoder));
        if (Quality is < 1 or > 5) throw new ArgumentOutOfRangeException(nameof(Quality));
        if (ReplaySeconds is < 15 or > 300) throw new ArgumentOutOfRangeException(nameof(ReplaySeconds));
        if (TargetVideoBitrateBps < 1_000_000 || MaximumVideoBitrateBps < TargetVideoBitrateBps)
            throw new ArgumentOutOfRangeException(nameof(TargetVideoBitrateBps));
        if (string.IsNullOrWhiteSpace(CacheDirectory) || string.IsNullOrWhiteSpace(ClipsDirectory))
            throw new InvalidOperationException("Capture storage paths are required.");
        return this;
    }
}

internal sealed record CaptureSource(
    string Id,
    string Type,
    string Name,
    int? ProcessId,
    string? WindowHandle,
    string? DisplayId,
    bool Available,
    [property: JsonIgnore] long? DisplayHandle = null);

internal sealed record CaptureCapabilities(
    string Backend,
    IReadOnlyList<string> Encoders,
    IReadOnlyList<string> Codecs,
    int MaximumFps,
    bool SystemAudio,
    bool MicrophoneAudio,
    bool ExclusiveFullscreen = false);

internal sealed record CaptureStorageStatus(
    string ClipsDirectory,
    string CacheDirectory,
    long AvailableBytes,
    long VolumeTotalBytes,
    long VolumeAvailableBytes,
    long ClipsBytes,
    long ReplayCacheBytes,
    bool LowSpace,
    bool CriticalSpace,
    string? Warning = null);

internal sealed record CaptureRuntime(
    string State,
    double BufferedSeconds,
    int SegmentCount,
    long ReplayCacheBytes,
    double ObservedBitrateBps,
    string EncoderLabel,
    string BackendLabel,
    int DroppedFrames,
    long EncodedFrames,
    int AudioSyncCorrections,
    CaptureSource? ActiveSource,
    int SaveQueueDepth,
    bool ShortcutRegistered = false,
    string? Warning = null,
    string? Error = null,
    DateTimeOffset? LastSavedAt = null);

internal sealed record CaptureHostSnapshot(
    CaptureRuntime Runtime,
    CaptureStorageStatus Storage,
    CaptureCapabilities Capabilities,
    IReadOnlyList<CaptureSource> Sources);

internal sealed record SavedReplay(
    string Path,
    string Name,
    string? Game,
    long CreatedAt,
    long DurationMs,
    long FileSize,
    int Width,
    int Height,
    double Fps,
    string? Codec,
    string? ThumbnailPath = null);
