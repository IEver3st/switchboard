# Architecture

Audio is an optional workspace available without Developer mode. Capture-only
onboarding never requests driver downloads. Main's `AudioDependencySetup` owns
the shared onboarding/Settings workflow through a narrow check/install/cancel
contract. Runtime progress is projected through `audio.dependencies` and omitted
from preferences. A per-user setup directory retains a reboot receipt and an
installer lock shared between installed and development profiles.

The Audio warning beneath the channel tabs derives recovery actions from the
canonical engine, routing, endpoint and mix state. Endpoint discovery retains
Windows volume and mute readback. Restart is a serialized main-owned operation
that releases the previous host and route leases before starting the saved mix;
it does not change Windows defaults. The Windows sound action opens only the
fixed system volume-mixer URI through typed IPC. Neither action exposes generic
process or shell access to the renderer.

The Windows backend downloads only two pinned official vendor archives, verifies
SHA-256 and Authenticode publisher identity, then elevates the unmodified vendor
installer with a visible window. The user completes UAC and any vendor Install
prompt. No driver is bundled, signing policy is unchanged, and no Windows restart
is initiated. A one-shot Audio.Host setup command inspects endpoints and driver
registration, configures the Hi-Fi pair at 48 kHz, and restores defaults only when
the just-installed transport took them over. An unelevated installer helper owns
that cleanup even if Electron closes. Installed-but-inactive drivers are reported
instead of invoking an installer that could remove them.

Headphone spatial audio is a personal-output stage in Audio.Host. Both routing
backends wrap their physical mixers in the same measured-HRTF renderer; clip,
stream, and microphone paths retain their original perspective. Main owns saved
`audio.spatial` settings and requires host readback before committing live edits.
Seven virtual sources expand stereo into a configurable headphone stage. Built-in
Android Head Tracker HID sensors or optional loopback OpenTrack poses are owned by
the routing session. No audio or pose stream enters Electron IPC. Disabling the
stage releases sensor/socket resources and fades to direct bypass. Sony input-service
setup is an explicit narrow host command; driver binding repair is a separate
administrator maintenance script, never a background operation. See
`docs/SPATIAL-AUDIO-EXPLORATION.md` for protocol, attribution, and validation scope.

Quick Controls is a bounded floating window with persisted solid/native-acrylic
material selection. Vertical framing uses a separate, static sandboxed window,
without a preload, scripts, or trusted IPC. Main validates and serializes setup
preferences, applies the native change, then publishes confirmed state. The guide
ignores input, requests capture exclusion, survives panel/tray dismissal, and is
destroyed on disable, renderer failure, display removal, or shutdown. Geometry is
expressed in physical screen pixels and drawn inside a display-sized window,
independent of Windows scaling. Outside dimming ranges from 0 to 80% with a clear
interior. Exact custom geometry is validated against the chosen display before
the last confirmed guide changes. New app sessions keep
the saved geometry but start with the guide off. The guide does not crop capture;
9:16 output remains an explicit clip-editor export choice.

Setup scenes are persisted by main through `SetupScenes` and the canonical shared
contract. Audio, capture, and device changes use the existing host and module
operations; failed subsystems report partial application. Automatic restoration
preserves subsystems edited during a scene. Saved recovery state survives restart.
`DesktopControlsService` registers Quick controls through Electron's global shortcut
API in main, so a press toggles the panel even when the main renderer is in the tray.
It unregisters only its own shortcut on reconfiguration or disposal. The bundled
Capture.Host runs with `--desktop-controls` only when automatic scenes need
application matching, without initializing capture/media or polling keyboard state.
Its bounded JSON events are validated in main. The sandboxed quick panel has a
separate trusted-window IPC allowlist. Status cues enter vendor modules through a
narrow temporary-lighting operation; battery warnings/cutoff take precedence, and
clearing the cue restores the user's effect. Game-only capture uses NAudio process
loopback for the selected source PID and children, bypasses the desktop clip mix,
and fails explicitly when process activation is unavailable.

## Control plane

