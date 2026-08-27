# Capture.Host

Windows-first `.NET 10` host for Switchboard Instant Replay. It is the data plane; Electron sends validated settings and receives low-frequency status snapshots, never video or audio buffers.

## Implemented pipeline

- Windows Graphics Capture through FFmpeg `gfxcapture`, with Desktop Duplication as the display-capture fallback.
- Working encoder probes and automatic preference for NVENC, AMF, or Quick Sync, followed by a software fallback.
- One-second, keyframe-aligned Matroska video segments plus independently encoded system-audio and microphone segment streams.
- Duration- and byte-bounded disk ring with abandoned-session cleanup.
- Immutable hard-link snapshots for queued saves, stream-copy MP4 assembly, fsync, and atomic final rename.
- Direct Clip-mix capture from Audio.Host's bounded named pipe and exact processed-microphone endpoint capture; no realtime audio or video crosses Electron IPC.
- Explicit fallback to configured loopback/default inputs only when the Switchboard audio path is unavailable, with the fallback reason exposed in status.
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
