# Audio.Host

`.NET 10` and NAudio host for Switchboard's Windows audio routing boundary.

## Implemented

- JSON-lines control protocol.
- Windows endpoint and application-session discovery through NAudio/Core Audio.
- WASAPI loopback capture for Game, Chat, Media, and Aux virtual render endpoints.
- Grouped playback to the physical output selected for each bus.
- Processed physical-microphone feed to the virtual Microphone transport.
- Bus-plus-microphone broadcast mix to the virtual Stream transport.
- Lock-free, preallocated transport rings and real 20 Hz meter frames.
- Game, chat, media, and aux bus state.
- ChatMix gain law.
- Allocation-free microphone graph primitives using `Span<float>` and `System.Numerics.Vector<float>`.
- Real physical-microphone capture and explicit normalization to 48 kHz float mono.
- A bounded capture adapter and dedicated above-normal processing thread; WASAPI capture never waits for neural inference.
- Packaged RNNoise processing through a pinned Rust/C ABI bridge, plus an optional pinned upstream `libDF` backend.
- Fail-open dry-frame delivery, invalid-sample rejection, bounded enable/strength crossfades, and aggregated timing/overrun diagnostics.
- Explicit processor order: AI suppression, noise gate, software gain, parametric EQ, compressor, limiter.
- Processed monitoring and a two-second record-then-play microphone test; neither route sends PCM through Electron.

The capture-to-DSP SPSC adapter holds at most four model frames (40 ms for the packaged backend), and output fan-out adapters hold at most eight. When a producer reaches that bound, new samples are dropped and counted instead of extending latency. Three consecutive neural deadline misses disable suppression and return the dry frame; microphone transport continues.

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

`start` and `configure` require the canonical `audio` object from `src/shared/contracts.ts`. Physical-microphone DSP and monitoring start without the signed virtual driver. Virtual channels and application routing remain truthfully unavailable until all required endpoints exist. A missing or invalid microphone is reported without fabricating an active processing path.

Useful diagnostic commands:

```json
{"requestId":"1","command":"listEndpoints"}
{"requestId":"2","command":"status"}
{"requestId":"3","command":"listSessions"}
{"requestId":"4","command":"testMicrophone"}
```

Run the offline quality/benchmark path against any local 48 kHz mono WAV with the same production graph:

```powershell
.\Audio.Host.exe --benchmark .\input.wav --output .\processed.wav --amount 55
```

Supply-chain, hashes, attribution, the optional DeepFilterNet build, and the model redistribution gate are documented in `docs/noise-suppression-supply-chain.md`.
