using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Switchboard.CaptureHost;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};
var outputGate = new SemaphoreSlim(1, 1);
var shutdown = new CancellationTokenSource();
var requests = new OperationTracker();
CancellationTokenSource? diagnosticCancellation = null;
string? diagnosticRunId = null;
AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
{
    try
    {
        var message = eventArgs.ExceptionObject switch
        {
            Exception exception => $"{exception.GetType().Name}: {exception.Message}",
            _ => "Capture.Host encountered an unhandled error.",
        };
        Console.Error.WriteLine($"[capture-host] fatal: {message}");
    }
    catch { }
};
TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
{
    try { Console.Error.WriteLine($"[capture-host] background task failed: {eventArgs.Exception.GetBaseException().Message}"); } catch { }
    eventArgs.SetObserved();
};
await using var engine = new ReplayEngine();
engine.Diagnostics.Recorded += diagnostic =>
{
    _ = WriteAsync(new { type = "event", @event = "captureDiagnostic", payload = diagnostic });
};
engine.SetDiagnosticsEnabled(Environment.GetEnvironmentVariable("SWITCHBOARD_DEVELOPER_DIAGNOSTICS") == "1");
var previousCpuTime = Process.GetCurrentProcess().TotalProcessorTime + engine.ChildProcessorTime;
var previousCpuSampleAt = Stopwatch.GetTimestamp();

engine.SnapshotChanged += snapshot =>
{
    _ = WriteAsync(new { type = "event", @event = "captureSnapshot", payload = snapshot });
    _ = WriteStatusAsync(snapshot);
};
engine.ReactionDetected += reaction =>
{
    _ = WriteAsync(new { type = "event", @event = "reactionDetected", payload = reaction });
};

await WriteStatusAsync(engine.GetSnapshot());

try
{
    while (!shutdown.IsCancellationRequested && await Console.In.ReadLineAsync(shutdown.Token) is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        if (IsShutdownCommand(line))
        {
            await HandleLineAsync(line);
            break;
        }
        requests.Track(HandleLineAsync(line));
    }
}
catch (OperationCanceledException) when (shutdown.IsCancellationRequested) { }

await Task.WhenAll(requests.Pending);

async Task HandleLineAsync(string line)
{
    string? requestId = null;
    try
    {
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        requestId = root.TryGetProperty("requestId", out var id) ? id.GetString() : null;
        var command = root.GetProperty("command").GetString() ?? throw new InvalidOperationException("Missing command.");
        var payload = root.TryGetProperty("payload", out var body) ? body : default;
        object? result = command switch
        {
            "setDiagnostics" => engine.SetDiagnosticsEnabled(ParseDiagnosticsEnabled(payload)),
            "runDiagnostics" => await RunDiagnosticsAsync(payload),
            "cancelDiagnostics" => CancelDiagnostics(payload),
            "start" => await engine.StartAsync(ParseSettings(payload), shutdown.Token),
            "configure" => await engine.ConfigureAsync(ParseSettings(payload), shutdown.Token),
            "stop" => await engine.StopAsync(shutdown.Token),
            "status" => engine.GetSnapshot(),
            "listSources" => engine.ListSources(),
            "saveReplay" => await engine.SaveReplayAsync(ParseSaveReplayWindow(payload), shutdown.Token),
            "shutdown" => await ShutdownAsync(),
            _ => throw new InvalidOperationException($"Unknown command: {command}"),
        };

        if (requestId is not null) await WriteAsync(new { type = "response", requestId, result });
    }
    catch (Exception commandError)
    {
        if (requestId is not null)
            await WriteAsync(new { type = "response", requestId, error = commandError.Message });
        else
            await WriteAsync(new { type = "event", @event = "fatalCaptureError", payload = new { message = commandError.Message } });
    }
}

