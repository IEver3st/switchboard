# Switchboard main-app audit — September 5, 2026

Implementation integrity: **pass, with the repairs below**. The application keeps its hardware imagery, continuous workspaces, shared controls, semantic channel colors, and main-owned state. No replacement visual direction or dependency was needed.

## Scope and score

Impeccable technical audit, using the Electron renderer's web implementation and the Windows window requirements in DESIGN.md. The mobile-native playbook does not apply to this desktop app.

Reviewed the shell, device gallery, G502, Huntsman, QuadCast, Capture library, Replay settings, General, Capture settings, Modules, About, Audio mixer, and Audio microphone workspace. Audio was inspected with Developer mode enabled and its engine stopped.

| Dimension | Before | After | Evidence and limit |
| --- | --- | --- | --- |
| Accessibility | 2/4 | 3/4 | Fixed measured contrast failures and weak text-field focus. Chromium accessibility trees had no unnamed controls in the sampled routes. This is not a full screen-reader or WCAG certification. |
| Performance | 3/4 | 3/4 | Existing route splitting, bounded artwork cache, virtualized clip collection, and demand-driven audio meters retained. Removed an unnecessary width transition. No fresh CPU, startup, or soak benchmark. |
| Responsive design | 3/4 | 3/4 | Native layouts reviewed at 1080×720, 1420×900, and 1920×1080. No page or sampled scroll-container horizontal overflow. |
| Theming | 3/4 | 4/4 | Corrected affected text to existing readable tokens; retained the product palette and channel identities. |
| Implementation integrity | 3/4 | 4/4 | Unavailable Replay and locked Audio module controls now explain their actual state. |
| **Total** | **14/20** | **17/20** | **Good; scores describe this scoped review, not release readiness.** |

## Findings and actions

**P1 — Repeated low-contrast text. Fixed.** Navigation labels measured 4.24:1; module metadata 4.21:1; locked workspace status 3.98:1; audio readouts 3.82:1; polling units 2.93–3.31:1. Populated clip timestamps measured 4.07:1. These are small informative text, requiring 4.5:1 under WCAG 1.4.3. Updated the affected selectors in `src/renderer/src/globals.css`, `components/audio/audio.css`, and `components/device-controls/mouse-device.css` to use `--text-description` or full inherited control color. Polling units now use 9px rather than the previous 7px mouse override. The wide-layout Mix label received the same correction. Command family: colorize/typeset.

**P1 — Text-input focus was too subtle. Fixed.** Shared Input only changed to the hover background/border; InputGroup used an 18%-opacity focus ring. Added a solid token-based two-pixel ring for the shared controls. Verified focused module search and clip search, including their empty-result states, in native Electron with browser focus emulation while the native window stayed hidden. Command family: harden.

**P2 — Replay offered an unavailable action. Fixed.** Capture's header reported Off and accepted an enable action while the same screen said capture was unavailable. `CaptureHeader.tsx` now reports Unavailable, describes the Replay switch with the status, and disables starting when the canonical backend is unavailable. An already-enabled recorder remains stoppable. Replay settings also explain the unavailable backend while the recorder is off. Command family: harden/clarify.

**P2 — Audio module bypassed the visible Developer mode boundary. Fixed.** Modules offered an enabled switch that main would reject with Developer mode off. The row and details dialog now disable that action and explain “Developer mode required.” Turning Developer mode on unlocks the control through the canonical snapshot. Turning an existing module off remains possible. The explanatory label wraps instead of being truncated at compact widths. Command family: harden/clarify.

**P2 — Capture recovery copy directed ordinary users to hidden Diagnostics. Fixed.** The notices now describe the available Replay retry action without depending on the developer-only Diagnostics page. Command family: clarify.

**P3 — Decorative width transition. Removed.** The detector identified a width transition on `.device-render__ground`. Removed that transition while retaining its opacity transition. This removes unnecessary layout animation; no measured performance improvement is claimed. Command family: optimize.

Total: **0 P0, 2 P1, 3 P2, 1 P3**, addressed. The contrast finding groups repeated instances of the same problem.

## Detector interpretation and positive findings

`detector.json` recorded two findings. The remaining Arial warning in `video-edit-controls.css` refers to a font preview for editable video text, not a competing application typeface. It was retained intentionally. Shared controls flagged for `outline-none` require contextual review: the changed text inputs now have explicit replacement rings, while dialog and menu containers are not themselves routine text inputs.

The existing system already has semantic buttons and switches, accessible control names, useful unavailable messages, actual product artwork, and canonical settings persistence. The sampled settled device, settings, and audio screens had no running animation with reduced motion enabled. Transient portal measurements and artwork loading are recorded separately and are not evidence of missing hardware imagery.

## Validation and evidence

- `bun run check:types`, `bun run check`, `bun run build`, and `git diff --check` passed. `check` also ran source transpilation and the worker smoke check.
- Focused existing suites passed: settings search, feedback reporting/handoff, device-module visibility, and workspace profiles (25 tests).
- `before.json` and `after.json`: native layout, computed text contrast, image-loading state, animation, and accessibility-tree evidence for twelve surfaces at all three window sizes.
- `controls.json` / `controls-progress.json`: focused action verification and final contrast/overflow checks. Includes Developer mode persistence across renderer reload, locked/unlocked module states, disabled unavailable Replay, and working search with visible focus.
- `before/`, `after/`, and `final/`: local native screenshots. Final captures wait for compositor paint; some earlier captures include transient artwork loading.

The review used hidden windows and fixture hardware in an isolated app profile. The background library scan subsequently discovered the existing clip directory, allowing populated-library inspection; clips were not edited, exported, deleted, or submitted anywhere. Initial empty-library and later populated-library measurements are different states, not a before/after performance comparison.

Physical hardware writes, active recording, audio routing, installed packaging, Windows screen-reader use, exhaustive editor/montage workflows, and long-running performance remain outside this audit's evidence. No unrelated dirty-checkout work was reset, staged, or committed.
