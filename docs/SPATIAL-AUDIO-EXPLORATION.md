# Headphone spatial audio and optional head tracking

Implemented locally on September 27, 2026. Open **Audio → Spatial** after enabling
application routing. This is a real native binaural stereo stage for ordinary
stereo headphones, with built-in headset motion input or optional OpenTrack. It is not an Atmos
decoder or a discrete 5.1/7.1 transport.

## Listening and tracking

1. Select physical headphones as the Game, Chat, and Media outputs and start the
   audio engine. The existing VB-CABLE or Switchboard transport must be working.
2. In Spatial, enable the seven-speaker soundstage. Focused, Natural, and Cinema
   set immersion and room distance. Select or drag front, center, side, and rear
   speakers; adjust their angle, elevation, distance scale, level, and mute.
   Stereo mode uses the front pair and its stage-width control.
3. Enable head tracking with **Headset sensor** for a Windows-accessible Android
   Head Tracker HID sensor. No separate tracker application is needed for this path.
   Choose **Connect headset sensor** if a supported Sony headset's input service
   has not been registered. This changes only its Bluetooth HID service.
4. Face the screen and choose **Center stage** after motion data arrives. Yaw,
   pitch, and roll rotate the listening perspective; translation is not used.
5. Alternatively choose OpenTrack, set its output to **UDP over network**,
   destination **127.0.0.1**, matching port **4242**, and 1:1 rotation mappings.

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

`scripts/repair-xm6-head-tracker.ps1` inspects by default. From an administrator
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
The latest local hardware readback still reports Code 10 with the original sensor
driver; no live XM6 pose stream has been verified. The user's reported repair
success has not yet been confirmed by device readback.

## Native signal path

Each physical personal-listening output has a `SpatialSampleProvider` after its
existing channel processors and mixer. Stream, clip, virtual microphone, and
microphone-monitor paths bypass spatial processing. Both `RoutingEngine` and
`CableRoutingEngine` use the same renderer and one tracker session per engine.

The renderer derives seven virtual sources from the stereo input and convolves
each with measured
MIT KEMAR left/right ear responses. The bundled diffuse-field dataset covers 368
measured directions, expanded by ear symmetry. `scripts/build-kemar.py` checks the
original ZIP SHA256 and reproducibly resamples the 44.1 kHz data to 48 kHz using a
windowed sinc. Filters are padded to 160 taps; measured interaural timing remains
in the responses. Three nearest spherical measurements are interpolated. The
inverse calibrated head quaternion transforms the source positions. Filter
changes crossfade over 128 frames; orientation smoothing is approximately 20 ms.
Front sources retain left/right; center uses their average; side sources use
stereo difference; rear sources use weighted crossfeed with short staggered
reflections. Immersion controls side/rear weighting and reflection delay. Distance
controls fractional propagation delay and inverse-square-root gain, with delay
slewing to avoid discontinuities. Each source has independent direction, height,
distance scale, gain, and mute. Stereo and surround sums have conservative headroom
and a final peak guard. Wet/dry changes ramp over 20 ms.

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

Optional OpenTrack binds exclusively to IPv4 loopback, never the LAN. It accepts exactly 48
bytes: six little-endian doubles (translation x/y/z, yaw/pitch/roll in degrees).
Non-finite, out-of-range, short, and oversized datagrams are ignored. A background
receiver publishes only the latest immutable pose. Audio callbacks take no locks,
allocate no memory, do no I/O, and never use Electron IPC.

A pose expires after 500 ms. The audio thread then smoothly returns to the fixed
stage; fresh packets recover tracking. Connection status uses the existing host
five-second status publication, so UI status can lag the audio fallback by up to
five seconds. Recenter validates freshness again in the host. Disabling tracking,
spatial playback, or the audio engine closes the chosen sensor/socket and joins its receiver.
No tracking timer or additional process remains. Disabled DSP becomes a direct
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
