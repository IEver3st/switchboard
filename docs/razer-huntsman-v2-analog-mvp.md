# Razer Huntsman V2 Analog MVP

## Scope

Switchboard supports the Razer Huntsman V2 Analog (USB VID/PID `1532:0266`) as a keyboard with a deliberately narrow native-control surface. The MVP reads firmware and brightness, writes brightness with immediate readback, and sends acknowledged device-firmware quick-effect commands. It does not run a background RGB frame stream.

The module keeps unsupported key features visible as capability information with their current owner. It does not render inert versions of Synapse controls.

## Researched keyboard surface

| Capability | Keyboard support | MVP owner | Notes |
| --- | --- | --- | --- |
| Adjustable actuation | Per-key, 1.5–3.6 mm | Synapse | Native profile/actuation packets are not documented or safely verified. |
| Dual-step actuation | Two actions at distinct press depths | Synapse | Not written by Switchboard. |
| Analog controller mapping | Joystick axes and controller triggers | Synapse | Not written by Switchboard. |
| Key mapping | Remapping, macros, Hypershift, Gaming Mode, profiles | Synapse | Undocumented profile writes are out of scope. |
| Rapid Trigger | Present in the supplied current Synapse UI | Observed | No native command path has been verified. |
| Snap Tap | Present in the supplied current Synapse UI | Observed | Razer's public compatibility page currently conflicts with the supplied UI, so Switchboard makes no support claim. |
| Quick lighting | Static, breathing, spectrum, reactive, starlight, wave, wheel, off | Switchboard | Low-frequency HID feature reports; effect writes provide acknowledgement but no effect readback. |
| Brightness | 0–100% | Switchboard | Every write is followed by a hardware brightness read. |
| Per-key/custom animation | Chroma-capable hardware | Not in MVP | Continuous frame streaming is intentionally excluded. |

The hardware also advertises 1,000 Hz polling, per-key Chroma RGB with underglow, a multi-function digital dial, four media keys, USB passthrough, onboard profiles, and on-the-fly macro recording. These describe the product; they are not implied Switchboard controls.

## Why direct HID for the MVP

Razer's Chroma SDK is a lighting API and requires the Razer Chroma SDK core/Synapse environment. It does not cover actuation or key mappings. The direct endpoint gives this narrow module an independent brightness and quick-effect path while preserving Switchboard's process boundaries.

The control collection is HID interface 3, usage page `0x0c`, usage `0x01`. Each operation:

1. Opens the exact path non-exclusively.
2. Sends one 91-byte feature report.
3. validates transaction, command, response status, and XOR checksum.
4. Reads brightness when the command has a readable state.
5. Closes the handle in `finally`.

There is no long-lived handle, module timer, or encoder/session. Device presence still uses Switchboard's documented five-second `node-hid` discovery cycle, which stops with the registry.

## Evidence and limits

On the attached physical keyboard, the dedicated endpoint was found while Synapse 4 was running. Firmware read returned `1.06`. A brightness write/readback round trip succeeded and the original value was restored. A spectrum quick-effect command returned the device success status. This proves packet acceptance and brightness state, not visual appearance, power-cycle persistence, per-key writes, or actuation/profile safety.

High-frequency/custom-frame lighting remains excluded. OpenRGB has a Huntsman V2 Analog report in which rapid updates caused double typing, so this MVP only sends commands in direct response to user changes.

## Sources

- [Razer support: Huntsman V2 Analog specifications, firmware, typing mode, and analog behavior](https://mysupport.razer.com/app/answers/detail/a_id/4023)
- [Razer product announcement: analog input, 1.5–3.6 mm actuation, and dual-step actuation](https://www.razer.com/newsroom/product-news/razer-huntsman-v2-analog-keyboard-unlocks-full-versatility-with-a-new-dimension-of-input)
- [Razer Synapse manual: customization, actuation, lighting, and quick effects](https://dl.razerzone.com/master-guides/RazerSynapse3/HUNTSMANV2ANALOG-00000614-en.pdf)
- [Razer analog controller binding guide](https://mysupport.razer.com/app/answers/detail/a_id/4532/kw/huntsman%2Bchroma)
- [Razer Snap Tap compatibility page](https://www.razer.com/ca-en/technology/razer-snap-tap)
- [Razer Chroma SDK setup requirements](https://developer.razer.com/works-with-chroma/setting-up/)
- [OpenRazer device table and Huntsman V2 Analog USB ID](https://github.com/openrazer/openrazer/blob/master/README.md)
- [OpenRGB Huntsman V2 Analog detector](https://gitlab.com/CalcProgrammer1/OpenRGB/-/blob/35c5d99a80db09ca0cd037ae3fc84e6fcbd40978/Controllers/RazerController/RazerControllerDetect.cpp)
- [OpenRGB high-frequency update issue for this keyboard](https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/3538)
