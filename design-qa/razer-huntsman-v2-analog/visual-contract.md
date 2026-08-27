# Huntsman V2 Analog workbench visual contract

- **Surface and job:** Devices > Huntsman V2 Analog. Daily control of the active onboard profile, gaming input behavior, and firmware lighting without opening Synapse.
- **Visual authority:** Switchboard's Logitech mouse workbench owns product grammar and density. The supplied Synapse screenshots own feature grouping and control semantics, not styling.
- **First viewport:** The real keyboard render, active onboard profile, Gaming Mode, lighting state, effect, brightness, and contextual color remain visible at 1420 x 900. Unsupported input configuration and implementation diagnostics are absent from the workbench.
- **Hierarchy and density:** One open hardware stage followed by a compact profile/mode rail and one continuous lighting section. The device is primary, routine controls are secondary, and firmware/readback metadata is available through a small information tooltip and Diagnostics.
- **Type roles:** Existing Switchboard title and section roles; compact uppercase metadata; tabular numerals for millimetres, brightness, and polling rate.
- **Color and material:** Existing neutral console surfaces and hairline separators. Cyan is reserved for selection/focus; green and amber communicate verified device state and unavailable ownership. No chroma decoration, gradients, glow, or floating cards.
- **Control grammar:** `Select` for onboard profile, `Switch` for real booleans, `ToggleGroup` for firmware effects, a slider for brightness, and a popover color picker only when the selected effect accepts color.
- **Signature:** The official keyboard render provides immediate whole-device color, brightness, and on/off feedback while remaining honest that per-key writes are unavailable.
- **Anti-reference:** Avoid the incumbent boxed product stage, diagnostic readouts, unsupported toggles, disclaimer copy, equal-weight cards, and controls that only mutate renderer state.
- **Critical states:** Connected, disconnected, partially available readback, command pending, command rejected, disabled lighting, contextual color hidden, keyboard focus, and reduced motion.
- **Responsive constraints:** No page-level horizontal overflow at 1080 x 720. Reflow the control desk below 1180 px; preserve critical status and routine controls before mandatory scrolling. Also inspect 1420 x 900 and 1920 x 1080.
