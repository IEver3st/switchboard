using System.Text.Json;
using Switchboard.AudioHost;
using Switchboard.AudioHost.NoiseSuppression;
using Switchboard.AudioHost.Realtime;

var expected = new[]
{
    Endpoint("render-game", EndpointCatalog.Game, "render"),
    Endpoint("render-chat", EndpointCatalog.Chat, "render"),
    Endpoint("render-media", EndpointCatalog.Media, "render"),
    Endpoint("render-aux", EndpointCatalog.Auxiliary, "render"),
    Endpoint("render-microphone", EndpointCatalog.Microphone, "render"),
    Endpoint("render-stream", EndpointCatalog.Stream, "render"),
    Endpoint("capture-microphone", EndpointCatalog.Microphone, "capture"),
    Endpoint("capture-stream", EndpointCatalog.Stream, "capture"),
};
var complete = EndpointCatalog.Inspect(expected);
Assert(complete.Ready, "The canonical eight-endpoint manifest must be accepted.");
Assert(complete.Snapshot().Endpoints.Count == 8, "Every canonical endpoint must be reported.");

var incomplete = EndpointCatalog.Inspect(expected.Take(7).ToArray());
Assert(!incomplete.Ready, "An incomplete driver package must not be reported as ready.");
Assert(incomplete.Missing.Single() == $"{EndpointCatalog.Stream} (capture)", "The missing endpoint must be named precisely.");

var ring = new SpscFloatRing(16);
ring.WriteMono([0.25f, -0.5f, 0.75f]);
var stereo = new float[8];
var read = ring.Read(stereo, 0, stereo.Length);
Assert(read == stereo.Length, "Realtime providers must zero-fill underruns.");
AssertSequence(stereo, [0.25f, 0.25f, -0.5f, -0.5f, 0.75f, 0.75f, 0f, 0f], "Mono microphone frames must become stereo transport frames.");

var graph = new RoutingControlGraph();
graph.Configure(new AudioHostSettings
{
    Master = new AudioMasterConfiguration { Gain = 0.5f, Enabled = true },
    Buses = [new AudioBusConfiguration { Id = "game", Gain = 0.5f, Enabled = true }],
});
var samples = new[] { 1f, -1f };
graph.Process(samples, "game");
AssertSequence(samples, [0.25f, -0.25f], "Bus and master gains must be applied to the routed signal.");

TestStrengthMapping();
TestFrameAdapter();
TestMissingAndCorruptDeepFilterModel();
TestMissingRnnoiseLibrary();
TestNativeRnnoiseWrapper();
TestAudioGraphTransparencyAndOrder();
TestAudioGraphFailureBypass();

Console.WriteLine("Audio.Host deterministic tests passed.");

static AudioEndpoint Endpoint(string id, string name, string flow) => new(
    id, name, flow, false, flow == "capture" ? "microphone" : "speakers",
    AudioConstants.InterfaceName, 1f, false, true);

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static void AssertSequence(IReadOnlyList<float> actual, IReadOnlyList<float> expected, string message)
{
    if (actual.Count != expected.Count) throw new InvalidOperationException(message);
    for (var index = 0; index < actual.Count; index++)
    {
        if (Math.Abs(actual[index] - expected[index]) > 0.0001f) throw new InvalidOperationException(message);
    }
}

static void TestStrengthMapping()
{
    AssertClose(0f, NoiseStrengthMapping.ToAttenuationDb(0), 0.001f, "Zero strength must bypass suppression.");
    AssertClose(9f, NoiseStrengthMapping.ToAttenuationDb(25), 0.001f, "Light must map to 9 dB.");
    AssertClose(21f, NoiseStrengthMapping.ToAttenuationDb(55), 0.001f, "Balanced must map to 21 dB.");
    AssertClose(36f, NoiseStrengthMapping.ToAttenuationDb(80), 0.001f, "Strong must remain bounded at 36 dB.");
    AssertClose(100f, NoiseStrengthMapping.ToAttenuationDb(100), 0.001f, "Maximum must use the backend maximum.");
    var previous = -1f;
    for (var amount = 0; amount <= 100; amount++)
    {
        var attenuation = NoiseStrengthMapping.ToAttenuationDb(amount);
        Assert(attenuation >= previous, "Strength mapping must be monotonic.");
        previous = attenuation;
    }
}

