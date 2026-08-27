# Switchboard audit - initial pass

Date: 2026-08-27

## Scope

Combined product, accessibility, architecture, and validation audit of the current Electron checkout. The primary flow is Devices -> Audio -> Capture -> Settings. Native captures use the repository's isolated fixture mode; physical hardware behavior is outside this pass.

## Visual contract for remediation

- **Surface and job:** Switchboard's desktop control plane; expose connected hardware, the complete audio chain, replay capture, and settings without hiding routine work.
- **Visual authority:** `AGENTS.md`, `ARCHITECTURE.md`, `PERFORMANCE.md`, the incumbent Electron renderer, and the initial native captures in `initial-native-fixtures/`.
- **First viewport:** Current state and routine controls remain visible at 1080x720; capture and audio retain their deliberate dense workbench layouts.
- **Hierarchy and density:** Compact continuous console. Work surfaces dominate; navigation and diagnostics remain secondary.
- **Type roles:** Existing display, section, body, label, metadata, and tabular-number roles remain unchanged.
- **Color and material:** Dark neutral surfaces, quiet borders, cyan interaction accent, semantic warning/error/success colors. No new gradients, glow, glass, or routine shadows.
- **Control grammar:** Existing Radix/shadcn switches, selects, tabs, sliders, popovers, and semantic buttons. No renderer-only state.
- **Signature:** Real device renders and the continuous mixer/capture workbenches.
- **Anti-reference:** Generic dashboard cards, oversized empty layouts, and convincing controls that do not round-trip through the canonical contract.
- **Critical states:** Device lighting off, disabled channels, capture stopped/recovering/error, settings disabled, empty clip library, keyboard focus, and reduced motion.
- **Responsive constraints:** 1080x720 minimum, 1420x900 review target, 1920x1080 large desktop; no page-level horizontal overflow.

## Flow evidence

1. **Devices - needs repair.** The four-device gallery is responsive and has no horizontal overflow, but the Huntsman V2 Analog becomes nearly indistinguishable from the background when its lighting is off.
2. **Audio - healthy.** The mixer preserves the complete signal chain and ChatMix at 1080x720. Disabled channels explain their state and expose recovery actions.
3. **Capture - minor clarity issue.** The source control and dense library fit at 1080x720, but the unqualified footer value `Not selected` reads as if it contradicts the selected `Display 1`; it is actually the encoder state.
4. **Settings - healthy.** The takeover layout, category navigation, switches, reset actions, and Back control remain visible without horizontal overflow.

## Findings

### A1 - Blocker - deterministic suite is red

`bun run test` stops after 165 passing tests because `tests/startup-readiness.test.ts` imports the Electron IPC module under Bun and fails before its Electron mock can supply the named `ipcMain` export. The startup contract already has a pure `getStartupSnapshot` boundary, so the test should exercise that boundary directly.

### A2 - Major - native audit is not deterministic by default

`bun run review:native` repeatedly timed out during HID enumeration and did not complete the baseline capture. Running the same native review with `SWITCHBOARD_NATIVE_FIXTURES=1` completed 16 screenshots at four viewports in 4.7 seconds. The review harness should opt into fixture isolation itself while leaving explicit hardware verification to the hardware-specific commands.

### A3 - Major - keyboard off state loses the product silhouette

At 1080x720 and 1420x900 the official Huntsman photograph is processed with lighting off, but neutral keyboard material is not lifted for the dark stage. The model is present yet visually disappears. The off-state pipeline should retain the opaque official photograph and restore only the existing bounded neutral-shadow lift.

### A4 - Minor - encoder state is unlabeled in the capture toolbar

The capture meta row renders only `runtime.encoderLabel`. When the value is `Not selected`, it appears opposite a visibly selected capture source and creates an avoidable state contradiction. Prefix the value with `Encoder` while preserving the canonical runtime value.

### A5 - Major - the full native audit cannot reach disabled audio channels

The second pass stopped at `#audio/chat` because the saved Chat bus was disabled, so the renderer correctly redirected to Mixer while the harness waited for a tab that could not exist. The audit must enable each requested channel through the typed preload contract before navigating, preserving the disabled-state Mixer capture that runs first.

## Evidence limits

- The native fixture pass proves Electron rendering, responsive geometry, and deterministic renderer state; it does not prove HID writes, physical lighting, audio routing, encoder output, capture ring behavior, or device reconnects.
- Screenshot inspection cannot establish full WCAG compliance. Keyboard focus, screen-reader output, forced colors, and reduced motion still require direct checks.
- Long-running performance and handle-growth budgets require the documented soak tests.
