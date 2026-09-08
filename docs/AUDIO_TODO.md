# Audio completion checklist

Verified on this Windows machine on September 7, 2026. Repairs are in the workspace; the installed Switchboard application has not been replaced.

The physical microphone can capture and process audio inside Audio.Host. Application routing, Game/Chat/Media processing, and virtual microphone/stream delivery remain unavailable because the Switchboard driver is not installed. This is not yet a fully working end-to-end audio module.

## Completed and checked

- [x] Serialize audio configuration changes through main's canonical state. Commit confirmed settings after the host accepts them; restore the previous settings after a partial failure.
- [x] Preserve live host status, endpoint inventory, capabilities, and application counts while applying settings or audio scenes.
- [x] Start audio scenes with the host's start operation when audio was off, and restore the previous off state.
- [x] Validate microphone processor configurations before replacing a working graph.
- [x] Repair shelf EQ coefficients at high Q. Both microphone and stereo graphs now produce finite, matching responses across the tested shelf settings.
- [x] Keep microphone capture alive when its optional monitoring output is missing. Retry failed monitoring through the existing five-second recovery loop and clear the error when monitoring is disabled.
- [x] Dispose owned input/output endpoint handles, dispose failed output initialization, and discard stale routing samples without resetting an active producer.
- [x] Remove the routing callback's control-lock deadlock path and rebuild routing when its microphone source needs recovery.
- [x] Refresh endpoint inventory after host endpoint notifications and bound repeated host restart attempts.
- [x] Restore rejected fader, EQ, ChatMix, and processor drafts; expose pending edits and truthful unavailable status. Disabled EQ rejects keyboard edits from retained focus.
- [x] Verify master gain/mute, destination independence, channel enable/disable, ChatMix keyboard/reset, microphone gain and EQ host readback, preset creation, invalid endpoint rejection, killed-host recovery, scene restore, renderer reload, and application restart.
- [x] Inspect Mixer, Game, Chat, Media, and Microphone in hidden native Electron at 1080 x 720, 1420 x 900, and 1920 x 1080 with reduced motion. No horizontal overflow; mixer routine controls and ChatMix fit at the smallest size.

## Required before calling audio complete

- [ ] Obtain a driver package Windows accepts under the machine's active security policy, install it in a maintenance session, and verify all eight canonical endpoints with `scripts/verify-virtual-audio-driver.ps1`. Current live discovery finds zero Switchboard endpoints. The existing catalog in `.switchboard/build/virtual-audio-source/audio/simpleaudiosample/x64/Release/package` is signed by a local WDK test certificate; Windows reports an untrusted root. Compilation alone does not satisfy this gate. No driver installation, certificate trust, boot-security change, or reboot was attempted during gameplay.
- [ ] Verify real application assignments to Game/Chat/Media, per-channel DSP and mute, ChatMix, independent Personal/Stream/Clip mixes, virtual microphone delivery to a receiving app, and stream/clip audio using that installed driver.
- [ ] Listen to microphone monitoring and the microphone-test playback at a comfortable level; check for feedback, delay, clipping, and subjective noise-removal quality. The checks in this session produced no playback and saved no microphone recording.
- [ ] Exercise physical microphone/output disconnect and reconnect, default endpoint changes, sleep/resume, tray behavior, and capture replay ring-wrap saves with audio enabled. Do this outside gameplay because it affects live devices and routing.
- [ ] Run a sustained audio/monitoring/routing soak and inspect handles, memory, underruns, and overruns. The measured physical-microphone run here was 60 seconds, not a long-running soak.
- [ ] Package the intended integrated change set and validate an installed candidate in a maintenance session. The installed application was not replaced during gameplay.

## Validation evidence

- Focused audio, microphone, EQ, and scene JavaScript checks: **42 passed, 0 failed**.
- `bun run test:audio-host`: passed, including native RNNoise, DSP, shelf-Q, ring-buffer, and endpoint-handle checks.
- Capture.Host deterministic suite: passed when run separately.
- Direct physical HyperX QuadCast 2 capture: five stop/start cycles, dormant/requested metering, missing-monitor startup, rejected configuration retention, and shutdown/process exit passed. The 60-second run recorded zero capture overruns or bypassed frames; RNNoise p99 was 0.1773 ms and maximum was 0.3981 ms. These are processing measurements, not end-to-end latency or listening proof.
- Hidden native workflow and application restart checks: passed. Synthetic renderer events exercised the real preload/main/host path; this does not prove physical GUI input or assistive-technology behavior.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, and `git diff --check`: passed.
- Final full JavaScript run: **388 passed, 3 skipped, 0 failed**. Audio.Host and Capture.Host suites passed separately. An earlier aggregate attempt stopped on concurrent capture-editor failures; those separate changes were corrected before the final JavaScript and type-check runs.

Local artifacts: `.switchboard/audio-repair-20260907/lifecycle.json`, `lifecycle-final.json`, `audio-tests.log`, `test-final.log`, `types-final.log`, and `native/workflow.json`, `native/restart.json`, `native/layouts.json`, plus all 15 native route captures in that directory. Runtime/UI review used isolated preferences and hidden unfocusable windows. The installed app and Windows default audio devices were left running as they were.

The repeatable checks are `bun scripts/verify-audio-lifecycle.ts` and, after `bun run build`, `bun scripts/run-native-review.mjs audio-workflow`. The native workflow requires a built Release Audio.Host and a physical microphone; it never enables monitoring. Set `SWITCHBOARD_AUDIO_UI_USER_DATA` to the generated `native/user-data.txt` value and use `--restore` for the restart phase.
