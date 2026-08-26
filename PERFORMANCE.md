# Performance budgets

These are release gates, not marketing claims.

| State | Memory target | CPU target |
|---|---:|---:|
| Core in tray, renderer destroyed | < 70 MB | < 0.3% sustained |
| UI open, no engines | < 180 MB | < 0.7% sustained |
| Audio engine active | +40 MB | < 1.0% typical |
| Replay engine active | +50 MB host memory | < 2.0% CPU with hardware encode |
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

## Guard behavior

The product should surface sustained regressions, not react to one noisy sample. Initial policy:

- sample every 5 seconds;
- evaluate a rolling 60-second window;
- warn after three consecutive failed windows;
- include per-process attribution;
- never auto-kill an engine while recording or carrying active audio without an explicit recovery plan.

## Soak tests

1. Renderer open for 8 hours with frequent navigation.
2. Tray mode for 24 hours with renderer destruction enabled.
3. Capture ring wrapping continuously for 24 hours.
4. Save a replay every 2 minutes for 4 hours.
5. Audio graph active for 24 hours while endpoints connect/disconnect.
6. Repeatedly start/stop each engine 500 times.

## Device sessions

The G502 X Plus live DPI Shift path holds one non-exclusive HID++ long-report handle only while the Logitech module and matching device are active. Sniper-button edges are notification-driven; the session adds no button polling timer. Release, module disable, disconnect, and application shutdown close the handle deterministically and restore the pre-hold DPI when the device remains reachable.

The QuadCast 2 path holds one non-exclusive blocking-read handle for absolute tap-mute events and one non-exclusive feature-report handle only while maintained lighting is active. Lighting refreshes every 55 ms because the researched display frame expires on-device; the timer is unreferenced and stops on module disable, disconnect, write failure, or shutdown. A failed mute read closes its handle and retries after one second while the device remains present.
