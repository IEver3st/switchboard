# WH-1000XM6 control transport

Switchboard controls the WH-1000XM6 over Sony's proprietary MDR protocol. Audio continues to use the ordinary Windows A2DP/HFP profiles; configuration messages use a separate authenticated and encrypted Bluetooth Classic RFCOMM socket. No realtime audio crosses Electron IPC.

## Transport

- Preferred service: MDR v2 UUID `956C7B26-D49A-4BA8-B03F-B17D393CB6E2`.
- Compatibility fallback: MDR v1 UUID `96CC203E-5068-46AD-B32D-E316F5E069BA`.
- Last-resort SDP fallback: RFCOMM channel 9, used only when Windows reports that neither service UUID is available. A timeout does not cascade through all fallbacks.
- On Windows, a UUID-based `SOCKADDR_BTH` client endpoint must use port `0`; channel `9` is used only with an empty service UUID. The native structure is packed to the Windows 30-byte layout.
- The host requests RFCOMM authentication and encryption, bounds connection attempts to eight seconds, and owns the socket outside Electron main.

The renderer never sees Bluetooth addresses, raw packets, or generic socket operations. The flow is:

`RFCOMM host -> Sony MDR session/framing -> WH-1000XM6 adapter -> canonical device contract -> Electron IPC -> renderer projection`

## Protocol behavior

Sony MDR frames use escaped delimiters, a checksum, an alternating sequence bit, and an acknowledgement for every frame. Switchboard serializes commands and does not report a new control value after an ACK alone. It issues a state query and waits for a matching reply or notification before the renderer receives the new state.

The XM6 firmware found in the field uses more than one ambient-control and equalizer query subtype. At connection time Switchboard probes the known XM6 variants, records the subtype the device actually returns, and echoes that subtype on later writes. A capability is exposed only after the headphones report it.

Implemented state families:

- battery and charging state, plus a nominal remaining-playback estimate derived from Sony's 30-hour noise-cancelling/Ambient Sound rating when the headphones are discharging
- Noise Cancelling, Ambient Sound, Off, ambient level, and Focus on Voice
- ten-band EQ, device-resident presets, and the writable Custom curve when ten bands are reported
- DSEE Extreme
- Speak-to-Chat enabled state
- Standard, Background Music, and Cinema listening modes; Background Music also reports the perceived-room parameter

Listening mode is derived from two independent hardware flags: Background Music (`AUDIO` subtype `0x09`) and Cinema upmix (`AUDIO` subtype `0x04`). Standard means both are off. A mode change disables the mutually exclusive flag first, reads both flags back, and completes only after the derived mode matches the request.

## Availability and reconnection

Supported controls carry an explicit availability state: available, temporarily unavailable, or read-only. Missing capabilities are unsupported. A disconnected control socket retains the last confirmed values for context but marks them temporarily unavailable.

Automatic reconnect uses bounded exponential delays and pauses after five unsuccessful attempts. A Windows disconnected-to-connected transition resets the budget. The UI also exposes a manual Retry action.

## Evidence and remaining physical validation

The Windows service cache for the paired test device advertised the MDR v2 UUID and RFCOMM channel 9. The original Switchboard endpoint failed locally with `socket-addressnotavailable`; changing UUID-based connects from port `uint.MaxValue` to port `0` reaches the remote device and now returns the expected bounded `socket-timedout` while that headset is powered off.

Packet codecs, dialect parsing, endpoint construction, timeout behavior, type contracts, static interaction, production build, and native Electron layouts are covered locally. A powered-on WH-1000XM6 is still required to complete physical write/readback proof for ANC, ambient level, EQ, DSEE Extreme, Speak-to-Chat, all three listening modes, external-controller synchronization, disconnect-during-command, power-cycle recovery, and shutdown. Do not treat fixture or packet-test results as that physical proof.

The remaining-playback value is explicitly an estimate rather than device telemetry. Sony rates Bluetooth music playback at up to 30 hours with noise cancelling or Ambient Sound enabled, while codec, EQ, DSEE Extreme, Speak-to-Chat, temperature, and other settings can reduce actual runtime. Switchboard therefore derives minutes only while discharging and does not mislabel that value as time-to-full while charging.

Reference implementations used for protocol comparison:

- [Gadgetbridge Sony support](https://codeberg.org/Freeyourgadget/Gadgetbridge)
- [SonyHeadphonesClient](https://github.com/Plutoberth/SonyHeadphonesClient)
- [xm6-macos-controller](https://github.com/shellingtonshreyas/xm6-macos-controller)
- [xm6-control](https://github.com/ruimartins23/xm6-control)
