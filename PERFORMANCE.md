# Performance budgets

Replay audio adds no Electron PCM traffic or polling. Capture.Host opens WASAPI
capture only for enabled tracks, plus a detector-only microphone input while
reaction clipping needs one. Disable and shutdown dispose those inputs. Replay
device discovery runs a one-shot `Capture.Host --list-audio-endpoints` process at
startup, on renderer activation at most once every 10 seconds, and on manual
source refresh, with a 15-second deadline and a 2 MiB output cap. It adds no timer
or long-lived process.

Vite dev launches now collect an automatic local feedback feed, readable with
`bun run diagnose:dev`. It shares the existing five-second resource tick; status
writes coalesce, recent events/history are bounded, and it does not activate the
native resource helper or add renderer snapshot updates. First-window startup and
sustained CPU/event-loop anomalies can produce a three-second main/renderer profile
(five-minute cooldown, three automatic batches per app session). Manual profiles
are bounded to 1–10 seconds. The current session retains four batches, each profile
at most 8 MiB, plus two previous ended sessions. Details and the opt-out are in
[Resource diagnostics](docs/resource-diagnostics.md#automatic-development-feedback).
These instrumented measurements are for diagnosis, not budget qualification.

Microphone calibration runs only on request in an isolated Capture.Host helper.
It plays five test sounds over eleven seconds and retains two bounded arrays of
millisecond energy values. Endpoint callbacks do no allocation, locking, logging,
or asynchronous work. Main enforces a twenty-second process deadline and bounded
output; cancel, tray closure, settings navigation, and shutdown release the helper.
The saved correction is constant frame arithmetic with no extra process or
polling. See `docs/audio-sync-calibration.md`.

The optional vertical framing guide owns one static transparent renderer only
while enabled. It has no scripts, preload, animation, polling, media process, or
snapshot subscription. Display-change listeners exist only for its lifetime and
are removed on disable, display removal, renderer failure, and shutdown. Geometry,
color, and dimming replace one serialized CSS rule on a display-sized surface.
Quick Controls remains destroyed when
dismissed; its glass material uses Windows composition with an opaque fallback.

Community module downloads are user-initiated, with one review request at a time,
bounded responses, a 20-second deadline per request chain, and shutdown
cancellation. Main retains at most four package reviews, each valid for ten minutes; expiry
is pruned on access without a timer. Community modules reuse the lazy discovery
sandbox and retain no host while disabled. Updates are manual.

The onboarding backdrop draws its existing paths into one software-backed canvas
on resize. Its ResizeObserver disconnects and the pixel buffer is cleared on
unmount. Step changes only translate the layer; there is no idle drawing loop.
This avoids retaining Chromium GPU path caches after closing the renderer.

These are release gates, not marketing claims.

Runtime handoff retains one presence pipe per instance, one owner pipe for the
active runtime, and one passive watch connection while installed Switchboard is
paused. Healthy ownership has no polling timer. Handshakes have bounded messages
and deadlines; all sockets close at shutdown. The standby window is static,
sandboxed and has no preload, subscriptions, device discovery or engine processes.
Development startup performs one bounded process inventory only when no cooperating
installed peer responds, to avoid overlapping an older installed build.

The Electron 44 Browser, sandbox utility, and GPU process floor is part of the
core budget. On the supported Windows configuration that floor is approximately
246 MB private in tray mode and 304 MB with the renderer open. A 70 MB tray
target would require a separate native background service rather than an
Electron main process. Replay includes Capture.Host and the FFmpeg hardware
encoder process; NVENC reserves substantial private address space even when its
resident working set is materially lower. Rebaseline these gates when Electron,
Chromium, FFmpeg, or the supported encoder stack changes.

Idle memory and CPU gates use the median of a 60-second sample after warmup.
The report retains p95 and maximum values so transient allocation remains
visible without turning a single Chromium spike into a release failure.

| State | Memory target | CPU target |
|---|---:|---:|
| Core in tray, renderer destroyed | < 270 MB private | < 0.3% sustained |
| UI open, no engines | < 340 MB private | < 0.7% sustained |
| Capture host waiting, no encoder children | +100 MB private | +0.3% sustained |
| Replay engine active | +1,000 MB private / +600 MB working set | < 2.0% CPU with hardware encode |
| 24-hour growth | < 10 MB | no monotonic handle growth |

Waiting/error/stopped capture runtime uses the host-only allowance once the host
is running and reports no encoder children. Starting, unknown, buffering and
saving retain the existing 1,000 MB / 2% allowance; saving has an explicit policy
entry with the same memory cap. These states reset the guard's rolling window
when their budget changes. Diagnostic hosts retain the conservative allowance.

September 14 investigation reproduced roughly 700 MB GPU-process private memory
with a composited real-library fixture on this AMD system. Reducing the library
to 22 clips and blocking thumbnails did not remove the allocation. A Chromium
memory dump attributed most of the excess to native heaps, not image surfaces.
CPU rasterization offered only a modest improvement, Graphite was already off,
and OpenGL increased memory. No backend override is shipped. Hidden idle gates
do not establish composited-window or playback resource usage; keep these
measurements separate. See `design-qa/performance-execution-20260914/RESULTS.md`.

Main uses narrow, copied reads and schema-validated branch updates for telemetry,
settings and device publication. Published snapshots are deeply frozen, with
unchanged branches shared. IPC sends one full subscription baseline followed by
revisioned changed branches; preload validates and reconstructs snapshots and
requests a fresh baseline after a revision gap. Full mutation responses and
preload-to-renderer snapshot copies remain; this is not zero-copy transport.

Windows device topology is cached behind a hidden native BaseWindow with no
webContents. DBT_DEVNODES_CHANGED invalidates the inventory through one 250 ms
coalescing timeout. The five-second device-status cycle remains for battery and
protocol recovery; it re-enumerates topology after 60 seconds as a missed-event
fallback, or immediately on explicit refresh. Without notifications it retains
the five-second enumeration fallback. Disabling all device modules or disposing
the registry destroys the watcher, clears its cache and removes both timers.

Replay maintenance reads the bounded segment manifest when its metadata changes,
caches immutable closed-file metadata, and performs an orphan-directory sweep at
most every 30 seconds during ordinary ticks. Explicit replay selection always
reconciles file existence. Eviction updates cached inventory and retains locked
files for retry; changing session drops the cache. Absent manifest streams do
not enumerate their directory. The cache owns no thread, timer or file handle.

## Required measurements

Move to tray when a game starts is off by default. When enabled, the existing
media-free desktop helper checks game windows every two seconds (background
inventory remains capped at five seconds by the shared detector). After detection
it checks only the tracked process lifetime until exit, preserving manual reopen
through Alt-Tab. It retains one process handle, disposed on exit or shutdown.
Disabling this policy removes game watching; the helper and its timer stop unless
automatic scenes still need application watching. Capture is unchanged.

Main schedules capture recovery only after an enabled recorder stops or fails.
Retries back off through 1, 2, 4, 8, 16 and 30 seconds, then remain at 30 seconds
until recovery, with one unreferenced timeout and no concurrent configuration.
Healthy buffering/saving or normal source-waiting, manual changes, disabling
Capture and shutdown clear the timeout. Healthy capture adds no recovery poll.

The Capture library schedules one timeout for its earliest draft expiry, three
hours after the last save. It reloads drafts from main at that deadline and
clears the timeout when the library is empty or the route unmounts.

AMF capture uses a BGRA download and CPU conversion to NV12 before hardware
encoding to avoid capture-texture Direct3D failures. A September 7, 2026 live
1440p/60 H.264 discard-sink probe on the RX 9070 XT setup encoded 3,600 frames
in 60.28 seconds (322 duplicated, zero dropped), averaging 2.25% whole-machine
CPU for FFmpeg alone. This exceeds the 2% replay CPU target; it is a bounded
compatibility check, not a complete replay/audio resource or soak measurement.

- private working set and RSS;
- CPU time, sampled over at least 60 seconds;
- process count;
- Windows handles and GDI/user objects;
- encoder/GPU engine usage;
- disk write rate and ring size;
- audio glitches, overruns, and callback duration;
- captured/dropped frames;
- device reconnect count and leaked HID handles.

`bun run measure:idle` builds the production bundles, launches an isolated
native Electron instance, and samples both UI-open idle and close-to-tray idle
for 60 seconds each. It reports median, p95, and maximum Electron private bytes,
working set, first-to-last-window growth, normalized CPU, process count, Windows
handles, GDI objects, and USER objects. The default path uses canonical fixtures and no engines so it is
repeatable; set `SWITCHBOARD_IDLE_REAL_DEVICES=1` for a separate live-device
measurement that includes the normal five-second discovery cycle. Set
`SWITCHBOARD_IDLE_DISABLE_GPU=1` to measure the controlled software-rendering
mode separately; it is not evidence that high-resolution clip playback remains
within its CPU and dropped-frame budgets.

Users can enable the same startup path with **Low resource rendering** in
Settings > General. The preference is read and schema-validated before Electron
becomes ready, because hardware acceleration can only be disabled before that
point. The change takes effect on the next launch. Hardware acceleration remains
the default for smoother high-resolution clip playback.

The in-product performance snapshot uses Electron's real per-process metrics,
not fixed estimates. Collection remains at the five-second guard interval while
renderer publication is limited to every 30 seconds or a guard-state change.
This keeps Diagnostics current without turning the full canonical snapshot into
a high-frequency renderer update. Private bytes and working set are reported
separately; enabled native-host memory and CPU are added from host telemetry.

The renderer reconciles incoming IPC snapshots against its previous projection,
reusing unchanged branches and ID-matched collection items. A performance sample
therefore does not invalidate every clip card, sorted library, or media effect.
This does not reduce IPC payload size or the number of initially mounted cards.
Settings patches use the canonical partial-input schema without hydration
defaults, so unrelated changes preserve the software-rendering preference.

The clip grid and list virtualize their React controls within the existing native
scroll viewport. Date headings and explicit CSS grid tracks preserve the scroll
range; only intersecting rows, 300 px of overscan, and one retained interaction
row mount cards and thumbnails. Scroll and resize events share one cancellable
animation frame, with no idle polling. Unmount disconnects the observer and
scroll listener. Native Tab navigation crosses unmounted rows, while context
menus and editor return focus retain their originating row. Search, filtering,
favorites, and montage selection continue to operate on the full canonical
library, independently of which rows are mounted.

`scripts/measure-library-idle.mjs` measures a copied library in an isolated profile.
Set `SWITCHBOARD_LIBRARY_STATE` to the source state file and launch the script
through Electron after building. It copies thumbnails before reconciliation,
disables engines and physical-device modules, exercises 20 canonical updates,
then samples Settings memory for 60 seconds. The native window is placed offscreen
with throttling disabled: use this for controlled renderer comparisons, not a
foreground CPU release gate. `--verify` checks canonical favorite/settings state,
renderer reload, the three supported native sizes, and reduced motion. See
`design-qa/library-performance/REPORT.md` for the measured comparison and limits.
`--verify-virtual` additionally sweeps the complete grid/list library, checks
bounded mounting at all three sizes, and exercises keyboard focus, menus,
search, selection, and editor restoration. The virtualization comparison is in
`design-qa/library-virtualization/REPORT.md`.

The same sampler maintains a local resource journal under
`<userData>/diagnostics/resources`. It writes one compact JSONL sample every 30
seconds and temporarily samples the journal every 15 seconds while memory is
over budget or growing rapidly. Each record attributes Electron private bytes,
working set, CPU, native-engine totals, main-process heap/resources, system
memory, and a bounded renderer probe (JS heap, DOM, canvas, image, and video
counts) only while an anomaly is active. Routine healthy samples avoid executing
diagnostic JavaScript in the renderer. The journal never records paths, clip IDs,
device IDs, UI text, or media. Files
rotate at 8 MB and use `diagnosticsRetentionDays` for retention. Run
`bun run diagnose:resources` to summarize the newest session, or
`bun run diagnose:live` for a short red/green process-tree gate against the
currently running development app.

Capture video uses one FFmpeg input per encoder process. Do not force a
threaded packet queue for that single raw-video input. A large packet limit can
retain entire unencoded frames and consume hundreds of megabytes without
improving steady-state throughput. NVENC uses a three-frame output pipeline and
four encoder surfaces, with B-frame reordering and lookahead disabled. A zero
output delay makes FFmpeg wait on each submitted frame; the bounded pipeline
allows encoding to overlap without restoring automatic frame retention. Source
timestamps still own media time. Forced keyframes are IDRs so a replay can start
after earlier segments are evicted. NVIDIA game-load cadence and memory still
require hardware validation. `bun run measure:capture-host` exercises the
rebuilt development host at 1440p60 and fails if the video process crosses its
825 MB private-memory gate or continues growing after a 30-second warmup. Growth
uses the median of the first and final thirds of the sample window, so one
deferred encoder allocation is retained in the report without being mistaken
for a sustained leak. Set `SWITCHBOARD_CAPTURE_INCLUDE_AUDIO=1` to include the
system and microphone encoders in the capture-tree gate. The
broader application allowance also covers Capture.Host, optional audio encoder
children, and the Electron GPU-process increase while capture is active.

Connected capture audio writers wait for packets, with a 50 ms timeout to emit
silence when loopback stops delivering callbacks. Silence trails the monotonic
clock by 100 ms to allow normal callback delivery. This prevents long quiet
periods from accumulating an encoding backlog. The timeout and writer stop on
input disposal; analysis-only inputs create neither. Each writer retains a
48 KiB silence buffer instead of a 512 KiB batching buffer. Segment manifests
retain metadata for the maximum supported replay duration plus bounded headroom,
so increasing replay length does not restart capture or leave the old duration
limit in place. File eviction uses the current duration and a 64-bit byte budget;
it also removes files
that aged out of the manifest while the host was paused.

Engine command pipes pause further writes until drain. Each host retains at most
1 MiB of serialized queued/buffered commands, preserves FIFO ordering, and removes
unsent requests when their existing deadline expires. Pipe failure rejects pending
requests; shutdown still terminates a host whose command pipe cannot accept work.
These paths add no polling or persistent timers.

Physical device discovery continues on its five-second lifecycle, but a present
Logitech HID++ endpoint that fails to open is retried at most once every 30
seconds. The last confirmed controls remain visible but disabled during the
cooldown. Removing or changing the endpoint clears the cooldown so reconnecting
hardware can recover immediately.

When every device module is disabled, the registry skips HID enumeration and
removes its discovery timer. Enabling a module performs immediate discovery and
rearms one timer. Repeated start/disposal cannot accumulate timers.

## Startup responsiveness

The saved Quick Controls shortcut is restored immediately after settings load,
before diagnostics, device discovery, or engine restoration. Application scene
watching still begins after service initialization; opening the panel is not a
prerequisite for the shortcut, including when startup remains in the tray.

Auto Capture runtime/provider publications update only the capture branch.
Audio endpoint discovery reads only its owning branch; cached endpoint refreshes
return without copying the full state.
Subscription baselines retain canonical branch identity, avoiding a second
library-sized payload for the first ordinary update. Persistence retains at
most one latest pending generation behind the current durable write, serializes
only generations actually written, and drains on shutdown without a timer.

`node scripts/run-native-review.mjs state-churn` exercises these paths with
2,000 synthetic clip records, isolated settings/media, no engines, and hidden
Electron windows. The September 27 comparison measured 30 Auto Capture status
updates at 223.7 ms before and 2.2 ms after, with library invalidations reduced
from 30 to zero. Thirty disabled replay-audio sync checks went from 65.9 ms to
1.0 ms; cached endpoint refreshes dropped 30 full-state copies. The first
post-subscription delta fell from 772,827 to 316 JSON bytes. A synchronous burst
of 40 settings updates went from 40 durable writes/backups in 449.6 ms to one
write/backup in 17.1 ms, with final preferences verified after loading from disk.
These are bounded workload timings, not sustained CPU or whole-app RAM savings.
The persistence tests also cover a delayed or failed in-flight write, latest
pending state, the last durable backup, and exclusion of later transient updates.

Set `SWITCHBOARD_IDLE_BUILD` to a saved production output directory to compare
immutable builds with `node scripts/run-native-review.mjs idle`, while preserving
the same renderer assets and isolated profile/media policy.
The follow-up 60-second-per-state pair measured 364.9 to 351.1 MiB median private
memory open and 291.7 to 288.6 MiB in tray. The open GPU-process median changed
from 197.6 to 185.8 MiB, accounting for most of the total difference; one pair
does not establish a repeatable RAM reduction. Both builds still failed the
340/270 MiB memory gates and passed CPU gates (median rounded to 0.0%). Native
reopen checks, immutable-baseline delivery, delayed/failed persistence, recovery,
type/build/source checks and the JavaScript suite passed; physical engines,
populated media playback and long-running soak were not part of these fixtures.

Retained main windows stop snapshot-stream delivery on hide or minimize. Each
subscription keeps only its latest pending canonical snapshot and sends one
revision-contiguous catch-up patch on show or restore. Explicit subscriptions
and reloads still receive a full baseline. Window destruction and IPC disposal
remove the delivery listeners; this adds no timer. Minimize also pauses library
background work through the existing renderer-active
signal. Reopening restores a minimized window. Repeated renderer-active signals
return without cloning the full state, and the open path no longer duplicates
the focus handler's audio-device refresh.

`node scripts/run-native-review.mjs window-lifecycle` checks these paths in
isolated hidden Electron with injected visibility events, empty media storage,
and no hardware writes. A matched September 27 comparison of the previous and
updated lifecycle paths delivered 100 versus zero snapshot frames for 100 hidden
updates, then one catch-up frame after resume. The same workload while minimized
went from 100 frames to zero; 100 redundant activations went from 100 full-state
copies to zero. Three renderer destroy/reopen cycles checked current state and
listener cleanup. This proves lifecycle work elimination, not a foreground
rendering, physical-audio, whole-app memory reduction, or long-running soak claim.

The September 27 post-change production-bundle idle fixture sampled each state
for 60 seconds after warmup: 351.1 MiB median private memory open and 283.1 MiB
with the renderer destroyed. Both exceeded the existing 340/270 MiB gates.
Median whole-machine CPU rounded to 0.0% at one decimal in both states. The
earlier checkout run measured 345.9/280.3 MiB; other device work changed
concurrently, so these whole-checkout samples are not an isolated memory A/B.
The production-bundle startup sample reached the shell in 291.5 ms, and three
destroy/reopen samples took 154.4, 163.2 and 157.8 ms. These are hidden fixtures
with no engines or populated library; memory-budget acceptance remains open.

Library reconciliation and thumbnail enrichment wait while the main interface
is in the tray, including when its renderer is retained. Reopening resumes queued
work through the existing renderer-active signal, with no waiting poll or timer.
The saved-clips directory watcher runs only while the interface is open, coalesces
file changes over 250 ms, and closes in the tray or on shutdown. Reopening runs
one reconciliation to catch changes made while the watcher was stopped.
The current media operation may finish on close; shutdown aborts its child,
releases paused work, and waits for cleanup. Explicit imports, exports and replay
saves remain available independently. Reconciliation merges against current
canonical clips so saves, edits and deletions made while paused survive resume.

The idle harness now isolates its Videos folder as well as its settings profile.
Previously an apparently empty fixture could scan real unindexed clips in the
user's Videos folder; profiling found repeated FFprobe launches in tray mode.
Those old samples are library-indexing measurements, not core idle baselines.
Set `SWITCHBOARD_IDLE_CPU_PROFILE` to an output path to record a main-process
CPU profile during the tray phase; profile runs are diagnostic, not budget gates.
The corrected September 14, 2026 hidden native fixture run, with empty media
storage and no engines, passed both 60-second median gates: 315.5 MiB with the
renderer and 257.7 MiB in tray mode. Both reported 0.0% median whole-machine CPU
at the sampler's one-decimal precision. This isolates idle overhead; it does not
measure gameplay, physical devices, populated libraries, or active replay.

Replay video conversion uses at most two filter workers; each independent audio
encoder uses one filter worker. Software video encoding uses half the logical
processors, clamped to one through eight workers. x265 and SVT-AV1 receive their
own pool limits because their internal pools do not obey FFmpeg's thread count
alone. Startup and on-demand synthetic encoder probes share these limits, with
one filter worker. This bounds worker pools, not total process CPU utilization;
high-resolution software capture can still miss its frame budget.

An optional encoder probe timeout is diagnosed and excluded from the current
capability inventory. It cannot discard already-working hardware encoders and
restart the entire probe sequence. User cancellation still aborts the operation,
and the timed-out child is reaped before another probe starts.

The one-second replay maintenance pass obtains each stream inventory once and
uses post-eviction byte totals for its storage guard. This reduces ring inventory
reads from eleven to four per tick without extending retention or polling
intervals. Failed deletions remain included in those byte totals. Snapshots and
save requests still read fresh inventories, and the timer stops with the host.

`dotnet run -c Release --project engines/capture-host-tests -- --resource-benchmark`
compares previous automatic threading with production limits using 600 synthetic
1080p60 BGRA frames, with no desktop/audio access. On September 14, 2026, setting
`DOTNET_PROCESSOR_COUNT=4` and limiting the FFmpeg child to four logical processors
on a Ryzen 9 9950X3D reduced peak private memory from 455.1 to 357.8 MiB and peak
threads from 31 to 19. CPU time was 11.19 vs 10.61 seconds; elapsed encode time
increased from 3.30 to 4.40 seconds, still faster than the ten-second source.
This is a synthetic scheduling constraint, not an Intel or low-end hardware
emulation, NVIDIA gameplay test, sustained resource gate, or quality comparison.
The encoder preset, bitrate, frame rate and resolution remain unchanged.

`bun run measure:startup` builds the production Electron bundles and measures the isolated native review path from main-process JavaScript entry to a committed control-plane shell. The budget is 1,500 ms; the harness uses canonical fixture devices so physical HID latency cannot make the result nondeterministic. Overlay dismissal is reported separately because Chromium throttles animation frames for a hidden review window.

`bun run measure:settings` builds the same production bundles and measures the
first Settings navigation in native Electron. The route must commit visible
layout without a loading state and stay within a 100 ms click-to-DOM-commit
budget. `bun run measure:routes` applies the same budget to the preloaded Capture
workspace. Visible native QA remains the proof for first-paint
presentation because a hidden Chromium window cannot provide honest paint timing.

Persisted state hydration is the only renderer-readiness gate. Hardware discovery, audio endpoint discovery, clip reconciliation, update scheduling, and optional engine restoration continue through Electron main and publish canonical snapshot updates when ready. A stalled peripheral must not keep the startup screen visible.

Capture and capability-heavy device editors are loaded on demand. Settings
is part of the renderer shell so its route has no chunk-loading state and is visible
on the first paint after navigation. The default Devices gallery does not parse
Capture or individual device-editor code before the user opens those
workspaces. The new-clips review surface is loaded only when canonical clip state
contains an unreviewed clip.

Linked local modules follow the same rule. Persisted-state hydration publishes their last known project records, then manifest validation and sandbox preparation continue after renderer readiness. A local project path, entrypoint, or sandbox failure cannot hold the startup screen.

## Guard behavior

The product should surface sustained regressions, not react to one noisy sample. Initial policy:

- sample every 5 seconds;
- evaluate a rolling 60-second window;
- warn after three consecutive failed windows;
- include per-process attribution;
- never auto-kill an engine while recording or carrying active audio without an explicit recovery plan.

The application updater performs one delayed launch check and then checks every 30 minutes while automatic checks are enabled, including after an installer is downloaded. Download completion reschedules that same timer for an immediate check to discover releases published during the download. Manual and idle install requests recheck the feed before installation. Automatic download and install-for-next-startup change updater policy without adding timers. Idle installation adds one unreferenced 60-second eligibility timer only while an update is downloaded, automatic checks are enabled, and Install while away is enabled. It reads Windows idle time and existing activity state; it never starts or stops an engine to make an update eligible. Disabling either policy, leaving downloaded state, or disposal clears the idle timer. Disposal also clears updater listeners.

## Soak tests

Montage export normally encodes each segment once at its final bitrate, seeks before
decoding trimmed sources, and copies video during final assembly. It selects the
existing supported share encoder, falling back to CPU for the remaining sequence
if hardware encoding fails. An oversized result automatically retries from the
original sources with software two-pass encoding at the same bitrate. If needed,
one final attempt reduces video bitrate using the measured size and updates the
output resolution for that budget. Audio, edits, and the full duration remain;
only a verified file within the target is published. These corrections add work
only to oversized exports, with at most three attempts and one FFmpeg process at
a time. FFmpeg progress is forwarded only during an export and stays monotonic;
cancel waits for the worker to close before cleaning temporary files. Final
output size is verified, and a cancelled replacement preserves the existing file.
Native editor/render evidence and the bounded CPU comparison are recorded in
`design-qa/editor-tools/REPORT.md`. These are fixture results, not a long-project
or physical-capture soak claim.

1. Renderer open for 8 hours with frequent navigation.
2. Tray mode for 24 hours with renderer destruction enabled.
3. Capture ring wrapping continuously for 24 hours.
4. Save a replay every 2 minutes for 4 hours.
5. Replay audio tracks capturing for 24 hours while endpoints connect/disconnect.
6. Repeatedly start/stop each engine 500 times.

## Device sessions

Mouse battery lighting reuses the session's battery reads and change notifications; it
adds no battery polling loop. By default, battery at or below 20% triggers a
seven-second burst of three red flashes at 25% brightness at most once every five minutes. Each flash lasts two seconds with half-second dark gaps. At or
below 10%, lighting remains off and warnings stop. Both thresholds and the flash
interval are configurable. Only the active burst owns a timer, with one pending transition at a time;
charging, cutoff, disabled policy, disconnect, module disable, and shutdown
cancel it. Automatic writes affect live RGB RAM only, never onboard flash.

G502 button reporting is enabled after its notification listener is attached and
rearmed on recovery notifications or a failed device read. Healthy five-second
discovery ticks issue no G502 HID queries. Failed session opens retry after five seconds.
Neither recovery path creates a timer or writes onboard flash; module disable
and shutdown stop recovery with the existing discovery/session lifecycle.

Onboard refresh reuses the session's fixed profile format and sector geometry.
Mode and profile selection refresh on device/profile notifications; full profile
reads still require CRC validation. A timed-out
read transaction gets one serialized retry; repeated failures retain the last
verified profile and back off through 5, 10, 20 and 30 seconds on the existing
discovery cycle. Recovery resets backoff. No new timer or automatic write retry is
introduced, and repeated failures in one outage produce one warning.

An enabled local device-discovery add-on creates at most one hidden sandboxed Chromium host. The host is lazy, performs work only during the registry's existing five-second discovery cycle, has no Module Host timer of its own, and is destroyed on disable, unlink, runtime failure, or shutdown. A disabled project retains no renderer process or subscription. Each active local host counts as an additional process in the canonical performance snapshot; real private working-set and long-running growth still require native measurement before release acceptance.

The G502 X Plus native-control path holds one non-exclusive HID++ handle only while the Logitech module and matching device are active. Sniper-button edges, battery changes, profile changes and receiver recovery are notification-driven. Healthy discovery projects cached confirmed values without device queries, avoiding firmware indicator flashes and queued work ahead of controls. Startup and invalidated state refresh on the existing cycle, with no extra timer. Explicit lighting commands and recovery verify RGB power; Unknown selections retry restoration. RGB ownership is retained in either onboard mode and released on session close. Lighting controls never write profile flash. Stored DPI, report-rate and button changes retain CRC validation and immediate readback. Module disable, receiver removal, and shutdown close the handle and restore pre-hold DPI when reachable. Idle transport errors mark the session unavailable for the existing recovery path.

Routine G502 discovery does not read profile flash, mode, DPI, battery, report rate
or RGB ownership. Full CRC-validated contents refresh on profile/reconnect events
and failed-read recovery. Profile mutations
always read fresh contents before writing. Lighting packs up to four zones into
each HID++ report and commits only after all batches succeed. A partial failure
invalidates acknowledgement and restores the last confirmed selection on discovery.
The complete acknowledged lighting selection is persisted immediately, including
zone colors and power; an older discovery cannot overwrite a newer lighting write.

The QuadCast 2 path holds one non-exclusive blocking-read handle for absolute tap-mute events and one non-exclusive feature-report handle only while maintained lighting is active. Lighting refreshes every 55 ms because the researched display frame expires on-device; the timer is unreferenced and stops on module disable, disconnect, write failure, or shutdown. A failed mute read closes its handle and retries after one second while the device remains present.

## Source discovery

Source-picker refreshes are on demand and coalesced. A media-free helper exits
after one inventory, with a 15-second deadline and 1 MiB output limit. Failed
scans retry after one and two seconds, then stop until another refresh request.
Shutdown aborts discovery and its retry delay. No discovery polling timer or
helper remains idle, and discovery never restarts the recording host.

## Windows update handoff

Silent Windows updates use the NSIS process itself for executable-path checks,
without launching PowerShell or querying WMI. A bounded 64 KiB PID snapshot is
checked against the exact installation directory, including its separator.
Checks repeat every 500 ms only during update shutdown, for at most 30 seconds;
a busy app or incomplete scan stops installation before replacing files. Active
recordings and state get the normal shutdown path rather than a forced kill.
The installer and updater uninstaller use Windows background processing mode
and idle CPU priority during their work. The installer restores its previous
CPU and I/O priorities before launching the updated application. This trades
installation speed under contention for foreground responsiveness. The previous
version's uninstaller still uses that version's scan implementation on the first
upgrade, but inherits idle CPU priority. `node scripts/verify-update-installer.mjs`
checks native priorities, directory isolation, graceful shutdown, a busy app,
the uninstaller, and both production NSIS template passes without installing the
application. It is not an end-user machine update benchmark.

## Opt-in resource debugging

Detailed recording adds one media-free Windows counter helper. It has no polling
timer: the existing five-second sampler requests up to 255 known PIDs plus the
helper itself. Only one request may be pending. A ready handshake gives cold
.NET startup up to 15 seconds; each subsequent sample is bounded to 2.5 seconds
and 256 KiB. Counter reads use one limited-query handle per PID rather than
repeated system-wide process snapshots. Collector health transitions publish
immediately; ordinary healthy readings retain the 30-second publication interval.
Disable, diagnostic cancellation/completion, reset and shutdown stop the helper;
a failed helper retries on the next existing sample. Its memory/CPU/I/O appear
under Collector, separately from the ordinary performance guard's engine budget.
Main retains 720 compact trend points (about an hour), 256 process lifetimes and
the existing 120 full samples. Full samples contain only their current native
counters rather than nested histories. Canonical renderer publication remains at
30 seconds or guard-state changes. Optional state is omitted from persisted
settings. Partial samples create chart gaps, and the first counter sample has no
rate. CPU uses whole-machine normalization; I/O includes network and device I/O.
Short-lived processes between samples and GPU/thermal counters remain unavailable.

Developer mode starts an event-driven diagnostic timeline with no extra polling
timer. Main retains at most 2,000 events / 2 MiB, with an 8 KiB per-event limit
and a 120-events-per-second cap; the capture host caps diagnostic emissions at
60 per second. Events reuse the resource journal's bounded write queue and
retention policy. Native health records reuse existing snapshots. Disabled
Developer mode emits/retains no developer events and stops optional main/renderer
resource probes unless an on-demand diagnostic run owns collection. Existing
capture processes are not restarted to toggle logging. FFmpeg progress reuses
its existing output stream and emits at most every five seconds plus final
progress while diagnostics are enabled; it adds no polling timer.

Settings > Diagnostics provides detailed resource recording and local JSON export.
It reuses the five-second sampler, keeps renderer publication at 30 seconds, and
adds bounded operation counters plus a 20 ms main-loop probe only while enabled.
The export retains the latest 120 samples; disabling stops the extra probes and
retains the report for export. See [Resource diagnostics](docs/resource-diagnostics.md)
for measurement semantics, limits, and the comparison workflow.

Setup scenes and status cues follow canonical state events. Clip-saved lighting
uses one 1.5-second timer, cancelled when disabled or disposed. Desktop controls
run the bundled Capture.Host in a separate media-free mode only while a global
quick shortcut or automatic scene is enabled. Application matching checks the
configured executable names every two seconds, stopping when no automatic scenes
remain. Shortcut release checks run every 16 ms only while that shortcut is held.
The helper exits on stdin EOF; shutdown waits for exit and force-stops after two
seconds. Resource samples reuse the existing five-second performance sampler.
The quick panel is created on request and destroyed on release, blur, or close.

On-demand capture diagnostics use canonical transient state owned by main and
narrow run/cancel IPC operations. A stopped capture engine gets a temporary host
that is disposed after the run; an existing host serializes checks through its
lifecycle gate. Active recordings skip competing encoder/capture probes. There
is no background diagnostic timer. Each run owns a cancellable one-minute
observation window using the existing five-second resource sampler. Initial and
final samples are awaited, including on cancellation; completed events and
samples remain exportable without leaving optional collectors enabled. Saved
Developer mode preferences are unchanged. Native checks have a 90-second
deadline and each FFmpeg diagnostic probe has a five-second timeout with bounded
output and child-process cleanup on timeout or cancellation. Startup capability
probes use the same isolated process runner with a 15-second cold-driver allowance;
their closed stdin cannot consume the capture host's JSON commands. Three-frame capture probes discard output.
Configuration changes and shutdown cancel the run; diagnostics do not change
capture preferences. Completed results remain available until the next run or
application restart, including when Developer mode is disabled.
