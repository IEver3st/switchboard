//! One clock for every stream: QueryPerformanceCounter in 100 ns units.
//! WASAPI reports packet QPC positions in the same unit, so audio and video
//! timestamps compare directly.

use std::sync::OnceLock;
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

pub const HNS_PER_SECOND: i64 = 10_000_000;

fn frequency() -> i64 {
    static FREQ: OnceLock<i64> = OnceLock::new();
    *FREQ.get_or_init(|| {
        let mut f = 0i64;
        unsafe {
            let _ = QueryPerformanceFrequency(&mut f);
        }
        f.max(1)
    })
}

/// QPC time (100 ns) of a wall-clock instant, via the current offset
/// between the two clocks. Accurate to a few ms for recent instants.
pub fn system_to_hns(t: std::time::SystemTime) -> i64 {
    let now_sys = std::time::SystemTime::now();
    let now = now_hns();
    match now_sys.duration_since(t) {
        Ok(ago) => now - (ago.as_nanos() / 100) as i64,
        Err(e) => now + (e.duration().as_nanos() / 100) as i64,
    }
}

/// Unix milliseconds of a capture-clock instant (inverse of `system_to_hns`).
pub fn hns_to_unix_ms(hns: i64) -> u64 {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    (now_ms - (now_hns() - hns) / 10_000).max(0) as u64
}

pub fn now_hns() -> i64 {
    let mut c = 0i64;
    unsafe {
        let _ = QueryPerformanceCounter(&mut c);
    }
    ((c as i128 * HNS_PER_SECOND as i128) / frequency() as i128) as i64
}
