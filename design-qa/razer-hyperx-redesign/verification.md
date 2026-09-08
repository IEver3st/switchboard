# Razer and HyperX workbench verification

Implemented in the existing dirty Switchboard checkout; unrelated edits preserved. No commit, package, release, or physical hardware writes.

## Rendered evidence

Native Electron using isolated user data and canonical device fixtures. Reviewed 1080x720 requested (Windows reports 1080x722 content), 1420x900, and 1920x1080. Keyboard and microphone lighting on/off captured at supported sizes; additional disconnected, partial transport unavailable, reduced-motion, and 150% zoom / 720 CSS-pixel-width states captured. No horizontal overflow. Routine controls remain in the first viewport at supported sizes. Narrow zoom layouts scroll vertically.

Keyboard: profile selection, Gaming Mode, all seven lighting effects, conditional color control, color preview/commit, brightness by keyboard, lighting toggle, and renderer reload persistence passed.
Microphone: input volume, direct monitoring, brightness, effect speed, all three lighting profiles, all three patterns, lighting toggle, follow-mute toggle, and renderer reload persistence passed. Injected rejected write first reproduced a stale slider value; corrected slider restores canonical value and passes the regression.

An independent pixel review identified the keyboard photograph backdrop in the off state, inconsistent microphone slider thumbs, and ambiguous Live status. Corrections were rendered again. Off-state screenshots now wait for both canonical state and transitions to settle; report records unchecked switches and 2px thumb translation. Keyboard matte preserves enclosed dark hardware in its regression test.

## Deterministic checks

- bun run test: 305 pass, 3 skipped, 0 fail; Capture.Host and Audio.Host deterministic tests passed.
- bun run check, check:source, check:types, build, and git diff --check passed.
- frontend-design source audit: no errors; one pre-existing warning for the mouse color-picker outline removal, with a visible focus replacement confirmed immediately below it.

Reproduce: bun run build, then node scripts/run-native-review.mjs equipment.

## Evidence boundaries

Fixtures prove rendered UI, IPC/state transitions, and failure handling, not physical device acknowledgement, reconnect behavior, or lighting output. No screen-reader or forced-colors session was performed. No independent Rapid Trigger/Snap Tap control protocol was added.

Razer support verified 2026-09-04: Huntsman V2 Analog Rapid Trigger requires Synapse running; Snap Tap is explicitly not supported on this model. Shared capability catalog now matches current vendor guidance. See docs/razer-huntsman-v2-analog-mvp.md for source links.
