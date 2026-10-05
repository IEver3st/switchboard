# Capture.Host

Windows-first `.NET 10` host for Switchboard Instant Replay. It is the data plane; Electron sends validated settings and receives low-frequency status snapshots, never video or audio buffers.

## Implemented pipeline

- Windows Graphics Capture through FFmpeg `gfxcapture`, with Desktop Duplication as the display-capture fallback.
- Working encoder probes and automatic preference for NVENC, AMF, or Quick Sync, followed by a software fallback.
- One-second, keyframe-aligned Matroska video segments plus independently encoded game-audio, chat-audio, and microphone segment streams.
- Duration- and byte-bounded disk ring with abandoned-session cleanup.
- Immutable hard-link snapshots for queued saves, stream-copy MP4 assembly, fsync, and atomic final rename.
- Audio is recorded directly from Windows devices through NAudio WASAPI: default or selected output loopback for game audio, game-only process loopback (Windows build 20348 or later), communications or selected output loopback for chat, and the default or selected microphone. No realtime audio or video crosses Electron IPC.
- Saved microphone sync calibration is applied when the calibrated microphone and output pair is active.
- Conservative sticky automatic-game detection. It never falls back from a game to an arbitrary foreground window.
- Explicit waiting, recovery, low-storage, encoder, source, and audio failure states.

Exclusive-fullscreen graphics hooking is not implemented. Automatic game and window capture use Windows Graphics Capture and are truthful about that boundary.

## Build and run

```powershell
dotnet build .\engines\capture-host\Capture.Host.csproj
dotnet run --project .\engines\capture-host\Capture.Host.csproj
```

The host locates a full FFmpeg build on `PATH`, beside `Capture.Host.exe`, or through `SWITCHBOARD_FFMPEG` and `SWITCHBOARD_FFPROBE`. Packaged Switchboard builds stage the host and FFmpeg together.

The standard-input protocol is newline-delimited JSON. A `start` request includes the validated capture configuration and application-resolved cache/Clips paths. Other commands are `configure`, `stop`, `status`, `listSources`, `saveReplay`, and `shutdown`.

One-shot modes exit after printing JSON: `--list-sources` lists capture sources, and `--list-audio-endpoints` lists active Windows audio endpoints as `{ id, name, flow, isDefault, formFactor?, interfaceName? }`, where `flow` is `render` or `capture` and `isDefault` marks the default multimedia or console endpoint for that flow.

## Audio/video sync validation

The normal capture-host tests cover timestamp fallback, PCM gaps/overlaps, and
manifest-based selection. With FFmpeg available, run the saved-media regression:

```powershell
dotnet run --configuration Release --project engines/capture-host-tests/Capture.Host.Tests.csproj -- --sync-media-probe
```

It generates synthetic flashes and tones, exercises delayed startup, missing
audio packets, ring eviction, and stream-copy saves, then measures alignment in
the decoded MP4. The previous zero-offset assembly is checked against the same
fixture to demonstrate the regression. It does not capture a screen or device.

`--sync-loopback-probe` separately checks three live Windows loopback start/stop
cycles with audio sent only to a discard sink. It saves no media and opens no
window. Neither check proves alignment in a particular game or a long soak.
