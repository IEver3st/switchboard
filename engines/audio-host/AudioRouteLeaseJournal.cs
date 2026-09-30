using System.Text.Json;

namespace Switchboard.AudioHost;

// Crash-recovery leases, not product preferences. Main persists the user's bus
// assignments. This write-ahead journal only records OS state we must restore.
internal sealed class AudioRouteLeaseJournal : IDisposable
{
    private readonly string path;
    private readonly FileStream ownership;
    private readonly IApplicationEndpointPolicy policy;
    private readonly List<AudioRouteLease> leases;
    public AudioRouteLeaseJournal(IApplicationEndpointPolicy policy)
    {
        this.policy = policy;
        path = Environment.GetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Switchboard", "Audio Routing", "leases.json");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        // A session can have only one owner of these Windows-wide preferences.
        ownership = new FileStream(path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        try
        {
            leases = Load(path);
            if (File.Exists(path)) Save();
        }
        catch { ownership.Dispose(); throw; }
    }

    private const int MaximumLeases = 256;

    public bool HasLease(string executablePath) =>
        leases.Any(lease => lease.Process.ExecutablePath.Equals(executablePath, StringComparison.OrdinalIgnoreCase));

    // One unreadable lease must not disable application mixing: the route it
    // cannot describe is unrecoverable anyway, while every valid lease still has
    // to be restored when its executable next runs.
    private static List<AudioRouteLease> Load(string path)
    {
        if (!File.Exists(path)) return [];
        List<AudioRouteLease?>? stored = null;
        try
        {
            if (new FileInfo(path).Length <= 1024 * 1024)
                stored = JsonSerializer.Deserialize<List<AudioRouteLease?>>(File.ReadAllText(path));
        }
        catch (JsonException) { }
        if (stored is null)
        {
            File.Move(path, $"{path}.invalid-{DateTime.UtcNow:yyyyMMddHHmmss}", overwrite: true);
            return [];
        }
        return stored.OfType<AudioRouteLease>().Where(lease => lease.IsValid && lease.ExecutableExists).Take(MaximumLeases).ToList();
    }

    public void Acquire(AudioProcessIdentity process, string sinkId)
    {
        if (leases.Any(lease => lease.Process == process)) return;
        var original = leases.FirstOrDefault(lease => lease.Process.ExecutablePath.Equals(process.ExecutablePath, StringComparison.OrdinalIgnoreCase))?.Previous;
        var lease = new AudioRouteLease(process, sinkId, original ?? policy.ReadPreferences(process.Id));
        if (leases.Count >= 256) throw new InvalidOperationException("Audio route recovery journal is full; resolve outstanding leases before routing more apps.");
        leases.Add(lease);
        try { Save(); }
        catch { leases.Remove(lease); throw; }
        try { policy.WritePreferences(process.Id, ApplicationAudioPolicy.PreferencesFor(sinkId)); }
        catch
        {
            // Covers partial Console/Multimedia/Communications writes too.
            Restore(process);
            throw;
        }
    }

    public void Restore(AudioProcessIdentity process)
    {
        foreach (var lease in leases.Where(lease => lease.Process == process).ToArray())
        {
            if (AudioProcessIdentity.TryRead(process.Id) != process) continue;
            policy.RestorePreferences(process.Id, lease.SinkId, lease.Previous);
            leases.Remove(lease);
            Save();
        }
    }

    public void Recover(IEnumerable<AudioProcessIdentity> processes)
    {
        foreach (var process in processes.DistinctBy(process => process.ExecutablePath, StringComparer.OrdinalIgnoreCase))
        {
            foreach (var lease in leases.Where(lease => string.Equals(lease.Process.ExecutablePath, process.ExecutablePath, StringComparison.OrdinalIgnoreCase)).ToArray())
            {
                policy.RestorePreferences(process.Id, lease.SinkId, lease.Previous);
                leases.Remove(lease);
                Save();
            }
        }
    }

    public void RestoreAll()
    {
        List<Exception> failures = [];
        foreach (var process in leases.Select(lease => lease.Process).ToArray())
            try { Restore(process); } catch (Exception error) { failures.Add(error); }
        if (failures.Count > 0) throw new AggregateException("Some application routes could not be restored; recovery leases were retained.", failures);
    }

    private void Save()
    {
        var temporary = path + ".tmp";
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            JsonSerializer.Serialize(stream, leases);
            stream.Flush(flushToDisk: true);
        }
        File.Move(temporary, path, overwrite: true);
    }

    public void Dispose() => ownership.Dispose();
}

internal sealed record AudioRouteLease(AudioProcessIdentity Process, string SinkId, ApplicationEndpointPreferences Previous)
{
    public bool IsValid => Process is not null && Process.Id > 0 && Process.StartedAt > 0
        && AudioApplicationPreference.IsExecutablePath(Process.ExecutablePath)
        && !string.IsNullOrWhiteSpace(SinkId) && SinkId.Length <= 2048 && Previous is not null
        && new[] { Previous.Console, Previous.Multimedia, Previous.Communications }.All(value => value is not null && value.Length <= 4096);

    // Windows persists the redirect per executable. A deleted executable (such
    // as a removed test build) can never run again, so nothing is left to restore.
    public bool ExecutableExists => File.Exists(Process.ExecutablePath);
}
