# Startup state failure, September 4

Windows booted at 14:59:49 local time and recorded Kernel-Power event 41 at 14:59:53 and unexpected-shutdown event 6008 at 15:00:05. The supplied Switchboard log follows at 15:00:47. An interrupted shutdown is consistent with both the JSON parse failure and missing Chromium cache entry. The evidence does not identify what caused the shutdown.

By inspection time, the old loader had already replaced the failing primary JSON. Its original bytes were unavailable. The current file parsed successfully; a 01:14 backup also existed. Copies of both were preserved under `C:\Users\User\AppData\Roaming\Switchboard Dev\state-recovery-20260904-150157`. The current copy contained 442 clips versus 435 in the backup, with newer setup choices. No live state was restored or replaced during this repair.

Confirmed defects reproduced by `bun test tests/state-store-recovery.test.ts`: the loader ignored a valid backup, overwrote corrupt primary data with defaults, and did not maintain a previous valid generation. Saves now sync a unique temporary file before atomic replacement, commit the previous validated generation to `.bak`, and preserve invalid primary bytes before recovering. UTF-8 BOMs are accepted. The early rendering-preference reader follows the backup on invalid primary JSON.

Validation: 297 tests passed, 3 skipped, no failures; capture/audio host deterministic suites passed. Structure/source, type checks, production build, and whitespace checks passed. These are persistence and recovery tests, not sudden-power-loss or filesystem durability guarantees.

The Chromium messages are separate from product state. Its [critical-error handler](https://chromium.googlesource.com/chromium/src/net/+/master/disk_cache/blockfile/backend_impl.cc) invalidates the cache index and schedules cache recreation. Cache entry creation timestamps in the live profile start at 15:00:47, consistent with that rebuilding path. No cache directory was deleted: Switchboard also stores replay and thumbnails beneath `Cache`, outside Chromium's `Cache_Data` directory. A subsequent clean live terminal log was not captured by this session.
