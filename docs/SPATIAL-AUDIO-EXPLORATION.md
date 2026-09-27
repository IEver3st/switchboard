# Headphone spatial audio and optional head tracking

Implemented locally on September 27, 2026. Spatial audio is per channel: the **Spatial
audio** module on the Audio → Game, Chat and Media pages has its own stage (on/off,
room, speakers, immersion, distance, speaker layout). Head tracking is shared by all
channels. This is a real native binaural stage for ordinary stereo headphones, with
built-in headset motion input or managed OpenTrack. It is not an Atmos decoder or a
discrete 5.1/7.1 transport.

Each channel's renderer runs on that channel's personal-listening path before the
channels are mixed for a physical output; a channel that is off is a direct bypass.
Aux, stream, clip, virtual microphone and monitor paths are never spatialized. Saved
settings from the earlier single global stage migrate by copying it to every channel.

## Listening and tracking

1. Select physical headphones as the Game, Chat, and Media outputs and start the
   audio engine. The existing VB-CABLE or Switchboard transport must be working.
2. In Spatial, enable the seven-speaker soundstage. Focused, Natural, and Cinema
   set immersion and room distance. Select or drag front, center, side, and rear
   speakers; adjust their angle, elevation, distance scale, level, and mute.
   Stereo mode uses the front pair and its stage-width control.
3. Enable head tracking. **OpenTrack** works with any headphones: choose **Set up
   OpenTrack** once and Switchboard installs its own verified portable copy, then
   starts it hidden in the tray while tracking is on and closes it when tracking is
   off. **Webcam** input uses OpenTrack's neural-net face tracker; **Phone** input
   receives an OpenTrack-compatible phone app (for example SmoothTrack) on port 4243.
   No manual OpenTrack configuration is needed.
4. **Headset sensor** reads a Windows-exposed Android Head Tracker HID sensor.
   **Connect headset sensor** reopens a supported Sony headset's Bluetooth input
   service, and for the known XM6 Code 10 driver state runs the reviewed driver
   repair after Windows administrator approval.
5. Face the screen and choose **Center** after motion data arrives. Yaw, pitch,
   and roll rotate the listening perspective; translation is not used.

Fixed spatial playback works with ordinary stereo headphones. Head tracking needs
real orientation data from an integrated sensor exposed to Windows or the optional
OpenTrack input. Sensors that exist only behind unsupported vendor/ISO protocols
are not claimed compatible. Use one spatializer, with other surround effects off.

### WH-1000XM6 Windows driver recovery

On the local XM6, Windows had registered the Bluetooth input service without a
present input node. Cycling only that absent HID service exposed a real Android
Head Tracker device. Windows then bound `sensorshidclassdriver.inf`, which failed
with Code 10. Audio endpoints remained available. The app now identifies this
specific condition instead of repeatedly requesting a reconnect.

`scripts/repair-xm6-head-tracker.ps1` inspects by default. Audio.Host embeds the
same script and runs it with `-Apply` through a UAC prompt from **Connect headset
sensor** (or `--enable-headset-sensor`) only when that exact Code 10 state exists. From an administrator
PowerShell, `-Apply` can bind Microsoft's inbox `input.inf` to the exact failed XM6
tracker. It refuses ambiguous devices, different models, non-Code-10 states, or
other driver bindings; saves the prior binding; uses noninteractive installation;
and never changes audio services, pairing, signing policy, or initiates a reboot.
It prints readback and rollback guidance. This is an explicit maintenance step,
not an automatic background driver replacement. A successful API request still
requires a healthy device and actual sensor packets to establish tracking.

`Audio.Host --probe-head-tracking` reports discovered compatible sensors and
known driver errors. `--enable-headset-sensor` performs only input-service setup.
`--verify-head-tracking` performs three bounded sensor open/read/close cycles
without playing audio, reporting fresh observed poses and rotation range.
Local hardware readback on September 27, 2026: the HID service node had no
children (link closed). Cycling that empty service exposed the sensor with Code 10;
the approved repair bound `input.inf`; `--verify-head-tracking` then read about 90
fresh poses per cycle over three open/read/close cycles with 10-14 degrees of real
rotation. Motion-to-sound latency over Bluetooth is still unmeasured.

## Native signal path

Each physical personal-listening output has a `SpatialSampleProvider` after its
existing channel processors and mixer. Stream, clip, virtual microphone, and
microphone-monitor paths bypass spatial processing. Both `RoutingEngine` and
`CableRoutingEngine` use the same renderer and one tracker session per engine.

