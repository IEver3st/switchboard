# Devices background verification

Implemented a 1,819-byte static SVG of routed signal paths at opposite corners. CSS-only integration on the gallery, including its empty state. No added JavaScript, DOM, timers, animation, canvas, filters, dependencies, or settings. Forced colors removes the artwork. Device editors retain their existing surface.

Compared signal paths, arcs, and rails in native Electron. Chose signal paths for a hardware-specific geometry distinct from onboarding waves and a clear center. Alternate artwork and selector were never part of production.

Native Electron fixture review covered exact CSS viewports 1080x720, 1420x900, and 1920x1080. Checked gallery, disconnected, empty, disabled modules, keyboard focus, device navigation and return focus, reduced motion, forced colors, and renderer reload. No overflow; routine controls visible; zero running gallery animations. Review used an isolated profile, offscreen windows with background throttling disabled, focus emulation for keyboard capture, and a visible window for reload. Earlier captures exposed stale-frame and Windows DPI sizing issues; final captures explicitly await paint and measure the actual viewport.

A five-second idle Chromium trace recorded zero Paint events after settling. This is a bounded fixture render check, not a sustained whole-application CPU or memory benchmark or physical-device proof.

Validation passed: bun run check, bun run check:source, bun run check:types, bun run build, git diff --check. bun run test: 316 passed, 3 skipped; Capture.Host and Audio.Host deterministic tests passed. Frontend source audit: no errors; 14 pre-existing global focus warnings outside the changed CSS. No lint script exists. No host source changed.

Pixel review found no blocker or major visual defect. Final focus/empty captures replace initially mislabeled stale frames. Physical hardware and installed-release behavior were not changed or revalidated. Unrelated working-tree changes preserved.
