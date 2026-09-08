# Clip library virtualization

Native Electron comparison on September 4, 2026, using the same 442-clip library
copied into isolated profiles. Engines and device modules were disabled. The
production window remained rendered offscreen, with throttling disabled. User
state, physical devices, and original thumbnail files were not modified.

## Measured result

| Library open at 1420 x 900 | Before | Virtualized repeat |
|---|---:|---:|
| Mounted cards | 442 | 15 |
| DOM elements | 15,643 | 698 |
| Renderer private memory | 212 MB | 98 MB |
| Estimated JS heap | 58 MB | 14 MB |
| Total Electron private memory | 574 MB | 455 MB |
| Renderer task time across 20 canonical settings updates | 259 ms | 147 ms |
| Total private memory after updates | 574 MB | 481 MB |
| Settings private-memory median over 60 seconds | 405 MB | 400 MB |

The first virtualized run measured 96 MB renderer private memory, 457 MB total,
and 135 ms task time. The repeat supports a substantial library-open improvement:
about 54% less renderer memory, 96% fewer DOM elements, and 21% less total private
memory at the initial checkpoint. The Settings difference is too small to call
a meaningful improvement. GPU memory remains about 200 MB in these runs.

Raw evidence: `before/report.json`, `after/report.json`, and
`after-final/report.json`. The last benchmark preceded only the keyboard scroll
alignment adjustment; that adjustment runs on keyboard navigation, outside this
benchmark's workload. This is a dirty-checkout comparison with other ongoing
work, not a clean release A/B. DOM counts directly confirm the mounting change;
process-level measurements include normal Chromium and host variability.

## Implementation

- Grid and list retain date headings and explicit CSS grid tracks for the full
  native scrollbar range. Only visible rows and 300 px of overscan mount React
  cards, Radix controls, and thumbnail elements.
- One additional interaction row can remain mounted independently of the visible
  range. Focus, context menus, and editor return focus do not retain the gap
  between that row and the viewport.
- Native Tab and Shift+Tab traverse the entire filtered library, mounting the
  next row when needed. Scroll correction accounts for the sticky header.
- Search, filters, favorites, and montage selection still use the full canonical
  collection. Virtual mounting does not redefine "Select all."
- ResizeObserver and a passive scroll listener schedule one cancellable animation
  frame on demand. Unmount disconnects both and cancels pending work. No new
  dependency or idle timer was introduced.

## Verification

`scripts/measure-library-idle.mjs --verify-virtual` passed 18 isolated native checks.
Screenshots and detailed viewport samples are in `verification/`.

- Grid and list inspected at 1080 x 720, 1420 x 900, and 1920 x 1080, including
  top and end screenshots and intermediate scrollbar positions.
- Full scroll sweeps reached all 442 clips. The grid peaked at 28 mounted cards;
  the list peaked at 13 mounted rows during the 1420 x 900 sweeps.
- Native forward/backward Tab, retained distant focus, open context-menu
  retention, canonical favorite after unmount/remount, offscreen search,
  no-results/clear, all-442 montage selection, editor focus/scroll restoration,
  sticky-header focus visibility, renderer reload, and reduced-motion behavior
  are covered.
- `bun run test`: 313 passed, 3 skipped; Capture.Host and Audio.Host deterministic
  tests passed. `check`, `check:source`, `check:types`, and production build passed.
  Both native host builds passed with zero warnings/errors. `git diff --check`
  passed.
- Frontend source audit: zero errors; ten existing focus-outline warnings in the
  capture subtree. The affected title controls retain their visible underline
  focus styles, and native keyboard traversal was exercised.

These results do not establish an installed-app, active-engine, foreground CPU,
screen-reader, or multi-hour memory-growth release gate. Native screenshots use
the Windows display scale, so physical PNG sizes differ from the requested
Electron content sizes. No release was packaged or installed.
