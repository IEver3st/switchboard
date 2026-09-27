using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Switchboard.AudioHost;

internal static class CableRoutingTests
{
    public static void RunDeterministic()
    {
        var cable = new AudioEndpoint("sink", "CABLE Input (VB-Audio Virtual Cable)", "render", false, "speakers", CableEndpointCatalog.InterfaceName, 1, false, false);
        Check(CableEndpointCatalog.FindInput([cable]) == cable, "Standard stereo cable was not discovered.");
        foreach (var name in new[] { "Switchboard Mixer", "Switchboard Mixer (VB-Audio Virtual Cable)" })
        {
            var renamed = cable with { Name = name };
            Check(CableEndpointCatalog.FindInput([renamed]) == renamed, "Renamed Switchboard mixer was not discovered.");
            Check(CableEndpointCatalog.FindInput([renamed with { InterfaceName = "USB Audio" }]) is null, "Mixer alias bypassed driver identity validation.");
        }
        Check(CableEndpointCatalog.FindInput([cable with { Name = "CABLE In 16ch (VB-Audio Virtual Cable)" }]) is null, "16-channel endpoint must not become the stereo sink.");
        Check(CableEndpointCatalog.FindInput([cable with { InterfaceName = "USB Audio" }]) is null, "A renamed physical endpoint was accepted as a cable.");
        Check(CableEndpointCatalog.Inspect([cable]).Endpoints.Count == 1, "Driver snapshot fabricated endpoints.");
        Check(!CableRoutingEngine.CanPlay([("physical", true)], "sink"), "Unredirected apps must not be rendered twice.");
        Check(!CableRoutingEngine.CanPlay([("sink", true), ("physical", true)], "sink"), "Split active sessions must remain pending.");
        Check(CableRoutingEngine.CanPlay([("sink", true), ("physical", false)], "sink"), "An inactive old session must not block a confirmed route.");

        Check(ApplicationRoutingPolicy.AutomaticDestination(@"C:\Apps\CHROME.EXE") == "media", "Browser category must be case insensitive.");
        Check(ApplicationRoutingPolicy.AutomaticDestination(@"C:\Apps\Discord.exe") == "chat", "Chat detection failed.");
        Check(ApplicationRoutingPolicy.AutomaticDestination(@"C:\Games\unknown.exe") == "game", "Unknown applications need a default category.");
        var overrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { [@"C:\Apps\chrome.exe"] = "game" };
        Check(ApplicationRoutingPolicy.Destination(@"C:\Apps\CHROME.EXE", true, overrides) == "game", "Explicit preference did not override automatic detection.");
        Check(ApplicationRoutingPolicy.Destination(@"C:\Apps\chrome.exe", false, overrides) == "game", "Disabling automation discarded manual routing.");
        Check(ApplicationRoutingPolicy.Destination(@"C:\Apps\Spotify.exe", false, overrides) is null, "Disabled automation still assigned apps.");
        Check(ApplicationRoutingPolicy.Destination(@"C:\Apps\SteelSeriesSonar.exe", true, overrides) is null, "Audio mixer output must not feed back.");
        var microphoneSend = cable with { Id = "mic-send", Name = "Hi-Fi Cable Input", InterfaceName = MicrophoneCableCatalog.InterfaceName };
        var microphoneReceive = microphoneSend with { Id = "mic-receive", Name = "Hi-Fi Cable Output", Flow = "capture" };
        Check(MicrophoneCableCatalog.Find([cable, microphoneSend, microphoneReceive], "capture") == microphoneReceive, "Mic transport selected the app cable.");
        Check(MicrophoneCableCatalog.Find([microphoneReceive with { InterfaceName = "USB Audio" }], "capture") is null, "Renamed physical mic impersonated a cable.");
        Check(CableEndpointCatalog.IsVirtual(microphoneSend), "Hi-Fi Cable must not appear as physical playback hardware.");

        var mixer = new DynamicAudioMixer();
        var ringA = new SpscFloatRing(16);
        var ringB = new SpscFloatRing(16);
        mixer.SetSources([ringA, ringB]);
        ringA.WriteMono([0.2f, 0.3f]); ringB.WriteMono([0.1f, 0.4f]);
        var samples = new float[4]; mixer.Read(samples);
        Check(Math.Abs(samples[0] - 0.3f) < 0.0001 && Math.Abs(samples[2] - 0.7f) < 0.0001, "Independent source mixing failed.");
        mixer.SetSources([]); mixer.Read(samples);
        Check(samples.All(sample => sample == 0), "Removed sources retained audible data.");

        var directory = Path.Combine(Path.GetTempPath(), "switchboard-route-test-" + Guid.NewGuid().ToString("N"));
        var previousEnvironment = Environment.GetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL");
        var identity = AudioProcessIdentity.TryRead(Environment.ProcessId)!;
        var original = new ApplicationEndpointPreferences("original-console", "original-media", "original-chat");
        var policy = new FakePolicy { Value = original };
        try
        {
            Environment.SetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL", Path.Combine(directory, "leases.json"));
            using (var journal = new AudioRouteLeaseJournal(policy))
            {
                journal.Acquire(identity, "sink");
                Check(policy.Value == ApplicationAudioPolicy.PreferencesFor("sink"), "Cable preference was not set.");
                // Dispose without restoring simulates a host crash.
            }
            using (var recovery = new AudioRouteLeaseJournal(policy))
            {
                recovery.Recover([identity]);
                Check(policy.Value == original, "Crash recovery failed to restore original roles.");
                policy.FailNextWrite = true;
                ExpectFailure(() => recovery.Acquire(identity, "sink"));
                Check(policy.Value == original, "A partial role write was not rolled back.");
                recovery.Acquire(identity, "sink");
                policy.Value = policy.Value with { Communications = "user-changed-chat" };
                recovery.RestoreAll();
                Check(policy.Value == original with { Communications = "user-changed-chat" }, "Restore overwrote a user's newer Windows route.");
            }
            File.WriteAllText(Path.Combine(directory, "leases.json"), "[{\"Process\":null}]");
            ExpectFailure(() => { using var ignored = new AudioRouteLeaseJournal(policy); });
        }
        finally
        {
            Environment.SetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL", previousEnvironment);
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    public static void RunPolicyRestoration()
    {
        // This process has no audio session: only its own policy is changed.
        // No generated tone or user application can be picked up by another mixer.
        using var endpoints = new EndpointService();
        var inventory = endpoints.List();
        var sink = CableEndpointCatalog.FindInput(inventory) ?? throw new InvalidOperationException("VB-CABLE is required.");
        var physical = inventory.First(endpoint => endpoint.Flow == "render" && !CableEndpointCatalog.IsVirtual(endpoint));
        using var policy = new ApplicationAudioPolicy();
        var id = Environment.ProcessId;
        var original = policy.ReadPreferences(id);
        var managed = ApplicationAudioPolicy.PreferencesFor(sink.Id);
        var userChoice = ApplicationAudioPolicy.PreferencesFor(physical.Id).Communications;
        var missing = ApplicationAudioPolicy.PreferencesFor("{0.0.0.00000000}.{" + Guid.NewGuid() + "}");
        var directory = Path.Combine(Path.GetTempPath(), "switchboard-restore-policy-" + Guid.NewGuid().ToString("N"));
        var previousJournal = Environment.GetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL");
        try
        {
            policy.WritePreferences(id, managed with { Communications = userChoice });
            policy.RestorePreferences(id, sink.Id, missing);
            var expected = new ApplicationEndpointPreferences("", "", userChoice);
            Check(policy.ReadPreferences(id) == expected, "Missing endpoints must fall back to Windows default without overwriting the user's newer role.");
            policy.RestorePreferences(id, sink.Id, missing);
            Check(policy.ReadPreferences(id) == expected, "Repeated restoration changed an unowned route.");

            policy.WritePreferences(id, managed);
            var connected = ApplicationAudioPolicy.PreferencesFor(physical.Id);
            policy.RestorePreferences(id, sink.Id, connected);
            Check(policy.ReadPreferences(id) == connected, "A connected previous output was not restored.");

            // Exercise the same persisted lease teardown used by bus-device changes.
            Directory.CreateDirectory(directory);
            var journalPath = Path.Combine(directory, "leases.json");
            Environment.SetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL", journalPath);
            var lease = new AudioRouteLease(AudioProcessIdentity.TryRead(id)!, sink.Id, missing);
            File.WriteAllText(journalPath, JsonSerializer.Serialize(new[] { lease }));
            policy.WritePreferences(id, managed with { Communications = userChoice });
            using (var journal = new AudioRouteLeaseJournal(policy)) journal.RestoreAll();
            Check(policy.ReadPreferences(id) == expected, "Lease teardown failed to release the missing output.");
            Check(JsonSerializer.Deserialize<AudioRouteLease[]>(File.ReadAllText(journalPath))!.Length == 0,
                "Confirmed fallback retained an unrecoverable lease.");
            Console.WriteLine("Live route restoration passed: missing endpoint fallback, connected endpoint, newer user role, repeated restore, lease teardown.");
        }
        finally
        {
            Environment.SetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL", previousJournal);
            try { policy.WritePreferences(id, original); }
            finally { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); }
        }
    }

    public static void RunTone(string[] args)
    {
        var frequency = double.Parse(args[Array.IndexOf(args, "--cable-tone") + 1], System.Globalization.CultureInfo.InvariantCulture);
        using var endpoints = new EndpointService();
        var sink = CableEndpointCatalog.FindInput(endpoints.List()) ?? throw new InvalidOperationException("VB-CABLE is not installed.");
        using var device = endpoints.Open(sink.Id);
        using var output = new AudioOutput(device, new Tone(frequency));
        output.Start();
        Console.WriteLine("tone-ready");
        Console.ReadLine();
    }

    public static async Task RunLiveAsync()
    {
        using var endpoints = new EndpointService();
        var inventory = endpoints.List();
        _ = CableEndpointCatalog.FindInput(inventory) ?? throw new InvalidOperationException("Restart Windows after installing VB-CABLE, then rerun this check.");
        var physical = inventory.FirstOrDefault(endpoint => endpoint.Flow == "render" && !CableEndpointCatalog.IsVirtual(endpoint))
            ?? throw new InvalidOperationException("A physical playback endpoint is required.");
        var directory = Path.Combine(Path.GetTempPath(), "switchboard-live-cable-" + Guid.NewGuid().ToString("N"));
        var previousEnvironment = Environment.GetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL");
        var helperPath = Path.Combine(AppContext.BaseDirectory, "Switchboard.Cable.Test-" + Guid.NewGuid().ToString("N") + ".exe");
        var otherPath = Path.Combine(AppContext.BaseDirectory, "Switchboard.Cable.Other-" + Guid.NewGuid().ToString("N") + ".exe");
        Process? helper = null;
        Process? other = null;
        CableRoutingEngine? engine = null;
        var defaultsBefore = inventory.Where(endpoint => endpoint.IsDefault).Select(endpoint => endpoint.Id).Order().ToArray();
        try
        {
            Environment.SetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL", Path.Combine(directory, "leases.json"));
            File.Copy(Path.Combine(AppContext.BaseDirectory, "Audio.Host.Tests.exe"), helperPath);
            helper = Process.Start(new ProcessStartInfo(helperPath)
            {
                ArgumentList = { "--cable-tone", "440" },
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                UseShellExecute = false, CreateNoWindow = true,
            })!;
            var ready = await helper.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
            Check(ready == "tone-ready", "Synthetic source failed to start: " + ready);
            File.Copy(Path.Combine(AppContext.BaseDirectory, "Audio.Host.Tests.exe"), otherPath);
            other = Process.Start(new ProcessStartInfo(otherPath)
            {
                ArgumentList = { "--cable-tone", "880" }, RedirectStandardInput = true, RedirectStandardOutput = true,
                RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true,
            })!;
            Check(await other.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)) == "tone-ready", "Unassigned isolation source failed to start.");
            using var policy = new ApplicationAudioPolicy();
            var original = policy.ReadPreferences(helper.Id);
            var discoverOther = false;
            var clipPipe = "switchboard-test-" + Guid.NewGuid().ToString("N");
            engine = CableRoutingEngine.Create(endpoints, Settings(physical.Id),
                () => endpoints.ListProcessSessions().Where(session => session.Process.Id == helper.Id || discoverOther && session.Process.Id == other.Id).ToArray(), clipPipe);
            engine.Start();
            engine.RouteApplication(new(helper.Id, "game"));
            engine.Refresh();
            Check(engine.ListApplications().Single(app => app.ProcessId == helper.Id).RoutingState == "applied", "The synthetic cable route was not confirmed.");
            using var pipe = new NamedPipeClientStream(".", clipPipe, PipeDirection.In, PipeOptions.Asynchronous);
            await pipe.ConnectAsync(5000);
            var audible = await ReadRms(pipe);
            Check(audible > 0.005, $"Process loopback did not reach the independent clip mix (RMS {audible}).");
            Check(unassignedTone < assignedTone * 0.08, $"An unassigned app leaked from the shared cable: 440 Hz {assignedTone}, 880 Hz {unassignedTone}.");
            var assigned = engine.ApplicationRoutes;
            engine.Configure(Settings(physical.Id, clipGain: 0, routes: assigned));
            var muted = await ReadRms(pipe);
            Check(muted < audible * 0.05, $"Clip gain did not mute application PCM (RMS {muted}).");
            engine.RouteApplication(new(helper.Id, "media"));
            Check(engine.ApplicationRoutes.Single().Destination == "media", "Bus reassignment was lost.");
            engine.Configure(Settings(physical.Id, automatic: true));
            engine.Refresh();
            Check(engine.ListApplications().Single(app => app.ProcessId == helper.Id) is { CurrentDestination: "game", Automatic: true }, "Automatic routing required a manual assignment.");
            Check(engine.ApplicationRoutes.Count == 0, "Automatic classification polluted saved overrides.");
            discoverOther = true;
            engine.Refresh();
            Check(engine.ListApplications().Single(app => app.ProcessId == other.Id).CurrentDestination == "game", "Newly discovered app was not automatically routed.");
            engine.Configure(Settings(physical.Id, automatic: true, routes: [new(helperPath, "chat")]));
            engine.Refresh();
            Check(engine.ListApplications().Single(app => app.ProcessId == helper.Id) is { CurrentDestination: "chat", Automatic: false }, "Saved category did not move live audio.");
            engine.Configure(Settings(physical.Id, automatic: true));
            engine.Refresh();
            Check(engine.ListApplications().Single(app => app.ProcessId == helper.Id) is { CurrentDestination: "game", Automatic: true }, "Reset to Automatic did not recategorize audio.");
            engine.Configure(Settings(physical.Id));
            engine.Refresh();
            Check(engine.ListApplications().All(app => app.CurrentDestination is null), "Disabling automation retained automatic captures.");
            engine.Dispose(); engine = null;
            Check(policy.ReadPreferences(helper.Id) == original, "Live stop failed to restore the original Windows roles.");
            for (var index = 0; index < 3; index++)
            {
                using var repeated = CableRoutingEngine.Create(endpoints, Settings(physical.Id));
                repeated.Start(); repeated.Refresh();
            }
            await VerifyKilledHostRecovery(helper.Id, physical.Id, original);
            Check(defaultsBefore.SequenceEqual(endpoints.List().Where(endpoint => endpoint.IsDefault).Select(endpoint => endpoint.Id).Order()), "Audio defaults changed during the check.");
            Console.WriteLine(JsonSerializer.Serialize(new { liveCable = "passed", automaticDiscovery = true, categoryOverrideAndReset = true, clipRms = audible, mutedRms = muted, isolatedUnassignedApp = true,
                defaultDevicesUnchanged = true, restoredApplicationRoles = true, killedHostRecovery = true, repeatedStarts = 3 }));
        }
        finally
        {
            engine?.Dispose();
            if (helper is not null)
            {
                if (!helper.HasExited) { await helper.StandardInput.WriteLineAsync(); await helper.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); }
                helper.Dispose();
            }
            if (other is not null)
            {
                if (!other.HasExited) { await other.StandardInput.WriteLineAsync(); await other.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); }
                other.Dispose();
            }
            Environment.SetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL", previousEnvironment);
            if (File.Exists(helperPath)) File.Delete(helperPath);
            if (File.Exists(otherPath)) File.Delete(otherPath);
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private static double assignedTone, unassignedTone;
    private static async Task<double> ReadRms(Stream pipe)
    {
        var bytes = new byte[3840 * 2];
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        // Drain queued data and allow configuration changes to reach the consumer.
        for (var i = 0; i < 15; i++) await pipe.ReadExactlyAsync(bytes, timeout.Token);
        var samples = MemoryMarshal.Cast<byte, float>(bytes);
        double power = 0;
        foreach (var sample in samples) power += sample * sample;
        double aReal = 0, aImag = 0, bReal = 0, bImag = 0;
        for (var frame = 0; frame < samples.Length / 2; frame++)
        {
            var sample = samples[frame * 2];
            aReal += sample * Math.Cos(2 * Math.PI * 440 * frame / 48000);
            aImag += sample * Math.Sin(2 * Math.PI * 440 * frame / 48000);
            bReal += sample * Math.Cos(2 * Math.PI * 880 * frame / 48000);
            bImag += sample * Math.Sin(2 * Math.PI * 880 * frame / 48000);
        }
        assignedTone = Math.Sqrt(aReal * aReal + aImag * aImag);
        unassignedTone = Math.Sqrt(bReal * bReal + bImag * bImag);
        return Math.Sqrt(power / samples.Length);
    }

    private static async Task VerifyKilledHostRecovery(int sourcePid, string output, ApplicationEndpointPreferences original)
    {
        var hostPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../audio-host/bin/Release/net10.0-windows/Audio.Host.exe"));
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        Process SpawnHost() => Process.Start(new ProcessStartInfo(hostPath)
        {
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            UseShellExecute = false, CreateNoWindow = true,
        })!;
        async Task<JsonElement> Request(Process host, string command, object? payload = null)
        {
            var requestId = Guid.NewGuid().ToString();
            await host.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { requestId, command, payload }, options));
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            while (await host.StandardOutput.ReadLineAsync(timeout.Token) is { } line)
            {
                using var document = JsonDocument.Parse(line);
                var root = document.RootElement;
                if (!root.TryGetProperty("requestId", out var id) || id.GetString() != requestId) continue;
                if (root.TryGetProperty("error", out var error)) throw new InvalidOperationException(error.GetString());
                return root.GetProperty("result").Clone();
            }
            throw new InvalidOperationException("Audio.Host closed before responding: " + await host.StandardError.ReadToEndAsync());
        }
        using (var killed = SpawnHost())
        {
            try
            {
                var status = await Request(killed, "start", Settings(output));
                Check(status.GetProperty("capabilities").GetProperty("routingBackend").GetString() == "vb-cable", "Real host did not choose the free backend.");
                await Request(killed, "routeApplication", new AudioApplicationRouteRequest(sourcePid, "game"));
                var journalPath = Environment.GetEnvironmentVariable("SWITCHBOARD_AUDIO_ROUTE_JOURNAL")!;
                var leasedAt = File.GetLastWriteTimeUtc(journalPath);
                await Task.Delay(TimeSpan.FromSeconds(6));
                var later = await Request(killed, "status");
                Check(later.GetProperty("applications").EnumerateArray().Any(app => app.GetProperty("processId").GetInt32() == sourcePid
                    && app.GetProperty("routingState").GetString() == "applied"), "The app route did not survive a recovery tick without a microphone.");
                Check(File.GetLastWriteTimeUtc(journalPath) == leasedAt, "A missing optional microphone restarted application routing.");
            }
            finally { if (!killed.HasExited) killed.Kill(); await killed.WaitForExitAsync(); }
        }
        using var recovered = SpawnHost();
        try
        {
            await Request(recovered, "start", Settings(output));
            using var policy = new ApplicationAudioPolicy();
            Check(policy.ReadPreferences(sourcePid) == original, "A killed host left the application routed to the cable after recovery.");
            await Request(recovered, "shutdown");
            await recovered.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
        }
        finally { if (!recovered.HasExited) { recovered.Kill(); await recovered.WaitForExitAsync(); } }
    }

    private static AudioHostSettings Settings(string output, float clipGain = 1, IReadOnlyList<AudioApplicationPreference>? routes = null, bool automatic = false) => new()
    {
        Buses = new[] { "game", "chat", "media", "aux" }.Select(id => new AudioBusConfiguration { Id = id, DeviceId = output }).ToArray(),
        Mixes = new[] { "personal", "stream", "clip" }.Select(id => new AudioMixConfiguration
        {
            Id = id, Label = id, Master = new() { Gain = id == "personal" ? 0 : id == "clip" ? clipGain : 1 },
            Buses = new[] { "game", "chat", "media", "aux", "mic" }.Select(bus => new AudioMixBusConfiguration { Id = bus }).ToArray(),
        }).ToArray(),
        ChannelProcessing = new[] { "game", "chat", "media" }.Select(id => new ChannelProcessingSettings { BusId = id }).ToArray(),
        MicProcessors = new[] { "noise-suppression", "noise-gate", "gain", "equalizer", "compressor", "limiter" }
            .Select(id => new MicrophoneProcessorSettings { Id = id, Parameters = JsonSerializer.SerializeToElement(new { }) }).ToArray(),
        AutomaticApplicationRouting = automatic,
        ApplicationRoutes = routes ?? [],
    };

    private sealed class Tone(double frequency) : ISampleProvider
    {
        private long position;
        public WaveFormat WaveFormat { get; } = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);
        public int Read(Span<float> buffer)
        {
            for (var i = 0; i < buffer.Length; i += 2)
                buffer[i] = buffer[i + 1] = (float)(0.1 * Math.Sin(2 * Math.PI * frequency * position++ / 48000));
            return buffer.Length;
        }
    }
    private static void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private static void ExpectFailure(Action action)
    {
        try { action(); } catch (InvalidOperationException) { return; }
        throw new InvalidOperationException("Expected an invalid route to be rejected.");
    }
    private sealed class FakePolicy : IApplicationEndpointPolicy
    {
        public ApplicationEndpointPreferences Value = new("", "", "");
        public bool FailNextWrite;
        public ApplicationEndpointPreferences ReadPreferences(int processId) => Value;
        public void WritePreferences(int processId, ApplicationEndpointPreferences preferences)
        {
            if (FailNextWrite) { FailNextWrite = false; Value = Value with { Console = preferences.Console }; throw new InvalidOperationException("Partial write"); }
            Value = preferences;
        }
        public void RestorePreferences(int processId, string sinkId, ApplicationEndpointPreferences previous)
        {
            var owned = ApplicationAudioPolicy.PreferencesFor(sinkId);
            Value = new(Value.Console == owned.Console ? previous.Console : Value.Console,
                Value.Multimedia == owned.Multimedia ? previous.Multimedia : Value.Multimedia,
                Value.Communications == owned.Communications ? previous.Communications : Value.Communications);
        }
    }
}
