# Free application mixing backend

The audio host uses a complete Switchboard driver if installed. Otherwise it
uses the standard free VB-CABLE render endpoint plus Windows process-loopback
capture (Windows build 20348 or later). It does not require a paid certificate,
VB-CABLE A/B, SteelSeries GG, or changes to Windows security settings.

## UI integration

The experimental Audio workspace remains available in developer mode. Its app
picker includes unassigned sessions, distinguishes pending routes, and uses the
backend capability fields. In single-cable mode, Stream is unavailable, Aux is
hidden, and the Clip mixer omits the separately recorded microphone.

- `audio.capabilities.routingBackend` is `vb-cable`, `switchboard-driver`, or
  `none`. Optional new fields retain compatibility with earlier snapshots.
- Gate the application picker using `applicationRouting`, bus processing and
  personal mixing using `channelDsp`, and replay mix availability using
  `clipMix`. Do not gate all audio controls using `virtualChannels`: that means
  the separate named Windows endpoints, which the free mode does not provide.
- `virtualMicrophone` and `streamOutput` are unavailable in single-cable mode.
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

Only explicitly assigned executables are redirected. The Windows default devices
are never changed. A single cable is the silent ingress; each app gets its own
Windows process-loopback capture, then separate personal and clip buffers feed
the existing per-bus DSP and mixers. An unassigned app on the same cable cannot
leak into an assigned channel. Parent/child captures cannot overlap. Limits are
32 simultaneous captures and 64 saved executable assignments.

The host uses its existing five-second control tick for session inventory, app
restart detection, and route readback; there is no extra polling process. A new
or restarted app can take up to one tick to attach. PCM callbacks use bounded
100 ms per-destination SPSC buffers and immutable source snapshots, without
allocation, locks, logging, or IPC. The existing 20 ms clip pipe pump drains the
clip mix even without a consumer so it cannot accumulate an old-audio backlog.
Stopping audio disposes all capture/output handles and the pipe pump.

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

## Validation and reboot handoff

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
