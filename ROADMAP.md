# Prototype to usable alpha

## Milestone 1: replace simulations

- Wire Electron to Capture.Host over named pipes.
- Bundle a known FFmpeg build and add encoder capability probing.
- Implement Windows display capture and replay saves on a real machine.
- Add NAudio endpoint discovery for replay audio device pickers.

## Milestone 2: real devices

- Add HID enumeration in a dedicated device host.
- Port the existing HyperX QuadCast protocol work into `device.hyperx-quadcast`.
- Implement Logitech HID++ discovery and basic DPI/polling controls.
- Add USB reconnect and permission error surfaces.

## Milestone 3: capture tracks

- Record game, chat, and microphone as separate synchronized tracks.
- Add automatic game/process detection and per-game profiles.
- Add endpoint recovery and default-device changes for capture sources.
- Validate HDR, VRR, exclusive fullscreen fallback, and 120 FPS capture.

## Milestone 4: hardening

- Signed module registry and rollback.
- Crash recovery and diagnostics.
- 24-hour soak suite and performance release gates.