static void TestFrameAdapter()
{
    int[] packetSizes = [64, 128, 240, 441, 480, 512, 960, 1024];
    var total = packetSizes.Sum();
    var adapter = new BoundedFrameAdapter(total + 16);
    var expected = new float[total];
    for (var index = 0; index < expected.Length; index++) expected[index] = index;
    var position = 0;
    foreach (var packetSize in packetSizes)
    {
        Assert(adapter.Write(expected.AsSpan(position, packetSize)) == packetSize, "A bounded adapter with capacity must accept each awkward packet.");
        position += packetSize;
    }

    var frame = new float[480];
    var readPosition = 0;
    while (adapter.TryReadFrame(frame))
    {
        for (var index = 0; index < frame.Length; index++)
            AssertClose(expected[readPosition + index], frame[index], 0f, "Frame adapter changed sample order.");
        readPosition += frame.Length;
    }
    Assert(adapter.Count == total - readPosition, "Frame adapter must preserve the exact remainder.");
    var remainder = new float[adapter.Count];
    Assert(adapter.Read(remainder) == remainder.Length, "Frame adapter must return its entire remainder.");
    for (var index = 0; index < remainder.Length; index++)
        AssertClose(expected[readPosition + index], remainder[index], 0f, "Frame adapter remainder changed sample order.");

    var bounded = new BoundedFrameAdapter(480);
    Assert(bounded.Write(new float[512]) == 480, "Frame adapter must reject overflow instead of growing.");
    Assert(bounded.Write(new float[64]) == 0, "A full frame adapter must remain bounded.");
}

static void TestMissingAndCorruptDeepFilterModel()
{
    var root = Path.Combine(Path.GetTempPath(), $"switchboard-df-test-{Guid.NewGuid():N}");
    try
    {
        Directory.CreateDirectory(root);
        using var missing = new DeepFilterNetNoiseSuppressor();
        Assert(!missing.Initialize(new NoiseSuppressorInitialization(AppContext.BaseDirectory, root)), "A missing model must fail inside the backend without affecting its owner.");

        File.WriteAllText(Path.Combine(root, DeepFilterNetNoiseSuppressor.ExpectedModelFileName), "corrupt model");
        File.WriteAllText(Path.Combine(root, "acquisition.json"), JsonSerializer.Serialize(new { source = "test" }));
        using var corrupt = new DeepFilterNetNoiseSuppressor();
        Assert(!corrupt.Initialize(new NoiseSuppressorInitialization(AppContext.BaseDirectory, root)), "A corrupt model hash must be rejected.");
    }
    finally
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }
}

static void TestNativeRnnoiseWrapper()
{
    var initialization = new NoiseSuppressorInitialization(AppContext.BaseDirectory, Path.GetTempPath());
    for (var iteration = 0; iteration < 8; iteration++)
    {
        var suppressor = new RnnoiseNoiseSuppressor();
        Assert(suppressor.Initialize(initialization), suppressor.LastError ?? "RNNoise failed to initialize.");
        Assert(suppressor.FrameLength == 480, "RNNoise must report its upstream 48 kHz frame size.");
        suppressor.Configure(25);
        AssertClose(9f, (float)suppressor.AttenuationLimitDb, 0.001f, "RNNoise light attenuation must use the canonical mapping.");
        var input = new float[suppressor.FrameLength];
        var output = new float[suppressor.FrameLength];
        for (var index = 0; index < input.Length; index++) input[index] = MathF.Sin(index * 0.04f) * 0.1f;
        Assert(suppressor.Process(input, output, out _), "RNNoise must process a valid frame.");
        Assert(output.All(float.IsFinite), "RNNoise must return only finite samples.");
        for (var warmup = 0; warmup < 16; warmup++) Assert(suppressor.Process(input, output, out _), "RNNoise warmup failed.");
        var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        for (var frameIndex = 0; frameIndex < 1_000; frameIndex++) Assert(suppressor.Process(input, output, out _), "RNNoise frame failed.");
        var allocatedBytes = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
        Assert(allocatedBytes <= 512, $"RNNoise processing allocated {allocatedBytes} managed bytes across 1,000 frames.");
        input[10] = float.NaN;
        Assert(!suppressor.Process(input, output, out _), "RNNoise must reject invalid input samples.");
        Assert(suppressor.Reset(), "RNNoise reset must recreate recurrent state.");
        suppressor.Dispose();
        suppressor.Dispose();
    }
}

