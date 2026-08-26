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

## Prototype versus production host

The checked-in utility workers make the desktop prototype immediately runnable and validate the most important lifecycle rule: a disabled engine has no process.

Production Windows builds should substitute:

```text
utility worker        → .NET host
postMessage           → named pipe
simulation status     → measured status
metadata clip         → FFmpeg segment ring and remux
software bus state    → WASAPI + signed virtual endpoints
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

The Logitech module currently enumerates HID transport locally and can enrich active devices with Logitech's localhost DEVIO metadata when that vendor service is present. G502 X Plus `extendedModel` distinguishes the known black and white hardware variants; the receiver USB PID alone does not. Without DEVIO metadata, the module resolves the model from its known receiver mapping, leaves colorway unknown, and uses the model asset or an optional override rather than claiming an exact color.

## Audio

Production target:

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
Hardware encoder through FFmpeg
          ↓
2-second MKV ring segments
          ↓
Snapshot completed segments
          ↓
MP4 remux, no re-encode
```

The first native host uses FFmpeg `ddagrab`. Automatic game/window capture can move to FFmpeg `gfxcapture` or a direct Windows.Graphics.Capture adapter after Windows validation.

## Security

- context isolation enabled;
- renderer sandbox enabled;
- Node integration disabled;
- renderer-created windows denied;
- IPC sender origin checked;
- Zod validates all mutable IPC payloads;
- modules will require signed manifests, hashes, constrained permissions, and atomic rollback.
