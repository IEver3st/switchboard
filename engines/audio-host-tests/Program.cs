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
_ = new AudioApplicationRouteRequest(42, "game").Validate();
AssertThrows<InvalidOperationException>(() => new AudioApplicationRouteRequest(0, "game").Validate(), "Application routes must reject the system process.");
AssertThrows<InvalidOperationException>(() => new AudioApplicationRouteRequest(42, "aux").Validate(), "Application routes must reject non-assignable destinations.");

using (var endpointService = new EndpointService())
{
    for (var warmup = 0; warmup < 4; warmup++) _ = endpointService.List();
    using var process = System.Diagnostics.Process.GetCurrentProcess();
    process.Refresh();
    var handlesBefore = process.HandleCount;
    for (var iteration = 0; iteration < 12; iteration++) _ = endpointService.List();
    process.Refresh();
    var retainedHandles = process.HandleCount - handlesBefore;
    Assert(retainedHandles <= 8, $"Repeated endpoint snapshots retained {retainedHandles} OS handles.");
}

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
    Mixes = DefaultMixes(personalMaster: 0.5f, personalGame: 0.5f),
    ChannelProcessing = DefaultChannelProcessing(),
});
var samples = new[] { 1f, -1f };
graph.CreateProcessor("personal", "game").Process(samples);
AssertSequence(samples, [0.25f, -0.25f], "Bus and master gains must be applied to the routed signal.");

TestIndependentDestinationMixes();

TestChannelDsp();

TestStrengthMapping();
TestFrameAdapter();
TestMissingAndCorruptDeepFilterModel();
TestMissingRnnoiseLibrary();
TestNativeRnnoiseWrapper();
TestAudioGraphTransparencyAndOrder();
TestEveryMicrophoneControlChangesSignal();
TestMicrophoneSettingsParser();
TestMonitoringVolume();
TestAudioGraphFailureBypass();

Console.WriteLine("Audio.Host deterministic tests passed.");

static AudioEndpoint Endpoint(string id, string name, string flow) => new(
    id, name, flow, false, flow == "capture" ? "microphone" : "speakers",
    AudioConstants.InterfaceName, 1f, false, true);

static ChannelProcessingSettings[] DefaultChannelProcessing() => [
    Channel("game"),
    Channel("chat"),
    Channel("media"),
];

static AudioMixConfiguration[] DefaultMixes(
    float personalMaster = 1f,
    float personalGame = 1f,
    bool personalMicEnabled = true) =>
[
    Mix("personal", personalMaster, personalGame, personalMicEnabled),
    Mix("stream", 1f, 1f, true),
    Mix("clip", 1f, 1f, true),
];

static AudioMixConfiguration Mix(string id, float master, float game, bool micEnabled) => new()
{
    Id = id,
    Label = char.ToUpperInvariant(id[0]) + id[1..],
    Master = new AudioMasterConfiguration { Gain = master, Enabled = true },
    Buses =
    [
        new AudioMixBusConfiguration { Id = "game", Gain = game, Enabled = true },
        new AudioMixBusConfiguration { Id = "chat", Gain = 1f, Enabled = true },
        new AudioMixBusConfiguration { Id = "media", Gain = 1f, Enabled = true },
        new AudioMixBusConfiguration { Id = "aux", Gain = 1f, Enabled = true },
        new AudioMixBusConfiguration { Id = "mic", Gain = 1f, Enabled = micEnabled },
    ],
};

static ChannelProcessingSettings Channel(
    string busId,
    bool equalizer = false,
    bool normalization = false,
    bool compressor = false,
    bool limiter = false) => new()
{
    BusId = busId,
    Equalizer = new ChannelEqualizerSettings
    {
        Enabled = equalizer,
        Bands = [new EqualizerBandSettings { Type = "bell", Frequency = 1_000, GainDb = 9, Q = 1 }],
    },
    Normalization = new ChannelNormalizationSettings { Enabled = normalization, TargetLufs = -12, MaxGainDb = 6 },
    Compressor = new ChannelCompressorSettings { Enabled = compressor, ThresholdDb = -24, Ratio = 8, AttackMs = 0.1f, ReleaseMs = 100, MakeupDb = 0 },
    Limiter = new ChannelLimiterSettings { Enabled = limiter, ThresholdDb = -6, ReleaseMs = 90 },
};

