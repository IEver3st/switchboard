using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Switchboard.CaptureHost;

internal sealed record ReplaySegmentInfo(
    string Path,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    long SizeBytes,
    bool Complete);

internal sealed class ReplaySegmentRing
{
    private readonly string rootDirectory;
    private readonly int segmentSeconds;

    public ReplaySegmentRing(string cacheDirectory, int segmentSeconds)
    {
        rootDirectory = Path.GetFullPath(cacheDirectory);
        this.segmentSeconds = segmentSeconds;
        Directory.CreateDirectory(rootDirectory);
    }

    public string CreateSessionDirectory()
    {
        var directory = Path.Combine(rootDirectory, $"session-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        return directory;
    }

    public IReadOnlyList<ReplaySegmentInfo> List(string sessionDirectory, bool captureRunning)
    {
        if (!Directory.Exists(sessionDirectory)) return [];
        var files = new DirectoryInfo(sessionDirectory)
            .EnumerateFiles("segment-*.mkv", SearchOption.TopDirectoryOnly)
            .Where(file => file.Length > 0)
            .OrderBy(file => file.LastWriteTimeUtc)
            .ToArray();
        if (files.Length == 0) return [];

        var completedCount = captureRunning ? Math.Max(0, files.Length - 1) : files.Length;
        var output = new ReplaySegmentInfo[files.Length];
        for (var index = 0; index < files.Length; index++)
        {
            var endedAt = new DateTimeOffset(files[index].LastWriteTimeUtc, TimeSpan.Zero);
            output[index] = new ReplaySegmentInfo(
                files[index].FullName,
                endedAt - TimeSpan.FromSeconds(segmentSeconds),
                endedAt,
                files[index].Length,
                index < completedCount);
        }
        return output;
    }

    public IReadOnlyList<ReplaySegmentInfo> SelectForReplay(
        IReadOnlyList<ReplaySegmentInfo> segments,
        TimeSpan duration)
    {
        return SelectForReplayCore(segments, duration);
    }

    internal static IReadOnlyList<ReplaySegmentInfo> SelectForReplayCore(
        IReadOnlyList<ReplaySegmentInfo> segments,
        TimeSpan duration)
    {
        if (duration <= TimeSpan.Zero) return [];
        var completed = segments
            .Where(segment => segment.Complete && segment.EndedAt > segment.StartedAt)
            .OrderBy(segment => segment.StartedAt)
            .ToArray();
        if (completed.Length == 0) return [];

        var selected = new List<ReplaySegmentInfo>();
        var replayStart = completed[^1].EndedAt - duration;
        for (var index = completed.Length - 1; index >= 0; index--)
        {
            if (completed[index].EndedAt <= replayStart && selected.Count > 0) break;
            selected.Insert(0, completed[index]);
        }
        return selected;
    }

    public IReadOnlyList<ReplaySegmentInfo> Evict(
        string sessionDirectory,
        TimeSpan maximumDuration,
        long maximumBytes,
        bool captureRunning)
    {
        var segments = List(sessionDirectory, captureRunning);
        var candidates = SelectEvictionCandidates(segments, maximumDuration, maximumBytes);
        foreach (var segment in candidates)
        {
            try { File.Delete(segment.Path); } catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        return candidates;
    }

    internal static IReadOnlyList<ReplaySegmentInfo> SelectEvictionCandidates(
        IReadOnlyList<ReplaySegmentInfo> segments,
        TimeSpan maximumDuration,
        long maximumBytes)
    {
        var completed = segments.Where(segment => segment.Complete).OrderBy(segment => segment.StartedAt).ToArray();
        if (completed.Length == 0) return [];
        var candidates = new List<ReplaySegmentInfo>();
        var bytes = completed.Sum(segment => segment.SizeBytes);
        var first = 0;
        while (first < completed.Length)
        {
            var duration = completed[^1].EndedAt - completed[first].StartedAt;
            if (duration <= maximumDuration && bytes <= maximumBytes) break;
            candidates.Add(completed[first]);
            bytes -= completed[first].SizeBytes;
            first++;
        }
        return candidates;
    }

    public string Snapshot(IReadOnlyList<ReplaySegmentInfo> segments)
    {
        if (segments.Count == 0) throw new InvalidOperationException("Replay ring has no completed segments.");
        var snapshotDirectory = Path.Combine(rootDirectory, $"snapshot-{Guid.NewGuid():N}");
        Directory.CreateDirectory(snapshotDirectory);
        try
        {
            for (var index = 0; index < segments.Count; index++)
            {
                var destination = Path.Combine(snapshotDirectory, $"{index:D4}.mkv");
                try
                {
                    CreateHardLink(destination, segments[index].Path);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException or PlatformNotSupportedException)
                {
                    File.Copy(segments[index].Path, destination, overwrite: false);
                }
            }
            return snapshotDirectory;
        }
        catch
        {
            TryDeleteDirectory(snapshotDirectory);
            throw;
        }
    }

    public void CleanupAbandonedSessions(TimeSpan maximumAge)
    {
        if (!Directory.Exists(rootDirectory)) return;
        var cutoff = DateTimeOffset.UtcNow - maximumAge;
        foreach (var directory in new DirectoryInfo(rootDirectory).EnumerateDirectories())
        {
            if (directory.LastWriteTimeUtc >= cutoff.UtcDateTime) continue;
            TryDeleteDirectory(directory.FullName);
        }
    }

    public static void TryDeleteDirectory(string directory)
    {
        try { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); } catch { }
    }

    private static void CreateHardLink(string destination, string source)
    {
        if (!OperatingSystem.IsWindows() || !CreateHardLinkW(destination, source, 0))
            throw new IOException("Unable to create a replay snapshot hard link.", new Win32Exception(Marshal.GetLastWin32Error()));
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateHardLinkW(string fileName, string existingFileName, nint securityAttributes);
}
