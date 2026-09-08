# G502 lighting and idle updates verification

September 5, 2026. Source checkout changes only; installed Switchboard was left running unchanged.

## G502 lighting

Reproduced the reported out-of-range error through the actual connected 046D:C547 receiver using a separate HID++ software ID and the existing transport. The 0x8081 GetZoneInfo page was sent in parameter byte 2 instead of byte 1. All three reads returned page zero, producing nonexistent zones 112-120 and 224-232. The write failed at zone 112.

With [0, page], replies identified pages 0, 1, and 2; only zones 1-8 were populated. The same Static color operation received acknowledgements for all eight zone writes and FrameEnd, followed by software-ownership release and handle close. No onboard profile was rewritten. This proves the command rejection is repaired on the connected hardware; visible LED appearance and long-running reconnect behavior were not observed.

The fake device now interprets the real page byte and rejects nonexistent zones. The packet layout was cross-checked against [Solaar's PerKeyLighting validator](https://github.com/pwr-Solaar/Solaar/blob/master/lib/logitech_receiver/settings_templates.py).

## Updates

Checks run 15 seconds after launch and every 30 minutes thereafter. Install while away is a separately persisted default-on option. It requires automatic checks, a downloaded installer, at least 600 seconds of Windows idle time, an inactive renderer, stopped audio/capture hosts, no active clip/montage exports, and no game scan. Eligibility is checked every 60 seconds only while needed; disabling the policy/checks, installation, or disposal clears the timer. Downloaded state survives periodic checks.

Silent installation uses electron-updater and the existing shutdown path. A validated, single-use, expiring local marker returns an update launch to the tray without creating the interface. Idle time uses [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor).

Tests cover scheduling, eligibility, user return, preference disable/re-enable, disposal, silent-install arguments, saved-settings migration/restart, and update-launch marker consumption. A real downloaded-installer install/relaunch was not performed; packaged updater delivery remains unverified for this change.

## Validation

- bun test: 332 pass, 3 skip, 0 fail.
- bun run check: passed, including source transpilation and worker smoke.
- bun run check:types and bun run build: passed.
- git diff --check: passed.
- Hidden native Electron About review passed at 1080x720, 1420x900, and 1920x1080. All four preferences were visible without initial scrolling or horizontal overflow, toggled through canonical IPC, and retained their values after renderer reload. Store tests separately verified disk persistence after restart. Available and downloaded update states were captured.
- The general-purpose verifier's unrelated tooltip focus check timed out in the hidden session. The focused native review omitted that tooltip check, retained the About assertions, and passed. No window was shown or focused. This is hidden native rendering, not visible-desktop focus QA.
- No native engine source changed; native engine rebuilds, soak tests, and a release/install were not run.
