# Library improvements

## Implemented behavior

- Full or unknown saved-clip and replay-cache volumes cannot report healthy storage. Main and Capture.Host evaluate both locations independently; startup storage errors are critical.
- Unavailable clips retain their identity and metadata. Retry rechecks media, Locate uses a native picker and verifies compatible duration/dimensions, and Remove explicitly removes only the library record.
- Keep project persists edits beyond the three-hour temporary-autosave lifetime. The project strip distinguishes kept projects from temporary drafts.
- Layout and sort are persisted by main. Search, filters, and scroll survive navigation to Settings and back during the renderer session.
- General selection supports Shift-click ranges, select filtered results, favorite/unfavorite, and Recycle Bin deletion. Confirmation checks saved-project references; partial failures retain failed records and retry only those items.
- Replay cache has a separate folder chooser and capacity readout. The chosen parent gets a dedicated Switchboard Replay Cache child. Active reconfiguration is serialized, rejects location changes while saves are pending, and commits the location after host acknowledgement. Existing media is not moved. Opening the saved-clips folder does not depend on cache availability.
- Generated titles use the game or Desktop label followed by compact capture time. User-edited names remain unchanged.

## Validation

- JavaScript suite: 436 passed, 6 existing opt-in skips, 0 failed. After the final title change, the 27 relevant clip/storage tests passed again.
- Capture.Host deterministic suite passed, including full/unknown-volume cases.
- `bun run check`, `bun run check:types`, `bun run build`, and `git diff --check` passed. Line-ending normalization warnings are present in the existing working tree.
- Hidden native Electron acceptance: 21 checks passed with no renderer errors; 1080 x 720, 1420 x 900, 1920 x 1080; reduced motion enabled. Checks cover range selection, canonical favorites, cache selection, preferences, route scroll, kept-project expiry, deletion references, partial failure, unavailable menus, explicit removal, retry, and relink.
- Harness: `scripts/verify-library-improvements.mjs`. Uses synthetic media in an isolated profile, production preload/IPC/controller paths, a mocked native file picker, and a deterministic locked-file failure. Real Recycle Bin operations are restricted to disposable fixture files.
- Screenshots and machine-readable report: `.switchboard/library-improvements-review/1789450475094/`.
- Independent visual review found no blocker in selection at minimum/large sizes or the partial-deletion result. Cache settings and unavailable actions were also visually inspected.

No physical drive-disconnect, live recording reconfiguration, foreground gameplay, or long-duration soak claim follows from this evidence.

## GPU investigation remains open

`scripts/measure-gpu-playback.mjs` captures process metrics, Chromium memory dumps, rendering configuration, and video progress. The bounded hidden run loaded 1,277 real-library records with engines disabled and the copied software-rendering preference enabled (Microsoft Basic Render Driver). The user's media was read-only.

Latest trace: `.switchboard/gpu-playback-review/1789450161709/`.

| Phase | GPU private MiB | Renderer private MiB |
| --- | ---: | ---: |
| Library | 121.6 | 124.8 |
| First editor close | 35.8 | 284.4 |
| Second editor close | 35.9 | 306.0 |
| Settings | 39.7 | 307.8 |

These are short, hidden-window samples. Both attempted video-playback samples remained at time zero with readyState zero, so they are editor-open measurements, not successful playback evidence. The renderer increase is worth a longer controlled trace but does not prove a leak. The previous roughly 700 MiB GPU observation was not reproduced under these conditions.

PID-scoped Windows heap tracing returned `0xd0000061`; cleanup was attempted before the owned process exited. No WPR recording remains active. Allocation stacks and controlled visible playback remain unverified. No rendering-backend override or GPU fix is claimed.
