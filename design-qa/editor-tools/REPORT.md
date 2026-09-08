# Clip and montage editing

## Custom menus follow-up

Playback speed, text position/size and montage canvas now use the existing Radix
Select primitive. Both timelines have position-aware context menus with seek,
trim start/end and reset. Montage segments also offer split, duplicate, remove
and undo/redo; the music lane offers settings, placement, mute and removal.
Single-clip audio lanes trim independently from the video range. Right-click
positions snap to source frames and account for montage speed, zoom and scroll.
Shift+F10 opens the menu at the playhead for keyboard users.

`menus/report.json` and `menus/*.png` cover native Electron at 1080x720,
1420x900 and 1920x1080, keyboard selection/focus return, Escape, invalid boundary
actions, montage undo, music operations, canonical clip save/reopen and reduced
motion. Test media uses the Downloads MP3 and native output is muted.
`bun test`: 321 passed, 3 environment-gated skips, no failures. Type checks,
structure/source checks, build and diff whitespace checks passed. No screen
reader session or installed-package validation is claimed for this follow-up.

Run the existing native harness with `SWITCHBOARD_EDITOR_MENUS_ONLY=1` to repeat
these menu checks without rendering exports.

## Editing and export implementation

Implemented per-clip 0.25x to 4x speed, source-frame trim nudges, millisecond
inputs, in/out at playhead, brightness/contrast/saturation, horizontal flip,
and timed titles with three sizes and positions. Both editors support imported
music, waveform/source trims, placement, looping, volume, mute and fades.
Montage split/reorder/duplicate and undo/redo retain the new edits.

Montage export offers duration-based Compact/Balanced/More detail sizes, uncapped
Quality, and a custom 5 to 100,000 MB target. Actual size is checked before success.
Completed files use the existing prepared-share/native-drag path. Export writes
a temporary sibling before replacing a destination, preserving existing files on
failure or cancellation.

## Evidence

- `native/report.json`: real Electron renderer, preload, main persistence,
  managed audio import and FFmpeg export in an isolated profile.
- Both editors inspected at 1080x720, 1420x900 and 1920x1080. Native snapshots are
  in `native/`. No page-level horizontal overflow. Inspector scroll owns overflow.
- Exercised speed, keyboard picture adjustment, flip, text size/placement,
  source-frame trim, music trims, save/reopen/reload, montage undo/redo,
  invalid/custom export size, reduced motion and mid-export cancellation.
- Prepared montage drag traversed renderer dragstart, validated IPC and native
  startDrag arguments with the actual exported path. The OS drop itself was
  intercepted to avoid depositing test media into another app.
- `render-report.json`: mixed 0.5x/2x/0.25x segment render with trimmed music,
  picture edits and literal punctuation in a title. Expected 9 seconds;
  ffprobe reports 9.021354 seconds, including container/audio rounding. The output
  used h264_nvenc. `title-visible.png` and `title-ended.png` verify rendered text.
- `baseline.json` versus `updated.json`: 24-second 1080p30 CPU fixture, 10 MB
  target, same input. Old three-encode pipeline: 7.314 s. Single-encode pipeline:
  2.731 s, approximately 2.7x faster. This does not establish the user's original
  stalled-project cause or performance on all long/high-resolution projects.
- Subsequent media tests use the MP3 found in the user's Downloads. Native
  playback stays muted; FFmpeg render tests do not open a sound device.

## Checks

- `bun run test`: 321 passed, no failures; capture/audio host deterministic suites
  passed. The three environment-gated FFmpeg entries were skipped in that command;
  the montage FFmpeg integration was also run explicitly and passed.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`:
  passed. Capture.Host and Audio.Host builds passed with no warnings/errors.
- `git diff --check`: passed. Frontend source audit: no errors; existing focus
  warnings were inspected. New fields, disclosure and buttons retain focus styles.
- Pixel-first review fixed buried editing controls, music field grouping,
  custom export summary mismatch and a toast covering the inspector.

No external-app drop, screen-reader session, installed release, capture-device
behavior or long-duration soak is claimed. Slow motion repeats available source
frames; it does not synthesize optical-flow frames. Titles are one timed text
block per segment; split a segment to use successive titles.

Reproduce with `scripts/verify-editor-tools.mjs` through Electron with
ELECTRON_RUN_AS_NODE removed, and `bun scripts/verify-editor-render.ts`.
The native harness uses a copied development profile and the Downloads MP3.
FFmpeg filter semantics follow the [official filter reference](https://ffmpeg.org/ffmpeg-filters.html).
