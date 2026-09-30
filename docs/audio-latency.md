# Audio latency

The live path avoids unnecessary buffering while keeping recording queues and
noise-model framing intact. These changes are native Audio.Host behavior; they
do not change saved presets, endpoint choices, system volume, or replay timing.

## Runtime policy

- Physical microphone capture, monitoring, and shared playback request
  IAudioClient3 low-latency operation. The endpoint chooses its supported minimum
  period; ordinary shared-mode fallback requests 10 ms, previously 20 ms.
- Process/endpoint loopback uses its supported event-driven capture path with a
  10 ms requested buffer. It does not request unsupported low-latency loopback.
- Capture/playback and the microphone DSP worker use multimedia scheduling.
  The worker registers once, reverts on exit, and sleeps until new capture data,
  capture failure, or shutdown. Removing its idle timeout does not itself reduce
  audio delay: it already woke on data notifications.
- Bypassed noise removal lets the sample-based DSP process a partial capture
  packet immediately. Enabled suppression, including fade-out, still consumes
  complete model frames. RNNoise uses 480 samples at 48 kHz. Its 10 ms output
  delay also applies to the dry path during bypass, so toggles never combine
  different moments in time. Missing models use a direct, undelayed bypass.
  Diagnostics report 20 ms while assembling model frames and 10 ms in bypass,
  separate from Windows/device buffering.
- Personal playback, virtual microphone, and monitoring consumers skip stale
  queued samples beyond 20 ms, or one render callback if larger. This is recovery
  after backlog, not an imposed 20 ms prebuffer. Discards are counted and can make
  an audible discontinuity after a stall. Producer overflow still drops incoming
  samples; this policy cannot guarantee sample age after an arbitrarily long stall.
- Stream and recording queues keep their existing continuity and overflow policy.
  Replay's 20 ms pipe cadence is unchanged. The float output adapter reads directly
  into the render buffer, eliminating an extra scratch buffer and copy.

NAudio documents low-latency negotiation and fallback for its
[recorder](https://github.com/naudio/NAudio/blob/main/Docs/WasapiRecorder.md) and
[player](https://github.com/naudio/NAudio/blob/main/Docs/WasapiPlayer.md).
Windows periods remain subject to
[driver support](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/low-latency-audio).

## Reproduce

```powershell
dotnet run --configuration Release --project engines/audio-host-tests/Audio.Host.Tests.csproj -- --audio-latency
dotnet run --configuration Release --project engines/audio-host-tests/Audio.Host.Tests.csproj -- --live-audio-latency
dotnet run --configuration Release --project engines/audio-host-tests/Audio.Host.Tests.csproj -- --live-microphone-quality
```

The first command is deterministic. It checks backlog recovery, stereo alignment,
wraparound, underrun silence, larger render requests, recording sample order,
partial-frame DSP equivalence, model transitions, and zero hot-path allocations.
Its 500 ms synthetic backlog is retained as 20 ms by the live consumer; this is
not a measurement of the ordinary live buffer depth. A 2.5 ms bypassed DSP packet
produces the same samples as processing the equivalent 10 ms block.

The second command opens shared physical endpoints, sends silent output, and
retains no audio recording. It prefers QuadCast 2 and WH-1000XM6 when available,
otherwise available physical devices. It compares old/new WASAPI settings,
then runs the real microphone pipeline through suppression on/off and monitoring
stop/start, verifies repeated disposal, and checks a sample-rate mismatch fallback.
The third exercises repeated microphone pipeline lifecycles with native RNNoise.

## Local observations, September 27, 2026

Release Audio.Host build and the complete deterministic native audio suite passed.
The QuadCast 2 and WH-1000XM6 shared endpoint comparison reported low-latency mode
active and a 10 ms period for both, versus 20 ms reported with the previous settings.
Capture callback cadence was similar: approximately 10.8 ms p99 in both runs,
with batched immediate callbacks between intervals. The largest render request
was 22 ms in both. Negotiated periods therefore do not prove halved audible delay.

The real pipeline's suppression/bypass/monitor-restart/restore phases had zero
capture overruns, monitor overruns, suppression bypasses, or backlog discards.
DSP p99 was 0.2182 ms in the first phase and at most 0.1357 ms thereafter. Monitoring
had two initial zero-fill underrun reads and one after restart; these did not grow
in the following phases. MMCSS registration succeeded. The deliberately mismatched
44.1 kHz playback source fell back from low-latency mode on the 48 kHz endpoint
and continued rendering. Three additional microphone-quality cycles completed
with zero capture overruns or suppression bypasses.

These short checks do not measure acoustic round-trip or Bluetooth transport delay,
nor qualify sustained load, unplug/reconnect, killed-host recovery, default endpoint
changes, or the full app's tray lifecycle. There was no audible monitoring trial:
test monitoring volume was zero. No active development host was replaced or stopped.
To load the changes in development, fully quit the current app (including its tray
instance), then run `bun run dev` without `SWITCHBOARD_SKIP_NATIVE_BUILD=1`; startup
rebuilds the native hosts into `.switchboard/dev-hosts`.
