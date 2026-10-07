//! Win32 events for cancellation-aware waits. Every blocking wait in the
//! engine includes the stop event, so stopping never waits on a timeout.

use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::Result;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT};
use windows::Win32::System::Threading::{CreateEventW, SetEvent, WaitForMultipleObjects};

/// An owned Win32 event handle.
pub(crate) struct Event(HANDLE);

// Event handles are process-wide kernel objects; any thread may wait on or
// signal them.
unsafe impl Send for Event {}
unsafe impl Sync for Event {}

impl Event {
    /// Auto-reset: one waiter wakes and the event clears.
    pub fn auto() -> Result<Event> {
        Ok(Event(unsafe { CreateEventW(None, false, false, None)? }))
    }

    /// Manual-reset: stays signalled for every waiter.
    pub fn manual() -> Result<Event> {
        Ok(Event(unsafe { CreateEventW(None, true, false, None)? }))
    }

    pub fn handle(&self) -> HANDLE {
        self.0
    }

    pub fn set(&self) {
        unsafe {
            let _ = SetEvent(self.0);
        }
    }
}

impl Drop for Event {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

/// Which handle ended a `wait_any`.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Woke {
    Handle(usize),
    Timeout,
}

/// Waits for any of `handles` (at most 64) or `ms` milliseconds (u32::MAX = forever).
pub(crate) fn wait_any(handles: &[HANDLE], ms: u32) -> Woke {
    let r = unsafe { WaitForMultipleObjects(handles, false, ms) };
    if r == WAIT_TIMEOUT {
        return Woke::Timeout;
    }
    let i = r.0.wrapping_sub(WAIT_OBJECT_0.0) as usize;
    if i < handles.len() { Woke::Handle(i) } else { Woke::Timeout }
}

/// Engine-wide stop request: a flag for cheap checks plus a manual-reset
/// event so blocked waits end immediately.
pub(crate) struct Stop {
    flag: AtomicBool,
    event: Event,
}

impl Stop {
    pub fn new() -> Result<Stop> {
        Ok(Stop { flag: AtomicBool::new(false), event: Event::manual()? })
    }

    pub fn set(&self) {
        self.flag.store(true, Ordering::Relaxed);
        self.event.set();
    }

    pub fn is_set(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }

    pub fn handle(&self) -> HANDLE {
        self.event.handle()
    }

    /// Sleeps up to `ms`; returns true as soon as stop is requested.
    pub fn sleep(&self, ms: u32) -> bool {
        wait_any(&[self.handle()], ms) == Woke::Handle(0) || self.is_set()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    #[test]
    fn stop_wakes_a_long_sleep_immediately() {
        let stop = Arc::new(Stop::new().unwrap());
        let s = stop.clone();
        let t = Instant::now();
        let worker = std::thread::spawn(move || s.sleep(60_000));
        std::thread::sleep(Duration::from_millis(20));
        stop.set();
        assert!(worker.join().unwrap());
        assert!(t.elapsed() < Duration::from_secs(2));
        // Manual reset: later waits return at once, repeatedly.
        assert!(stop.sleep(60_000));
        assert!(stop.sleep(60_000));
    }

    #[test]
    fn auto_event_wakes_once() {
        let e = Event::auto().unwrap();
        e.set();
        assert_eq!(wait_any(&[e.handle()], 0), Woke::Handle(0));
        assert_eq!(wait_any(&[e.handle()], 0), Woke::Timeout);
    }
}
