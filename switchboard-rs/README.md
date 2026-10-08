# Switchboard (Rust)

Technical notes for Switchboard 1.0, the Rust rewrite focused only on clipping: Instant Replay with separate Game, Chat and Microphone tracks, the clip library, the editor and montages, export for sharing, Auto Capture and automatic updates. The product overview is in the [repository README](../README.md).

## Layout

```
crates/capture   engine library (no UI)
crates/app       switchboard-rs.exe: tray service + window
scripts/         review, soak and IPC helpers (PowerShell)
```

One binary runs as two processes:

- `switchboard-rs` / `--background`: tray icon, global hotkey, saved-clip notice, and the capture engine. Single instance per session; launching again opens the window.
- `switchboard-rs --ui`: the window. Started on demand, exits when closed, so a closed window costs nothing. It talks to the service over a per-user local named pipe (JSON lines).

## Window

Follows `DESIGN.md`'s capture-only shell. One workspace, Clips, with a two-row command header:

- Row 1: count and size, the recorder control (state, live Game/Chat/Mic levels, buffer line while filling; opens the replay popover), the save shortcut as keycaps, Save clip, Settings.
- Row 2: search (Ctrl+F), game filter, sort, grid/list, open folder. With a selection it becomes selection actions (play, show in folder, Recycle Bin).

The library is grouped by day and virtualized: only rows in view are laid out and painted. Thumbnails decode once to a disk cache and at most 160 stay as textures. Settings is one full page of rows separated by space. Fonts and icons come from Windows (Segoe UI, Cascadia Mono, Segoe Fluent Icons), not the binary.

Keys: Ctrl+F search, Ctrl+A select all, Delete move to Recycle Bin (confirm, Cancel focused), Enter or double-click play, Ctrl+click and Shift+click select, Esc closes the popover, clears search focus or selection, or leaves Settings, Ctrl+, opens Settings.

## Capture pipeline

```
WGC display capture (GPU texture)
  -> D3D11 video processor: scale + BGRA->NV12, BT.709 limited (GPU)
  -> hardware H.264 MFT on the same adapter (NVENC/AMF/QSV via Media Foundation)
  -> Annex-B -> AVCC packets -> disk ring (1 s segments, keyframe aligned)

WASAPI process loopback: Game = everything except the chat app's process tree
WASAPI process loopback: Chat = only the chat app's tree (Discord, PTB, Canary)
WASAPI capture:          Microphone = default microphone
  -> QPC-locked PCM timeline (silence filled, overlaps trimmed)
  -> AAC-LC 192 kbps (Media Foundation) -> disk ring

Save: last N seconds from the keyframe at or before the cut
  -> faststart MP4 (own muxer, edit lists align audio to video) -> Clips folder
```

Raw frames never reach system memory. No FFmpeg, .NET or Chromium process is involved. Every stream is stamped with QueryPerformanceCounter time, so audio and video share one clock. Segment files use `FILE_ATTRIBUTE_TEMPORARY` and are deleted as the ring advances and when the engine stops.

## Cursor track

With `cursor_track` on (Settings > Video > Record cursor track, default on), the engine runs an `sb-cursor` thread that polls `GetCursorPos` and `GetAsyncKeyState` (left, right, middle) at 120 Hz on a high-resolution waitable timer, in a per-monitor-DPI-aware thread context so positions are physical pixels. It stops with the engine's stop event. Polling was chosen over a `WH_MOUSE_LL` hook: a hook sits in the input path of every mouse event system-wide, which a 1 to 8 kHz gaming mouse turns into thousands of callbacks a second. Nothing else is read: no keys, window titles or pixels. It works whether or not `cursor` draws the pointer into the video.

Polls are stored in memory for the replay window plus 2 s, only when the position, buttons or on-display state change, plus a heartbeat once a second. A save writes `<clip stem>.cursor.json` next to the MP4 (atomically, after the MP4) for exactly the saved video range, starting with the pointer's state at the first frame. If writing it fails, the clip is kept and the notice says the cursor track is missing. Moving a clip to the Recycle Bin from the library recycles its track in the same operation; titles live in the library index, so renaming never touches either file.

```json
{ "version": 1, "video": "SB_Game_2026-10-08_12-00-00.mp4",
  "display": { "index": 0, "originX": -1920, "originY": 0, "width": 1920, "height": 1080, "dpiScale": 1.25 },
  "output": { "width": 1920, "height": 1080 },
  "sampleHz": 120, "buttonBits": { "left": 1, "right": 2, "middle": 4, "offDisplay": 8 },
  "samples": [[0, 640, 360, 0], [16.7, 641, 360, 1]],
  "events": [{ "tMs": 12.5, "type": "down", "button": "left", "x": 641, "y": 360 }] }
```

- `tMs`: milliseconds from the clip's first video frame, to 0.1 ms. Both tracks use the QPC capture clock; frame n of a clip is at its encoder grid time minus the first frame's.
- `x`, `y`: video pixels, to 0.1 px: desktop position minus the display's virtual-desktop origin, scaled by `output / display`. While the pointer is on another display, positions fall outside the frame and `buttons` carries bit 8.
- `display`: the captured monitor in physical virtual-desktop pixels (origins can be negative) and its Windows scale.
- Buttons are logical: with swapped mouse buttons the primary button is still `left`.

