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

Calibration requires five seconds of received audio, including three seconds of voice-shaped input. Silence cannot arm the detector. Diagnostics explain that normal speech is needed. A candidate must:

- clear an absolute level floor and rise above the learned speech baseline;
- look voice-shaped by bounded zero-crossing and crest-factor checks;
- accumulate 450 to 900 ms of qualifying voice, allowing gaps of at most 100 ms;
- be outside the configured 5 to 120 second cooldown;
- follow at least three seconds of settled input after the previous reaction.

| Sensitivity | Minimum level | Rise above normal speech | Qualifying voice |
| --- | --- | --- | --- |
| Low | -10 dBFS | 14 dB | 900 ms |
| Balanced | -14 dBFS | 12 dB | 650 ms |
| High | -20 dBFS | 9 dB | 450 ms |

The first voice-shaped frame initializes the speech baseline to the actual input level. During calibration, louder speech is learned quickly. Once listening, the baseline follows louder speech with a two-second time constant and quieter speech with a 60-second time constant. Learning pauses while scoring a new burst but continues during cooldown and loud exchanges. Quiet words therefore do not immediately lower the threshold, and a louder conversation becomes the new normal. The noise floor adapts only during non-voice frames. High microphone gain alone cannot bypass the relative-rise requirement. Packet outages longer than 250 ms clear sustain and settling evidence.

New configurations default to a 60-second cooldown; saved user preferences remain intact. Main also enforces the configured cooldown and rejects reaction windows that overlap the previous admitted reaction, even after finalization or a source/host restart. After an app restart, the latest saved reaction clip's creation time supplies a conservative cooldown and window-end bound. Deleting that clip removes this persisted bound. Game events and manual replay saves keep their existing behavior. These guards use existing event delivery, clip metadata, and save timers; they add no polling, process, or audio storage.

The detector needs ordinary speech to establish a useful baseline. If the first speech is already a shout, it may learn that level and miss the initial reaction. Quiet laughter and reactions without a sufficient level rise also remain outside this heuristic's reliable coverage.

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

The ten-minute synthetic conversational-emphasis regression produced 30 detections with the old policy and zero with this policy. Deterministic tests also cover silent startup, high-gain speech, separated syllables, packet gaps, sustained-reaction acceptance at every sensitivity, adaptation during loud conversations, recovery, repeated pause/disable/re-enable, confidence bounds, settings validation, overlap suppression after finalization, and cooldown restoration from saved clips. A hardware acceptance pass must still measure false positives and missed reactions across the owner's microphone, gain, room noise, keyboard, laughter, speech, and game sessions. Build or synthetic-waveform evidence does not prove subjective reaction accuracy.
