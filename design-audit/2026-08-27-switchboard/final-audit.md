# Switchboard audit - final pass

Date: 2026-08-27

## Outcome

The iterative audit, repair, and re-audit loop is clean within the repository, deterministic native-fixture, and exercised native-host scope. No actionable findings remain in that scope.

## Scope and visual contract

Switchboard remains a compact Windows control surface: deep neutral work surfaces, restrained cyan functional emphasis, real hardware imagery, and a continuous-console hierarchy. The remediation preserved the canonical main/preload/renderer contracts and existing shared controls; it did not introduce renderer-only state, decorative gradients or glow, generic card nesting, or simulated capabilities.

## Flow health

1. **Devices and hardware editors - healthy.** The gallery and G502 X Plus, QuadCast 2, Huntsman V2 Analog, and WH-1000XM6 editors render at every audited viewport. The Huntsman remains legible with lighting off, and the headset's routine controls fit the 1080x720 minimum without page-level overflow.
2. **Audio mixer and channel editors - healthy.** Mixer, Game, Chat, Media, and Microphone states are reachable deterministically. Disabled buses are enabled through the typed contract for their audit state, and the native noise-suppression workflow survives persistence, orderly restart, host termination, and recovery.
3. **Capture and clip editing - healthy.** Source, encoder, replay, library, and editor states remain coherent. The capture toolbar now identifies the encoder value explicitly instead of presenting an ambiguous bare state.
4. **Modules, settings, diagnostics, clips, and updates - healthy.** Primary settings, diagnostic views, clip settings, device popovers, and update states complete their native workflows across the required viewports.

## Findings resolved

- The default native-review command now opts into isolated fixtures, avoiding live-HID enumeration stalls.
- Fixture preparation now supplies the canonical device inventory instead of inheriting an empty live profile.
- Native review can reach disabled audio channels by establishing the required state through typed preload operations.
- The Huntsman off-state render retains its silhouette on the dark device stage.
- The capture footer labels its encoder state.
- The WH-1000XM6 minimum-window layout now exposes the complete routine listening controls without vertical or horizontal page overflow.
- Native interaction checks were updated to the current personal-mix, microphone, and lighting-editor contracts.
- The native noise lifecycle workflow now establishes its own audio-engine preconditions and waits for canonical readiness before asserting state.

## Final evidence

- [Native capture report](final-native/report.json): 68 captures, 17 product surfaces, and four viewports (1080x720, 1420x900, 1920x1080, and 2560x1440), with zero page-level horizontal-overflow findings.
- Representative minimum-window evidence: [Devices](final-native/1080x720-devices.png), [WH-1000XM6](final-native/1080x720-wh-1000xm6.png), [Audio mixer](final-native/1080x720-audio-mixer.png), [Capture](final-native/1080x720-capture.png), and [Settings](final-native/1080x720-settings.png).
- `verify:native-ui`: 17 interaction steps passed through an application restart.
- `verify:device-popovers`: passed.
- `verify:app-update-ui`: passed at 1080x720, 1420x900, and 1920x1080.
- Native RNNoise lifecycle: persistence and microphone test passed; orderly restart changed PID; killed-host recovery completed in 1,227 ms with zero capture overruns and zero dropped or bypassed frames.
- `bun run test`: 169 passed, 0 failed across 43 files, including deterministic Capture.Host and Audio.Host checks and the release noise bridge build.
- `bun run check`, `bun run check:source`, `bun run check:types`, `bun run build`, both required `dotnet build` commands, `bun audit`, and `git diff --check`: passed. Both .NET builds reported zero warnings and zero errors; Bun reported no vulnerable packages.

## Notable strengths

- Capability and persisted state continue to round-trip through the canonical contract instead of being imitated in React-local state.
- The complete audio signal chain stays visible and operational at the minimum window rather than being hidden behind deep disclosure.
- Real device imagery and device-specific editors preserve product identity while unsupported or unavailable behavior remains explicit.

## Evidence limits

- Fixture-backed Electron review proves native rendering, responsive geometry, state transitions, persistence, and the exercised host recovery paths. It does not prove physical HID or Bluetooth writes, physical lighting/audio behavior, production capture output, or disconnect/reconnect behavior on the named devices.
- No long-duration memory, handle-growth, replay ring-wrap, or encoder soak was run in this audit.
- The application-update verification exercised development-mode UI states, not a packaged installer/update transaction.
