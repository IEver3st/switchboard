using System.Text.Json;
using Switchboard.AudioHost;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
using var endpoints = new EndpointService();
var graph = new AudioGraph();
var running = false;

if (args.Contains("--list-endpoints", StringComparer.OrdinalIgnoreCase))
{
    Console.WriteLine(JsonSerializer.Serialize(endpoints.List(), jsonOptions));
    return;
}

await foreach (var line in ReadLinesAsync(Console.In))
{
    if (string.IsNullOrWhiteSpace(line)) continue;

    string? requestId = null;
    try
    {
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        requestId = root.TryGetProperty("requestId", out var id) ? id.GetString() : null;
        var command = root.GetProperty("command").GetString() ?? throw new InvalidOperationException("Missing command.");
        var payload = root.TryGetProperty("payload", out var body) ? body : default;

        object result = command switch
        {
            "start" => SetRunning(true),
            "stop" => SetRunning(false),
            "status" => Status(),
            "listEndpoints" => endpoints.List(),
            "listSessions" => endpoints.ListSessions(),
            "setBusGain" => SetBusGain(payload),
            "setBusEnabled" => SetBusEnabled(payload),
            "setChatMix" => SetChatMix(payload),
            "setProcessor" => SetProcessor(payload),
            _ => throw new InvalidOperationException($"Unknown command: {command}"),
        };

        Console.WriteLine(JsonSerializer.Serialize(new { requestId, ok = true, result }, jsonOptions));
    }
    catch (Exception error)
    {
        Console.WriteLine(JsonSerializer.Serialize(new { requestId, ok = false, error = error.Message }, jsonOptions));
    }
}

object SetRunning(bool value)
{
    running = value;
    return Status();
}

object SetBusGain(JsonElement payload)
{
    graph.SetBusGain(payload.GetProperty("busId").GetString()!, payload.GetProperty("gain").GetSingle());
    return Status();
}

object SetBusEnabled(JsonElement payload)
{
    graph.SetBusEnabled(payload.GetProperty("busId").GetString()!, payload.GetProperty("enabled").GetBoolean());
    return Status();
}

object SetChatMix(JsonElement payload)
{
    graph.SetChatMix(payload.GetProperty("value").GetSingle());
    return Status();
}

object SetProcessor(JsonElement payload)
{
    graph.SetProcessor(payload.GetProperty("processorId").GetString()!, payload.GetProperty("enabled").GetBoolean());
    return Status();
}

AudioHostStatus Status() => new(
    running ? "running" : "stopped",
    48_000,
    "float32 stereo",
    Math.Round(Environment.WorkingSet / 1024d / 1024d, 1),
    graph.GetBuses(),
    graph.GetProcessors(),
    graph.ChatMix,
    VirtualDriverPresent: false,
    Message: "Control graph and Core Audio discovery are implemented. Signed virtual endpoints are the next hard dependency.");

static async IAsyncEnumerable<string> ReadLinesAsync(TextReader reader)
{
    while (await reader.ReadLineAsync() is { } line) yield return line;
}
