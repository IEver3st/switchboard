# AGENTS.md

## Product

Switchboard is a low-overhead Windows clipping app: Instant Replay with separate Game, Chat and Microphone tracks, single-app capture, the clip library, the editor, montages, sharing, Auto Capture and automatic updates. It is a native Rust app in `switchboard-rs/`. The 0.9 Electron app (device modules, Capture.Host) is archived on the `archive/electron-0.9` branch and is not maintained.

## Start here

- Run `git status` before editing. Existing changes belong to the owner: do not reset, clean, overwrite, stage or include unrelated work.
- Read `README.md` for the product and `switchboard-rs/README.md` for the capture pipeline, cursor track format, measurements and test helpers.
- Read `DESIGN.md` before window work. It holds design intent; the code that implements it is `crates/app/src/ui/theme.rs` and `ui/widgets.rs`. Its device-workspace sections describe the archived app.
- **Every push to `main` that touches `switchboard-rs/**` builds, tests and publishes a patch release** through `.github/workflows/native-release.yml`. Never push to `main` without the owner asking for a release.

## Layout

| Crate | Owns |
| --- | --- |
| `crates/capture` | WGC capture (display or one app window), HDR tone mapping, D3D11 NV12 conversion, MF and AMF encoders (H.264, HEVC, AV1), WASAPI tracks, the disk ring, the MP4 muxer, the cursor track |
| `crates/app` | `switchboard-rs.exe`: service, tray, hotkey, notices, window (CPU-rendered egui), updater, migration, FFmpeg provisioning, diagnostics |
| `crates/media` | Editor playback, frames and waveforms (runs in `--media-host`) |
| `crates/project` | Clip edits and montages |
| `crates/export` | FFmpeg export for sharing |
| `crates/autocapture` | Game event detection and reaction clipping |
| `crates/log` | Rotating per-role logs and crash reports |

One executable, three roles:

- `--background` (default): service. Owns settings, the capture engine, tray, hotkey and notices. Single instance through the `Local\SwitchboardNative` mutex.
- `--ui`: the window. Started on demand, exits when closed, talks to the service over a per-user named pipe (JSON lines, `protocol.rs`).
- `--media-host`: editor decoding, kept out of the window process.

The service owns persisted state (`%LOCALAPPDATA%\Switchboard Native\settings.json`). The window only renders `ServiceState` snapshots and sends requests. Captured frames and audio never cross the pipe.

## Rules

- No code comments. Names and structure carry meaning; facts that need prose go in this file or the READMEs.
- No new unit, mock or snapshot tests. Prove behavior by running it: a temporary `crates/capture/examples/*.rs` that calls `Engine::start`, a review render, or the service driven through `scripts/service.ps1`. Delete temporary examples when done.
- Realtime paths (capture callbacks, encoder delivery, audio packets) do not log, block on locks held elsewhere, or allocate per frame.
- A stopped engine holds no thread, timer, capture session, encoder or device handle. Stop must be idempotent and safe during crash recovery.
- Prefer events (capture item Closed, endpoint notifications, power broadcasts) over polling. Every poll is listed below with its reason and stop condition; add new ones there.
- Keep a control visible only when the capability is real on this machine. Hide unsupported codecs, label waiting and blocked states beside the control, and keep internal identifiers in diagnostics.
- Say "Built, untested" for anything not exercised, and keep hardware or soak evidence separate from build evidence.

## Checks

From `switchboard-rs/`:

```powershell
cargo build --release
cargo test --release
git diff --check
```

There is no lint script. `native-release.yml` runs the same build and tests.

Window work: render each changed screen at 1080x720, 1420x900 and 1920x1080 with `target\release\switchboard-rs.exe --review-shot out.png W H 1.0 <scenario>` and look at the PNGs. The service must be running. The installed service locks its own exe, so build to `target\release` and do not run a dev service beside the installed one.

Capture work: run a temporary example and check the saved MP4 with `ffprobe`; decode it with `ffmpeg -f null -` and in the editor's decoder. The per-process GPU counter is unreliable; measure the encoder by encoded frames.

## Logs and diagnostics

- Logs: `%LOCALAPPDATA%\Switchboard Native\Logs\{service,ui,media}.log`, rotated. Crash reports (`crash-<role>-<time>.txt`) sit beside them.
- Settings > Diagnostics > Copy diagnostics builds `diagnostics::report`: versions, encoder and codec, frames, track errors, settings, crash reports and log tails, with the user profile and name redacted. Settings > General > Report a problem copies the same report and opens the issue form with the environment prefilled.

## Encoders