static void TestChannelDsp()
{
    var graph = new RoutingControlGraph();
    graph.Configure(new AudioHostSettings
    {
        Master = new AudioMasterConfiguration { Gain = 1, Enabled = true },
        Buses = [
            new AudioBusConfiguration { Id = "game", Gain = 1, Enabled = true },
            new AudioBusConfiguration { Id = "chat", Gain = 1, Enabled = true },
            new AudioBusConfiguration { Id = "media", Gain = 1, Enabled = true },
        ],
        Mixes = DefaultMixes(),
        ChannelProcessing = [Channel("game"), Channel("chat", equalizer: true), Channel("media", limiter: true)],
    });

    var dry = Enumerable.Range(0, 960).Select(index => MathF.Sin(index * 0.11f) * 0.2f).ToArray();
    var transparent = dry.ToArray();
    graph.CreateProcessor("personal", "game").Process(transparent);
    AssertSequence(transparent, dry, "A disabled channel graph must be bit transparent.");

    var equalized = dry.ToArray();
    graph.CreateProcessor("personal", "chat").Process(equalized);
    Assert(!equalized.SequenceEqual(dry), "An enabled channel equalizer must alter routed samples.");

    var limited = Enumerable.Repeat(1f, 960).ToArray();
    graph.CreateProcessor("personal", "media").Process(limited);
    Assert(limited.All(sample => MathF.Abs(sample) <= 0.502f), "The channel limiter must enforce its configured stereo ceiling.");
}