CaptureSettings ParseSettings(JsonElement payload)
{
    if (payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        throw new InvalidOperationException("Capture settings are required.");
    return payload.Deserialize<CaptureSettings>(jsonOptions)?.Validate()
           ?? throw new InvalidOperationException("Capture settings could not be parsed.");
}

async Task<object> RunDiagnosticsAsync(JsonElement payload)
{
    if (diagnosticCancellation is not null) throw new InvalidOperationException("A diagnostic run is already active.");
    var runId = payload.GetProperty("runId").GetString();
    if (!Guid.TryParse(runId, out _)) throw new InvalidOperationException("Invalid diagnostic run identifier.");
    var settings = payload.GetProperty("settings").Deserialize<CaptureSettings>(jsonOptions)
        ?? throw new InvalidOperationException("Capture settings could not be parsed.");
    // Missing window selection is a diagnosis, not a reason to skip all the
    // independent display/encoder/storage checks. Validate all other fields.
    _ = (settings.Source == "window" && string.IsNullOrWhiteSpace(settings.SourceId)
        ? settings with { Source = "automatic-game" } : settings).Validate();
    using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(shutdown.Token);
    cancellation.CancelAfter(TimeSpan.FromSeconds(90));
    diagnosticCancellation = cancellation;
    diagnosticRunId = runId;
    try
    {
        await engine.RunDiagnosticsAsync(settings, check =>
        {
            var bounded = check with { Detail = check.Detail[..Math.Min(8192, check.Detail.Length)] };
            _ = WriteAsync(new { type = "event", @event = "diagnosticCheck", payload = new { runId, check = bounded } });
        }, cancellation.Token);
        return new { completed = true };
    }
    finally { diagnosticCancellation = null; diagnosticRunId = null; }
}

object CancelDiagnostics(JsonElement payload)
{
    if (payload.TryGetProperty("runId", out var runId) && runId.GetString() == diagnosticRunId)
        diagnosticCancellation?.Cancel();
    return new { cancelled = true };
}

bool ParseDiagnosticsEnabled(JsonElement payload)
{
    if (payload.ValueKind != JsonValueKind.Object || !payload.TryGetProperty("enabled", out var enabled)
        || enabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        throw new InvalidOperationException("Diagnostics requires a boolean enabled flag.");
    return enabled.GetBoolean();
}

SaveReplayWindow? ParseSaveReplayWindow(JsonElement payload)
{
    if (payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return null;
    if (!payload.TryGetProperty("startedAt", out _) && !payload.TryGetProperty("endedAt", out _)) return null;
    return payload.Deserialize<SaveReplayWindow>(jsonOptions)
           ?? throw new InvalidOperationException("The replay window could not be parsed.");
}

async Task<object> ShutdownAsync()
{
    diagnosticCancellation?.Cancel();
    await engine.StopAsync(CancellationToken.None);
    shutdown.Cancel();
    return new { stopped = true };
}

bool IsShutdownCommand(string line)
{
    try
    {
        using var document = JsonDocument.Parse(line);
        return document.RootElement.TryGetProperty("command", out var command)
               && command.ValueEquals("shutdown");
    }
    catch (JsonException)
    {
        return false;
    }
}

async Task WriteStatusAsync(CaptureHostSnapshot snapshot)
{
    var replayState = snapshot.Runtime.State;
    var state = replayState switch
    {
        "stopped" => "stopped",
        "starting" => "starting",
        "error" => "error",
        _ => "running",
    };
    var process = Process.GetCurrentProcess();
    process.Refresh();
    var sampledAt = Stopwatch.GetTimestamp();
    var cpuTime = process.TotalProcessorTime + engine.ChildProcessorTime;
    var elapsedSeconds = (sampledAt - previousCpuSampleAt) / (double)Stopwatch.Frequency;
    var cpuSeconds = (cpuTime - previousCpuTime).TotalSeconds;
    var cpuPercent = elapsedSeconds <= 0
        ? 0
        : Math.Clamp(cpuSeconds / elapsedSeconds / Environment.ProcessorCount * 100, 0, 100);
    previousCpuTime = cpuTime;
    previousCpuSampleAt = sampledAt;
    var resourceProcesses = new List<object>();
    if (state != "stopped")
    {
        resourceProcesses.Add(new
        {
            pid = Environment.ProcessId,
            role = "host",
            privateMemoryMb = Math.Round(process.PrivateMemorySize64 / 1024d / 1024d, 1),
            workingSetMb = Math.Round(process.WorkingSet64 / 1024d / 1024d, 1),
        });
        resourceProcesses.AddRange(engine.GetProcessResources().Select(resource => (object)new
        {
            pid = resource.Pid,
            role = resource.Role,
            privateMemoryMb = Math.Round(resource.PrivateMemoryBytes / 1024d / 1024d, 1),
            workingSetMb = Math.Round(resource.WorkingSetBytes / 1024d / 1024d, 1),
        }));
    }
    await WriteAsync(new
    {
        type = "status",
        status = new
        {
            kind = "capture",
            state,
            pid = state == "stopped" ? (int?)null : Environment.ProcessId,
            cpuPercent = Math.Round(cpuPercent, 1),
            memoryMb = Math.Round((process.WorkingSet64 + engine.ChildWorkingSetBytes) / 1024d / 1024d, 1),
            uptimeSeconds = Math.Max(0, engine.Uptime.TotalSeconds),
            message = snapshot.Runtime.Error ?? snapshot.Runtime.Warning,
            updatedAt = DateTimeOffset.UtcNow,
            processes = resourceProcesses,
        },
    });
}

async Task WriteAsync(object message)
{
    var json = JsonSerializer.Serialize(message, jsonOptions);
    await outputGate.WaitAsync();
    try
    {
        await Console.Out.WriteLineAsync(json);
        await Console.Out.FlushAsync();
    }
    finally
    {
        outputGate.Release();
    }
}
