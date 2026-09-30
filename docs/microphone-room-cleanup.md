# Microphone residual-noise cleanup

The reported problem is an empty-room sound heard by other people in Discord.
The installed 0.9.25 host already contained the RNNoise dry/wet alignment repair.
The saved configuration selected the physical QuadCast 2, RNNoise at strength 80,
and the separate Hi-Fi Cable microphone output. A short input-only measurement
found almost identical left/right channels, rather than phase cancellation on
mono conversion. These observations do not establish the cause of the reported
voice quality in a live call.

## Sonar research

SteelSeries describes ClearCast AI as CPU-based voice/noise separation, alongside
microphone EQ, gating and compression. Its public material documents behavior,
not its model weights or DSP implementation. Its Discord guide advises using one
noise-cancellation stage because stacking Discord's cancellation with ClearCast
can conflict. This investigation did not establish Discord's current processing
settings, and did not change them.

Sources:

- [SteelSeries microphone noise cancellation](https://steelseries.com/ro-ro/blog/how-to-eliminate-noise-from-microphone-communication-869)
- [SteelSeries Discord setup](https://support.steelseries.com/hc/en-us/articles/4412048537869-Setup-Sonar-on-Discord)
- [RNNoise plugin speech detection and grace periods](https://github.com/werman/noise-suppression-for-voice#plugin-settings)

## Change

RNNoise returned speech probability, but Switchboard did not use it to attenuate
residual non-speech. The ordinary amplitude gate could remain open on room tails
and louder background sounds. The RNNoise wrapper now applies a speech envelope
to the wet output before the existing latency-aligned strength blend.

0.9.29 revision: the first version muted non-speech completely, opening at 0.5
probability with a 60 ms hold. RNNoise's probability dips under soft onsets,
unvoiced consonants and word tails, so that mute chopped real speech ("mic cutting
out"). The envelope now attenuates by a bounded range that grows with strength:
none up to the 21 dB setting (strength 55), then 1 dB per dB of extra strength,
capped at 18 dB. It opens at 0.35, stays open down to 0.12, holds for 200 ms, and
uses 2 ms attack and 80 ms release. With `clean_freesound_33711.wav` plus
`noise_freesound_2530.wav` at strength 85, chopped speech frames (at least 15 dB
under the clean reference) fell from 2.6% to 0.2% at 25 dB SNR and from 3.1% to
1.3% at 12 dB SNR (`--microphone-continuity`). The strength setting retains its existing dry
floor. No lookahead, process, timer, model download or additional audio delay is
introduced. Reset and disposal clear the envelope. Backend failure still uses
the existing direct raw-audio bypass.

This is residual-noise suppression, not an inverse room filter. It cannot remove
all reflections that overlap speech. No Sonar code or weights were copied.

A separate test-playback defect is also repaired: with monitoring disabled,
Test microphone follows the current main output instead of a stale monitor
destination. Enabled monitoring retains its explicit destination. This defect
does not explain the sound transmitted to Discord.

## Evidence

The existing microphone-quality suite reproduced the test-output defect before
the repair and passed afterward. Regression coverage checks strength alignment,
speech hold/reopening/reset, zero managed DSP allocations, amplitude-gate speech
preservation, and stale-output failure bypass. The complete Audio.Host suite also
passed, including microphone controls, routing isolation and pipe lifecycle.

Offline comparisons used the already available upstream
`clean_freesound_33711.wav` sample. At strength 80, overall speech level changed by
-0.007 dB at original level, -0.007 dB with input scaled to 0.1, and -0.008 dB at
0.03, relative to the previous RNNoise wrapper. The existing timbre probe measured
no additional sample delay (480 samples / 10 ms wet-path delay), and approximately
0.05 ms p99 processing per 10 ms frame on this machine.

A deterministic reflection simulation with the same speech and the saved gate
settings measured late-tail attenuation (150–600 ms after speech) improving from
22.84 dB to 31.13 dB. The wider 50–400 ms tail window changed only from 10.67 dB to
10.86 dB. Keyboard-like transients in the timbre probe improved from 8.5 dB to
12.7 dB attenuation at strength 80. These are fixture results, not measurements
of the user's room or confirmation that the Discord complaint is resolved.

Three live QuadCast 2 input-only start/stop cycles processed 201, 202 and 602
frames, with p99 DSP times of 0.186, 0.090 and 0.086 ms respectively. All three
reported zero capture overruns and zero dropped/bypassed frames. This verifies
capture and DSP lifecycle, not subjective voice quality or remote Discord audio.

Reproduction:

```powershell
bun run test:audio-host
dotnet run --configuration Release --project engines/audio-host-tests -- --microphone-quality
dotnet run --configuration Release --project engines/audio-host-tests -- --microphone-timbre <48-kHz-mono-16-bit-speech.wav>
```

The temporary before/after speech and room probes are under
`.switchboard/microphone-room-investigation`. No user microphone recording was
saved or uploaded. Final acoustic acceptance requires listening to the processed
Hi-Fi Cable input in the user's voice app with a single noise-removal stage, then
checking quiet speech, word beginnings/endings and room reflections.

## Local installation

The repaired self-contained Audio.Host executable and its symbols were applied
to the existing 0.9.25 installation after hash-verified backups. The original
RNNoise DLL and all saved settings were retained. The rebuilt host generated
byte-identical fixture WAV output with the installed and locally built native
libraries. The installation receipt, backups and restoration script are under
`.switchboard/microphone-room-investigation`.

The initial local repair retained version 0.9.25. Release 0.9.26 includes these
source changes so subsequent installations and updates retain the repair.
