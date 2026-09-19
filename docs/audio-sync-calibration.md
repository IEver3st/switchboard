# Microphone timing calibration

Settings → Capture → Audio → Microphone timing measures acoustic delay and applies
a saved microphone advance to future replay recordings.

## Flow

1. Enable microphone and Game tracks, using All audio from output device.
2. Pause other audio. Take the headphones off and hold one earcup near the capture
   microphone at the usual listening volume.
3. Start the test. Five short sounds play over roughly eleven seconds. A native
   helper compares their system-loopback and microphone energy envelopes.
4. Review the delay and variation, then save. Saving starts a fresh replay buffer.
   Subsequent recordings on that device pair use the correction automatically.
5. Adjust the advance in milliseconds if a listening check reveals residual delay,
   or Reset to remove it. Existing files are unchanged.

This aligns recorded voice with the audio heard through the playback path. It
does not reduce live Bluetooth latency or preserve the original physical timing
of speech against video; that tradeoff matters for reactions to visual events.
Game-only capture and the internal Switchboard pipe mix do not use calibration.
Choose an explicit output-device Game track when the pipe mix would be active.

## Ownership and timing

The renderer sends only start, cancel, or apply through typed, validated IPC.
Main owns the transient measurement and persisted `capture.config.microphoneSync`.
Candidates cannot be applied twice or to a changed route. Failures, cancellation,
and invalid native results preserve the saved correction. Transient measurement
state is excluded from settings persistence.

An isolated `Capture.Host --calibrate-audio` helper owns WASAPI inputs and test
playback. It retains bounded millisecond energy arrays, writes no recordings, and
sends a bounded numeric result to main. Measurement uses the same QPC startup and
device-frame continuity model as replay. At least four of five distinct matches
must agree within 20 ms. Weak, ambiguous, or variable results fail. The accepted
range is 0–1200 ms. It adds no idle process or timer. Cancellation, configuration
changes, leaving the audio settings surface, closing to tray, and shutdown stop
the owned helper. EOF also cancels the native operation.

Capture.Host applies the advance only when actual microphone and system-loopback
endpoint IDs match the saved profile. Other routes receive no correction and an
inactive-correction warning. The producer subtracts the advance from microphone
frame positions. The writer trims samples before the session origin and preserves
later continuity and genuine gaps. Silence advancement uses the same subtraction.
Video and system audio timestamps remain unchanged.

Changing correction restarts the buffer to avoid mixed timing in one session.
Calibrated saves select only video whose corresponding microphone audio has
finished encoding. The newest available clip can end slightly earlier while the
advanced microphone catches up; it must not end with missing voice samples.

Windows endpoint identity cannot identify every downstream change inside Sonar.
Recalibrate after changing headphones, Sonar routing or processing, or Bluetooth
mode, even if Windows still calls the endpoint Sonar. Noise removal can suppress
the test; failure must not be interpreted as zero delay. This is a measurement
followed by automatic compensation, not continuous drift tracking or inferred
synchronization from ordinary singing.

## Verification

- `bun test`: schemas, candidate ownership, cancellation, persistence, and existing
  JavaScript coverage.
- `dotnet run --project engines/capture-host-tests -- --audio-sync-only`: known
  delays, silence/noise/echo rejection, variable delays, pre-origin trimming,
  endpoint mismatch, restart policy, and completed microphone tails.
- `dotnet run --project engines/capture-host-tests -- --sync-calibration-media`:
  real FFmpeg encoding/decoding with a simulated 185 ms delay, startup, and ring
  wrap. Residual marker differences were 21.4 and 20.7 ms.
- Build the app and `engines/capture-host-tests` in Debug, then run
  `node scripts/verify-audio-sync.mjs`: hidden native Electron at all three review
  sizes, with a subprocess fixture that opens no audio devices. Covers prepare,
  measure, cancel, result, save, failure, adjustment, reset, reload, and restart.

Fixtures and synthetic media do not establish Sonar/Bluetooth acoustic accuracy,
physical reconnect stability, or long-running capture behavior. These require a
user-run calibration and listening check on the intended devices.
