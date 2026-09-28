# Microphone presets, September 2026

All ten factory microphone presets were rebuilt after the same unnatural, thin
sound was reported in Switchboard's microphone test and in Discord. This changes
the factory processing definitions, not the neural model or native DSP algorithm.
The previous curves commonly combined low-mid cuts, presence boosts, suppression,
gating and makeup gain. That is a plausible contributor to the complaint, not a
listening-confirmed diagnosis of this particular microphone.

## Research and limits

- [SteelSeries: how Sonar works](https://support.steelseries.com/hc/en-us/articles/16954265292173-How-does-Sonar-work)
  describes per-channel parametric EQ and distinct microphone processing controls.
  The user's Sonar screenshot supplies the preferred tonal reference here.
- [Shure: recording and mixing vocals](https://www.shure.com/en-US/insights/how-to-record-and-mix-vocals)
  makes EQ dependent on the voice and microphone, cautions against extra treble on
  bright microphones, and discusses restrained compression for a natural result.
  This informs the selective presence boosts and lighter dynamics. It does not
  establish a universal preset or prescribe the exact numbers below.
- [SteelSeries: Sonar and Discord](https://support.steelseries.com/hc/en-us/articles/4412048537869-Setup-Sonar-on-Discord)
  recommends a single noise-cancellation stage because stacking cancellation can
  conflict. For comparison, select the physical mic in Switchboard and its
  processed output in the voice app. Avoid processing a Sonar virtual mic again.
- [RNNoise](https://jmvalin.ca/demo/rnnoise/) describes its hybrid DSP/neural speech
  suppression approach. Switchboard uses nnnoiseless through its native wrapper.
  ClearCast is a different implementation; equal slider positions do not imply
  equal speech preservation or noise attenuation.

The screenshot shows Deep Voice, ClearCast at maximum, an automatic noise gate
with a displayed -60 dB threshold, and compressor level 0.64. It does not reveal
the EQ filter types/Q values or the compressor's threshold, ratio and time
constants. Switchboard has a manual gate, not Sonar's automatic threshold.
Its suppression strength maps nonlinearly to an attenuation limit and aligned
dry contribution. The Deep Voice settings below are an explicit approximation
of the visible EQ response plus conservative native dynamics, not a Sonar clone.

## Tonal reference

Read the white summed response, not the colored individual-filter handles.
Deep Voice uses a -12 dB shelf at 40 Hz, a -3 dB bell at 65 Hz, broad body at
150/250 Hz, and a broad cut at 1.1 kHz. High-frequency editor points are neutral.
Shelves attenuate sub-bass; they are not high-pass filters. None of these presets
shifts pitch or provides dynamic de-essing.

| Frequency | Approximate screenshot trace | New combined Deep Voice EQ |
|---|---:|---:|
| 60 Hz | -4.5 dB | -4.01 dB |
| 120 Hz | +2.8 dB | +2.98 dB |
| 180 Hz | +4.2 dB | +4.51 dB |
| 250 Hz | +3.5 dB | +3.56 dB |
| 500 Hz | 0 dB | -0.15 dB |
| 1 kHz | -3 dB | -3.32 dB |
| 2 kHz | -1.6 dB | -2.15 dB |
| 7 kHz | approximately flat | -0.15 dB |

Natural Voice is within 0.15 dB of flat from 120 Hz upward. Studio is flat.
Other presets preserve body while changing specific parts of the voice. The ten
editable bands include neutral points, which the native host skips; the existing
64-band capacity remains available.

## Factory choices

All presets use 0 dB input gain and a -1 dBFS sample-peak limiter with 90 ms
release. This is not a true-peak limiter. Compression thresholds are dBFS;
attack/release are milliseconds. Suppression uses the selected backend and does
not switch models. Noise cleanup is deliberately off for quiet-space presets.

| Preset | Purpose | Suppression | Gate threshold / attack / release | Compressor threshold / ratio / attack / release / makeup |
|---|---|---|---|---|
| Natural Voice | Preserve voice, mild rumble reduction | Off | Off | -16 / 1.5:1 / 25 / 250 / 0 |
| Clear Speech | Small definition boost, body retained | Off | Off | -18 / 1.8:1 / 20 / 240 / +0.5 |
| Deep Voice | Supplied Sonar curve as tonal reference | 25 | -60 / 2 / 300 | -18 / 2:1 / 25 / 280 / 0 |
| Warm & Smooth | Fuller body, softer bite and treble | Off | Off | -17 / 1.7:1 / 25 / 280 / 0 |
| Podcast | Quiet-room narration, gentle warmth | Off | Off | -20 / 2:1 / 25 / 300 / +1 |
| Broadcast | Fuller speech with moderate leveling | 20 | Off | -21 / 2.5:1 / 20 / 280 / +1 |
| Crisp | Modest presence and air for a dull mic | Off | Off | -17 / 1.6:1 / 20 / 240 / 0 |
| Streamer | Moderate background cleanup and leveling | 45 | -56 / 2 / 280 | -20 / 2.2:1 / 20 / 260 / +1 |
| Noisy Room | Stronger cleanup without bass stripping | 65 | -54 / 2 / 260 | -18 / 1.8:1 / 25 / 280 / 0 |
| Studio | Clean reference below the peak ceiling | Off | Off | Off |

Gate thresholds depend on source gain and the room. Noisy Room trades some voice
texture for cleanup; it is not the default for every microphone. The disabled
processors retain editable values if the user chooses to enable them.

## Validation

The TypeScript response and cleanup regressions fail against the previous
definitions and pass against the new definitions. File round-trip, application,
custom presets, saved sound and monitoring preferences pass the focused suites.
Existing sessions keep their saved sound as Custom until a new factory preset is
selected; startup does not silently overwrite a customized chain.

`scripts/verify-microphone-preset-dsp.ts` exports the actual factory definitions
and display responses into a temporary fixture. C# parses them through
`MicrophoneDspConfiguration.From` and processes them through `AudioGraph`.
Every preset passed native EQ agreement within 0.12 dB at eleven frequencies,
sample-peak limiting under overload, repeatability after reset, finite output,
and zero managed callback allocations. Existing RNNoise alignment, gate speech
preservation, speech-envelope and failed-frame bypass regressions also passed.

An offline upstream speech sample (`clean_freesound_33711.wav` from the existing
DeepFilterNet cache) was normalized once to -12 dBFS peak, then also tested 20 dB
quieter. Full-chain level changes, without output normalization:

| Preset | Normal speech | Quiet speech |
|---|---:|---:|
| Natural Voice | -0.01 dB | -0.01 dB |
| Clear Speech | +0.08 dB | +0.08 dB |
| Deep Voice | +1.41 dB | +1.40 dB |
| Warm & Smooth | +0.21 dB | +0.21 dB |
| Podcast | +0.95 dB | +0.95 dB |
| Broadcast | +1.31 dB | +1.31 dB |
| Crisp | -0.11 dB | -0.11 dB |
| Streamer | +1.05 dB | +1.03 dB |
| Noisy Room | -0.07 dB | -0.10 dB |
| Studio | 0.00 dB | 0.00 dB |

Studio was sample-identical to the input at these levels. These are level and
signal-integrity measurements on one fixture, not perceptual quality scores.

Hidden native Electron checks passed preset selection for all ten complete
chains, keyboard EQ edits, custom save/reload, pending/rejected selections and
unavailable controls. Screenshots were inspected at 1080 x 720, 1420 x 900 and
1920 x 1080 with reduced motion and no horizontal overflow. Processor availability
was simulated; no audio engine or physical endpoint was started by the UI check.

Reproduce:

```powershell
bun test tests/microphone-preset-tuning.test.ts tests/audio-presets.test.ts tests/audio-builtin-preset-refresh.test.ts tests/audio-custom-preset-persistence.test.ts
bun scripts/verify-microphone-preset-dsp.ts
# Optional second argument: a local 48 kHz mono speech WAV, at least two seconds.
bun scripts/verify-microphone-preset-dsp.ts <speech.wav>
dotnet run --configuration Release --project engines/audio-host-tests -- --microphone-quality
```

`bun run check`, `check:source`, `check:types`, and `build` also passed. There are
no native production-code, routing or host-lifecycle changes in this revision.
Physical disconnect/reconnect, host recovery and long-running device soak were
not repeated. No installer, release or live Discord listening validation is
claimed. Compare Deep Voice, Natural Voice and Studio in the rebuilt app at
similar playback loudness, using normal speech, quiet sentence endings and S/F/T
consonants; then repeat through the actual voice-app input.