- MF hardware encoders are tried first. On AMD the MF H.264 and HEVC encoders can accept frames and never emit output; after 1 s of silence the pipeline switches to AMF on the same adapter. A codec that produced zero frames is remembered per adapter for the session and recording falls back to H.264 with a note in Settings.
- HEVC and AV1 use 0.7x the H.264 bitrate. Sharing re-encodes them to H.264 because the stream-copy path is H.264 only.
- HDR displays: WGC delivers FP16 scRGB, which `tonemap.rs` maps to SDR using the display's SDR white level. Verified on a forced path only; no HDR display has been tested.

## FFmpeg

Recording, saving and editing never use FFmpeg. Sharing finds it in this order: `SWITCHBOARD_FFMPEG`/`SWITCHBOARD_FFPROBE`, next to the exe, PATH, the provisioned copy in `%LOCALAPPDATA%\Switchboard Native\FFmpeg\<PINNED_FFMPEG>`, then the 0.9 install. When none is found, the service downloads the pinned build once on start (`ffmpeg_setup::ensure`, one thread, no polling) and publishes progress as `ServiceState.ffmpeg`; the share dialog waits on that state and sends `InstallFfmpeg` once to retry a failed download. `ffmpeg_setup.rs` checks size and SHA-256 before unpacking. The executable links the C runtime statically (`switchboard-rs/.cargo/config.toml`), so users install nothing. Bumping the version means updating `PINNED_FFMPEG`, the URLs, `SIZE` and `SHA256` together. Uninstall removes the provisioned copy.

## Polling inventory

| Where | Interval | Why | Stops when |
| --- | --- | --- | --- |
| `app/service.rs` tick | 1 s | Status for the open window | Window disconnects |
| `app/service.rs` tick | 1 s (`APP_FOLLOW_INTERVAL`) | Retarget Game loopback to the followed app's process | Not in app mode |
| `app/service.rs` tick | 5 s | Engine health, video lag (`VIDEO_LAG_LIMIT` 12 s) | No engine, retry or Auto Capture pending |
| `app/service.rs` | 5 s (`CHAT_APP_CHECK`) | Chat app started or quit after replay began | Engine stops or Chat follows a device |
| `app/service.rs` | 5 s (`RETRY_AFTER`) | Restart a failed engine | Engine starts or replay is turned off |
| `app/service.rs` | 3 s / 30 s | Start after resume, or if the resume event was missed | Engine started |
| `app/update.rs` | 15 s, then hourly | Update check | Updates turned off |
| `app/auto.rs` | 2 s (`GAME_CHECK`) | Game detection for Auto Capture | Auto Capture off |
| `app/auto.rs` | 100 ms (`MIC_PUMP`) | Reaction clipping mic levels | Reaction clipping off |
| `app/media_host.rs` | 40 ms (`STATUS_INTERVAL`) | Playback position to the window | Media host exits |
| `app/media_client.rs` | 3 s (`LINGER`) | Keep the media host warm between clips | Linger expires |
| `app/ui/library.rs` | 10 s (`MISSING_RETRY`) | Re-check clips whose files were missing | Window closes |
| `app/ui/sources.rs` | 2 s | Open app windows for the source menu | Menu closes |
| `autocapture/war_thunder` | 750 ms | Game's local HTTP telemetry | Game exits or Auto Capture off |
| `autocapture/http` | 100 ms slices | Abortable request wait | Request ends |
| `capture/video.rs` | 1 s (`APP_CHECK`) | Waiting for the chosen app to open | App window found |
| `capture/video.rs` | 2 to 30 s backoff | Retry a window capture that failed | Capture starts or engine stops |
| `capture/video.rs` | 2 to 16 s backoff | Reopen a quiet display capture | Frames return or engine stops |
| `capture/video.rs` | 4 s stall, 1 s silent encoder | Detect a frozen capture or a silent MF encoder | Engine stops |
| `capture/wgc.rs` | 2 s, only on frame arrival | Display HDR state change | Capture stops |
| `capture/cursor.rs` | 120 Hz, 1 s heartbeat | Cursor track samples | Cursor track off or engine stops |
| `capture/audio.rs` | 200 ms (`IDLE_MS`) | Keep silent tracks on the timeline when a device sends no events | Engine stops |
| `capture/audio.rs` | per packet | Track levels for the window | 2 s without a reader |

## Probes

- `cargo run --release -p switchboard-capture --example probe -- 20 10`: headless engine run.
- `--example aac_delay`: AAC encoder delay regression.
- `--example av_sync`: A/V sync against a flash-and-click reference. It flashes a white square at the top-left and clicks on the default output; ask the owner before running it.
- `scripts/soak.ps1`, `scripts/cycle-test.ps1`, `scripts/hotkey-test.ps1`, `scripts/service.ps1`: soak, start/stop cycles, hotkey and IPC driving.
