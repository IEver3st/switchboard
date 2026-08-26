# Switchboard prototype

A working control-plane prototype for a modular, open-source alternative to SteelSeries GG, Sonar, Moments, Logitech G Hub, and HyperX NGENUITY.

## What is implemented

The Electron prototype includes:

- Electron + React + TypeScript desktop shell.
- shadcn-style components using Tailwind and selected Radix primitives.
- sandboxed renderer with a narrow, schema-validated preload API.
- persisted module, device, audio, capture, and lifecycle state.
- capability-driven Logitech mouse and HyperX microphone workbenches.
- G502 X Plus hold-to-lower-DPI behavior through event-driven HID++ MouseButtonSpy and live sensor DPI control.
- optional audio and capture utility processes that exist only while enabled.
- audio buses, ChatMix, microphone processing, replay buffer, and clip library surfaces.
- tray lifecycle with optional renderer destruction.
- explicit memory, CPU, and process budgets.
- .NET 10 capture and audio host scaffolds for the Windows production path.
- dependency-free interactive browser preview.

The prototype does not claim to provide:

- broad direct HID configuration or persistent onboard-profile writes beyond the scoped G502 X Plus live DPI path;
- production game capture through the default Electron worker;
- signed virtual Windows audio endpoints;
- a production module registry, signing service, or updater.

Simulated behavior is identified as `Prototype` in the interface.


## Run the desktop app

Windows with Bun:

```powershell
bun install
bun run dev
```

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

## Native host prototypes

```powershell
dotnet run --project .\engines\capture-host\Capture.Host.csproj
dotnet run --project .\engines\audio-host\Audio.Host.csproj
```

The capture host defaults to simulation. Read `engines/capture-host/README.md` before opting into its Windows FFmpeg path.

## Architecture

```text
Electron renderer
      │ narrow typed IPC
Electron main process
      │
      ├── module and device state
      ├── audio utility process    prototype
      └── capture utility process  prototype
                 │
         production replacement
                 │
      ├── Audio.Host    .NET 10 + NAudio
      └── Capture.Host  .NET 10 + FFmpeg
                 │
      Virtual audio driver  C++/WDK, later phase
```

The virtual driver is intentionally not fabricated. That subsystem should begin from Microsoft SysVAD, remain small, and contain no DSP or product logic.

## Important files

- `src/shared/contracts.ts`: canonical state and IPC contracts.
- `src/main/controller.ts`: application orchestration and persisted state transitions.
- `src/main/services/engine-supervisor.ts`: optional process lifecycle and request routing.
- `src/renderer/src/pages`: product surfaces.
- `resources/engine-workers`: runnable simulation hosts.
- `engines`: production C# host scaffolds.
- `docs/MODULES.md`: signed module package model.
- `AGENTS.md`: project-local instructions for autonomous coding agents.
- `PERFORMANCE.md`: resource budgets and release gates.