The measured MIT KEMAR left/right ear responses (368 diffuse-field directions,
expanded by ear symmetry, resampled to 48 kHz by `scripts/build-kemar.py`) are
prepared once at load, off the audio thread:

- Each response becomes a 128-tap minimum-phase filter plus a separate arrival
  delay per ear, so interpolation between the three nearest directions blends
  aligned filters and interpolates interaural timing instead of smearing onsets.
- Below 150 Hz the response is flat (blended in up to 300 Hz). The 1994
  measurement loudspeaker rolled off there while a real head is transparent;
  keeping the measured roll-off thinned bass and made the rest sound boxy.
- A third-octave frontal equalizer, weighted toward centre-panned content,
  keeps music through the front pair at the source timbre (limited to +/-12 dB).
  Relative differences between directions, the localization cues, are kept.

Every virtual speaker, its stereo feed and six first-order image-source wall
reflections are linear in the input, so they fold into ear filters (left->left,
left->right, right->left, right->right) rebuilt only when settings change or the
head turns more than about 0.3 degrees, at most once per 512-frame (10.7 ms) block,
crossfading across it; head orientation follows with about 20 ms smoothing. The
host always compiles optimized: an unoptimized Debug host needed 20-30 ms per
10 ms frame for the seven-speaker stage while the head moved, which broke up the
audio. `Audio.Host.Tests --spatial-motion` measures that case. The
front pair carries the plain channels at full band. Side and rear speakers carry
only the stereo difference with 6/12 ms Haas delays, so vocals and bass never
comb against delayed copies. Surrounds and reflections form a second filter bank
fed through a 200 Hz high-pass, so bass stays direct and tight. The room always
contains the speakers and grows with Distance; Immersion sets surround level and
wall reflectivity. Levels normalise to the plain front pair, so enabling the stage
keeps the mix level, and a soft knee replaces the hard clamp. Partial effect adds
dry signal aligned to the front speakers' arrival rather than a zero-delay blend.

`Audio.Host.Tests --spatial-response` prints third-octave ear responses for the
presets. Centre-panned audio in Focused, Natural and the stereo pair stays within
about +/-3 dB of bypass from 40 Hz to 12.5 kHz at matched level (the earlier
renderer measured +/-7 dB and about 10 dB quieter); the test suite enforces it.
Measured synthetic cost is about 0.23 ms per 10 ms frame with zero callback
allocations.

These are generic HRTFs, not personalized measurements. Existing routing supplies
a stereo source. The implementation cannot recover discrete rear/height channels
that a source has already downmixed, and it makes no competitive-localization or
Dolby compatibility claim. A future multichannel path must preserve channel layout
through capture and transport; the seven virtual sources here are stereo expansion.

## State and lifecycle

`audio.spatial` is persisted by main and validated with Zod. Narrow patches retain
omitted preferences. While audio runs, settings require native readback and an
active spatial route before main commits. Failure reconciles to confirmed state.
Old state files default spatial playback and tracking off. Renderer reloads do not
lose settings; live tracker connections and recenter calibration are not persisted.

Headset tracking enumerates standard Android HID 1.x or 2.x ACL-capable sensors.
Report identifiers, field lengths, scaling and feature controls come from HID
descriptors. Activation preserves original feature reports; disposal restores them,
cancels I/O and releases handles. Missing/disconnected sensors retry on the existing
five-second host control tick, only while tracking and spatial playback are enabled.
No pose stream crosses Electron IPC. Multiple sensors require disambiguation.

Switchboard's OpenTrack copy is `opentrack-2026.1.0-win32-portable.7z` from the
official GitHub release, SHA-256 pinned, extracted with Windows' inbox `tar.exe` to
`%LOCALAPPDATA%\Switchboard\OpenTrack\opentrack-2026.1.0` and marked portable, so
a personal OpenTrack install and its profiles are never read or changed. Main owns
installation (explicit action only, cancellable, staged then renamed). The audio
host owns the process: it writes `globals.ini` and a `switchboard.ini` profile
(neuralnet or UDP input, UDP output to 127.0.0.1 and the tracker port, raw 1:1
rotation, tray start) and launches `opentrack.exe`. OpenTrack has no command line;
its own process detector maps `opentrack.exe` to the Switchboard profile and starts
tracking about six seconds after launch. The process lives in a kill-on-close job,
is killed when tracking stops, and is relaunched at most every 15 seconds if it
exits. OpenTrack's positive yaw turns right and positive pitch looks up (confirmed
from its mouse output plugin), matching the receiver.

