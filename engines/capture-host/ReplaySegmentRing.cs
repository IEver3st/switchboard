using System.ComponentModel;
using System.Globalization;
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
    private readonly Dictionary<string, ManifestInventory> inventories = new(StringComparer.Ordinal);
    private string? inventoryDirectory;
    private readonly Func<DateTimeOffset> now;
    internal int DirectoryScanCount { get; private set; }
    private sealed class ManifestInventory
    {
        public DateTime LastWrite;
        public long Length = -1;
        public DateTimeOffset ReconciledAt;
        public DateTimeOffset Origin;
        public bool SweepOrphans;
        public HashSet<string> Known = new(StringComparer.Ordinal);
        public Dictionary<string, ReplaySegmentInfo> Completed = new(StringComparer.Ordinal);
    }

    public ReplaySegmentRing(string cacheDirectory, int segmentSeconds, Func<DateTimeOffset>? now = null)
    {
        rootDirectory = Path.GetFullPath(cacheDirectory);
        this.segmentSeconds = segmentSeconds;
        this.now = now ?? (() => DateTimeOffset.UtcNow);
        Directory.CreateDirectory(rootDirectory);
    }

    public string CreateSessionDirectory()
    {
        var directory = Path.Combine(rootDirectory, $"session-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        return directory;
    }

    public IReadOnlyList<ReplaySegmentInfo> List(
        string sessionDirectory,
        bool captureRunning,
        string searchPattern = "segment-*.mkv", bool reconcile = true)
    {
        if (!Directory.Exists(sessionDirectory)) return [];
        var originPath = Path.Combine(sessionDirectory, "timeline-origin.txt");
        if (File.Exists(originPath)) return ListManifest(sessionDirectory, searchPattern, reconcile);
        var files = new DirectoryInfo(sessionDirectory)
            .EnumerateFiles(searchPattern, SearchOption.TopDirectoryOnly)
            .Where(file => file.Length > 0)
            .OrderBy(file => file.Name, StringComparer.Ordinal)
            .ToArray();
        if (files.Length == 0) return [];

        var completedCount = captureRunning ? Math.Max(0, files.Length - 1) : files.Length;
        var latestEnd = new DateTimeOffset(files.Max(file => file.LastWriteTimeUtc), TimeSpan.Zero);
        var output = new ReplaySegmentInfo[files.Length];
        for (var index = 0; index < files.Length; index++)
        {
            // Segment muxers may close several files in a burst, so filesystem mtimes
            // are not a usable media timeline. Filenames are monotonic and the encoder
            // forces a keyframe at every fixed segment boundary.
            var endedAt = latestEnd - TimeSpan.FromSeconds((files.Length - 1 - index) * segmentSeconds);
            output[index] = new ReplaySegmentInfo(
                files[index].FullName,
                endedAt - TimeSpan.FromSeconds(segmentSeconds),
                endedAt,
                files[index].Length,
                index < completedCount);
        }
        return output;
    }

    // Closed-segment sizes and times are immutable. The encoder's bounded manifest
    // identifies new segments; ordinary ticks stat only those new files. Explicit
    // saves and a 30s fallback reconcile external deletion and rolled-out entries.
    private IReadOnlyList<ReplaySegmentInfo> ListManifest(string directory, string pattern, bool force)
    {
        if (inventoryDirectory != directory) { inventories.Clear(); inventoryDirectory = directory; }
        if (!inventories.TryGetValue(pattern, out var cache)) inventories[pattern] = cache = new();
        var manifest = new FileInfo(Path.Combine(directory, $"{pattern[..pattern.IndexOf('-')]}-timeline.csv"));
        if (!manifest.Exists) { cache.Completed.Clear(); cache.Known.Clear(); cache.Length = -1; return []; }
        var reconcile = force || cache.Length < 0 || now() - cache.ReconciledAt >= TimeSpan.FromSeconds(30);
        if (!reconcile && cache.Length == manifest.Length && cache.LastWrite == manifest.LastWriteTimeUtc)
            return cache.Completed.Values.OrderBy(segment => segment.StartedAt).ToArray();
        if (reconcile)
        {
            cache.Origin = DateTimeOffset.Parse(File.ReadAllText(Path.Combine(directory, "timeline-origin.txt")), CultureInfo.InvariantCulture);
            cache.Completed.Clear(); cache.Known.Clear(); cache.ReconciledAt = now();
        }
        var names = new HashSet<string>(StringComparer.Ordinal);
        var pendingFile = false;
        using (var stream = new FileStream(manifest.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        using (var reader = new StreamReader(stream))
        {
            while (reader.ReadLine() is { } line)
            {
                var fields = line.Split(',');
                if (fields.Length != 3
                    || !double.TryParse(fields[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var start)
                    || !double.TryParse(fields[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var end)
                    || !double.IsFinite(start) || !double.IsFinite(end) || start < 0 || end <= start
                    || end > TimeSpan.FromDays(365).TotalSeconds) continue;
                var name = fields[0].Trim('"');
                // Only a basename matching this stream can become a local file path.
                if (Path.GetFileName(name) != name || !System.IO.Enumeration.FileSystemName.MatchesSimpleExpression(pattern, name)) continue;
                names.Add(name);
                if (cache.Known.Contains(name)) continue;
                var file = new FileInfo(Path.Combine(directory, name));
                if (!file.Exists) { cache.Known.Add(name); continue; } // Tombstone until explicit/periodic reconciliation.
                if (file.Length == 0) { pendingFile = true; continue; }
                cache.Known.Add(name);
                cache.Completed[name] = new(file.FullName, cache.Origin.AddSeconds(start), cache.Origin.AddSeconds(end), file.Length, true);
            }
        }
        cache.Known.IntersectWith(names);
        foreach (var name in cache.Completed.Keys.Where(name => !names.Contains(name)).ToArray()) cache.Completed.Remove(name);
        cache.Length = pendingFile ? -1 : manifest.Length; cache.LastWrite = manifest.LastWriteTimeUtc;
        cache.SweepOrphans |= reconcile;
        return cache.Completed.Values.OrderBy(segment => segment.StartedAt).ToArray();
    }

    private void SweepOrphans(string directory, string pattern)
    {
        if (inventories.TryGetValue(pattern, out var cache) && cache.SweepOrphans && cache.Completed.Count > 0)
        {
            cache.SweepOrphans = false;
            DirectoryScanCount++;
            var oldest = cache.Completed.Keys.Min(StringComparer.Ordinal)!;
            foreach (var path in Directory.EnumerateFiles(directory, pattern))
            {
                if (StringComparer.Ordinal.Compare(Path.GetFileName(path), oldest) >= 0) continue;
                try { File.Delete(path); } catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
    }

    public IReadOnlyList<ReplaySegmentInfo> SelectForReplay(
        IReadOnlyList<ReplaySegmentInfo> segments,
        TimeSpan duration)
    {
        return SelectForReplayCore(segments, duration);
    }

    public IReadOnlyList<ReplaySegmentInfo> SelectForWindow(
        IReadOnlyList<ReplaySegmentInfo> segments,
        DateTimeOffset startedAt,
        DateTimeOffset endedAt)
    {
        return SelectForWindowCore(segments, startedAt, endedAt);
    }

    internal static IReadOnlyList<ReplaySegmentInfo> SelectForWindowCore(
        IReadOnlyList<ReplaySegmentInfo> segments,
        DateTimeOffset startedAt,
        DateTimeOffset endedAt)
    {
        if (endedAt <= startedAt) return [];
        return segments
            .Where(segment => segment.Complete
                              && segment.EndedAt > startedAt
                              && segment.StartedAt < endedAt)
            .OrderBy(segment => segment.StartedAt)
            .ToArray();
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

    // Return retained completed bytes from this inventory, including locked
    // files whose deletion failed. Callers need not rescan the same ring.
    public long Evict(
        string sessionDirectory,
        TimeSpan maximumDuration,
        long maximumBytes,
        bool captureRunning,
        string searchPattern = "segment-*.mkv")
    {
        var segments = List(sessionDirectory, captureRunning, searchPattern, reconcile: false);
        SweepOrphans(sessionDirectory, searchPattern);
        var candidates = SelectEvictionCandidates(segments, maximumDuration, maximumBytes);
        var retainedBytes = segments.Where(segment => segment.Complete).Sum(segment => segment.SizeBytes);
        foreach (var segment in candidates)
        {
            try {
                File.Delete(segment.Path); retainedBytes -= segment.SizeBytes;
                if (inventories.TryGetValue(searchPattern, out var cache)) cache.Completed.Remove(Path.GetFileName(segment.Path));
            } catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        return retainedBytes;
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
                var destination = Path.Combine(snapshotDirectory, $"{index:D4}{Path.GetExtension(segments[index].Path)}");
                try
                {
                    CreateHardLink(destination, segments[index].Path);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException or PlatformNotSupportedException)
                {
                    File.Copy(segments[index].Path, destination, overwrite: false);
                }
            }
            File.WriteAllLines(Path.Combine(snapshotDirectory, "durations.txt"), segments.Select(segment =>
                (segment.EndedAt - segment.StartedAt).TotalSeconds.ToString("0.######", CultureInfo.InvariantCulture)));
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
