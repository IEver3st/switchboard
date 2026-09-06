# Resource diagnostics

Enable **Settings > General > Developer mode**, reproduce the problem, then open
**Settings > Diagnostics > Export diagnostics**. Developer mode starts a local
event timeline automatically. Export works immediately, including when capture
fails before the first resource sample. No report is uploaded.

For CPU, memory, or responsiveness investigations, also enable **Detailed
resource diagnostics** and reproduce the slowdown for at least 60 seconds.
This adds resource sampling to the same export. The resource switch is off by
default and persists across launches. Disabling Developer mode disables both
collectors and the renderer probe. Resetting Diagnostics stops resource sampling;
the event timeline continues while Developer mode remains on.

## Capture and application events

The schema-version-2 export includes:

- Windows build, Electron/Chromium versions, GPU names and driver versions,
  graphics feature status, and display dimensions, refresh rates, and scaling.
- Capture settings, current runtime/error state, backend and encoder capabilities,
  source counts, storage headroom, and host/child process identities.
- Native encoder probes, the FFmpeg version, selected capture filter and encoder
  arguments, startup stderr, process exits, source resolution, state changes,
  and recovery attempts. A video-attempt number connects a process to its output.
- Main-process capture requests/rejections, host commands and responses with
  request IDs and elapsed times, invalid host messages/snapshots, renderer exits,
  failed loads, unresponsiveness, and IPC action failures. Command bodies and
  window titles are not recorded.

FFmpeg's normal bounded error tail is also retained in a startup exception, so
an encoder failure no longer shows only a numeric code. In Diagnostics, **Capture
failure** displays that explanation. A live host reporting a source/encoder
failure remains in Error. Automatic host recovery applies to process exits;
it must not reset a rejected source change back to Waiting.

Developer events use no polling timer. They are captured as operations happen,
with native health entries using the existing capture snapshot cadence. The
in-memory export retains the latest 2,000 events within 2 MiB, at most 8 KiB per
event, and at most 120 events per second. The native event source is capped at
60 events per second. Discard/eviction counters make truncation visible.
Native FFmpeg output remains at warning level; enabling Developer mode does not
restart or interrupt an existing recording.

Events are validated and redacted in main before retention and journal writes.
Absolute paths, URLs, email addresses, and credential fields are redacted.
Capture context uses an explicit field selection; it excludes clip paths,
endpoint identifiers, window titles, command payloads, and media. Events are
also appended to the existing rotating local resource journals. Turning
Developer mode off clears its in-memory timeline; existing journal files follow
the retention preference. Re-enabling starts a new session.

## What is measured

- Electron processes: PID, process type, private memory, resident working set,
  peak working set, and CPU percentage.
- Native engines: existing host CPU/memory telemetry and host/FFmpeg process
  memory breakdown. Child-process CPU is explicitly unavailable in the table.
- Main process: heap, external allocations, ArrayBuffers, active resource types,
  event-loop utilization, and p99/maximum event-loop intervals.
- Renderer: current route, approximate JS heap, DOM/image/canvas/video counts,
  playing video count, resource-entry count, and long-task count/total/maximum.
- Operations: completed calls, failures, in-flight calls, total elapsed time,
  and maximum elapsed time for state cloning, validation, serialization, disk
  writes, snapshot delivery, IPC requests, HID enumeration, discovery by module,
  and host commands. Labels are defined in source; command payloads are omitted.

Use the process breakdown to locate CPU or memory growth first. Compare samples
from the same route and engine state. If the Browser process grows, compare heap,
external buffers, active resources, and state-operation counts. If a renderer
grows, compare heap, DOM/media counts, and long tasks. If Capture.Host or FFmpeg
grows, use their individual memory rows and the existing capture health data.

Operation durations are **inclusive wall time**, including asynchronous waits.
Nested operations overlap, so do not sum them or interpret them as CPU usage.
High call counts can expose avoidable polling or snapshot churn. High elapsed
time with low CPU can indicate a slow device or disk. Confirm a suspected fix
with the same workload and then repeat the resource measurement with debugging
off to exclude measurement overhead.

## Collection and limits

Detailed recording reuses the five-second performance-monitor timer. The
Diagnostics view updates at most every 30 seconds, or when guard state changes,
so measurement does not turn the full application snapshot into a fast UI feed.
The debug collector adds a 20 ms event-loop probe only while enabled. Its delay
numbers include that sampling interval; event-loop utilization is not CPU load.
Utilization is unavailable when the embedded runtime supplies no active/idle
time counters, rather than displaying a misleading zero.
See the [Node performance API](https://nodejs.org/api/perf_hooks.html).

The resource portion of the export contains at most 120 samples from the latest recording, plus its
cumulative operation counters (at most 128 labels, each at most 96 characters).
Starting a new recording replaces that in-memory history. Stopping retains the
report for export until restart or another recording. The exported counter for
dropped journal writes covers the application lifetime; it does not indicate
loss from the in-memory export history.

Existing local resource journals also receive the detailed samples. They live
under the app's user-data `diagnostics/resources` folder, rotate at 8 MiB, and
use the Diagnostics retention preference. At most four journal writes can be
pending; additional writes are counted and dropped. The offline command remains
`bun run diagnose:resources --directory="<resource folder>"`.

A renderer probe times out after 1.5 seconds and only one may remain outstanding.
A null renderer sample means unavailable or rejected data, not zero usage.
Renderer long-task counters cover the current document's enabled observation
period and restart on renderer reload; they are not per-component CPU profiles.

This is operational instrumentation, not a stack-sampling profiler. GPU engine
load, per-child native CPU, Windows handle/GDI/USER counts, physical device
behavior, and long-running leak/soak proof require the existing native tools or
a separate profiler. Chromium heap figures are approximate. The report omits
media paths, DOM text, resource URLs, settings payloads, and hardware writes.

## Extending coverage

Main-process code can import `debugDiagnostics` from
`src/main/services/debug-diagnostics.ts`. Wrap synchronous work with
`measure('subsystem.operation', () => work())`, or use `measureAsync` for an
operation that returns a promise. Use static labels or bounded code-owned
module/command identities. Do not put user input, paths, device serial numbers,
or request bodies in labels. The disabled collector retains no observations.

For event logging, import `developerDiagnostics` from
`src/main/services/developer-diagnostics.ts`. Use `record(source, level, event,
data)` with code-owned event names and scalar fields, or `trace` around an action.
The native host emits the shared `developerDiagnosticInputSchema` shape through
`captureDiagnostic`; main discards it unless Developer mode is enabled.
Do not pass arbitrary settings or source objects to the logger.

Native review: build the app and run the capture-host tests in Release, then
launch `scripts/verify-developer-diagnostics.mjs` through Electron with
`ELECTRON_RUN_AS_NODE` removed. It uses one hidden, unfocused fixture profile,
prevents all window/dialog shows, and substitutes a child process for FFmpeg.
It checks a real host startup failure through the exported JSON, verifies Error
does not revert to Waiting, kills only its isolated host to check recovery,
tests developer/resource gates and export controls, and captures all three
supported viewport sizes. Output goes to a new `design-qa/developer-diagnostics-*`
directory. This is host/renderer integration proof, not physical RX 9070 capture.
