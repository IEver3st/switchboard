# G502 lighting repair, September 27, 2026

Local implementation and connected-receiver verification. No release, installer,
or installed-app update was performed. Existing audio work and pre-existing
HID++ timeout/backoff changes were preserved.

## Reproduced failures

- Delayed discovery published an older lighting selection over a completed
  command when another field (such as battery percentage) changed.
- A failed zone write retained an acknowledged state, preventing restoration
  when ownership and power still matched.
- Routine discovery issued 32 flash chunk reads before a queued lighting command.
- Immediate command persistence omitted indirect changes such as all zone colors
  and enabling RGB after a brightness adjustment.

The stale-discovery, partial-write and excess-flash-read regressions failed before
their corresponding repairs. Focused coverage now includes atomic selection
persistence, bounded zone batching, partial-frame rejection, recovery, startup,
disconnect/module lifecycle, and battery/status priority.

## Connected receiver

G502 X Plus receiver VID 046d / PID c547, direct non-exclusive HID++ transport.
No window or monitor capture was needed. Native profile flash was not written
by the live lighting checks. Persisted user settings were only read.

| Workload | Before | After |
| --- | ---: | ---: |
| Static color acknowledgement | 494 ms | 247–262 ms |
| Brightness acknowledgement | 589 ms | 248–250 ms |
| Discovery followed by queued Off | 1,582–2,257 ms with full profile read | 404–533 ms with routine selection read |

These are individual sequential command timings, not percentile benchmarks or
visible LED latency. Full and cached discovery use the same session/workload;
the harness forces the profile-cache age to exercise both paths. Full content
validation still occurs on the existing cycle once per minute, on changed profile
selection, after a timeout, and before profile writes.

Live checks confirmed acknowledged restoration after deliberately releasing
software ownership, successful repeated close, reopening with the confirmed
selection, and RGB power Off (mode 3) after reopening. The initial ownership flags
and power were restored at the end. See `final-live.json` and the before/after
JSON files alongside this document.

## Validation and limits

- 87 focused tests across 12 relevant files passed. Additional profile-mutation
  assertions passed after final review: preserve fresh external profile edits and
  reject a write if the active profile changed.
- Production build, structure/source checks, main-process type check, and diff
  whitespace check passed.
- The final whole-project type-check attempt was blocked by three unrelated
  `variant="outline"` errors in concurrently edited `SpatialAudioPage.tsx`.
- Physical LED appearance, actual mouse sleep/unplug cycles, close-to-tray behavior
  in the installed app, and a long-running hardware soak remain unverified.
- Off and selected effects are maintained while the session is running. Closing
  the application releases ownership, as before; this does not add flash persistence.

The four-zone long-report layout was checked against the maintained
[Solaar implementation](https://github.com/pwr-Solaar/Solaar/blob/master/lib/logitech_receiver/settings_templates.py).
Power/ownership semantics were cross-checked with
[OpenLogi's RGB Effects reference](https://openlogi.org/hidpp/features/x8071-rgb-effects).

## Follow-up: purple flashes while Off

The user observed physical purple bursts during navigation. Clearing the live
zone frame alone did not stop them. A bounded software-profile-mode trial also
did not eliminate them; the original onboard mode was restored without flash
writes. Neither experiment is recorded as a successful repair.

The passive HID trace (`activity-trace.json`) observed power change from 3 to 1
without an intervening host RGB, DPI, or profile write. Switchboard subsequently
reapplied Off. Power mode 3 allows firmware sleep/wake behavior; manual Off now
holds a black Static effect and black live zone frame with power mode 1, keeping
the saved effect/colors unchanged. Battery cutoff and firmware restoration retain
their explicit power-down behavior. This avoids the observed sleep/wake path;
physical confirmation remains separate from command acknowledgement.

The old Dev process (14732) was confirmed through its main-process snapshot to
still use the original Off implementation after the reported restart. It also
reversed a direct new-controller test back to power 3 at about five seconds.
A normal Electron quit/relaunch replaced it with process 4500. The replacement's
saved canonical state contains the new Off acknowledgement, and subsequent live
samples stayed at power 1 across the discovery interval (`manual-off.json`).

Native fixture navigation through Audio, Capture, and Devices passed at
1080x720, 1420x900, and 1920x1080, retaining Off and issuing zero device writes
from page changes (`navigation.json`). The final focused 7-file suite passed
59 tests. Whole-project type checks, production build, structure/source checks,
and diff whitespace checks passed. No unrelated native engines were rebuilt.

The current Dev process has the repair; no public release or installed-app update
was performed. User confirmation of physical LEDs on this verified replacement
process is pending.
