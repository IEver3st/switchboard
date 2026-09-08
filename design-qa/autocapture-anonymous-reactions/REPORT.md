# Anonymous identity and reaction detector review

Reviewed September 5, 2026. These results apply to the local source build. The installed app and its settings were not changed.

## Behavior and checks

- War Thunder now supports canonical anonymous-mode and squadron-tag settings. Matching requires the exact tag plus the literal name Player. Normal nickname matching no longer accepts arbitrary suffix matches.
- Read-only parsing of the current retail localhost battle feed identified three kills and two deaths for the configured anonymous identity. No raw battle feed was saved in these artifacts. This is observed-message evidence, not a new-event-to-saved-clip test.
- Reaction detection learns actual voice gain, requires a relative rise, and waits for 750 ms of settled input before rearming. Synthetic regression cases cover high-gain ordinary speech, continuous loud input beyond cooldown, and a fresh burst after settling. The previous detector failed the continuous-loud-input regression.
- Focused JavaScript suites passed: War Thunder, Auto Capture coordinator, and Auto Capture engine (20 tests). The Capture.Host test executable passed, including reaction regressions. Its callback benchmark reported an average 0.0446 ms over 426 frames; this is a synthetic measurement.
- `bun run check`, `bun run check:types`, `bun run build`, and `git diff --check` passed. Unrelated native audio checks were not run.

## Native renderer review

A hidden Electron session used isolated copied settings and disabled capture. Windows were placed offscreen before loading; no window was shown or activated. The session exited after review.

The anonymous workflow exercised the mode switch, required empty state, tag input and keyboard focus, Enter-to-save, canonical readback, and persistence after renderer reload. The existing nickname workflow also passed save, clear, and reload checks. See `warthunder-anonymous-workflow.json` and `warthunder-settings-workflow-report.json`.

The changed settings controls were visually inspected at exact renderer and screenshot sizes of 1080 x 720, 1420 x 900, and 1920 x 1080, with no page-level horizontal overflow. The harness additionally captured 2560 x 1440. See `report-settings-warthunder-provider.json` for measured sizes. Hidden offscreen rendering placed the settings shell at y=-24, clipping the unrelated top header; the changed identity controls remained fully visible. This review does not establish normal visible-window titlebar placement. Reduced motion was forced for the session, but no separate motion assertion was made.

## Remaining live boundaries

Physical microphone accuracy, missed or unwanted reactions during play, and new War Thunder events producing saved replay files still require a live session with the updated build. Localized anonymous names and unobserved feed formats remain unsupported validation boundaries. The running installed version still needs the full displayed anonymous identity in its existing nickname field until updated.
