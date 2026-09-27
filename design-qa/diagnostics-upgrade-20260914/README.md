# Diagnostics resource monitor verification

Implemented September 14, 2026. The user reference governs information depth;
DESIGN.md governs the flat instrument layout and existing product tokens.

## Verified

- Hidden native Electron at exact 1080 x 720, 1420 x 900, and 1920 x 1080 content sizes.
- Real Windows CPU time, private/resident/peak memory, I/O and handle counters for
  known app processes and the collector itself. No audio/capture engine starts in
  the collector's dedicated mode.
- Main-owned chart history and process summaries exported in JSON schema 4.
  `live-export.json` contains real measurements from the isolated review session.
- Recording toggle, range selection, sorting, process filtering/disclosure,
  runtime/activity views, event filtering, pending/cancelled/failed/successful
  export, retained history after stopping, and recording preference after reload.
- Recovery after forcibly terminating the owned collector; repeated stop/start is
  also covered by the native collector test.
- No renderer console errors or page-level horizontal overflow in the review.
  Focus/reduced-motion and unavailable-collector states were captured.
- Resource history is transient and excluded from persisted settings.

## Deterministic checks

- `bun test`: 412 passed, 6 existing opt-in media tests skipped.
- Focused resource/developer diagnostic checks passed after boundary refinements.
- Capture.Host deterministic tests passed; Debug host build had zero warnings/errors.
- `bun run check`, `bun run check:source`, `bun run check:types`, and production build passed.
- Frontend skill source audit found no errors or warnings in changed resource UI.
- `git diff --check` passed.

## Evidence boundaries

`history-fixture-*` screenshots use explicitly synthetic historical curves to
exercise a populated five-minute chart. Their latest point uses the same genuine
native sample as the process/category attribution. The production application
never generates history. `collector-error-*` uses an injected error fixture;
recovery from a killed collector was separately exercised against the real host.

Windows save-dialog selection was stubbed to exercise actual export writing and
failure/cancellation handling without showing a dialog. This does not verify the
native dialog's appearance. No physical device changes, capture quality claim,
installed-release update, or prolonged memory/handle soak is included.

The collector observes known live PIDs at five-second intervals, so processes
that start and exit between samples are not counted. Process I/O includes file,
network, and device traffic. Thermal/GPU utilization and CPU speed limit remain
explicitly unavailable. Shared working-set pages may be counted more than once.

API references: Microsoft IO_COUNTERS and Electron powerMonitor.
https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-io_counters
https://www.electronjs.org/docs/latest/api/power-monitor/
