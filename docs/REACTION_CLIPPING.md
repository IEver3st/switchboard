# Reaction clipping

Reaction clipping preserves a replay window when the active microphone contains a sustained, unusually energetic voice burst. It is an acoustic-arousal heuristic, not semantic understanding: it does not transcribe speech, decide whether something was funny, identify a speaker, or claim to recognize an emotion.

## Architecture

```text
existing shared-mode WASAPI microphone callback
  -> allocation-free frame features in Capture.Host
  -> adaptive local baseline + sustain/cooldown state machine
  -> one bounded reaction event
  -> Electron validates and normalizes the event
  -> existing AutoCaptureEngine window planner
  -> existing replay ring snapshot and no-reencode remux
  -> normal Clip metadata with a Reaction timeline marker
```

The detector observes the same microphone packets that Capture.Host already forwards to the microphone AAC encoder. If the microphone track is disabled, reaction clipping opens one event-driven shared-mode input only while a capture source is active. It discards samples immediately after computing frame features and does not create an audio pipe. It never sends PCM over Electron IPC and never creates another FFmpeg or video encoder process.

The realtime callback calculates only RMS level, peak-to-RMS crest factor, and zero-crossing rate from one channel. It allocates nothing, takes no lock, performs no I/O, and emits no IPC. The existing one-second host monitor drains at most one pending detection and publishes sparse state. A failed detector-only microphone input retries every five seconds while reaction clipping and the capture source remain active; disabling the setting, losing the source, stopping Capture, or shutting down disposes the input and stops retries.

## Detector policy

The first 1.5 seconds calibrate a local noise and speaking baseline. A candidate must:

- clear an absolute level floor and rise above the learned speech baseline;
- look voice-shaped by bounded zero-crossing and crest-factor checks;
- remain above the sensitivity profile for 120 to 260 ms;
- be outside the configured 5 to 120 second cooldown.

The noise floor adapts only during non-voice or calibration frames. The speech baseline follows ordinary voice slowly and does not chase a reaction while it is being scored. Low, Balanced, and High sensitivity change the absolute floor, relative rise, and sustain duration together. The UI exposes pre-roll, post-roll, and cooldown; overlapping reaction windows use the existing bounded merge path.

## Resource decision

| Approach | Cost and behavior | Decision |
| --- | --- | --- |
| Adaptive time-domain features | One linear pass over existing microphone frames, no model or extra process. Detects acoustic energy changes but cannot understand meaning. | Shipped baseline. |
| WebRTC VAD | Mature low-cost speech/noise gate using short frames and GMM likelihoods. It detects speech, not excitement, and would add native source/build surface. | Useful future gate if false positives show the current voice-shape checks are insufficient. |
| RNNoise VAD probability | The project already ships RNNoise for optional microphone denoising. Reusing its VAD output could improve a path where Audio.Host is already active, but running a second neural pass in Capture.Host would waste CPU. | Reuse only through a future shared feature contract; do not duplicate inference. |
| eGeMAPS-style arousal classifier | Pitch, loudness dynamics, spectral flux, and speaker normalization are stronger emotion/arousal features. They require FFT/pitch work, a trained and calibrated model, datasets, and model-version support. | Later accuracy tier, after opt-in evaluation data and measured need. |
| Speech-to-text or cloud emotion API | High CPU/network/privacy/support cost and poor fit for a continuous replay utility. | Rejected. |

The selected design follows Microsoft’s event-driven shared-mode capture pattern and keeps the detector on the already active audio callback. WebRTC’s VAD source demonstrates bounded 10, 20, and 30 ms decisions using speech/noise likelihoods. The GeMAPS research supports loudness, pitch, spectral distribution, temporal dynamics, and per-speaker normalization for arousal work; this implementation intentionally uses only the cheapest defensible subset and labels the limitation.

Primary references:

- Microsoft, [CaptureSharedEventDriven](https://learn.microsoft.com/en-us/windows/win32/coreaudio/capturesharedeventdriven)
- WebRTC, [VAD core implementation](https://webrtc.googlesource.com/src/+/refs/heads/master/common_audio/vad/vad_core.c)
- Xiph.Org, [RNNoise](https://github.com/xiph/rnnoise)
- Eyben et al., [The Geneva Minimalistic Acoustic Parameter Set](https://mediatum.ub.tum.de/doc/1523509/document.pdf)

## Validation boundary

Deterministic tests cover calibration, ordinary-speech rejection, transient rejection, sustained-reaction acceptance, confidence bounds, cooldown, settings validation, independent reaction policy, and persistence. A hardware acceptance pass must still measure false positives and missed reactions across the owner’s microphone, gain, room noise, keyboard, laughter, speech, and game sessions. Build or synthetic-waveform evidence does not prove subjective reaction accuracy.