static void TestIndependentDestinationMixes()
{
    var graph = new RoutingControlGraph();
    var mixes = DefaultMixes();
    mixes[0] = Mix("personal", 0.5f, 0.5f, false);
    mixes[1] = Mix("stream", 1f, 0.75f, true);
    mixes[2] = Mix("clip", 0.25f, 1f, true);
    graph.Configure(new AudioHostSettings
    {
        ChatMix = 0,
        Mixes = mixes,
        ChannelProcessing = DefaultChannelProcessing(),
    });

    var personalGame = new[] { 1f, -1f };
    graph.CreateProcessor("personal", "game").Process(personalGame);
    AssertSequence(personalGame, [0.25f, -0.25f], "The personal game mix must use only its own bus and master controls.");

    var streamGame = new[] { 1f, -1f };
    graph.CreateProcessor("stream", "game").Process(streamGame);
    AssertSequence(streamGame, [0.75f, -0.75f], "The stream game mix must remain independent from personal controls.");

    var clipGame = new[] { 1f, -1f };
    graph.CreateProcessor("clip", "game").Process(clipGame);
    AssertSequence(clipGame, [0.25f, -0.25f], "The clip game mix must use its own master control.");

    var personalMic = new[] { 0.5f, -0.5f };
    graph.CreateProcessor("personal", "mic").Process(personalMic);
    AssertSequence(personalMic, [0f, 0f], "Personal microphone mute must affect the virtual microphone signal.");

    var streamMic = new[] { 0.5f, -0.5f };
    graph.CreateProcessor("stream", "mic").Process(streamMic);
    AssertSequence(streamMic, [0.5f, -0.5f], "Stream microphone controls must not inherit the personal mute.");

    graph.Configure(new AudioHostSettings
    {
        ChatMix = 1,
        Mixes = DefaultMixes(),
        ChannelProcessing = DefaultChannelProcessing(),
    });
    var gameAtFullChat = new[] { 1f, -1f };
    graph.CreateProcessor("personal", "game").Process(gameAtFullChat);
    AssertSequence(gameAtFullChat, [0f, 0f], "ChatMix must attenuate the personal game path at the full-chat extreme.");
    var streamAtFullChat = new[] { 1f, -1f };
    graph.CreateProcessor("stream", "game").Process(streamAtFullChat);
    AssertSequence(streamAtFullChat, [1f, -1f], "ChatMix must not alter stream or clip destinations.");
}

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static void AssertThrows<T>(Action operation, string message) where T : Exception
{
    try { operation(); }
    catch (T) { return; }
    throw new InvalidOperationException(message);
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

static void TestEveryMicrophoneControlChangesSignal()
{
    var voice = SineFrame(0.45f, 1_000f);
    var loudVoice = SineFrame(0.9f, 1_000f);
    var quietVoice = SineFrame(0.02f, 1_000f);
    var disabled = Controls(version: 1);

    AssertDifferent(
        Render(disabled, [voice]),
        Render(Controls(version: 2, gain: new GainConfiguration(true, 6f)), [voice]),
        "The input-volume switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 3, gain: new GainConfiguration(true, -6f)), [voice]),
        Render(Controls(version: 4, gain: new GainConfiguration(true, 6f)), [voice]),
        "Input volume must change microphone samples.");

    var gateFrames = Enumerable.Repeat(quietVoice, 8).ToArray();
    AssertDifferent(
        Render(disabled, gateFrames),
        Render(Controls(version: 5, gate: new NoiseGateConfiguration(true, -10f, 0.1f, 10f)), gateFrames),
        "The noise-gate switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 6, gate: new NoiseGateConfiguration(true, -60f, 0.1f, 10f)), gateFrames),
        Render(Controls(version: 7, gate: new NoiseGateConfiguration(true, -10f, 0.1f, 10f)), gateFrames),
        "Gate threshold must change microphone samples.");
    var gateAttackFrames = Enumerable.Repeat(quietVoice, 12).Concat([voice]).ToArray();
    AssertDifferent(
        Render(Controls(version: 8, gate: new NoiseGateConfiguration(true, -30f, 0.1f, 10f)), gateAttackFrames),
        Render(Controls(version: 9, gate: new NoiseGateConfiguration(true, -30f, 100f, 10f)), gateAttackFrames),
        "Gate attack must change microphone samples.");
    var gateReleaseFrames = new[] { voice }.Concat(Enumerable.Repeat(quietVoice, 6)).ToArray();
    AssertDifferent(
        Render(Controls(version: 10, gate: new NoiseGateConfiguration(true, -30f, 0.1f, 10f)), gateReleaseFrames),
        Render(Controls(version: 11, gate: new NoiseGateConfiguration(true, -30f, 0.1f, 1_000f)), gateReleaseFrames),
        "Gate release must change microphone samples.");

    var suppressionFrames = Enumerable.Repeat(voice, 3).ToArray();
    AssertDifferent(
        Render(disabled, suppressionFrames),
        Render(Controls(version: 12, suppression: new NoiseSuppressionConfiguration(true, 55f)), suppressionFrames),
        "The noise-removal switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 13, suppression: new NoiseSuppressionConfiguration(true, 25f)), suppressionFrames),
        Render(Controls(version: 14, suppression: new NoiseSuppressionConfiguration(true, 80f)), suppressionFrames),
        "Noise-removal strength must change microphone samples.");

    var eqFrames = Enumerable.Repeat(voice, 5).ToArray();
    var activeBand = new EqualizerBandConfiguration(true, "bell", 1_000f, 9f, 1f);
    AssertDifferent(
        Render(disabled, eqFrames),
        Render(Controls(version: 15, equalizer: new EqualizerConfiguration(true, [activeBand])), eqFrames),
        "The equalizer switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 16, equalizer: new EqualizerConfiguration(true, [activeBand with { Enabled = false }])), eqFrames),
        Render(Controls(version: 17, equalizer: new EqualizerConfiguration(true, [activeBand])), eqFrames),
        "An EQ band switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 18, equalizer: new EqualizerConfiguration(true, [activeBand with { Type = "bell" }])), eqFrames),
        Render(Controls(version: 19, equalizer: new EqualizerConfiguration(true, [activeBand with { Type = "high-shelf" }])), eqFrames),
        "EQ filter type must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 20, equalizer: new EqualizerConfiguration(true, [activeBand with { Frequency = 200f }])), eqFrames),
        Render(Controls(version: 21, equalizer: new EqualizerConfiguration(true, [activeBand with { Frequency = 1_000f }])), eqFrames),
        "EQ frequency must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 22, equalizer: new EqualizerConfiguration(true, [activeBand with { GainDb = -9f }])), eqFrames),
        Render(Controls(version: 23, equalizer: new EqualizerConfiguration(true, [activeBand with { GainDb = 9f }])), eqFrames),
        "EQ gain must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 24, equalizer: new EqualizerConfiguration(true, [activeBand with { Q = 0.3f }])), eqFrames),
        Render(Controls(version: 25, equalizer: new EqualizerConfiguration(true, [activeBand with { Q = 8f }])), eqFrames),
        "EQ width must change microphone samples.");

    var compressorFrames = Enumerable.Repeat(loudVoice, 4).ToArray();
    var compressor = new CompressorConfiguration(true, -24f, 6f, 0.1f, 100f, 0f);
    AssertDifferent(
        Render(disabled, compressorFrames),
        Render(Controls(version: 26, compressor: compressor), compressorFrames),
        "The voice-consistency switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 27, compressor: compressor with { ThresholdDb = -30f }), compressorFrames),
        Render(Controls(version: 28, compressor: compressor with { ThresholdDb = -3f }), compressorFrames),
        "Compression threshold must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 29, compressor: compressor with { Ratio = 2f }), compressorFrames),
        Render(Controls(version: 30, compressor: compressor with { Ratio = 12f }), compressorFrames),
        "Compression ratio must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 31, compressor: compressor with { AttackMs = 0.1f }), compressorFrames),
        Render(Controls(version: 32, compressor: compressor with { AttackMs = 200f }), compressorFrames),
        "Compression attack must change microphone samples.");
    var compressorReleaseFrames = Enumerable.Repeat(loudVoice, 5).Concat(Enumerable.Repeat(quietVoice, 5)).ToArray();
    AssertDifferent(
        Render(Controls(version: 33, compressor: compressor with { ReleaseMs = 10f }), compressorReleaseFrames),
        Render(Controls(version: 34, compressor: compressor with { ReleaseMs = 2_000f }), compressorReleaseFrames),
        "Compression release must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 35, compressor: compressor with { MakeupDb = 0f }), compressorFrames),
        Render(Controls(version: 36, compressor: compressor with { MakeupDb = 12f }), compressorFrames),
        "Compression makeup gain must change microphone samples.");

    var limiterFrames = Enumerable.Repeat(loudVoice, 3).ToArray();
    var limiter = new LimiterConfiguration(true, -9f, 90f);
    AssertDifferent(
        Render(disabled, limiterFrames),
        Render(Controls(version: 37, limiter: limiter), limiterFrames),
        "The output-safety switch must change microphone samples.");
    AssertDifferent(
        Render(Controls(version: 38, limiter: limiter with { ThresholdDb = -12f }), limiterFrames),
        Render(Controls(version: 39, limiter: limiter with { ThresholdDb = -1f }), limiterFrames),
        "Limiter ceiling must change microphone samples.");
    var limiterReleaseFrames = new[] { loudVoice }.Concat(Enumerable.Repeat(quietVoice, 5)).ToArray();
    AssertDifferent(
        Render(Controls(version: 40, limiter: limiter with { ReleaseMs = 10f }), limiterReleaseFrames),
        Render(Controls(version: 41, limiter: limiter with { ReleaseMs = 1_000f }), limiterReleaseFrames),
        "Limiter release must change microphone samples.");
}

static void TestMicrophoneSettingsParser()
{
    var settings = new AudioHostSettings
    {
        MicProcessors =
        [
            Processor("gain", true, new { gainDb = 7.5f }),
            Processor("noise-gate", true, new { thresholdDb = -41f, attackMs = 7.5f, releaseMs = 305f }),
            Processor("noise-suppression", true, new { amount = 73f }),
            Processor("equalizer", true, new
            {
                bands = new[] { new { enabled = true, type = "high-shelf", frequency = 8_500f, gainDb = 3.5f, q = 0.8f } },
            }),
            Processor("compressor", true, new { thresholdDb = -21f, ratio = 5.5f, attackMs = 8.5f, releaseMs = 240f, makeupDb = 4f }),
            Processor("limiter", true, new { thresholdDb = -2.5f, releaseMs = 125f }),
        ],
        Mixes = DefaultMixes(),
        ChannelProcessing = DefaultChannelProcessing(),
    };

    var configured = MicrophoneDspConfiguration.From(settings.Validate(), 72);
    Assert(configured.Version == 72, "The microphone configuration version must round trip.");
    Assert(configured.Gain is { Enabled: true, GainDb: 7.5f }, "Input volume must parse from the canonical payload.");
    Assert(configured.NoiseGate is { Enabled: true, ThresholdDb: -41f, AttackMs: 7.5f, ReleaseMs: 305f }, "Every gate setting must parse from the canonical payload.");
    Assert(configured.NoiseSuppression is { Enabled: true, Amount: 73f }, "Noise-removal strength must parse from the canonical payload.");
    var band = configured.Equalizer.Bands.Single();
    Assert(band is { Enabled: true, Type: "high-shelf", Frequency: 8_500f, GainDb: 3.5f, Q: 0.8f }, "Every EQ setting must parse from the canonical payload.");
    Assert(configured.Compressor is { Enabled: true, ThresholdDb: -21f, Ratio: 5.5f, AttackMs: 8.5f, ReleaseMs: 240f, MakeupDb: 4f }, "Every compressor setting must parse from the canonical payload.");
    Assert(configured.Limiter is { Enabled: true, ThresholdDb: -2.5f, ReleaseMs: 125f }, "Every limiter setting must parse from the canonical payload.");
}

static void TestMonitoringVolume()
{
    var source = new BoundedFrameAdapter(8);
    var provider = new ProcessedWaveProvider(source);
    var samples = new[] { 1f, -0.5f, 0.25f, -0.125f };
    Assert(source.Write(samples) == samples.Length, "The monitoring source must accept the test frame.");
    provider.SetVolume(0.25f);
    var buffer = new byte[samples.Length * sizeof(float)];
    provider.Read(buffer);
    AssertClose(0.25f, BitConverter.ToSingle(buffer, 0), 0.0001f, "Monitor volume must scale positive samples.");
    AssertClose(-0.125f, BitConverter.ToSingle(buffer, sizeof(float)), 0.0001f, "Monitor volume must scale negative samples.");
}

static MicrophoneProcessorSettings Processor(string id, bool enabled, object parameters) => new()
{
    Id = id,
    Enabled = enabled,
    Parameters = JsonSerializer.SerializeToElement(parameters),
};

static MicrophoneDspConfiguration Controls(
    long version,
    NoiseSuppressionConfiguration? suppression = null,
    NoiseGateConfiguration? gate = null,
    GainConfiguration? gain = null,
    EqualizerConfiguration? equalizer = null,
    CompressorConfiguration? compressor = null,
    LimiterConfiguration? limiter = null) => new(
        version,
        suppression ?? new NoiseSuppressionConfiguration(false, 55f),
        gate ?? new NoiseGateConfiguration(false, -48f, 10f, 180f),
        gain ?? new GainConfiguration(false, 0f),
        equalizer ?? new EqualizerConfiguration(false, []),
        compressor ?? new CompressorConfiguration(false, -18f, 4f, 12f, 180f, 2f),
        limiter ?? new LimiterConfiguration(false, -1f, 90f));

static float[] SineFrame(float amplitude, float frequency)
{
    var frame = new float[480];
    for (var index = 0; index < frame.Length; index++)
        frame[index] = MathF.Sin(2f * MathF.PI * frequency * index / AudioConstants.ProcessingSampleRate) * amplitude;
    return frame;
}

static float[] Render(MicrophoneDspConfiguration configuration, IReadOnlyList<float[]> frames)
{
    using var suppressor = new ControlAwareSuppressor();
    var graph = new AudioGraph(suppressor);
    var rendered = new float[frames.Count * suppressor.FrameLength];
    for (var frameIndex = 0; frameIndex < frames.Count; frameIndex++)
    {
        var frame = frames[frameIndex].ToArray();
        graph.ProcessMicrophone(frame, configuration);
        frame.CopyTo(rendered, frameIndex * suppressor.FrameLength);
    }
    return rendered;
}

static void AssertDifferent(IReadOnlyList<float> left, IReadOnlyList<float> right, string message)
{
    if (left.Count != right.Count) return;
    for (var index = 0; index < left.Count; index++)
    {
        if (MathF.Abs(left[index] - right[index]) > 0.00001f) return;
    }
    throw new InvalidOperationException(message);
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

sealed class ControlAwareSuppressor : INoiseSuppressor
{
    private float amount;
    public bool IsAvailable => true;
    public string BackendName => "control-aware-test";
    public string ModelIdentifier => "control-aware-test";
    public string? ModelHash => null;
    public string? NativeLibraryHash => null;
    public int SampleRate => AudioConstants.ProcessingSampleRate;
    public int FrameLength => 480;
    public double AlgorithmicLatencyMs => 10;
    public double AttenuationLimitDb => NoiseStrengthMapping.ToAttenuationDb(amount);
    public string? LastError => null;
    public bool Initialize(NoiseSuppressorInitialization initialization) => true;
    public void Configure(float value) => amount = value;
    public bool Process(ReadOnlySpan<float> input, Span<float> output, out float localSnrDb)
    {
        var gain = MathF.Pow(10f, -(float)AttenuationLimitDb / 20f);
        for (var index = 0; index < FrameLength; index++) output[index] = input[index] * gain;
        localSnrDb = 12f;
        return true;
    }
    public bool Reset() => true;
    public void Dispose() { }
}
