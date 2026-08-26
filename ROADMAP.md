# Prototype to usable alpha

## Milestone 1: replace simulations

- Wire Electron to the C# hosts over named pipes.
- Bundle a known FFmpeg build and add encoder capability probing.
- Implement Windows display capture and replay saves on a real machine.
- Add NAudio endpoint/session discovery to the renderer.

## Milestone 2: real devices

- Add HID enumeration in a dedicated device host.
- Port the existing HyperX QuadCast protocol work into `device.hyperx-quadcast`.
- Implement Logitech HID++ discovery and basic DPI/polling controls.
- Add USB reconnect and permission error surfaces.

## Milestone 3: Sonar core

- Build the smallest possible SysVAD-derived proof of concept exposing Game and Chat render endpoints.
- Route both into Audio.Host and out to a selected physical endpoint.
- Add endpoint recovery and default-device changes.
- Add Virtual Microphone only after render routing is stable.

## Milestone 4: capture/audio integration

- Add a dedicated Clip Mix virtual endpoint.
- Record game, chat, and microphone as separate synchronized tracks.
- Add automatic game/process detection and per-game profiles.
- Validate HDR, VRR, exclusive fullscreen fallback, and 120 FPS capture.

## Milestone 5: hardening

- Signed module registry and rollback.
- Driver signing pipeline.
- Crash recovery and diagnostics.
- 24-hour soak suite and performance release gates.
