# Performance budgets

These are release gates, not marketing claims.

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
| Audio engine active | +65 MB private | < 1.0% typical |
| Replay engine active | +1,000 MB private / +600 MB working set | < 2.0% CPU with hardware encode |
| 24-hour growth | < 10 MB | no monotonic handle growth |

## Required measurements

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
improving steady-state throughput. NVENC also runs with zero encoder output
delay because the rolling segment writer consumes frames immediately; the
automatic delay allocation reserves roughly another 250 MB of private memory
without benefiting replay capture. `bun run measure:capture-host` exercises the
rebuilt development host at 1440p60 and fails if the video process crosses its
825 MB private-memory gate or continues growing after a 30-second warmup. Growth
uses the median of the first and final thirds of the sample window, so one
deferred encoder allocation is retained in the report without being mistaken
for a sustained leak. Set `SWITCHBOARD_CAPTURE_INCLUDE_AUDIO=1` to include the
system and microphone encoders in the capture-tree gate. The
broader application allowance also covers Capture.Host, optional audio encoder
children, and the Electron GPU-process increase while capture is active.

Audio meter telemetry is demand-driven end to end. Audio.Host produces 20 Hz
meter frames only while a visible renderer has an Audio workspace consumer.
Closing, hiding, navigating away, destroying the renderer, or disposing IPC
clears that demand and parks the meter loop without a polling timer. Five-second
host snapshots still discover application and
endpoint transitions, while unchanged timing-only diagnostics publish at most
once every 30 seconds.

Physical device discovery continues on its five-second lifecycle, but a present
Logitech HID++ endpoint that fails to open is retried at most once every 30
seconds. The last confirmed controls remain visible but disabled during the
cooldown. Removing or changing the endpoint clears the cooldown so reconnecting
hardware can recover immediately.

When every device module is disabled, the registry skips HID enumeration and
removes its discovery timer. Enabling a module performs immediate discovery and
rearms one timer. Repeated start/disposal cannot accumulate timers.

## Startup responsiveness

`bun run measure:startup` builds the production Electron bundles and measures the isolated native review path from main-process JavaScript entry to a committed control-plane shell. The budget is 1,500 ms; the harness uses canonical fixture devices so physical HID latency cannot make the result nondeterministic. Overlay dismissal is reported separately because Chromium throttles animation frames for a hidden review window.

`bun run measure:settings` builds the same production bundles and measures the
first Settings navigation in native Electron. The route must commit visible
layout without a loading state and stay within a 100 ms click-to-DOM-commit
budget. `bun run measure:routes` applies the same budget to the preloaded Audio
and Capture workspaces. Visible native QA remains the proof for first-paint
presentation because a hidden Chromium window cannot provide honest paint timing.

Persisted state hydration is the only renderer-readiness gate. Hardware discovery, audio endpoint discovery, clip reconciliation, update scheduling, and optional engine restoration continue through Electron main and publish canonical snapshot updates when ready. A stalled peripheral must not keep the startup screen visible.

Audio, Capture, and capability-heavy device editors are loaded on demand. Settings
is part of the renderer shell so its route has no chunk-loading state and is visible
on the first paint after navigation. The default Devices gallery does not parse
Audio, Capture, or individual device-editor code before the user opens those
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

Montage export encodes each segment once at its final bitrate, seeks before
decoding trimmed sources, and copies video during final assembly. It selects the
existing supported share encoder, falling back to CPU for the remaining sequence
if hardware encoding fails. FFmpeg progress is forwarded only during an export;
cancel waits for the worker to close before cleaning temporary files. Final
output size is verified, and a cancelled replacement preserves the existing file.
Native editor/render evidence and the bounded CPU comparison are recorded in
`design-qa/editor-tools/REPORT.md`. These are fixture results, not a long-project
or physical-capture soak claim.

1. Renderer open for 8 hours with frequent navigation.
2. Tray mode for 24 hours with renderer destruction enabled.
3. Capture ring wrapping continuously for 24 hours.
4. Save a replay every 2 minutes for 4 hours.
5. Audio graph active for 24 hours while endpoints connect/disconnect.
6. Repeatedly start/stop each engine 500 times.

## Device sessions

An enabled local device-discovery add-on creates at most one hidden sandboxed Chromium host. The host is lazy, performs work only during the registry's existing five-second discovery cycle, has no Module Host timer of its own, and is destroyed on disable, unlink, runtime failure, or shutdown. A disabled project retains no renderer process or subscription. Each active local host counts as an additional process in the canonical performance snapshot; real private working-set and long-running growth still require native measurement before release acceptance.

The G502 X Plus native-control path holds one non-exclusive HID++ long-report handle only while the Logitech module and matching device are active. Sniper-button edges are notification-driven; the session adds no button or lighting polling timer. Device-reported live RGB effects and zone frames are written only after an explicit user change; software RGB ownership is retained for the session and released deterministically when onboard mode takes over or the session closes. Onboard profile sectors are read during discovery and written only in response to an explicit stored-setting change, with CRC validation and immediate readback rather than background flash traffic. Release, module disable, disconnect, and application shutdown close the handle deterministically and restore the pre-hold DPI when the device remains reachable.

The QuadCast 2 path holds one non-exclusive blocking-read handle for absolute tap-mute events and one non-exclusive feature-report handle only while maintained lighting is active. Lighting refreshes every 55 ms because the researched display frame expires on-device; the timer is unreferenced and stops on module disable, disconnect, write failure, or shutdown. A failed mute read closes its handle and retries after one second while the device remains present.

## Opt-in resource debugging

Developer mode starts an event-driven diagnostic timeline with no extra polling
timer. Main retains at most 2,000 events / 2 MiB, with an 8 KiB per-event limit
and a 120-events-per-second cap; the capture host caps diagnostic emissions at
60 per second. Events reuse the resource journal's bounded write queue and
retention policy. Native health records reuse existing snapshots. Disabled
Developer mode emits/retains no developer events and stops optional main/renderer
resource probes. Existing capture processes are not restarted to toggle logging.

Settings > Diagnostics provides detailed resource recording and local JSON export.
It reuses the five-second sampler, keeps renderer publication at 30 seconds, and
adds bounded operation counters plus a 20 ms main-loop probe only while enabled.
The export retains the latest 120 samples; disabling stops the extra probes and
retains the report for export. See [Resource diagnostics](docs/resource-diagnostics.md)
for measurement semantics, limits, and the comparison workflow.

On-demand capture diagnostics use canonical transient state owned by main and
narrow run/cancel IPC operations. A stopped capture engine gets a temporary host
that is disposed after the run; an existing host serializes checks through its
lifecycle gate. Active recordings skip competing encoder/capture probes. There
is no background diagnostic timer. Runs have a 90-second deadline and each
FFmpeg probe has a five-second timeout with bounded output and child-process
cleanup on timeout or cancellation. Three-frame capture probes discard output.
Configuration changes and shutdown cancel the run; diagnostics do not change
capture preferences. Completed results remain available until the next run or
application restart, including when Developer mode is disabled.
