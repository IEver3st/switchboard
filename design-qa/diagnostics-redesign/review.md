# Diagnostics review

Implemented against DESIGN.md. System and host state lead the page; recording and local preferences remain visible at the minimum window size. Removed repeated explanatory copy, row dividers, and nested maintenance surfaces. Technical values remain selectable.

## Rendered evidence

Native Electron, isolated temporary profile, 100% UI scale: 1080 x 720, 1420 x 900, 1920 x 1080. Baseline screenshots are in `baseline/`; confirmation screenshots and the machine-readable report are in `final/`.

The final run passed 35 assertions and captured 19 screenshots, with no renderer console errors. Covered recording off/on, empty export, native process tables, pending/canceled/successful/failed exports, persisted preferences after reload, stop cleanup, reset confirmation/cancellation, keyboard order, reduced motion, forced contrast, unavailable hosts, empty devices, long identifiers, warnings, and rejected settings writes.

Fresh screenshot review identified an oversized retention selector and excessive label/value separation at wide sizes. Both were corrected and rerendered. Final inspection also corrected missing-host labeling and switch thumb visibility in forced contrast. No remaining blocker or major visual defect was observed in the reviewed states.

## Checks

- `bun run test`: 316 passed, 3 existing skips; Capture.Host and Audio.Host deterministic suites passed.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, `git diff --check`: passed.
- Frontend source audit: both changed TSX files passed without findings. CSS scan reported 14 existing outline warnings outside the changed diagnostics blocks.

## Evidence boundary

Hardware inventory and adverse snapshots use isolated review fixtures. Recording, exports, settings persistence and reset exercise the actual main/preload/renderer path. This review does not establish physical hardware behavior, host soak performance, installed-release behavior, screen-reader speech, or separate Windows display-scaling coverage. Native hosts and process boundaries were not changed.

`scripts/verify-diagnostics-redesign.mjs` is an Electron review entry point. It creates its own profile, uses fixture inventory, and exits its own app when finished. It does not modify the user's running instance.
