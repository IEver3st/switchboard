# Auto Capture repair

September 4, 2026. Source changes only; the installed Switchboard app was not replaced or restarted.

## Confirmed defects repaired

- Replay reconfiguration stopped the active kill provider without invalidating the coordinator signature. Returning to the same source skipped its restart. A real War Thunder provider feeding the coordinator and engine now saves before and after this lifecycle transition.
- The coordinator unconditionally reported listening after provider start, including a missing nickname or failed API. Canonical status now follows provider health, including asynchronous failure and recovery.
- War Thunder nickname setup was hidden in collapsed event options. It is now always visible below its game row, with explicit Save and Enter submission, required/unsaved/saving/saved feedback, and local canonical persistence. Clearing and saving removes the stored name.
- Unavailable integrations no longer display an enabled game switch or actionable event/timing controls.
- WARDOGS uses its official Steam header artwork. Provenance is beside the asset.

## Validation

- `bun test tests/autocapture-coordinator.test.ts`: three regressions failed before the fixes and passed afterward.
- `bun run test`: 324 passed, 3 optional montage tests skipped; Capture.Host and Audio.Host deterministic suites passed.
- Subsequent focused Auto Capture/War Thunder tests: 17 passed.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, and `git diff --check` passed.
- Native Electron Settings > Capture reviewed at 1080 x 720, 1420 x 900, 1920 x 1080, plus 2560 x 1440. No horizontal overflow observed. The isolated profile normalizes app zoom to 100%; native screenshots reflect Windows display scaling.
- Native workflow verified nickname entry while options are collapsed, Save through canonical state, reload persistence, Enter to clear, and removal from disk. Empty, saved, and unavailable states rendered. Review styles disable motion; actual reduced-motion preference and transient saving/error screenshots were not separately exercised.

## Live evidence and remaining boundary

The installed Capture.Host was buffering the running `WardogsClient-Win64-Shipping.exe` source with no capture error. Existing automatic clips were reaction events. Both local WARDOGS Logs and Telemetry directories contained zero files, the running client had no listening TCP endpoint, and bounded install/config searches found no kill-event source. The existing Wardogs integration is explicitly unavailable. This work does not add Wardogs or standard-build Battlefield 6 kill detection, and fixture events are not proof of live-game kill detection. The installed app and its active capture process were left running.
