# Resource diagnostics

Open **Settings > Diagnostics > Detailed resource diagnostics**. Enable it,
reproduce the slowdown for at least 60 seconds, then choose **Export resource
report**. The save dialog writes a local JSON file. Disable recording when done.
The switch is off by default and persists across launches. Resetting Diagnostics
or all settings disables it. No report is uploaded.

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

The export contains at most 120 samples from the latest recording, plus its
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

Native review: build, then launch `scripts/verify-resource-diagnostics.mjs`
through Electron with `ELECTRON_RUN_AS_NODE` removed. It uses an isolated fixture
profile, saves evidence under `design-qa/resource-diagnostics`, and never writes
to the installed app's settings or physical devices.
