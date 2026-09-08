# Montage redesign verification

September 4, 2026. Native Electron, isolated profile, generated video and WAV fixtures. No user clips or drafts were modified.

## Result

The 191-second, five-segment montage fits the timeline at 1080x720, 1420x900 and 1920x1080. Timeline scroll width equals viewport width at each size. Playback, time readout, editing tools and the music lane remain visible. Opening the music inspector also preserves fit and exposes its controls without an initial scroll.

The title/save area replaces the metadata ledger. Canvas selection is actionable in the header. Playback remains visible below the preview. Add music is available in the toolbar and empty lane; Music settings opens a dedicated inspector section.

Native interaction checks passed: play/pause, boundary playback, ruler click and pointer-drag scrubbing, keyboard Home/End, zoom/Fit, original/vertical canvas, fullscreen, preview mute, music import cancellation/failure/recovery, waveform analysis, music preview including a delayed start, mute/loop/replace, source trim/fades, persistence after renderer reload, and real FFmpeg export with imported music. Reduced-motion state was rendered. The native file chooser was answered by the isolated harness; actual import, storage, analysis, playback and export used production services.

Pixel review identified endpoint-label overlap and music controls below the compact viewport. Both were repaired; the confirmation critic found no remaining visible blockers or major issues. Names and durations now occupy separate lines.

## Checks

- `bun run test`: 313 passed, three integration-suite entries skipped; Capture.Host and Audio.Host deterministic tests passed.
- Explicit FFmpeg-enabled montage tests: 10 passed, including the integration test skipped by the default suite.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`: passed.
- Both .NET host builds: passed, zero warnings/errors.
- UI source audit: zero errors; focus-reset warnings inspected, changed montage controls have a scoped visible focus replacement.
- `git diff --check`: passed.

Four initial type errors in the independently edited clip virtualization hook disappeared in the current workspace; no edits to that hook were made for this task. Native harness refinements addressed Windows offscreen sizing, focus, and waiting for the renderer's actual reload completion. The final successful run is `report.json`.

## Evidence and limits

See `*-fit.png`, `*-music.png`, `vertical-canvas.png`, `import-error.png`, `1080x720-reduced-motion.png`, and `report.json`. Solid-color video and the sine-wave soundtrack are explicit test fixtures. This verifies the source build in Electron, not an installed release, physical speaker output, arbitrary media codecs, or a long playback soak. Screen-reader behavior was not manually tested.

Reproduce with `bun run build` then `node scripts/run-native-review.mjs montage-redesign`. Requires FFmpeg/FFprobe on PATH and an existing application state file for the isolated profile copy.
