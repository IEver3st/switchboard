# Free application mixing backend

The audio host uses a complete Switchboard driver if installed. Otherwise it
uses the standard free VB-CABLE render endpoint plus Windows process-loopback
capture (Windows build 20348 or later). It does not require a paid certificate,
VB-CABLE A/B, SteelSeries GG, or changes to Windows security settings.

## UI integration

Audio is now opt-in for every user. New installs default to Devices/Capture;
onboarding's **Show the Audio page** adds a dedicated audio setup step. Settings
→ Audio exposes the same **Install audio drivers**, **Check again**, download
cancel, error/retry, and restart states. Driver installation is separate from
turning on the audio engine; a skipped setup never downloads anything. Selecting
Audio with ready drivers lets onboarding enable the engine on completion.

Packages download directly from VB-Audio and remain unmodified. SHA-256 pins and
publisher certificate thumbprints live in `windows-audio-dependencies.ts`.
Both official dialogs remain visible; UAC and the vendor's Install button are
user actions. This is assisted installation, not a fully silent installer. The
interface retains VB-Audio attribution and links to its donationware/licensing
terms: https://vb-audio.com/Services/licensing.htm .

The setup state machine has focused tests for missing/already installed drivers,
concurrency, failed verification, cancelled UAC/downloads, restart receipts,
inactive endpoints, and shutdown. Native Electron fixture checks cover both entry
points at the three supported sizes, including retry and keyboard enable. Actual
Windows checks verify inventory, both official downloads and signatures, 48 kHz
readback, and unchanged defaults. Fresh-PC installation through this new wrapper,
UAC interactions and reboot completion still require a clean Windows validation;
the existing drivers on this development PC were not reinstalled for testing.

The initial backend handoff is now connected to the existing audio UI. Unassigned
apps are available in each channel's application picker, pending routes remain
visible, and the first assignment has an explicit empty selection. The mixer
uses application-routing capability rather than requiring separate virtual
channels. Single-cable mode offers physical playback outputs, Game/Chat/Media
strips, Personal/Clip destinations, and an explanation for unavailable outputs.

- `audio.capabilities.routingBackend` is `vb-cable`, `switchboard-driver`, or
  `none`. Optional new fields retain compatibility with earlier snapshots.
- Gate the application picker using `applicationRouting`, bus processing and
  personal mixing using `channelDsp`, and replay mix availability using
  `clipMix`. Do not gate all audio controls using `virtualChannels`: that means
  the separate named Windows endpoints, which the free mode does not provide.
- `virtualMicrophone` and `streamOutput` are unavailable with only one cable.
  Physical-microphone processing, monitoring, and the mic test remain supported.
  Aux has no assignable source in this mode. The clip pipe contains applications
  only; Capture retains its separate microphone track. The stream mix and clip
  microphone control have no output in this mode and should be unavailable.
- `driver.interfaceName` and `driver.endpoints` describe the actual VB-CABLE
  devices. They never impersonate eight Switchboard endpoints.
- App discovery includes unassigned Windows audio sessions. `destination` is the
  desired/default picker choice; `currentDestination` is **null** until the
  app's audio is confirmed on the cable and its process capture can be played.
  Keep unassigned/pending apps visible in the application picker. Use
  `routingState`, not the desired destination, for an applied indication.
- The existing `setAudioApplicationRoute` operation still accepts the app ID
  and Game/Chat/Media destination. Main persists confirmed `applicationRoutes`
  by full executable path, not PID. Configurations and route changes serialize
  through the existing audio configuration queue. Session IDs include process
  start time to prevent accidental reuse after an app exits.
- Apps which hold their old endpoint stay `pending-restart` until restarted.
  No physical playback is added while an active session in the captured process
  tree still uses another endpoint, preventing duplicate playback.
- Select physical headphones/speakers for bus outputs. Sending the mix back
  into a virtual cable or another virtual mixer is rejected to prevent feedback.

## Runtime ownership

### Optional processed microphone

An independently installed, free VB-Audio Hi-Fi Cable provides the processed
microphone transport. Standard VB-CABLE remains exclusively the application
ingress. Select the physical microphone in Switchboard and **Hi-Fi Cable Output**
in the receiving voice app. Selecting the physical microphone in that app bypasses
Switchboard processing. This does not add a separate Stream output.

`MicrophoneCableOutput` consumes the existing processed microphone ring and owns
one WASAPI output. It gates disabled microphone channels to silence, releases
the output before microphone disposal, and retries failed output on the existing
five-second control tick. Endpoint topology changes recreate the pipeline. Missing
drivers do not trigger repeated endpoint enumeration. No PCM enters Electron IPC.

Hi-Fi Cable Input and Output must have matching Windows sample rates. The host
checks this before opening output and reports actionable errors through
`microphone.virtualOutput`; `virtualMicrophone` becomes available only with a
running output and microphone pipeline. Application routing remains independent.
Cable endpoints are rejected as physical bus outputs or microphone sources, and
saved selections are repaired during discovery to prevent feedback.

Use the official installer at https://vb-audio.com/Cable/ and restart if requested.
Driver installation and compatibility with this PC's Windows security settings
must be verified separately from builds and deterministic tests. Do not disable
Windows security protections to enable this optional transport.

### Application routing

