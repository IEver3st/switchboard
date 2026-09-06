using System.Diagnostics;

namespace Switchboard.CaptureHost;

internal sealed record CaptureDiagnostic(string Level, string Event, IReadOnlyDictionary<string, object?> Data);

internal sealed class CaptureDiagnostics
{
    private volatile bool enabled;
    private readonly object gate = new();
    private long windowStarted;
    private int windowCount;
    private long suppressed;

    public bool Enabled => enabled;
    public event Action<CaptureDiagnostic>? Recorded;

    public void SetEnabled(bool value)
    {
        lock (gate)
        {
            enabled = value;
            windowStarted = 0;
            windowCount = 0;
            suppressed = 0;
        }
        if (value) Write("info", "diagnostics.enabled", () => new() { ["pid"] = Environment.ProcessId });
    }

    // Never called from realtime audio callbacks. Main validates and redacts these records.
    public void Write(string level, string name, Func<Dictionary<string, object?>> data)
    {
        if (!enabled) return;
        lock (gate)
        {
            if (!enabled) return;
            var now = Stopwatch.GetTimestamp();
            if (Stopwatch.GetElapsedTime(windowStarted, now) >= TimeSpan.FromSeconds(1))
            {
                windowStarted = now;
                windowCount = 0;
            }
            if (++windowCount > 60) { suppressed++; return; }
            try
            {
                var fields = data();
                if (suppressed > 0) { fields["suppressedEvents"] = suppressed; suppressed = 0; }
                Recorded?.Invoke(new CaptureDiagnostic(level, name, fields));
            }
            catch { /* Diagnostic transport must never stop capture. */ }
        }
    }
}
