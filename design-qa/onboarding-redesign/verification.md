# Onboarding redesign verification

## Implemented

Centered setup composition, stronger welcome and step headings, a simplified progress rail, explicit Back navigation, and a layered flowing contour background. The background moves slowly on two cached HTML layers, with a pause control. Reduced motion responds to changes while onboarding is open and disables all onboarding motion.

The existing controls, capture configuration, workspace selection, canonical store operations, and completion behavior are retained. No dependency was added. Existing unrelated working-tree changes were preserved.

## Evidence

- Native Electron captures of all five steps at 1080 x 720, 1420 x 900, and 1920 x 1080. No horizontal overflow or initial vertical scrolling in the normal flow.
- Captured transition frames, pending/disabled controls, and an injected settings-save error in an isolated profile.
- Keyboard activation of Back and Get started, completed-step navigation, both workspace presets, completion, and persisted workspace/completion state after reload.
- Reduced-motion emulation: zero running animations immediately after step navigation and after settling.
- Pixel-first independent critique found no remaining major visual issues. Heading focus treatment and excessive background contrast were repaired. Supporting text uses balanced line endings to avoid a stranded final word.
- The harness now reasserts and validates actual viewport dimensions after settings updates, preventing a restored/maximized window from being mislabeled as a compact capture.

## Checks

Passed: `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, `git diff --check`, and the frontend-design source audit (zero findings).

`bun run test`: 291 passing, 3 skipped, zero failures; Capture.Host and Audio.Host deterministic suites passed.

Reproduce native evidence with `node scripts/run-native-review.mjs onboarding` after building. See `native-review-confirmed.log` for dimensions and interaction assertions; `tests.log` and `build.log` retain check output.

## Evidence limits

The native review uses an isolated fixture profile. This is renderer, interaction, and settings-persistence evidence, not physical-device or capture-quality validation. Full screen-reader, forced-color, high-zoom, empty-device, disconnected-device, and long-running performance checks were not performed. The settings-error fixture exposes the existing Electron IPC error prefix; error-message normalization was not changed by this visual redesign.

## Animation performance repair

The initial animated SVG groups rerasterized the contour artwork during movement. `node scripts/run-native-review.mjs onboarding-animation --label=before` reproduced the regression at 1920 x 1080: 25 animation-frame callbacks in about three seconds, p95 frame interval 145.9 ms, and 675 raster tasks. Pausing the same background yielded 721 callbacks, p95 4.3 ms, and zero raster tasks.

Moving the unchanged static SVG artwork onto two cached HTML transform layers eliminated repeated rasterization. The first after sample yielded 720 callbacks, p95 4.3 ms, and zero raster tasks while animated. This is a short native requestAnimationFrame/Chromium trace comparison on this 240 Hz environment, not a presentation-frame guarantee or a 60-second idle-budget measurement. The harness disables background/occlusion throttling so unattended foreground changes do not corrupt the comparison.

The regression harness compares active and paused frame cadence at the same viewport, requires at least 150 callbacks over three seconds, and validates pause/resume/reduced motion. `animation-before.json` and `animation-after.json` retain the measurements. `optimized-*.png` retain the final three native review sizes.