Automatic routing is enabled by default. Known chat apps go to Chat, browsers
and media players go to Media, and other eligible executables go to Game. Audio
hosts and known mixers are excluded to avoid feedback. Categories are executable
based: tabs within a browser share one category. Settings > Audio > Application
routing provides an automation toggle and persistent category overrides. Selecting
Automatic removes an override; turning automation off retains explicit categories.
Saved overrides remain editable when the app is closed and take priority over
classification. The Windows default devices are never changed. A single cable is the silent ingress; each app gets its own
Windows process-loopback capture, then separate personal and clip buffers feed
the existing per-bus DSP and mixers. An uncaptured app on the same cable cannot
leak into a captured channel. Parent/child captures cannot overlap. Limits are
32 simultaneous captures and 64 saved executable assignments.

The host uses its existing five-second control tick for session inventory, app
restart detection, and route readback; there is no extra polling process. A new
or restarted app can take up to one tick to attach. PCM callbacks use bounded
100 ms per-destination SPSC buffers and immutable source snapshots, without
allocation, locks, logging, or IPC. The existing 20 ms clip pipe pump drains the
clip mix even without a consumer so it cannot accumulate an old-audio backlog.
Stopping audio disposes all capture/output handles and the pipe pump. One app's
capture failure is reported on that app without tearing down the other routes;
it is retried when the app restarts or routing preferences change. Apps which
change their own Windows output are left alone until explicitly reassigned.

Before changing Windows application endpoint preferences, the host writes a
durable recovery lease for Console, Multimedia, and Communications roles under
`%LOCALAPPDATA%\Switchboard\Audio Routing\leases.json`. This is runtime recovery
metadata, not a second product settings store. A file lock prevents concurrent
owners. `SWITCHBOARD_AUDIO_ROUTE_JOURNAL` overrides the path for isolated tests.
Partial writes and normal stop restore the original preferences. User changes
to a role are preserved. Killed-host recovery restores outstanding leases when
the free backend next starts. If an app has exited, its lease is retained until
the executable is observed again; stale PIDs are never used for restoration.
Some applications require reopening their audio stream after restoration too.

If a saved previous output disappears (for example, closing Sonar removes its
endpoint), restoring a Switchboard-owned role falls back to the Windows default
instead of writing the unavailable endpoint back. Restoration verifies readback
before releasing the lease and never rewrites a role the user changed. The focused
`--live-route-restoration` Audio.Host.Tests mode checks this against Windows using
only the test process's own routing preferences, without playing audio or changing
the user's applications.

## Validation and reboot handoff

The September 27 microphone transport work builds and passes the deterministic
audio-host and focused configuration/discovery tests. Native Electron verified
the missing-driver and connected-output notices, renderer reload, repeated engine
start/stop, and layouts at 1080x720, 1420x900, and 1920x1080. These notices reflect
WASAPI connection state, not proof that a receiving app hears the signal.

Hi-Fi Cable installed on this PC and requested a restart. Its capture endpoint
initially used 44.1 kHz while render used 48 kHz; both were set and read back at
48 kHz. The installer changed Windows defaults; the previous standard-cable
defaults were restored. Before reboot, the synthetic test measured signal at
Hi-Fi Cable's render endpoint but silence at capture. End-to-end microphone
delivery is therefore still pending reboot and live verification. No Windows
security protections were disabled.

`Audio.Host.Tests --live-microphone-cable` checks transport gain, mute, three
start/stop cycles, disposal and unchanged Windows defaults using generated audio,
without recording the physical microphone. Run a copy of the test apphost renamed
`Audio.Host.exe` in an isolated copy of its output directory so automatic app
routing in another Switchboard instance excludes it. Do not rename the real
production host. The microphone DSP itself is covered by the deterministic suite.

Post-reboot validation on September 27 confirmed the Microsoft-signed VB-CABLE
3.3.1.7 driver and passed the live source-isolation, clip-gain, repeated-start,
and killed-host recovery checks. A native Electron check with an isolated profile
and generated tone also exercised the real enable-audio IPC call, first Game
assignment through the picker, a canonical fader write, renderer-reload
persistence, and all three supported review sizes. The user's microphone was
not recorded and the generated source's physical playback was muted.

Automatic routing was also validated with isolated live sources: discovery after
start, category override, reset to automatic, disable/restore, and no automatically
derived entries in persisted overrides. The Settings toggle, offline saved app,
live category move, reset, renderer reload and engine restart were exercised in
native Electron at all three supported sizes. The live test supplies a filtered
session inventory and private clip pipe so it does not reroute the user's apps.

Host JSON omits null properties. Both unassigned destination fields normalize to
null at the shared schema boundary; omitted `preferredDestination` must not
reject engine startup. `tests/audio-free-routing.test.ts` covers this wire case.

Run deterministic checks with:

```powershell
dotnet run --configuration Release --project engines/audio-host-tests/Audio.Host.Tests.csproj
bun test tests/audio-free-routing.test.ts tests/audio-configuration.test.ts tests/audio-device-discovery.test.ts tests/audio-persistence.test.ts
```

Run the bounded live check after installing VB-CABLE:

```powershell
dotnet run --configuration Release --project engines/audio-host-tests/Audio.Host.Tests.csproj -- --live-cable
```

The live check uses two generated tones on VB-CABLE, silences physical playback,
and does not record the user's microphone. It verifies source isolation, PCM
delivery, independent clip gain, reassignment, unchanged defaults, route
restoration, repeated starts/stops, and recovery after killing a separate real
Audio.Host process. All helper processes are scoped to the check.

The installed driver requests a Windows restart. After reboot, launch the dev
app with `bun run dev` to build/load the new host; an older installed Switchboard
release does not contain these source changes. Verify browser music, a game and
chat assignment using the updated UI; check personal/clip gains independently,
then stop audio and reopen apps that retain their old endpoint. Physical-device
disconnect/reconnect, default-device changes, a long soak, and end-user audible
quality remain separate acceptance checks. This work does not publish a release.
