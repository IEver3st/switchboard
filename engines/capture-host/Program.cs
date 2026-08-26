using System.Collections.Concurrent;
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
var requests = new ConcurrentDictionary<Guid, Task>();
await using var engine = new ReplayEngine();
var previousCpuTime = Process.GetCurrentProcess().TotalProcessorTime + engine.ChildProcessorTime;
var previousCpuSampleAt = Stopwatch.GetTimestamp();

engine.SnapshotChanged += snapshot =>
{
    _ = WriteAsync(new { type = "event", @event = "captureSnapshot", payload = snapshot });
    _ = WriteStatusAsync(snapshot);
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
        var operationId = Guid.NewGuid();
        var operation = HandleLineAsync(line).ContinueWith(
            completedTask => requests.TryRemove(operationId, out var _),
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
        requests[operationId] = operation;
    }
}
catch (OperationCanceledException) when (shutdown.IsCancellationRequested) { }

await Task.WhenAll(requests.Values);

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
            "start" => await engine.StartAsync(ParseSettings(payload), shutdown.Token),
            "configure" => await engine.ConfigureAsync(ParseSettings(payload), shutdown.Token),
            "stop" => await engine.StopAsync(shutdown.Token),
            "status" => engine.GetSnapshot(),
            "listSources" => engine.ListSources(),
            "saveReplay" => await engine.SaveReplayAsync(shutdown.Token),
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

async Task<object> ShutdownAsync()
{
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
