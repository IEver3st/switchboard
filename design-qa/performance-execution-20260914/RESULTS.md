# Switchboard performance implementation, September 14, 2026

Four performance changes are implemented locally. GPU allocation investigation is
complete enough to rule out several app-level causes, but a safe reduction of the
large native GPU heap has not been established. No release, installed-app settings,
physical device settings, or captured media were changed. Existing uncommitted
work was preserved.

## Implemented

- Main state has copied branch reads and atomic, schema-validated branch updates.
  Telemetry, settings, and device publication use these paths. Published state is
  frozen; unchanged branches are shared. New snapshot subscriptions get a full
  baseline followed by revisioned branch frames. Preload validates every received
  branch and resynchronizes on missing revisions. Omitted hydration-default fields
  are not inserted into patches. Command results and the public snapshot API remain
  complete snapshots, including preload-to-renderer copies.
- Capture waiting without child encoders gets a 100 MiB / 0.3% host allowance,
  instead of the full 1,000 MiB / 2% capture allowance. Starting, unknown, buffering,
  saving and diagnostic-host cases retain the conservative existing allowance.
  Saving is an explicit policy entry; its cap has not been loosened.
- Windows device arrival/removal broadcasts invalidate a cached HID inventory.
  The owner is a hidden BaseWindow with no webContents, extra process, or polling.
  A 250 ms event burst coalescer and the existing five-second status cycle handle
  updates. Full enumeration falls back to once per 60 seconds; explicit refresh
  bypasses the cache. If notification setup fails, five-second enumeration remains.
  Disabling the last device module destroys the window and clears timers/cache.
- Replay caches immutable closed-segment metadata from bounded manifests. Ordinary
  ticks no longer enumerate every stream directory and stat every retained segment.
  A 30-second sweep handles orphan files; explicit replay selection reconciles file
  existence. Eviction updates the cache and retries locked files. Session changes
  discard cached metadata. Absent stream manifests do not scan directories.

## Measurements

Using the user's 1,272-clip state in memory, with persistence disabled:

| Operation | Audit baseline | New narrow path |
| --- | ---: | ---: |
| State read, median | 6.09 ms full snapshot | 0.023 ms capture branch |
| Transient update, median | 14.78 ms full-state update | 0.156 ms capture update and publisher |
| Serialized frame | about 966 KB full snapshot | 2,468 bytes capture patch |

These are Bun microbenchmarks of the changed operations, not Electron input latency
or total CPU savings. Full snapshot reads still scale with library size. In the
600-segment native fixture, 20 steady maintenance ticks produced one directory sweep
and retained accurate completed-byte accounting across eviction and external deletion.
The cached-device fixture made one enumeration across the first eleven five-second
status refreshes, then refreshed at 60 seconds and immediately after invalidation.

The composited full-library Electron comparison did not establish a whole-app memory
reduction: Settings median total private memory was 873 MiB before and 917 MiB after,
with GPU allocation dominating and varying between runs. Twenty canonical Settings
updates used 359 ms renderer task time before versus 326 ms after. Treat that single
comparison as directional evidence, not a stable performance percentage.

The isolated hidden idle check passed its existing budgets after the changes:
320.5 MiB median with the renderer loaded (0.1% median CPU), and 253.1 MiB in tray
with the renderer destroyed (0% rounded median CPU). Each phase sampled for 60
seconds after warmup. Open-window p95 private memory was 398.9 MiB; the documented
gate uses the median. The audit baseline was 319.4 / 261.6 MiB respectively. These
small differences are not evidence that the composited GPU allocation was fixed.

## GPU result and limit

The installed app held about 731 MiB GPU-process private memory during the audit.
The isolated real-library fixture reproduced roughly 714 MiB, retaining about
674 MiB after navigating to Settings. Reducing the library to 22 clips, blocking
thumbnail requests, and a blank-window/source-enumeration comparison ruled out
library count and desktop previews as sufficient explanations. A detailed Chromium
memory dump showed about 426 MiB in GPU-process malloc/native heap categories,
while attributed GPU resources were about 29 MiB. This does not identify the exact
native allocator or prove a leak.

CPU rasterization retained approximately 628 MiB initial GPU private memory;
Graphite was already disabled and disabling it explicitly did not help. ANGLE
OpenGL increased GPU private memory to approximately 1,052 MiB. These switches are
experiment-only harness options; none were added to production startup.

Further GPU remediation needs native allocation-stack/driver profiling and a
controlled visible-playback workload. Existing Low resource rendering remains an
explicit user choice; its preference and default were not changed. Hidden idle
results must not be presented as a composited-window or gameplay resource gate.

## Verification

- Full JavaScript suite: 431 passed, 6 skipped, no failures. After the final patch
  schema correction, focused snapshot-stream and performance tests passed again.
- Capture.Host deterministic suite passed, including resource policy, replay
  timing, ring wrap, locked-file eviction, cached inventory and session replacement.
- Native notification test: three start/message/stop cycles, no renderer, no
  visible window, idempotent cleanup. This uses an injected Win32 broadcast;
  physical unplug/replug remains untested.
- Real-library native Capture and Settings checks passed at 1080x720, 1420x900,
  and 1920x1080. Favorite state, multiple subscribers, omitted setup fields,
  renderer reload, overflow and reduced motion were exercised.
- Type checks, structure/security/source checks, production build and diff
  whitespace checks passed. The repository has no lint task.
- No physical audio/device control, active gameplay encoding, or 24-hour soak
  qualification was performed. Native DSP/driver code was not changed.

Evidence is in the adjacent JSON, log and screenshot directories. Native GPU
experiments used isolated profiles and offscreen windows. The installed process
and its settings were left intact.

## References

- [Electron BaseWindow](https://github.com/electron/electron/blob/main/docs/api/base-window.md)
- [Microsoft DBT_DEVNODES_CHANGED broadcast](https://learn.microsoft.com/en-us/windows/win32/devio/dbt-devnodes-changed)
- [Chromium GPU switches](https://chromium.googlesource.com/chromium/src/+/refs/tags/141.0.7347.0/gpu/config/gpu_switches.cc)
