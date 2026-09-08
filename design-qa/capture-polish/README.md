# Capture polish verification

The completed renderer keeps the two-row header, uses consistent 32px controls and 11px control type, exposes the full sort label, restores the grid/list selected state, and puts duration inside the replay settings trigger. Montage selection retains the same 92px header height. Short and wrapped clip titles share a first baseline; thumbnail menus no longer reserve an empty leading action slot.

Implementation is scoped to Capture components and capture-library.css. Pre-existing CaptureHeader audio-device work and all unrelated working-tree changes were preserved. No dependency, engine pipeline, recording policy, or real media was changed.

## Native evidence

Final screenshots and JSON reports are in `verified/`. Native Electron ran the production renderer with isolated canonical state. Offscreen windows avoided covering displays or taking focus. CDP fixed the CSS viewport at exactly 1080x720, 1420x900, and 1920x1080; screenshot pixel sizes additionally reflect Windows display scaling.

- Grid at all three sizes: no horizontal or toolbar overflow; full sort labels and selected grid state visible.
- Compact filter menu, list view, replay configuration, two-clip selection, no matching search results, unavailable empty library, and thumbnail loading inspected.
- Search, favorites, game/date filtering, ordering, grid/list toggles, overflow/context menus, deletion cancellation, montage creation/cancellation, and editor open/close exercised.
- Source and replay popovers exercised by keyboard, including Escape and focus restoration.
- Replay length changed through the UI to 45 seconds, confirmed by main, read back from the isolated persisted state file, and restored after renderer reload (`final/capture-20-clips-1420x900.json`).
- Reduced motion: emulated preference remained active and zero running animations were reported.
- Final runs reported no renderer console errors. Independent visual critique confirmed title alignment and no remaining major visual defects.

Scale fixtures reuse a real thumbnail and synthetic metadata. They are UI evidence, not new recordings. Live capture start/stop, hardware writes, source readback, physical recording quality, screen-reader use, and long-running CPU/memory soak were not part of this verification. The isolated build's unavailable backend was explicitly rendered.

## Rendering measurement

The 240-clip controlled comparison toggled one clip ten times under V8 precise function coverage. With ClipCard memoization enabled: 10 ClipCard calls total and 1.5ms median click-to-DOM-commit. With only that memo wrapper disabled in a temporary copied bundle: 2,400 calls and 88.6ms median. Reports: `after/capture-240-clips-1080x720.json` and `without-memo/capture-240-clips-1080x720.json`.

This isolates selection rendering work; it is not an end-to-end recording benchmark. Stable callbacks, cached groups, a selection-order map, and preserving an unchanged selection array remove redundant work without custom equality checks or extra timers. Temporary comparison bundles were removed after verification.

## Repository checks

- `bun run test`: 297 passed, 3 skipped; Capture.Host and Audio.Host deterministic tests passed.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, both requested .NET host builds, and `git diff --check` passed.
- Frontend skill source audit: 0 errors, 10 existing focus-replacement warnings. Changed title and thumbnail controls retain underline/ring focus treatment.
- Native review harness syntax check passed. There is no lint script.

Earlier `before`, `before-current`, `after`, `final`, `offscreen`, and `confirmed` screenshots document intermediate tooling/design states. Use `verified/` for visual acceptance. Hidden-only captures initially omitted popover layers; offscreen painting and fixed viewport emulation corrected the evidence path.
