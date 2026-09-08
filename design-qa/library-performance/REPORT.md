# UI-open performance investigation, September 4, 2026

Three changes are implemented: preserve unchanged renderer snapshot branches,
stop device discovery when all device modules are disabled, and prevent partial
settings updates from resetting the low-resource rendering preference.

## Measurements

The live development process failed `bun run diagnose:live`: 835.1 MB maximum
private memory, with about 403 MB in GPU, 293 MB in the renderer, and 110 MB in
Browser/main. Both native engines were stopped. Its resource journal recorded a
1,486.4 MB peak after Capture navigation, with 443 images and 15,971 DOM nodes.
The short live sample did not demonstrate monotonic growth.
Diagnostics' "Core" total includes the GPU and utility processes; it is not
main-process heap. Private bytes and working set are already measured separately.

Controlled runs used production bundles, 442 real indexed clips with copied
thumbnails, disabled engines/device modules, and isolated state. Native windows
were offscreen with throttling disabled. The control build disables only snapshot
identity reuse through `baseline.config.ts`; other code matches the optimized run.
Twenty canonical settings updates exercise the same full-snapshot delivery path
used by background state publication. Each run then samples Settings for 60 seconds.

| Measurement | Sharing disabled | Sharing enabled | Enabled, software rendering |
| --- | ---: | ---: | ---: |
| Renderer task time for 20 updates | 2,284 ms | 249 ms | 248 ms |
| Initial library private memory, whole Electron tree | 549 MB | 566 MB | 389 MB |
| Private memory immediately after updates, whole tree | 764 MB | 569 MB | 420 MB |
| Renderer private memory immediately after updates | 416 MB | 208 MB | 209 MB |
| Settings private memory, 60-second median | 396 MB | 409 MB | 211 MB |

Evidence: [control](control/report.json), [optimized](optimized/report.json),
[software rendering](software/report.json).

Identity reuse reduced measured update work by 89%. It reduced transient renderer
allocation in this run, but did **not** reduce the settled Settings memory floor.
Hardware-accelerated Settings remained above the 340 MB gate. Software rendering
reduced its median to 211 MB, but this is not video playback or encoder proof.
The browser `performance.memory` field is an estimate; process-private figures
come from Electron process metrics. These are single controlled comparisons,
not soak or public-release measurements. Earlier foreground/aborted harness runs
under `before/` and `after/` are excluded from this table.

## Implemented changes

- `reconcile-snapshot.ts` recovers identity for unchanged canonical branches and
  ID-matched collection entries. All renderer store snapshot writes use it,
  including responses, subscriptions, and optimistic rollback. Inputs remain
  immutable; acknowledgements and removed fields still replace changed data.
- `updateSettingsInputSchema` removes persisted defaults from patch fields.
  Previously `{ performanceGuard: false }` also reset software rendering,
  appearance overrides, developer mode, workspace visibility, and onboarding.
  Main IPC now uses this existing canonical schema rather than rebuilding it.
- `DeviceRegistry` avoids HID enumeration and removes its interval with no
  enabled device modules. Enabling re-arms one timer and immediately discovers;
  repeated start/disposal and stalled discovery remain covered by tests.

## Remaining opportunities, ranked

1. **Render only the visible library rows.** Both runs still mount 442 cards,
   15,642 nodes, and 443 image elements. Only 32 images decoded initially, so
   existing lazy loading already helps. `content-visibility` skips some browser
   layout work but leaves React components, menus, and tooltips mounted.
   Virtualize grid rows and list rows while preserving date headings, focus,
   scroll restoration, selection, context menus, and search across all clips.
   This is the strongest candidate for reducing initial library heap use.
2. **Validate media teardown across repeated editor/navigation cycles.** The live
   spike included a video, while this comparison isolates the library. The
   single-clip video has no explicit source-release cleanup; some montage
   cleanup reads refs during passive unmount, when refs may already be cleared.
   Measure decoder resources and detached media before selecting a fix. This is
   a plausible contributor, not a demonstrated leak from this investigation.
3. **Reduce main-process snapshot copying and publication payloads.** StateStore
   clones/validates the whole snapshot and IPC still delivers the full clip
   library for unrelated state updates. Renderer sharing avoids rendering work,
   not serialization. Profile this before introducing revisions/deltas or
   validated branch updates, preserving one canonical state owner.
4. **Replace periodic PnP inventory with device notifications.** Enabled modules
   still invoke `pnputil.exe` on the five-second discovery cycle. Disabled-module
   scans are now removed. Notification-driven inventory could remove remaining
   wakeups; reconnect, sleep/resume, and vendor discovery need native tests.
5. **Use the existing software-rendering option when playback permits.** The
   measured GPU allocation fell substantially. Keep acceleration as the default
   until high-resolution playback, scrubbing, and dropped frames are tested.

Artwork processing already has a six-entry cache; waveform and audio-preview
promise caches each have a 16-entry bound. Capture source previews are demand
driven, meter telemetry is consumer driven, and performance publication is
already limited to 30 seconds or guard changes. No new generic polling interval,
dependency, forced garbage collection, or raised resource budget was introduced.

## Validation

- `bun run test`: 304 passed, 3 existing FFmpeg montage tests skipped; native
  Capture.Host and Audio.Host deterministic tests passed.
- Structure/source/type checks, production build, both .NET host builds, and
  scoped `git diff --check` passed. The final whole-checkout whitespace check
  found a concurrently added blank line at EOF in `pages/devices.tsx`, which is
  outside these changes and was preserved.
- [Native verification](verification/verification.json): canonical favorite and
  partial settings changes, renderer reload, reduced motion, and Capture plus
  Diagnostics at 1080 x 720, 1420 x 900, and 1920 x 1080. All six rendered PNGs
  were inspected. No page-level horizontal overflow was observed.
- A later build briefly encountered a missing `equipment-workbench.css` from
  concurrent keyboard work. Once that file appeared, the rebuild and full tests
  passed. Unrelated source edits were preserved.
- Installed-app memory, physical reconnect, foreground playback CPU, and long
  soaks remain separate validation boundaries. The running development session
  is not used as post-fix proof.
- [Empty-library idle check](empty-library-idle.json): with onboarding completed,
  engines/device modules disabled, and the native renderer hidden, the 60-second
  medians were 285.2 MB / 0.0% CPU with the renderer retained and 230.9 MB / 0.0%
  after close-to-tray destroyed it. Both deterministic budget checks passed.
  This used the last successful renderer bundle while concurrent keyboard work
  was finishing; it does not reproduce a foreground 442-clip session.
