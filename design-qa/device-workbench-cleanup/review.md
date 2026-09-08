# Device workbench review

The mouse route uses a centered render, sensitivity and memory on the left, lighting on the right, and assignments below the render. Individual lighting zones use the existing popover and color-picker primitives. No hardware protocol or state ownership changes.

## Rendered evidence

Native Electron fixtures reviewed at 1080 x 720, 1420 x 900 and 1920 x 1080, plus the minimum window at 125% UI scale. No horizontal or vertical workbench scrolling at those sizes. The minimum native window reported 722 content pixels in height due to Windows sizing rounding.

Reviewed assignments, color preview, onboard-disabled, lighting-off, keyboard focus, reduced motion, a 26-zone/five-preset fixture, and disconnected state. The independent pixel review identified narrow inherited sensitivity/memory columns and inconsistent wide alignment; both were corrected and rerendered.

Nine native interaction groups passed, including DPI slider/input/preset editing, polling rate, DPI Shift, linked button assignment, onboard mode, lighting/zone color and keyboard zone-editor entry/exit. Confirmed canonical DPI, polling, shift, color and assignment state survived renderer reload. See `after/report.json` and screenshots. Fixtures do not prove physical hardware output or process-restart persistence.

## Checks

- `bun run test`: 297 passed, 3 skipped; Capture.Host and Audio.Host deterministic tests passed.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, and scoped `git diff --check` passed.
- Frontend source audit: zero errors; one existing `outline: none` warning on the color picker, whose adjacent focus-visible rule supplies its replacement.
- No new dependencies. Unrelated working-tree changes preserved.

Scope is the mouse detail surface shown in the brief; keyboard, microphone and gallery layouts were not redesigned. Screen-reader and physical-device testing were not performed.