The receiver binds exclusively to IPv4 loopback, never the LAN. It accepts exactly 48
bytes: six little-endian doubles (translation x/y/z, yaw/pitch/roll in degrees).
Non-finite, out-of-range, short, and oversized datagrams are ignored. A background
receiver publishes only the latest immutable pose. Audio callbacks take no locks,
allocate no memory, do no I/O, and never use Electron IPC.

A pose expires after 500 ms. The audio thread then smoothly returns to the fixed
stage; fresh packets recover tracking. Connection status uses the existing host
five-second status publication, so UI status can lag the audio fallback by up to
five seconds. Recenter validates freshness again in the host. Disabling tracking,
spatial playback, or the audio engine closes the chosen sensor/socket and joins its receiver.
No tracking timer, socket or OpenTrack process remains. Disabled DSP becomes a direct
bypass after its fade. Endpoint recovery creates a fresh session with saved
settings and releases the old one first.

## Verification and remaining acceptance

`dotnet run --project engines/audio-host-tests/Audio.Host.Tests.csproj -c Release`
covers measured ear symmetry/delay, elevation, actual opposite-ear convolution,
head rotation changing DSP output, recenter, bypass, zero realtime allocations,
all seven sources and tuning fields, HID scaling/protocol/rotation decoding,
malformed packets, port conflicts, stale/reconnect, and repeated socket release. Synthetic callback measurements are
not end-to-end latency or physical-headphone evidence.

`tests/audio-spatial.test.ts` covers legacy defaults, narrow patches, rejected and
unacknowledged settings, reconciliation, and actual StateStore restart persistence.
`scripts/verify-spatial-ui.mjs` reviews the native Electron page offscreen at
1080×720, 1420×900, and 1920×1080, with real offline IPC/persistence and explicitly
simulated capability/tracker status. It does not start physical audio. Evidence
is under `design-qa/spatial-surround-20260927`. The earlier two-speaker review
is retained separately under `design-qa/spatial-20260927`.

Type checks, renderer build, source transpilation and structure checks pass.

Physical listening quality, tracker axis alignment on an actual device,
motion-to-sound latency (including Bluetooth), endpoint disconnect/default changes,
killed-host recovery, tray lifecycle, simultaneous outputs and long-running
handle/memory behavior still require live acceptance. No release was published.

## Sources and attribution

- [Google Android spatial architecture](https://source.android.com/docs/core/audio/spatial)
  separates spatial rendering from decoder and head-motion sensors.
- [MIT KEMAR dataset](https://sound.media.mit.edu/resources/KEMAR.html), Bill Gardner
  and Keith Martin, MIT Media Lab, 1994. Commercial/research use is unrestricted
  with author attribution. The application shows the attribution; the binary and
  notice are embedded in Audio.Host. See `engines/audio-host/Spatial/NOTICE.md`.
- [Android Head Tracker HID protocol](https://source.android.com/docs/core/interaction/sensors/head-tracker-hid-protocol)
  defines sensor identity, control reports and rotation vectors.
- [Sony Head Tracker reference](https://github.com/NicholasSlattery/sony-head-tracker/tree/602bde785541b80d6e4bbafa48b01adab95ca967)
  informed Windows service/driver recovery and HID interoperability. MIT attribution
  is retained in `engines/audio-host/Spatial/HEAD-TRACKER-NOTICE.txt` and embedded
  in Audio.Host. No external tracker application is installed or bundled.
- [OpenTrack UDP sender](https://github.com/opentrack/opentrack/blob/aa3d6dd09fb2ecf4a5bf91536ca67b4f71b24613/proto-udp/ftnoir_protocol_ftn.cpp)
  defines the six-double payload. The adapter is independently implemented; no
  OpenTrack source or binaries are bundled.

## EQ and channel presets

Game, Chat, Media, and Microphone retain the earlier 0–64-band editor with
hover-to-add, keyboard Add/Remove, filter type, bypass and exact values. Presets
include Night play, Warm, and Dialogue with descriptions and saved-preset groups.
Spatial stage presets are separate because they affect personal listening across
channels, while EQ presets belong to individual processing paths.
