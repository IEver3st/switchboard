# QuadCast device-page visual contract

- Surface and job: QuadCast 2 hardware controls; inspect state and adjust microphone or lighting behavior quickly.
- Visual authority: the current task brief, `AGENTS.md`, and Switchboard's existing continuous-console primitives.
- First viewport: the microphone render is the focal object; essential microphone controls follow immediately; lighting and advanced hardware behavior recede in that order.
- Hierarchy and density: one integrated page background, compact metadata, aligned settings, and no card-like control clusters.
- Type roles: device name, section labels, control labels, right-aligned tabular values, then muted metadata.
- Color and material: primary page background throughout; pink only for active controls; semantic status dots; borders reserved for actual controls.
- Control grammar: sliders for continuous values, Switch for booleans, ToggleGroup for profiles and patterns, Tooltip for secondary hardware detail.
- Signature: the large real QuadCast render transitions directly into its hardware console without a separate product canvas.
- Anti-reference: a generic dashboard made from panels, prose, dividers, status badges, or decorative lighting effects.
- Critical states: connected, disconnected, mute unknown/muted/live, lighting off, solid pattern without speed, animated pattern with speed, and unavailable hardware state.
- Responsive constraints: native Electron at 1080x720, 1420x900, and 1920x1080 with no horizontal overflow; the short-window layout may use two columns to keep routine controls available.