Timing error: sample times are exact QPC reads. Button events are polled, so each is stamped at the midpoint between the two polls that saw the change (at most 4.2 ms off at 120 Hz); a click shorter than one poll is still reported, as a down and up at the same time. The video frame stamped `t` shows the newest WGC frame at `t`, which Windows composed up to one output frame earlier (16.7 ms at 60 fps, about half a frame on average) plus its capture delivery delay of a few ms, so the track can lead the picture by about one frame at most. Not yet measured against a physical reference. A display mode change during a session is not followed; changing the capture settings restarts the engine and re-reads the display.

## Build and run

```powershell
cargo build --release
cargo test --release
.\target\release\switchboard-rs.exe              # tray + window
.\target\release\switchboard-rs.exe --background # tray only
cargo run --release -p switchboard-capture --example probe -- 20 10   # headless engine probe
cargo run --release -p switchboard-capture --example aac_delay        # AAC delay regression
```

Settings: `%LOCALAPPDATA%\Switchboard Native\settings.json`. Clips default to `Videos\Switchboard\Clips`, the same folder as the Electron app.

Review helpers (never cover the foreground app):

```powershell
.\target\release\switchboard-rs.exe --review-shot out.png 1080 720 1.0 clips   # headless render; scenarios: clips list selection popover search empty settings delete
.\scripts\service.ps1 Subscribe | SaveClip | Quit                              # drive the running service
.\scripts\soak.ps1 -Minutes 10 -Out soak.csv                                    # memory/handle/CPU samples
```

## Measured (2026-10-06, RX 9070 XT, Ryzen 9 9950X3D, 2560x1440 display)

| State | Electron build (live, same machine) | Rust |
| --- | ---: | ---: |
| Replay armed, 1440p60, Game + Chat + Mic, window closed | ~1,550 MB private across Electron, Capture.Host and 4 FFmpeg processes | 170 MB private, 109 MB working set, 1 process |
| Tray only, replay off, cold start | n/a | 2.8 MB private, 15 MB working set |
| 10-minute soak, replay armed | n/a | median 171.6 MB private, +0.8 MB drift, handles 1410 to 1431, CPU median 0.24% |
| Window open | Electron processes alone: 702 MB private in the same live sample (351 MB median open, empty library, Sep 27 fixture) | +31 MB private, 46 MB working set |
| CPU with replay armed | 2.25% (FFmpeg alone, Sep 7 AMF probe) | 0.2 to 0.3% |
| Clip save (60 s buffer) | n/a | 27 to 41 ms |
| Engine stop | n/a | 25 ms, cache deleted |

The Electron figure is one live sample of the installed build with window capture; the Rust figures use display capture. They are not a controlled A/B of identical sources.

After replay has run once and is turned off, about 116 MB stays resident (GPU driver and Media Foundation DLLs remain loaded); turning it back on returns to the armed figure. Forty off/on cycles plateau at about 185 MB private.

UI renderer choice, bare 1080x720 window on this AMD system: eframe/OpenGL 240 MB private, wgpu DX12 379 MB, wgpu Vulkan 407 MB, CPU-rendered egui (`egui_software_backend`) 23 MB.

## Verified

- Saved clips decode fully with FFmpeg: H.264 High, BT.709 limited range, exact 60 fps grid, three named AAC tracks.
- AAC encoder delay is zero samples (impulse test, `aac_delay` example).
- Game loopback captures non-chat audio; Chat follows Discord; tracks are independent.
- IPC: subscribe, save, settings, quit; graceful quit removes the replay cache. The pipe allows only the owner and SYSTEM.
- Global shortcut fired with synthesized keys saves a clip (about 0.5 s to the saved event); the notice renders crisp at 150% scaling and never takes focus.
- 40 replay off/on cycles: threads return to baseline; handles grow 3 per start, traced to `ActivateObject` on AMD's `AMDh264Encoder` (enumeration and our own setup are clean).
- 13 unit tests: bitstream conversion, audio timeline, ring eviction/pinning, MP4 layout, naming, settings, shortcuts.

## Not yet verified

- A/V sync against a physical flash-and-click reference.
- The window on screen with real input (review renders use the same rasterizer headlessly), and DPI changes while open.
- NVIDIA and Intel encoders, HDR displays, exclusive fullscreen games, multi-GPU laptops.
- Long soaks (hours), sleep/resume, display unplug (handled through the capture item's Closed event, not exercised), default microphone changes (event-driven reopen, not exercised).

## Known gaps

- Display capture only; no per-window capture yet.
- Chat is split out only if Discord is running when Instant Replay starts, unless Chat follows a chosen output device.
- No screen-reader support in the window (the software backend does not wire up AccessKit).
- The executable is not code-signed.
- The measurements above predate the media helper, GPU thumbnails and the capture changes of 2026-10-06; see the repository README for current figures.