static void TestMissingRnnoiseLibrary()
{
    var root = Path.Combine(Path.GetTempPath(), $"switchboard-rnnoise-test-{Guid.NewGuid():N}");
    try
    {
        Directory.CreateDirectory(root);
        using var suppressor = new RnnoiseNoiseSuppressor();
        Assert(!suppressor.Initialize(new NoiseSuppressorInitialization(root, root)), "A missing native RNNoise library must fail closed inside the backend.");
        Assert(suppressor.LastError?.Contains("not found", StringComparison.OrdinalIgnoreCase) == true, "A missing native library must report a useful error.");
    }
    finally
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }
}

static void TestAudioGraphTransparencyAndOrder()
{
    using var suppressor = new DeterministicSuppressor();
    var microphoneGraph = new AudioGraph(suppressor);
    var disabled = DspConfiguration(suppression: false, gate: false, version: 1);
    var samples = Enumerable.Range(0, 480).Select(index => MathF.Sin(index * 0.03f) * 0.2f).ToArray();
    var original = samples.ToArray();
    microphoneGraph.ProcessMicrophone(samples, disabled);
    Assert(samples.SequenceEqual(original), "A fully disabled microphone graph must be bit transparent.");

    Array.Fill(samples, 0.001f);
    microphoneGraph.ProcessMicrophone(samples, DspConfiguration(suppression: true, gate: true, version: 2));
    Assert(samples[^1] > 0.1f, "Noise suppression output must feed the later gate detector.");

    var previous = samples[^1];
    microphoneGraph.ProcessMicrophone(samples, DspConfiguration(suppression: false, gate: false, version: 3));
    Assert(MathF.Abs(samples[0] - previous) < 0.6f, "Suppression toggles must use a bounded crossfade.");
}

static void TestAudioGraphFailureBypass()
{
    using var suppressor = new FailingSuppressor();
    var graph = new AudioGraph(suppressor);
    var samples = Enumerable.Range(0, 480).Select(index => MathF.Sin(index * 0.03f) * 0.2f).ToArray();
    var original = samples.ToArray();
    var result = graph.ProcessMicrophone(samples, DspConfiguration(suppression: true, gate: false, version: 1));
    Assert(result.SuppressionAttempted && !result.SuppressionSucceeded, "Backend failure must be visible to the pipeline.");
    Assert(samples.SequenceEqual(original), "A failed neural frame must fail open to dry microphone audio.");
}

static MicrophoneDspConfiguration DspConfiguration(bool suppression, bool gate, long version) => new(
    version,
    new NoiseSuppressionConfiguration(suppression, 55),
    new NoiseGateConfiguration(gate, -20, 0.1f, 10),
    new GainConfiguration(false, 0),
    new EqualizerConfiguration(false, []),
    new CompressorConfiguration(false, -18, 4, 12, 180, 2),
    new LimiterConfiguration(false, -1, 90));

static void AssertClose(float expected, float actual, float tolerance, string message)
{
    if (MathF.Abs(expected - actual) > tolerance)
        throw new InvalidOperationException($"{message} Expected {expected}, got {actual}.");
}

sealed class DeterministicSuppressor : INoiseSuppressor
{
    public bool IsAvailable => true;
    public string BackendName => "test";
    public string ModelIdentifier => "test";
    public string? ModelHash => null;
    public string? NativeLibraryHash => null;
    public int SampleRate => 48_000;
    public int FrameLength => 480;
    public double AlgorithmicLatencyMs => 10;
    public double AttenuationLimitDb { get; private set; }
    public string? LastError => null;
    public bool Initialize(NoiseSuppressorInitialization initialization) => true;
    public void Configure(float amount) => AttenuationLimitDb = NoiseStrengthMapping.ToAttenuationDb(amount);
    public bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
    {
        output[..FrameLength].Fill(0.5f);
        localSnrDb = 12;
        return true;
    }
    public bool Reset() => true;
    public void Dispose() { }
}

sealed class FailingSuppressor : INoiseSuppressor
{
    public bool IsAvailable => true;
    public string BackendName => "failing-test";
    public string ModelIdentifier => "failing-test";
    public string? ModelHash => null;
    public string? NativeLibraryHash => null;
    public int SampleRate => 48_000;
    public int FrameLength => 480;
    public double AlgorithmicLatencyMs => 10;
    public double AttenuationLimitDb => 21;
    public string? LastError => "Injected backend failure.";
    public bool Initialize(NoiseSuppressorInitialization initialization) => true;
    public void Configure(float amount) { }
    public bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
    {
        localSnrDb = float.NaN;
        return false;
    }
    public bool Reset() => true;
    public void Dispose() { }
}
