# Architecture

## Control plane

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

The G502 X Plus native session discovers HID++ features from the mouse, activates event-driven MouseButtonSpy (`0x8110`), and uses Adjustable DPI (`0x2201`) for hold-to-shift behavior. It parses only verified onboard-memory (`0x8100`) formats 3 and 5 with a valid CRC before exposing persistent DPI stages, report rate, six primary button assignments, onboard mode, or stored lighting. In software mode, the shared Logitech RGB controller probes RGB Effects (`0x8071`) clusters and Per-Key Lighting V2 (`0x8081`) zone bitmaps before publishing effects or addressable zones. It sends only known encodings for effects the device enumerates, retains software ownership without a timer while live lighting is active, and releases ownership on onboard-mode activation, module disable, disconnect, or shutdown. Effect writes are reported as acknowledged rather than read back because this HID++ path does not expose the visible live effect state. Every onboard profile mutation still recomputes the CRC, writes through the device's profile-sector protocol, and reads the sector back byte-for-byte. Unknown layouts are rejected rather than guessed. The base DPI is restored on button release, module disable, and shutdown, and the HID handle exists only while the Logitech module and matching device are active.

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

## Capture

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

Automatic game capture holds a conservative, stable game-window identity and waits rather than switching to unrelated foreground applications. This does not claim exclusive-fullscreen graphics hooking; a future hook can implement the existing source boundary without changing renderer IPC.

## Security

- context isolation enabled;
- renderer sandbox enabled;
- Node integration disabled;
- renderer-created windows denied;
- IPC sender origin checked;
- Zod validates all mutable IPC payloads;
- local add-ons run in a constrained Chromium host with permission-filtered inputs and schema-validated outputs;
- distributed modules will additionally require signed manifests, hashes, revocation, and atomic rollback.

## Application updates

Electron main owns the application-update lifecycle through `AppUpdateService`. Installed Windows builds use the electron-builder GitHub provider and NSIS metadata; the renderer receives only the validated canonical update state plus narrow check, download, and install intents. Automatic checks run once shortly after launch and every six hours while enabled. Automatic download and install-for-next-startup are separate persisted policies applied to `electron-updater`; manual download and restart actions remain available. The packaged NSIS installer is one-click per-user so `quitAndInstall` runs silently without the setup wizard; assisted installers cannot update silently. Timers and updater listeners are removed on disable or disposal.

GitHub Release publishing and end-user delivery are separate gates. The public repository provides an anonymously readable live feed with the NSIS installer, block map, `latest.yml`, and checksums. Windows installers remain unsigned unless the release environment supplies Authenticode credentials. No GitHub credential is stored in settings, preload, or the renderer.

Development launches use a separate application name, AppUserModelID, Chromium session, cache, persisted state directory, and single-instance boundary under `<appData>/Switchboard Dev`. They never load the installed app's updater or mutate its settings. Packaged builds retain the existing installed identity and user-data location so updating does not reset a user's configuration.
