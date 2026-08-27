# Switchboard prototype

A working control-plane prototype for a modular, open-source alternative to SteelSeries GG, Sonar, Moments, Logitech G Hub, and HyperX NGENUITY.

## What is implemented

The Electron prototype includes:

- Electron + React + TypeScript desktop shell.
- shadcn-style components using Tailwind and selected Radix primitives.
- sandboxed renderer with a narrow, schema-validated preload API.
- persisted module, device, audio, capture, and lifecycle state.
- capability-driven Logitech mouse, Razer keyboard, and HyperX microphone workbenches.
- event-driven QuadCast 2 physical mute state plus maintained fixed-red lighting, brightness, breathing/pulse timing, and hardware-backed lighting profiles.
- G502 X Plus control without G HUB: DPI stages and hold-to-lower-DPI, report rate, primary button assignments, onboard mode, battery, device-reported LIGHTSYNC effects, effect speed/direction, and addressable zones through direct HID++; stored onboard lighting remains limited to CRC-checked profile fields.
- optional native audio and capture hosts that exist only while enabled.
- audio buses, ChatMix, microphone processing, replay buffer, and clip library surfaces.
- persisted game detection with one-shot Steam/Epic manifest scans and manual executable entries.
- tray lifecycle with optional renderer destruction.
- explicit memory, CPU, and process budgets.
- main-process-owned Windows update checks, background downloads, and explicit restart-to-install behavior backed by GitHub Release metadata.
- .NET 10 capture and audio hosts, including WASAPI routing, processed microphone transport, session discovery, and real meters.
- dependency-free interactive browser preview.

The prototype does not claim to provide:

- direct HID configuration for Logitech models other than the verified G502 X Plus profile formats and feature set;
- production game capture through the default Electron worker;
- signed virtual Windows audio endpoints;
- a production module registry or signing service;
- publicly consumable application updates while the GitHub release feed remains private or Windows installers remain unsigned.

Simulated behavior is identified as `Prototype` in the interface.


## Run the desktop app

Windows with Bun:

```powershell
bun install
bun run dev
```

To preview the pending application-update presentation in the development app:

```powershell
bun run dev --demo-update
```

This is a presentation-only development flag. It shows a pending update in **Settings → About** without contacting the release feed or launching an installer; packaged builds ignore it.

Build the Electron bundles:

```powershell
bun run build
```

Create a Windows installer:

```powershell
bun run dist:win
```

## Open the browser prototype

Open `preview/index.html`, or generate a single-file copy:

```powershell
bun run preview:static
```

The generated file is `preview/standalone.html` and requires no local server or package installation.

## Validate

```powershell
bun run check
bun run check:types
bun run build
```

The structural check validates local imports, Electron security flags, IPC validation, process isolation, worker syntax, C# project targets, capture ring construction, and allocation rules in the audio realtime path.

## Native hosts

```powershell
dotnet run --project .\engines\capture-host\Capture.Host.csproj
dotnet run --project .\engines\audio-host\Audio.Host.csproj
```

`Audio.Host` owns physical microphone capture, 48 kHz mono normalization, CPU noise suppression, microphone DSP, monitoring, and bounded diagnostics. Build its packaged RNNoise dependency with `bun run build:noise-native`; `bun run build:audio-host` performs that step automatically. The optional DeepFilterNet integration and its unresolved model-license gate are documented in `docs/noise-suppression-supply-chain.md`.

The capture host defaults to simulation. Read `engines/capture-host/README.md` before opting into its Windows FFmpeg path.

## Architecture

```text
Electron renderer
      │ narrow typed IPC
Electron main process
      │
      ├── module and device state
      ├── Audio.Host    .NET 10 + NAudio + native CPU DSP
      └── Capture.Host  .NET 10 + FFmpeg
                 │
      Signed virtual audio driver  C++/WDK, release dependency
```

The virtual driver is intentionally not fabricated. Its eight-endpoint contract is in `drivers/virtual-audio`; it must remain a transport-only, signed WDM driver with no DSP or product policy.

## Important files

- `src/shared/contracts.ts`: canonical state and IPC contracts.
- `src/main/controller.ts`: application orchestration and persisted state transitions.
- `src/main/services/engine-supervisor.ts`: optional process lifecycle and request routing.
- `src/renderer/src/pages`: product surfaces.
- `resources/engine-workers`: retained prototype fixtures; the live audio path does not launch them.
- `engines`: isolated native audio and capture hosts.
- `docs/MODULES.md`: signed module package model.
- `AGENTS.md`: project-local instructions for autonomous coding agents.
- `PERFORMANCE.md`: resource budgets and release gates.
