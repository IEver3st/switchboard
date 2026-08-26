# AGENTS.md

## Objective

Build Switchboard into a low-overhead, modular Windows hardware, audio-routing, and game-capture application. Do not let it become another monolithic peripheral suite.

## Stack

- Package manager: Bun.
- Desktop: Electron.
- Renderer: React + TypeScript.
- UI primitives: shadcn-style local components, selected Radix primitives, Tailwind.
- State: Zustand in the renderer; canonical persisted state in the Electron main process.
- Validation: Zod at IPC and package boundaries.
- Windows realtime hosts: C# / .NET 10.
- Audio API wrapper: NAudio unless profiling or missing API coverage proves a direct COM path necessary.
- Capture: FFmpeg first; Vortice/Windows.Graphics.Capture only when a measured limitation requires replacing part of FFmpeg.
- Driver: C++/WDK only for virtual audio endpoints.

## Non-negotiable architecture

1. The renderer never receives Node access.
2. Do not expose generic `ipc.send` or arbitrary filesystem/process APIs through preload.
3. Device-family code does not belong in the core.
4. Realtime audio/video buffers never pass through Electron IPC.
5. Disabled engines do not retain a process, timer, device handle, or encoder session.
6. The virtual audio driver contains no DSP, profiles, networking, update logic, or product policy.
7. One canonical contract exists for modules, devices, audio buses, capture configuration, diagnostics, and engine status.
8. Do not add a dependency for a helper that can be implemented safely in a few lines.

## Current prototype boundaries

Confirmed implementation:

- Electron control plane, typed IPC, state persistence, module lifecycle, utility-process simulation, renderer UI.
- C# capture host protocol, FFmpeg probing, opt-in replay ring, no-reencode remux.
- C# audio host protocol, endpoint/session discovery, bus graph, ChatMix, basic allocation-free DSP nodes.

Likely next implementation work:

- Replace utility workers with packaged C# hosts over named pipes.
- Add a real HID discovery adapter and move mock devices behind a development flag.
- Add signed module manifests and atomic package install/rollback.
- Build the SysVAD-derived virtual endpoint proof of concept.

Do not describe virtual audio routing, real game capture, or hardware writes as complete until validated on Windows hardware.

## Coding rules

- Before creating, changing, or reviewing renderer UI, read `DESIGN.md` and enforce its no-pill, continuous-console, copy, density, accessibility, and visual-review gates.
- Read the relevant contract and controller before modifying a page.
- Preserve process isolation. Do not move engine work into Electron main for convenience.
- Use small services and explicit interfaces. Avoid generic service locators and plugin frameworks.
- Keep realtime callbacks allocation-free: no LINQ, logging, locks, async, object creation, or UI calls.
- Validate untrusted module/package/IPC input.
- Make shutdown and crash recovery idempotent.
- All long-lived resources require deterministic disposal.
- Prefer event-driven device changes over polling. Any polling must have a stated interval, reason, and stop condition.
- Avoid gradients, decorative glow, excessive cards, giant radii, and low-density dashboard filler.
- New UI must fit at 1080p without hiding critical controls below a mandatory scroll boundary.

## Validation before completion

Run, or explain why the environment cannot run, all applicable checks:

```powershell
bun run check
bun run check:source
bun run build
dotnet build .\engines\capture-host\Capture.Host.csproj
dotnet build .\engines\audio-host\Audio.Host.csproj
```

For Windows behavior:

- start and stop each engine repeatedly;
- kill each host and verify recovery/error state;
- close to tray and verify renderer memory is released;
- disconnect/reconnect devices;
- change the Windows default audio endpoint while Audio.Host is running;
- run capture for at least 30 minutes and save clips at ring-wrap boundaries;
- run a 24-hour memory/handle soak before release.

## Completion standard

A task is not complete because the UI changed. It is complete when state ownership, failure handling, cleanup, persistence, security boundaries, and validation all agree with the change.
