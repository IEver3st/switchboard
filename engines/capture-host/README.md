# Capture.Host

Windows-first `.NET 10` prototype host for the production capture process.

## What works

- JSON-lines control protocol over standard input/output.
- Safe simulation mode by default.
- FFmpeg discovery and hardware encoder probing.
- Optional Windows Desktop Duplication capture through FFmpeg `ddagrab`.
- Two-second MKV segment ring with `segment_wrap`.
- Clip save by snapshotting completed segments and remuxing to MP4 without re-encoding.

## Explicit limitations

- System/game audio is not wired yet. The intended source is the future `Switchboard Clip` virtual endpoint from `Audio.Host`.
- Automatic game-window selection is not wired yet.
- Real capture is opt-in to avoid starting desktop capture during prototype work.

## Run

```powershell
dotnet run --project .\engines\capture-host\Capture.Host.csproj
```

To exercise real capture:

```powershell
$env:SWITCHBOARD_REAL_CAPTURE = "1"
$env:SWITCHBOARD_FFMPEG = "C:\\tools\\ffmpeg\\bin\\ffmpeg.exe"
dotnet run --project .\engines\capture-host\Capture.Host.csproj
```

Then send one JSON object per line:

```json
{"requestId":"1","command":"start"}
{"requestId":"2","command":"saveReplay","payload":{"directory":"C:\\Users\\Manuel\\Videos\\Switchboard Clips"}}
{"requestId":"3","command":"stop"}
```
