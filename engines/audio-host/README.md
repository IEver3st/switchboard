# Audio.Host

`.NET 10` and NAudio prototype for the Sonar replacement engine boundary.

## Implemented

- JSON-lines control protocol.
- Windows endpoint and application-session discovery through NAudio/Core Audio.
- Game, chat, media, and aux bus state.
- ChatMix gain law.
- Allocation-free microphone graph primitives using `Span<float>` and `System.Numerics.Vector<float>`.
- Explicit processor nodes for gain, gate, suppression, EQ, compressor, and limiter.

## Not faked

A complete Sonar replacement requires signed virtual Windows audio endpoints. This host does **not** pretend that application routing is complete without that driver. The intended boundary is:

```text
Virtual Game / Chat / Media / Aux endpoints
                ↓
           Audio.Host
                ↓
Personal output / Stream mix / Clip mix / Virtual microphone
```

The virtual driver should remain deliberately stupid. DSP, profiles, routing, and recovery belong here in user mode.

## Run

```powershell
dotnet run --project .\engines\audio-host\Audio.Host.csproj
```

Example commands:

```json
{"requestId":"1","command":"listEndpoints"}
{"requestId":"2","command":"start"}
{"requestId":"3","command":"setBusGain","payload":{"busId":"game","gain":0.9}}
{"requestId":"4","command":"setChatMix","payload":{"value":0.25}}
```
