namespace Switchboard.AudioHost;

internal sealed class MeterTelemetryDemand : IDisposable
{
    private int enabled;
    private readonly SemaphoreSlim enabledSignal = new(0, 1);

    public bool Enabled => Volatile.Read(ref enabled) != 0;

    public bool SetEnabled(bool next)
    {
        var value = next ? 1 : 0;
        var changed = Interlocked.Exchange(ref enabled, value) != value;
        if (changed && next && enabledSignal.CurrentCount == 0) enabledSignal.Release();
        return changed;
    }

    public async ValueTask WaitUntilEnabledAsync(CancellationToken cancellationToken)
    {
        while (!Enabled) await enabledSignal.WaitAsync(cancellationToken);
    }

    public void Dispose() => enabledSignal.Dispose();
}
