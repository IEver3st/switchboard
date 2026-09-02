using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Switchboard.AudioHost;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};
using var endpoints = new EndpointService();

if (args.Contains("--list-endpoints", StringComparer.OrdinalIgnoreCase))
{
    Console.WriteLine(JsonSerializer.Serialize(endpoints.List(), jsonOptions));
    return;
}

if (args.Contains("--benchmark", StringComparer.OrdinalIgnoreCase))
{
    Environment.ExitCode = await OfflineNoiseBenchmark.RunAsync(args, jsonOptions);
    return;
}

using var engine = new AudioEngine(endpoints);
using var shutdown = new CancellationTokenSource();
using var outputGate = new SemaphoreSlim(1, 1);
using var meterTelemetryDemand = new MeterTelemetryDemand();
var process = Process.GetCurrentProcess();
var previousCpuTime = process.TotalProcessorTime;
var previousCpuSampleAt = Stopwatch.GetTimestamp();

engine.SnapshotChanged += snapshot =>
{
    _ = WriteAsync(new { type = "event", @event = "audioSnapshot", payload = snapshot });
};

await WriteStatusAsync();
var telemetry = PublishTelemetryAsync(shutdown.Token);

try
{
    while (!shutdown.IsCancellationRequested && await Console.In.ReadLineAsync(shutdown.Token) is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        var shouldStop = await HandleLineAsync(line);
        if (shouldStop) break;
    }
}
catch (OperationCanceledException) when (shutdown.IsCancellationRequested) { }
finally
{
    shutdown.Cancel();
    engine.Stop();
    try { await telemetry; } catch (OperationCanceledException) { }
}

async Task<bool> HandleLineAsync(string line)
{
    string? requestId = null;
    try
    {
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        requestId = root.TryGetProperty("requestId", out var id) ? id.GetString() : null;
        var command = root.GetProperty("command").GetString() ?? throw new InvalidOperationException("Missing command.");
        var payload = root.TryGetProperty("payload", out var body) ? body : default;
        object? result;
        if (command == "testMicrophone")
        {
            await engine.RunMicrophoneTestAsync(shutdown.Token);
            result = new { completed = true };
        }
        else result = command switch
        {
            "start" => engine.Start(ParseSettings(payload)),
            "configure" => engine.Configure(ParseSettings(payload)),
            "stop" => engine.Stop(),
            "status" => engine.GetSnapshot(),
            "listEndpoints" => endpoints.List(),
            "listSessions" => ListSessions(),
            "routeApplication" => engine.RouteApplication(ParseRoute(payload)),
            "setMetering" => meterTelemetryDemand.SetEnabled(ParseMeteringEnabled(payload)),
            "shutdown" => engine.Stop(),
            _ => throw new InvalidOperationException($"Unknown command: {command}"),
        };
        if (requestId is not null) await WriteAsync(new { type = "response", requestId, result });
        if (command is "start" or "stop") await WriteStatusAsync();
        if (command == "shutdown")
        {
            shutdown.Cancel();
            return true;
        }
    }
    catch (Exception commandError)
    {
        if (requestId is not null)
            await WriteAsync(new { type = "response", requestId, error = commandError.Message });
        else
            await WriteAsync(new { type = "event", @event = "audioError", payload = new { message = commandError.Message } });
    }
    return false;
}

AudioApplicationRouteRequest ParseRoute(JsonElement payload)
{
    if (payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        throw new InvalidOperationException("An application route is required.");
    return payload.Deserialize<AudioApplicationRouteRequest>(jsonOptions)?.Validate()
           ?? throw new InvalidOperationException("The application route could not be parsed.");
}

object ListSessions()
{
    var virtualEndpoints = EndpointCatalog.Inspect(endpoints.List());
    return virtualEndpoints.Ready ? endpoints.ListApplications(virtualEndpoints) : Array.Empty<AudioApplicationState>();
}

AudioHostSettings ParseSettings(JsonElement payload)
{
    if (payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        throw new InvalidOperationException("Audio settings are required.");
    return payload.Deserialize<AudioHostSettings>(jsonOptions)?.Validate()
           ?? throw new InvalidOperationException("Audio settings could not be parsed.");
}

bool ParseMeteringEnabled(JsonElement payload)
{
    if (payload.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        throw new InvalidOperationException("Audio meter demand must be a boolean.");
    return payload.GetBoolean();
}

async Task PublishTelemetryAsync(CancellationToken cancellationToken)
{
    await Task.WhenAll(
        PublishMeterTelemetryAsync(cancellationToken),
        PublishStatusTelemetryAsync(cancellationToken));
}

async Task PublishMeterTelemetryAsync(CancellationToken cancellationToken)
{
    while (true)
    {
        await meterTelemetryDemand.WaitUntilEnabledAsync(cancellationToken);
        await Task.Delay(50, cancellationToken);
        if (engine.Running && meterTelemetryDemand.Enabled)
            await WriteAsync(new { type = "meters", frame = engine.GetMeterFrame() });
    }
}

async Task PublishStatusTelemetryAsync(CancellationToken cancellationToken)
{
    using var statusTimer = new PeriodicTimer(TimeSpan.FromSeconds(5));
    while (await statusTimer.WaitForNextTickAsync(cancellationToken))
    {
        engine.RecoverIfNeeded();
        await WriteAsync(new { type = "event", @event = "audioSnapshot", payload = engine.GetSnapshot() });
        await WriteStatusAsync();
    }
}

async Task WriteStatusAsync()
{
    process.Refresh();
    var sampledAt = Stopwatch.GetTimestamp();
    var cpuTime = process.TotalProcessorTime;
    var elapsedSeconds = (sampledAt - previousCpuSampleAt) / (double)Stopwatch.Frequency;
    var cpuSeconds = (cpuTime - previousCpuTime).TotalSeconds;
    var cpuPercent = elapsedSeconds <= 0
        ? 0
        : Math.Clamp(cpuSeconds / elapsedSeconds / Environment.ProcessorCount * 100, 0, 100);
    previousCpuTime = cpuTime;
    previousCpuSampleAt = sampledAt;
    var snapshot = engine.GetSnapshot();
    var message = snapshot.Error
                  ?? snapshot.NoiseSuppression.LastError
                  ?? (engine.Running
                      ? $"{snapshot.NoiseSuppression.Backend} microphone processing active"
                      : null);
    var resourceProcesses = new List<object>();
    if (engine.Running)
    {
        resourceProcesses.Add(new
        {
            pid = Environment.ProcessId,
            role = "host",
            privateMemoryMb = Math.Round(process.PrivateMemorySize64 / 1024d / 1024d, 1),
            workingSetMb = Math.Round(process.WorkingSet64 / 1024d / 1024d, 1),
        });
    }
    await WriteAsync(new
    {
        type = "status",
        status = new
        {
            kind = "audio",
            state = engine.Running ? "running" : "stopped",
            pid = engine.Running ? Environment.ProcessId : (int?)null,
            cpuPercent = Math.Round(cpuPercent, 2),
            memoryMb = Math.Round(process.PrivateMemorySize64 / 1024d / 1024d, 1),
            uptimeSeconds = Math.Max(0, engine.Uptime.TotalSeconds),
            message,
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
