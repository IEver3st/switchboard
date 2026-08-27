# Razer Huntsman V2 Analog integration audit

## Integration boundary

Switchboard identifies the Huntsman V2 Analog by USB VID/PID `1532:0266` and uses only its interface 3 consumer-control collection (`usagePage 0x0c`, `usage 0x01`) for low-frequency feature reports. The renderer receives capability and state snapshots through the canonical device contract; it never receives a HID path, report payload, or generic IPC primitive.

The integration deliberately does not stream realtime RGB frames. Discovery uses Switchboard's five-second `node-hid` cycle, while module operations are serialized. Each supported write is followed by a hardware read and the confirmed value is what the registry publishes. Failed writes leave the previous canonical value in place.

## Capability audit

| Capability | Classification | Switchboard behavior |
| --- | --- | --- |
| Device/interface identification | Confirmed implementation | Matches `1532:0266` and the dedicated interface/usage tuple instead of selecting an arbitrary collection. |
| Firmware and serial reads | Implemented; independently fallible | Published as device metadata when returned. A failure no longer disables unrelated controls. |
| Brightness | Confirmed protocol path | Reads and writes 0–100%; every write is reconciled with a brightness read. |
| Quick lighting effects | Confirmed protocol path | Off, static, breathing, spectrum, reactive, starlight, and both wave directions. Effect writes are read back. Only effects reported by firmware are exposed. |
| Quick-effect color | Confirmed for color-bearing effects | One color is exposed for static, breathing, reactive, and starlight. Spectrum and wave omit the irrelevant color control. |
| Effect speed/duration | Unsupported by this implementation | Existing packets contain fixed firmware parameters; no independently verified read/write model exists, so no speed or duration UI is shown. |
| Gaming Mode | Confirmed protocol path | Reads and writes the Windows-key Gaming Mode state, followed by readback. |
| Onboard profile selection | Confirmed protocol path | Selects a profile ID reported by the keyboard and reads the active ID back. Switchboard does not overwrite profile contents. |
| Adjustable actuation / dual-step input | Hardware capability; unsupported by Switchboard | The keyboard supports it, but the profile payload and safe write protocol are not verified. No control is rendered. |
| Analog controller mapping | Hardware capability; unsupported by Switchboard | Joystick/trigger mapping remains outside the verified integration. No per-key editor is rendered. |
| Remaps, macros, and Hypershift | Unsupported by Switchboard | No undocumented key-map or macro payload is written. |
| Rapid Trigger | Unsupported/unverified for this model | Current Razer Rapid Trigger guidance does not list the Huntsman V2 Analog, and the attached V2 firmware rejected the newer standalone command. No control or capability claim is rendered. |
| Snap Tap | Synapse-owned | Razer lists the Huntsman V2 Analog as supported through Synapse 4, but no independent device command is verified here. It appears only as diagnostic capability context, not as a device-page toggle. |
| Per-key lighting / custom animation | Deliberately unsupported | No high-frequency frame stream or fake keyboard selection surface is exposed. |
| Polling rate | Product metadata only | Reported as 1,000 Hz; Switchboard does not present a polling-rate control. |

## State and failure model

The main process owns the device snapshot and persisted settings. Renderer controls submit a narrow `DeviceControlChange`, show a pending state, and wait for the returned canonical snapshot. The Razer module returns `confirmedChanges`; the registry applies those confirmed values rather than reapplying the user's requested value. This prevents rounding or firmware normalization from being overwritten in renderer state.

Discovery and writes share one module queue. Probe reads are independent, so an unsupported firmware query can coexist with working brightness or Gaming Mode. Feature responses that are stale, truncated, or belong to another pending command are retried before the operation fails. This matters when another installed Razer process is also communicating with the device.

HID enumeration and Razer open/send/read/close operations have explicit deadlines. A stuck Windows HID call therefore cannot hold startup or a control promise indefinitely, and the registry reuses one in-flight enumeration instead of accumulating native scans while a prior one is stalled.

Consumer errors are intentionally short and actionable. Detailed response, checksum, command-status, and failed-read information is retained under Settings → Diagnostics together with endpoint health and last synchronization time. The normal device page does not expose transport names, endpoint readiness, readback claims, or protocol limitations.

## Device-page contract

The primary page exposes only capabilities backed by a real state transition:

- compact onboard-profile selection;
- Gaming Mode;
- lighting enabled state;
- firmware-reported quick effects;
- brightness;
- a color picker only for effects that accept a color.

The keyboard render previews the current whole-device quick effect, brightness, enabled state, and in-progress color choice. It is not clickable because the backend cannot persist per-key or zone state. Rapid Trigger, Snap Tap, analog mapping, actuation, remapping, and per-key lighting are absent rather than represented by inert or permanently excused controls.

## Evidence and remaining physical proof

Protocol tests cover report construction, checksum and response validation, quick-effect encoding, partial probe failure, stale/truncated response retry, confirmed readback publication, sanitized user errors, and detailed diagnostic retention. The native Electron fixture exercises profile, Gaming Mode, effect, color, brightness, lighting enable, reload persistence, and responsive layout at 1080×720, 1420×900, and 1920×1080.

Earlier attached-device work read firmware `1.06`, profile IDs `1` and `2`, brightness, effect, Gaming Mode, and active profile, then changed and restored supported values with readback. During this audit, Windows again confirmed the physical keyboard and expected control interface, but a later `node-hid` enumeration stalled after concurrent review processes had accessed HID. The hardware verifier therefore treats a complete readable baseline as a hard precondition and restores every attempted state in `finally`. A clean-process rerun of `bun run verify:razer-hardware` remains required before calling the current build physically revalidated.

Visual appearance, power-cycle persistence, analog mappings, and per-key behavior remain outside that verifier's proof.

## Sources

- [Razer support: Huntsman V2 Analog specifications, firmware, typing mode, and analog behavior](https://mysupport.razer.com/app/answers/detail/a_id/4023)
- [Razer Snap Tap supported-device list](https://mysupport.razer.com/app/answers/detail/a_id/14658/~/list-of-devices-that-support-razer-snap-tap)
- [Razer Rapid Trigger configuration guide and current applicable models](https://mysupport.razer.com/app/answers/detail/a_id/13665/~/how-to-customize-the-razer-keyboards-rapid-trigger-mode)
- [Razer Synapse manual: customization, actuation, lighting, and quick effects](https://dl.razerzone.com/master-guides/RazerSynapse3/HUNTSMANV2ANALOG-00000614-en.pdf)
- [OpenRazer supported-device table](https://github.com/openrazer/openrazer/blob/master/README.md)
- [OpenRazer keyboard driver implementation](https://github.com/openrazer/openrazer/blob/master/driver/razerkbd_driver.c)
- [OpenRazer analog-keyboard protocol investigation](https://github.com/openrazer/openrazer/issues/1579)
- [OpenRGB high-frequency update issue for this keyboard](https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/3538)
