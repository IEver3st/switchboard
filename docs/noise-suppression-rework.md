# Microphone suppression rework

The reported symptom was a thin, muffled or robotic microphone, with a preference
for strong background cleanup. The previous path blended nearly full RNNoise
processing at moderate strengths, added a second VAD-driven attenuation envelope,
and crossfaded delayed model output against current raw input during bypass.
The latest installed profile had strength zero, so these defects do not establish
the cause of every reported live microphone problem.

## Processing ownership

The pinned [nnnoiseless model](https://github.com/jneem/nnnoiseless/tree/924a2dd143ccad7bce9e5bda061b60ca32911a67)
and native ABI are unchanged. Native wrappers now supply full neural output,
model metadata, measured delay and available speech confidence. They contain no
user-strength blend or second gate. `NoiseSuppressionStage` owns that policy once
for the microphone graph before the optional gate, gain, EQ, compression and
limiting. All microphone consumers receive the same processed samples.

The live factory selects packaged RNNoise unless the user explicitly chooses
DeepFilterNet3 (`audio.noiseSuppressionModel`). Finding its files never switches live
sound or latency. If the chosen model cannot start, RNNoise runs and the reason is
reported beside the control. DeepFilterNet3 preserves speech without raw restoration,
so the speech-protection floor below applies to RNNoise only.

## Strength and speech

The existing 0–100 control retains its persisted value. The room-noise attenuation
ceiling maps 25/55/80/100 to 6/14/24/36 dB, with smooth interpolation. These limits
describe the dry contribution, not guaranteed acoustic noise removal.

Speech confidence uses hysteresis and a 300 ms hold. When aligned wet-frame energy
falls substantially below the original microphone, the stage restores part of the
original voice. That protection increases gradually as retained amplitude falls
from 85% to 50%; intact neural output receives the requested cleanup. Even maximum
strength retains a 20% dry contribution for strongly attenuated, recognized speech.
The VAD decision never mutes or attenuates the whole output. The separate Noise
gate is still independently configured, and saved gate/EQ settings are preserved.

Zero strength means off in both DSP and the interface. Enabling from zero selects
the existing Balanced value, 55. Pending edits retain confirmed state, rejected
edits restore the confirmed slider value, and settings still belong to main.

## Timeline and failure

RNNoise output is delayed 480 samples. A preallocated raw delay keeps both signals
on that timeline during processing, bypass and failure. Bypass retains that 10 ms
delay but performs no inference and can consume partial capture packets. A missing
model uses direct bypass. Optional DeepFilterNet comparisons use their measured
1440-sample delay.

Enabling consumes the model's overlap/lookahead before a 20 ms fade. Strength
changes use the same bounded fade. Failed, throwing or nonfinite model output is
discarded; the stage returns aligned dry audio. The existing pipeline owns repeated
failure/deadline bypass and recovery. Reset clears history without allocating or
recreating the model on the DSP thread. Diagnostics distinguish bypass from active
suppression and report the configured limit and current framing latency.

## Evidence on September 30, 2026

With upstream `clean_freesound_33711.wav` and `noise_freesound_2530.wav` mixed at
12 dB SNR, strength 85 previously produced 1.3% chopped speech frames. The new
path measured 0.0% at normal, 0.1 and 0.03 input scales, with roughly +0.1 dB speech
level change. The test defines chopped speech as a 10 ms frame at least 15 dB
below its aligned clean reference. Noise-only level changed by -13.5 dB at 80 and
-16.2 dB at 100. These are sample-specific results.

Three QuadCast 2 input-only lifecycles processed 203, 201 and 602 frames with zero
capture overruns or bypassed frames. DSP p99 was 0.239, 0.066 and 0.085 ms per
model frame. The tests produced no microphone recording and changed no routes.
Native UI fixtures cover the noise control at 1080×720, 1420×900 and 1920×1080,
including keyboard edits, pending/rejected writes and confirmed state after reload.

Reproduce the signal tests with the existing upstream files:

```powershell
bun run test:audio-host
dotnet run --configuration Release --project engines/audio-host-tests -- --noise-suppression-reference <48-kHz-16-bit-clean.wav> <48-kHz-16-bit-noise.wav>
dotnet run --configuration Release --project engines/audio-host-tests -- --live-microphone-quality
```

Live call listening, physical disconnect/reconnect, long-running handle/memory
behavior and release/install qualification remain separate. The installed app
has not been replaced. Listening through the processed Hi-Fi Cable with the
user's voice-app processing settings is still required to assess the complaint.

## DeepFilterNet3 live option, October 3, 2026

`--noise-model-comparison clean.wav noise.wav` runs both models through the stage.
Clicks are synthetic broadband transients, a keyboard proxy rather than a recording.
With the upstream clean/noise references above:

| Strength 100 | RNNoise | DeepFilterNet3 |
|---|---|---|
| Clicks while talking | -5.5 dB | -11.4 dB |
| Clicks in pauses | -5.4 dB | -33.8 dB |
| Room noise alone | -16.2 dB | -36.0 dB |
| Clean speech chopped / level | 0.0% / 0.0 dB | 1.0% / -0.4 dB |
| Model latency | 20 ms | 40 ms |

DeepFilterNet3 chops 0.0% of clean speech frames at 55 and 0.3% at 80. Three
QuadCast 2 input-only lifecycles (`--live-microphone-quality deepfilternet3`) had DSP
p99 of 0.64-0.87 ms per 10 ms frame with no overruns or bypassed frames. Pretrained
weight redistribution remains unresolved upstream, so the model stays a local
acquisition. Live call listening and room-echo removal are not established.
