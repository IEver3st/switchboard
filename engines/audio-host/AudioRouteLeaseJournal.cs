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
            if (File.Exists(path) && new FileInfo(path).Length > 1024 * 1024) throw new InvalidOperationException("Audio route recovery journal is too large.");
            leases = File.Exists(path) ? JsonSerializer.Deserialize<List<AudioRouteLease>>(File.ReadAllText(path)) ?? [] : [];
            if (leases.Count > 256) throw new InvalidOperationException("Audio route recovery journal has too many leases.");
            foreach (var lease in leases) lease.Validate();
        }
        catch { ownership.Dispose(); throw; }
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
    public void Validate()
    {
        if (Process is null || Process.Id <= 0 || Process.StartedAt <= 0 || string.IsNullOrWhiteSpace(SinkId) || SinkId.Length > 2048
            || Previous is null || new[] { Previous.Console, Previous.Multimedia, Previous.Communications }.Any(value => value is null || value.Length > 4096))
            throw new InvalidOperationException("Audio route recovery journal is invalid.");
        new AudioApplicationPreference(Process.ExecutablePath, "game").Validate();
    }
}