Unpackaged Vite launches own an automatic local development feedback session.
`DevelopmentFeedback` consumes the existing diagnostic event stream and five-second
performance samples, without publishing dev timings into product state or changing
persisted settings. It writes bounded atomic status files and accepts only validated
1–10 second CPU-profile requests scoped to its session. In-process Node inspector
sessions and renderer debugger attachments exist only during short recordings;
there is no debug server or generic execution endpoint. Shutdown cancels recordings
and drains status writes. Production, preview and normal review launches do not
construct this service. See [the feedback commands](docs/resource-diagnostics.md#automatic-development-feedback).

Installed Switchboard and Switchboard Dev keep separate settings and share a
per-user runtime handoff protocol. Dev owns devices, audio, capture and shortcuts
for its session. Main-process named pipes authenticate peers with a key stored in
the user's AppData directory; a separate exclusive pipe fences runtime ownership.
The installed process removes its renderer IPC, releases its controller and all
hosts, then acknowledges handoff. Its sandboxed, preload-free standby window
cannot issue product commands. Dev starts only after release completes. A clean
Dev exit releases its runtime before notifying the installed process, which
constructs a fresh controller from its own persisted settings.

An unacknowledged disconnect does not prove native children have exited, so the
installed instance stays paused. Reopening Dev and quitting it normally restores
the acknowledged path. A failed cleanup retains the ownership fence. Older
installed builds cannot cooperate; Dev detects their process at startup and stays
blocked instead of competing. Fixture-only reviews bypass production handoff;
the native handoff verifier uses isolated AppData and explicit fixture roles.

The opt-in game launch tray policy shares the media-free desktop-controls helper.
It reuses WindowsCaptureSources game recognition without starting a recorder.
Main validates game process events and sends the window to tray once per detected
session, honoring renderer destruction independently of the manual close policy.
Reopening the interface during that session leaves it open. Helper failures appear
beside the setting; turning the option off and on retries watching.

Detailed resource recording reuses the performance sampler and starts the bundled
Capture.Host in `--resource-diagnostics` mode. This mode initializes no capture or
audio engine. Main sends only known app/engine process IDs over stdin; the helper
adds itself, reads Windows CPU time, memory, handle and I/O counters, and closes
each limited-query process handle after the request. The helper signals readiness
before the sample deadline starts, so cold runtime startup does not consume the
counter-read budget. Timed-out helpers are killed and the next sample restarts
them; collection recovery publishes immediately without ending a diagnostic run.
Main validates bounded responses, computes
per-lifetime deltas, and owns the transient history in the shared resource contract.
Renderer reloads retain that history; settings persistence omits it. JSON export
schema 4 includes the same history and process summaries, plus existing full
samples, runtime data, event timeline and capture/environment context.

Electron owns product lifecycle, module state, profiles, settings, diagnostics, and UI. It does not process realtime audio/video frames.

```text
Renderer (sandboxed)
        │
        │ typed, validated IPC
        ▼
Electron main
  ├─ StateStore
  ├─ AppController
  ├─ Module manager boundary
  ├─ Device service boundary
  └─ EngineSupervisor
        ├─ Audio host
        └─ Capture host
```

## Host migration status

Capture and audio have crossed the native-host boundary. The remaining audio release dependency is the signed transport driver:

```text
Capture utility worker  → replaced by packaged .NET Capture.Host
metadata clip           → replaced by encoded segment ring and atomic remux
Audio utility worker    → replaced by packaged .NET Audio.Host
software bus state      → replaced by WASAPI loopback, physical routing, and real meters
virtual endpoints       → blocked until the transport-only WDM package is signed and installed
```

The shared command vocabulary is intentionally small so transport replacement does not force a renderer rewrite.

## State ownership

The Electron main process owns canonical persisted state. Zustand is a renderer projection, not a second source of truth.

Main's narrow state reads return copies. Branch updates validate against the
canonical top-level schemas before an atomic commit; published snapshots are
deeply frozen and share unchanged branches. Each trusted webContents subscribes
to a full snapshot baseline followed by revisioned branch frames. Preload
validates frames, reconstructs the existing snapshot API, and resubscribes on a
revision gap. Reloads get a fresh baseline. Full command responses remain intact.
Subscription baselines use the same frozen main-owned snapshot as subsequent
publications, so the first delta does not resend unchanged branches. Ordinary
editable reads still return copies; the immutable publication accessor is not
exposed as a new preload operation.

State persistence permits one durable write and one latest pending generation.
Each request captures immutable state at that moment; later transient-only
changes do not enter it. Bursts replace the pending generation before it is
serialized, without delaying publication to the UI or adding a timer. `flush()`
drains pending work on shutdown. The backup remains the previous successful
durable generation; failed writes do not advance it. Atomic file replacement,
file synchronization, validation and corrupt-state recovery are unchanged.

The Windows device registry owns a hidden renderer-free BaseWindow only while
device modules are enabled, using native topology notifications to invalidate
its inventory without adding a helper process.

Every mutation follows:

```text
renderer intent
   ↓
preload method
   ↓
validated IPC handler
   ↓
AppController
   ↓
StateStore + optional engine command
   ↓
broadcast immutable snapshot
```

Onboarding persists capture and audio choices with Capture stopped, then starts
the configured engine once on Finish. Startup failures leave setup open for retry.
Bundled Razer, HyperX, and Logitech modules are opt-in on a fresh profile; loading
an existing profile preserves its explicit module enablement choices.

## Modules

A module represents a protocol or major capability, not one model:

- `device.logitech-hidpp`
- `device.hyperx-quadcast`
- `capability.replay`
- `capability.audio-router`

Device modules expose capabilities and settings. The core renderer owns canonical controls for common capabilities so every vendor surface remains coherent.

Device discovery keeps vendor protocol knowledge out of Electron's renderer:

```text
HID / USB descriptors
        ↓
vendor module metadata adapter
        ↓
canonical identity + variant evidence + capabilities
        ↓
DeviceRegistry
        ↓
variant resolver → bundled product-asset resolver
        ↓
renderer snapshot
```

Identity fields are optional because USB and HID do not consistently expose cosmetic SKUs. A vendor module may submit stronger evidence such as an onboard model identifier or receiver-reported extended model. The shared resolver prefers hardware evidence, then product/module mappings, then a stable-identity user fallback. An unknown cosmetic variant never blocks discovery.

Local authoring projects use a separate, lower-trust path:

```text
linked project folder
  ├─ validated manifest + exact VID/PID permission
  └─ single-file JavaScript entrypoint
                ↓
hidden Chromium Module Host
  sandbox on · no preload · no Node · no navigation/network/permissions
                ↓ validated identity descriptors only
Electron main permission and schema gate
                ↓
canonical read-only Device identity
                ↓
DeviceRegistry → renderer
```

Module Host API v1 cannot return a complete `Device`, open HID, write hardware, add IPC, load custom renderer code, or claim a canonical capability. Main filters discovery input to the manifest permission, replaces paths with opaque keys, validates every result, attaches the physical VID/PID itself, and publishes an empty capability set. Disabled local modules destroy their host. A crash, timeout, invalid result, or changed manifest moves the project to an explicit failure state without blocking bundled-module discovery.

The Logitech module enumerates HID transport locally and does not require G HUB for device control. It may use Logitech's localhost DEVIO metadata when that vendor service is present to improve identity resolution. G502 X Plus `extendedModel` distinguishes the known black and white hardware variants; the receiver USB PID alone does not. Without DEVIO metadata, the module resolves the model from its known receiver mapping, leaves colorway unknown, and uses the model asset or an optional override rather than claiming an exact color.

The G502 X Plus native session discovers HID++ features from the mouse, activates event-driven MouseButtonSpy (`0x8110`), and uses Adjustable DPI (`0x2201`) for hold-to-shift behavior. It parses onboard-memory (`0x8100`) formats 3 and 5 with a valid CRC before exposing persistent DPI stages, report rate, six primary button assignments, or onboard mode. Every profile mutation recomputes the CRC and verifies a byte-for-byte sector readback. The base DPI is restored on button release, module disable, and shutdown, and the HID handle exists only while the Logitech module and matching device are active.

G502 lighting uses the live RGB Effects (`0x8071`) and Per-Key Lighting V2
(`0x8081`) controller in either onboard mode. Profile-sector lighting bytes are
not evidence of visible LED state and are never written by lighting controls.
Explicit lighting commands claim RGB ownership, apply the effect, and verify
RGB power readback. Onboard-mode transitions invalidate prior acknowledgement
and restore the user's selected live lighting, including Off.
Startup restores a saved software selection before the full onboard-profile
scan and reapplies it after button monitoring starts, independently of its last
live-readback status. Device startup precedes audio endpoint discovery.
MouseButtonSpy is armed once per session and on receiver recovery, rather than
on every healthy discovery; rearming is followed by lighting restoration.
The persisted `selectionSaved` flag preserves that intent through Unknown,
disconnect, and restart; legacy acknowledged selections and ownership-loss
snapshots are migrated when the controller opens. Healthy discovery projects
confirmed values without HID queries: repeated background queries were associated
with physical purple flashes even while Off. Unified Battery notifications update
battery state; onboard profile and wireless/receiver notifications invalidate
cached state for refresh on the existing discovery cycle. Startup, explicit writes
and recovery check RGB power. Failed restoration remains Unknown and retries.
Recovery preserves active battery/status overrides and restores the selection
when those clear; a healthy effect is not continually restarted.
The effect itself remains acknowledged, not visually verified. Session shutdown
releases RGB ownership and can return the mouse to its firmware effect.
Successful native lighting writes return the complete confirmed capability from
inside the session's serialized operation. The registry validates and persists
that capability atomically, including indirect zone and power changes, without
waiting for another discovery. Discovery retains newer confirmed lighting when
another device delayed publication of an older mouse snapshot. Failed packets
invalidate acknowledgement so matching ownership/power alone cannot conceal a
partially changed effect.

Mouse battery-lighting preferences live in main-owned `settings.mouseBatteryLighting`,
keyed by device identity and validated at the settings IPC boundary. The G502
session advertises this capability only when battery reads/notifications and a
probed static RGB effect are supported. Battery timestamps retain the actual last
observation; an active change subscription stays valid until disconnect rather
than fabricating a fresh timestamp each tick. Battery policy reuses that state and
serializes temporary RGB overrides with manual controls. A seven-second burst of three red flashes
restores the prior software effect and individual zone colors, or releases to
firmware when Switchboard did not own lighting. The cutoff takes priority over
warnings. Neither automatic action writes onboard profile memory. Charging,
recovery above the thresholds, policy disable, and session shutdown restore the
normal lighting policy. Acknowledged commands do not prove physical LED output.

## Audio

Implemented Windows pipeline:

```text
Virtual Game ─┐
Virtual Chat ─┤
Media ────────┤
Aux ──────────┤
              ▼
          Audio.Host
   ┌──────────┼───────────┐
   ▼          ▼           ▼
Personal    Stream      Clip mix
output      endpoint     capture input

Physical mic → DSP graph → Virtual microphone / monitor / mixes
```

The signed driver is transport only. User-mode Audio.Host owns routing and DSP.
When that driver is unavailable, the experimental Audio workspace can use the
standard VB-CABLE endpoint with per-process loopback for personal and clip mixes.
This fallback does not provide separate virtual microphone or stream outputs.
See `docs/FREE-AUDIO-BACKEND.md` for capability, recovery, and lifecycle boundaries.

`NoiseSuppressionStage` owns strength, speech protection and bypass independently
of the native model. RNNoise provides fully processed frames and speech probability;
the stage aligns the original microphone with its measured 480-sample output delay.
That 10 ms timeline remains fixed during bypass and strength edits, including failed
model frames. The delayed dry contribution is never mixed with current input.
Enabling warms the model's overlap/lookahead before a 20 ms fade. Disabled suppression
retains no model processing, and missing models use direct bypass without added delay.

Strength bounds room-noise attenuation at 6/14/24/36 dB for 25/55/80/100 percent.
Speech probability and a 300 ms hold protect the original voice contribution only
when the model removes substantial frame energy; they never apply a second gate.
The separate Noise gate remains an explicit processor. Live operation always uses
the packaged RNNoise backend; optional DeepFilterNet is reserved for explicit offline
comparisons. See [the suppression design and evidence](docs/noise-suppression-rework.md).

Shared physical capture and playback request the minimum supported IAudioClient3
period, with a 10 ms ordinary shared-mode fallback. Loopback capture retains the
supported event-driven path. The microphone DSP thread registers with MMCSS once
and blocks on capture notifications until shutdown. Without active suppression or
its fade-out, DSP consumes available packets instead of assembling model frames.
Only personal playback, monitoring, and virtual microphone consumers discard old
queued samples beyond 20 ms (or one larger output callback) after a stall. Stream
and recording queues retain their continuity policy. These are queue limits, not
an end-to-end latency guarantee. See [Audio latency](docs/audio-latency.md).

## Capture

Replay automatic inputs use versioned, current-user-only native PCM pipes when
Audio.Host advertises `clipTracks` and `processedMicrophoneCapture`. Both audio
backends partition the recording mix identically: Game/Media/Aux feed the system
track, Chat feeds a separate track, and the processed microphone has its own
AudioEngine-owned feed independent of transport-driver availability. Recording
bus gain, mute, channel processing, and recording master apply before the pipes;
personal ChatMix and headphone spatial processing do not. No PCM crosses Electron.

Capture.Host relays each selected pipe to its existing FFmpeg track encoder and
observes processed microphone frames for reaction detection, including analysis
without microphone recording. Pipe loss is visible and triggers existing replay
recovery. Main follows confirmed host capabilities rather than application
activity, so quiet mixers do not switch sources. Explicit endpoint IDs survive
disconnects and override automatic feeds. Game-only remains process loopback;
fallback chat uses the Windows communications endpoint. Device-bound acoustic
calibration applies only to endpoint capture, not these recording feeds. Existing
clip editing/export consumes the same system, chat, and microphone track identities.

Microphone timing calibration uses an on-demand native helper and main-owned
measurement state. Saved device-bound advances apply to microphone PCM positions
before replay encoding; video and system timestamps retain the session clock.
See [Microphone timing calibration](docs/audio-sync-calibration.md) for measurement,
cancellation, device identity, and completed-audio save boundaries.

Automatic codec selection is resolved in the capture host from encoders that pass
FFmpeg probes. It prefers hardware H.264 for compatibility, then tested hardware
HEVC/AV1, then software H.264. Explicit codec and encoder preferences remain
explicit. The runtime encoder label reports the selected format; saved Automatic
policy and conservative bitrate estimates remain separate from the actual codec.

Automatic codec selection is resolved in the capture host from encoders that pass
FFmpeg probes. It prefers hardware H.264 for compatibility, then tested hardware
HEVC/AV1, then software H.264. Explicit codec and encoder preferences remain
explicit. The runtime encoder label reports the selected format; saved Automatic
policy and conservative bitrate estimates remain separate from the actual codec.

AMF capture downloads the backend's BGRA textures and converts them to NV12
before submitting them to the selected AMD hardware encoder. This avoids
capture-texture Direct3D interop failures that synthetic encoder probes do not
exercise. Recording and on-demand diagnostics share this conversion path;
NVENC retains direct hardware frames. AMF adds CPU conversion and upload costs.
QSV also receives an explicit BGRA download and NV12 conversion: the bundled
Intel H.264 encoder accepts NV12/QSV inputs, not the capture backend's BGRA
D3D11 textures. This compatibility path adds CPU conversion and upload costs;
Intel device capture and gameplay cadence require physical validation.

Production target:

```text
Windows display/game source
          ↓
D3D11 hardware frames
          ↓
Hardware encoder through FFmpeg (`gfxcapture`; display fallback via `ddagrab`)
          ↓
1-second keyframe-aligned MKV video segments
          +
bounded AAC system/microphone segment streams
          ↓
Snapshot completed segments
          ↓
MP4 remux, no re-encode
```

Automatic chat loopback uses the Windows communications render endpoint; desktop
audio uses the multimedia endpoint. Explicit chat selections survive disconnects
and fail visibly instead of silently switching devices. Diagnostics use the same
endpoint roles. Chat remains opt-in; applications with an explicit output need
that same output selected for the chat track.

Replay streams share a session clock. WASAPI QPC anchors audio startup, then
device frame positions preserve continuous PCM and exact missing-packet gaps;
packet-level QPC jitter must not insert silence or cut samples. Invalid/reset
device timestamps recover against QPC or packet arrival time, retaining sample
continuity across small timing variations. Reported discontinuities can re-anchor
virtual device clocks that stop during silence. Video anchors its first frame to
that session and preserves source timestamp deltas. Bounded segment manifests
record encoder start/end times; file modification times are not media timing.
Saves select each audio track against the completed video window and retain its
subsecond offset and segment durations during stream-copy assembly.

Automatic game capture holds a conservative, stable game-window identity and waits rather than switching to unrelated foreground applications. This does not claim exclusive-fullscreen graphics hooking; a future hook can implement the existing source boundary without changing renderer IPC.

Capture picker enumeration uses a short-lived `--list-sources` helper that never
constructs the replay engine. It reads window titles/handles without executable
metadata, and cannot block, stop, or restart a recorder. Main coalesces concurrent
refresh requests and retries failed scans twice, retaining the last source list
until a complete replacement is available. Discovery status stays in the picker;
failures are recorded in diagnostics rather than global error notifications.
A live host's encoder/source
error remains a capture error. While Capture is enabled, main retries host exits,
stopped recorders and live encoder/source errors with backoff until recovery.
Configuration and recovery commands are serialized; a rejected source/encoder
remains the retry target and is only persisted after acknowledgement. A manual
change replaces that target. Healthy buffering or source-waiting, disable and
shutdown cancel pending recovery. Developer mode enables a narrow native diagnostic event stream, validated,
redacted, bounded, and journaled in main. It carries configuration summaries,
FFmpeg startup/output, and lifecycle events without media buffers or window titles.

Clip edits remain nondestructive metadata in the canonical clip record. Edit
drafts expire three hours after their last successful main-owned save.
The draft service prunes expired entries on load, list and manifest writes;
expiry never removes source clips or imported audio. The visible draft library
requests a fresh list at its next expiry without a polling interval. Shared
video-edit and managed-music schemas are composed into the clip and montage
contracts. Source-time trims and titles survive speed changes and segment splits;
montage positions use the resulting output duration. Imported music stays in the
main-owned asset library. Edited clip shares reuse the montage FFmpeg renderer
and save into session-scoped temporary storage without a destination dialog;
finished montage exports keep their explicit destination picker. Both register
with the prepared-share service so native drag accepts an opaque share ID rather
than a renderer-provided path.

## Security

- context isolation enabled;
- renderer sandbox enabled;
- Node integration disabled;
- renderer-created windows denied;
- IPC sender origin checked;
- Zod validates all mutable IPC payloads;
- local add-ons run in a constrained Chromium host with permission-filtered inputs and schema-validated outputs;
- GitHub community device modules use signed payloads, release and source hashes, local publisher revocation, staged version directories, and explicit rollback through canonical module state. See `docs/COMMUNITY-MODULES.md` for the first-install trust boundary and limits.

## Application updates

`build/installer.nsh` owns silent update scheduling and the installer shutdown
barrier. It checks executable paths using Windows APIs in the installer process,
waits up to 30 seconds for this installation's processes to finish, and fails
before file replacement if they remain busy. Silent update work runs at idle CPU
and background I/O priority; priority is restored before app relaunch. Interactive
installation retains electron-builder's existing close/retry behavior. No helper
process or polling survives installation.

Downloaded updates do not stop feed checks. Main owns download initiation and
rechecks after a download and before manual or idle installation. A newer offer
replaces the pending download when automatic downloads are enabled; otherwise it
waits for a download request. Install-on-quit is enabled only when the ready file
matches the latest confirmed offer, and is disabled during checks and replacement
downloads. A failed preinstall check leaves the app running. Feed verification
does not prove an installed Windows update/relaunch lifecycle.

Electron main owns the application-update lifecycle through `AppUpdateService`. Installed Windows builds use the electron-builder GitHub provider and NSIS metadata; the renderer receives only the validated canonical update state plus narrow check, download, and install intents. Automatic checks run once shortly after launch and every 30 minutes while enabled. Automatic download and install-for-next-startup are separate persisted policies applied to `electron-updater`; manual download and restart actions remain available. The packaged NSIS installer is one-click per-user so `quitAndInstall` runs silently without the setup wizard; assisted installers cannot update silently. The separate Install while away policy waits for 10 minutes of Windows system idle, a closed interface, stopped audio and capture hosts, and no clip or montage exports or game scan. It checks eligibility once a minute only while an installer is downloaded and automatic checks and idle installation are enabled. Silent installation uses the normal updater and shutdown path; a consumed local launch marker returns the updated app to the tray without opening a window. Timers stop when their policy is disabled or the service is disposed; disposal also removes updater listeners.

GitHub Release publishing and end-user delivery are separate gates. The public repository provides an anonymously readable live feed with the NSIS installer, block map, `latest.yml`, and checksums. Windows installers remain unsigned unless the release environment supplies Authenticode credentials. No GitHub credential is stored in settings, preload, or the renderer.

Development launches use a separate application name, AppUserModelID, Chromium session, cache, persisted state directory, and single-instance boundary under `<appData>/Switchboard Dev`. They never load the installed app's updater or mutate its settings. Packaged builds retain the existing installed identity and user-data location so updating does not reset a user's configuration.

On-demand capture diagnostics use canonical transient state owned by main and
narrow run/cancel IPC operations. A stopped capture engine gets a temporary host
that is disposed after the run; an existing host serializes checks through its
lifecycle gate. Active recordings skip competing encoder/capture probes. There
is no background diagnostic timer. Runs have a 90-second deadline and each
FFmpeg probe has a five-second timeout with bounded output and child-process
cleanup on timeout or cancellation. Three-frame capture probes discard output.
Configuration changes and shutdown cancel the run; diagnostics do not change
capture preferences. Completed results remain available until the next run or
application restart, including when Developer mode is disabled.


## Clip recovery, selection, and storage

Main owns clip availability, bulk operations, library layout/sort preferences, kept montage projects, and replay-cache location. `clips:operate` validates bounded IDs and an explicit operation; relinking paths come from main's file dialog and must match duration/dimensions before preserving the original identity. Reconciliation removes records whose media file is gone while its parent folder remains readable. It retains records when the parent folder is offline or inaccessible. A debounced directory watcher refreshes the open library after file changes, stops in the tray, and scans again on reopening. Renderer selection/filter/scroll state never owns media or filesystem access.

Bulk operations serialize in main, process filesystem commands sequentially, and publish successful removals/favorite changes together with per-item failures. Deletion uses Windows Recycle Bin; Remove from library only accepts unavailable entries and does not touch media. Kept projects bypass temporary-draft expiration. Both storage volumes must have known nonzero headroom to start or save; cache selection uses a dedicated `Switchboard Replay Cache` child. Location changes share the capture-configuration queue and reject an in-flight replay save.

Quick controls and replay shortcuts share a key recorder. Quick controls accepts
validated Electron key combinations; main reserves each requested shortcut before
publishing preferences or releasing the previous registration. A conflict retains
the last confirmed binding. While a trusted window records keys, a narrow IPC
operation suspends global shortcut handling. Completion, cancellation, blur,
navigation, renderer failure, destruction, and IPC disposal release that session.
Recording adds no polling or background host.
