using System.Text.Json;
using Switchboard.CaptureHost;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    WriteIndented = false,
};

await using var engine = new ReplayEngine();
var settings = new CaptureSettings();

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

        object result = command switch
        {
            "status" => engine.GetStatus(),
            "start" => await engine.StartAsync(settings, CancellationToken.None),
            "stop" => await engine.StopAsync(CancellationToken.None),
            "configure" => await ConfigureAsync(root, engine),
            "saveReplay" => await SaveAsync(root, engine),
            _ => throw new InvalidOperationException($"Unknown command: {command}"),
        };

        Console.WriteLine(JsonSerializer.Serialize(new { requestId, ok = true, result }, jsonOptions));
    }
    catch (Exception error)
    {
        Console.WriteLine(JsonSerializer.Serialize(new { requestId, ok = false, error = error.Message }, jsonOptions));
    }
}

async Task<object> ConfigureAsync(JsonElement root, ReplayEngine replayEngine)
{
    settings = root.GetProperty("payload").Deserialize<CaptureSettings>(jsonOptions) ?? settings;
    await replayEngine.ConfigureAsync(settings, CancellationToken.None);
    return replayEngine.GetStatus();
}

static async Task<SavedReplay> SaveAsync(JsonElement root, ReplayEngine replayEngine)
{
    var outputDirectory = root.GetProperty("payload").GetProperty("directory").GetString()
                          ?? throw new InvalidOperationException("Missing output directory.");
    return await replayEngine.SaveReplayAsync(outputDirectory, CancellationToken.None);
}

static async IAsyncEnumerable<string> ReadLinesAsync(TextReader reader)
{
    while (await reader.ReadLineAsync() is { } line) yield return line;
}
