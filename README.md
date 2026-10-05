<p align="center">
  <img src="resources/branding/switchboard-mark.png" width="76" alt="Switchboard mark" />
</p>

<h1 align="center">Switchboard</h1>

<p align="center">
  A low-overhead Windows clipping app with built-in hardware control.
</p>

<p align="center">
  <a href="ARCHITECTURE.md">Architecture</a> ·
  <a href="DESIGN.md">Design</a> ·
  <a href="PERFORMANCE.md">Performance</a> ·
  <a href="TODO.md">Current work</a> ·
  <a href="https://github.com/IEver3st/switchboard/issues">Issues</a>
</p>

![Switchboard device workspace](design-audit/2026-08-27-switchboard/final-native/1920x1080-devices.png)

Switchboard is a clipping app first: Instant Replay with separate Game, Chat, and Microphone tracks, a clip library, a clip editor, and montages, in one restrained desktop utility. It also controls connected hardware, so the parts of peripheral suites people actually use do not need a pile of vendor applications, background services, and decorative dashboards.

This repository is an active Windows alpha. The control plane is real, several named devices have hardware-backed integrations, and the native capture host is working. Some release-critical paths still need production capture qualification, powered-on hardware acceptance, and long-running validation. Switchboard labels those boundaries instead of pretending they are finished.

## What works today

### Devices

- **Logitech G502 X Plus:** direct HID++ control for DPI stages, shift DPI, report rate, primary button assignments, onboard mode, battery state, supported LIGHTSYNC effects, and addressable zones. Onboard profile writes require a known layout and valid CRC.
- **HyperX QuadCast 2:** event-driven mute state, maintained lighting, brightness, pulse timing, and hardware-backed lighting profiles.
- **Razer Huntsman V2 Analog:** readback-backed brightness, firmware-reported quick effects, Gaming Mode, and onboard profile selection. Actuation, analog mapping, macros, Snap Tap, and per-key lighting remain outside Switchboard until their device protocols are independently verified.

Switchboard shows a control only when the detected device reports a matching capability. Failed writes leave the last confirmed state intact.

### Capture and clips

- Isolated .NET 10 capture host with an FFmpeg-first Windows path.
- Bounded encoded segment ring, atomic replay saves, and MP4 remux without a full re-encode.
- Separate Game, Chat, and Microphone tracks captured directly from Windows endpoints through NAudio WASAPI loopback, process loopback, and endpoint capture.
- Optional game-only audio through process loopback, plus microphone timing calibration for the replay tracks.
- Automatic game detection plus manual executable entries, and optional reaction clipping from microphone level.
- Searchable clip library, favorites, filters, grid and list views, trim editing, per-track levels, and waveform inspection.
- Ordered multi-clip montage projects with trim, reorder, music, playback, and FFmpeg export.

The development host defaults to simulation. Production capture claims require the Windows FFmpeg path and real encoder output, not renderer fixtures.

### Desktop lifecycle

- Sandboxed Electron renderer with no Node access.
- Narrow, typed preload operations and Zod-validated mutable IPC.
- Electron-main-owned persistence for modules, devices, capture, settings, diagnostics, and engine state.
- Optional native hosts that exist only while their engines are enabled.
- Tray lifecycle with optional renderer destruction.
- GitHub Release update checks, default-on background downloads, explicit restart, and install-on-next-startup policy for installed Windows builds.
- In-app bug and feature handoff that prepares a redacted report, copies it, and opens this repository's issue flow.

## Project status

| Area | Current state |
| --- | --- |
| Electron control plane | Implemented and persisted |
| G502 X Plus and QuadCast 2 | Hardware-backed integration |
| Huntsman V2 Analog | Supported controls implemented; clean-process physical revalidation remains |
| Capture host | Native path implemented; production Windows capture qualification remains |
| Application updates | Live public feed; installed Windows builds check, download, and apply verified releases by default |
| Windows installer | Buildable; currently unsigned |
| Soak testing | Release suite remains |

The exact remaining work lives in [TODO.md](TODO.md). Performance budgets and soak requirements live in [PERFORMANCE.md](PERFORMANCE.md).

## Architecture

```text
Sandboxed React renderer
          │
          │ narrow typed IPC
          ▼
Electron main process
  ├── canonical state and persistence
  ├── device registry and vendor modules
  └── Capture.Host          .NET 10 + FFmpeg + NAudio
```

Captured video and audio buffers never cross Electron IPC. Electron owns policy and state; the isolated capture host owns realtime capture work.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for subsystem boundaries and state ownership.

## Run Switchboard

Development currently targets Windows. Install [Bun](https://bun.sh/) and the .NET 10 SDK, then run:

```powershell
bun install
bun run dev
```

The development launcher builds Capture.Host into
`.switchboard/dev-hosts` before Electron starts. This keeps a running host from
locking the project output and prevents Electron from silently reusing a stale
native executable after C# changes. Set `SWITCHBOARD_SKIP_NATIVE_BUILD=1` only
when intentionally testing an already-built host.

Build the Electron application:

```powershell
bun run build
```

Build the capture host and create an NSIS installer:

```powershell
bun run dist:win
```

The generated installer is not Authenticode-signed unless the release environment supplies signing credentials.

## Validate a checkout

```powershell
bun run check
bun run check:source
bun run check:types
bun run test
bun run build
dotnet build .\engines\capture-host\Capture.Host.csproj
```

The repository has no lint script. The checks above cover structural invariants, source transpilation, TypeScript contracts, Bun tests, capture host tests, Electron bundles, and the direct host build.

Hardware fixtures and native Electron captures prove deterministic application behavior. They do not prove a physical HID or Bluetooth write, visible lighting, production capture, encoder output, reconnect behavior, or a 24-hour soak. Each subsystem document records its remaining physical proof.

## Browser preview

The browser preview is useful for reviewing the shell without Electron or hardware:

```powershell
bun run preview:static
```

Open `preview/index.html`, or use the generated single-file `preview/standalone.html`. The standalone file is generated and should not be edited by hand.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/shared/contracts.ts` | Canonical renderer, main, preload, and host contracts |
| `src/main/controller.ts` | Product orchestration and persisted state transitions |
| `src/main/services/device-registry.ts` and `src/main/modules` | Device registry and vendor protocol modules |
| `src/renderer/src` | React desktop interface |
| `engines/capture-host` | FFmpeg-first Windows capture host |
| `docs` | Subsystem, release, and supply-chain notes |
| `scripts` | Build, validation, measurement, and native review tools |

## Reporting bugs

Use Switchboard's **Bug or feature** action, or open a [GitHub issue](https://github.com/IEver3st/switchboard/issues/new). Review the report before submitting it because issues in this repository are public.

The app can confirm that it copied a report and opened GitHub. It cannot claim that GitHub accepted the issue until you submit it in the browser. Diagnostics are limited to the app version, Electron runtime, operating system, and architecture.

## License

No project license has been selected yet. Public access to this repository does not grant permission to copy, modify, or redistribute Switchboard. Third-party components retain their own licenses and attributions in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
