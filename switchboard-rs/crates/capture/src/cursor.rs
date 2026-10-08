//! Cursor track: where the pointer was and when mouse buttons changed, on the
//! capture clock, written beside each saved clip as `<clip>.cursor.json` so
//! an editor can draw its own cursor over footage recorded without one.
//!
//! Only the pointer position and the left, right and middle button states
//! are read. No keys, window titles or pixels.
//!
//! Polling, not a hook: a low-level mouse hook (WH_MOUSE_LL) runs in the
//! input path of every mouse event system-wide, which with a 1 to 8 kHz
//! gaming mouse means thousands of cross-process callbacks per second and
//! added input latency if this process is slow. Polling costs a fixed
//! `SAMPLE_HZ` wakeups per second while capture runs, and stops with the
//! engine's stop event.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::Result;
use serde::Serialize;

use crate::clock::{HNS_PER_SECOND, now_hns};
use crate::gpu::DisplayInfo;
use crate::signal::Stop;

pub const SAMPLE_HZ: u32 = 120;
/// A stationary pointer still gets one sample this often.
const HEARTBEAT_HNS: i64 = HNS_PER_SECOND;

/// Bits of a sample's `buttons` field.
pub const LEFT: u8 = 1;
pub const RIGHT: u8 = 2;
pub const MIDDLE: u8 = 4;
/// The pointer was outside the captured display.
pub const OFF_DISPLAY: u8 = 8;
const BUTTONS: [u8; 3] = [LEFT, RIGHT, MIDDLE];

/// Sidecar path for a clip: `SB_x.mp4` -> `SB_x.cursor.json`.
pub fn cursor_track_path(video: &Path) -> PathBuf {
    video.with_extension("cursor.json")
}

/// The captured display in physical virtual-desktop pixels (the space
/// `GetCursorPos` reports in a per-monitor-aware thread), and the size the
/// video is encoded at.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Geometry {
    pub index: usize,
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: i32,
    pub height: i32,
    pub dpi_scale: f64,
    pub out_width: u32,
    pub out_height: u32,
}

impl Geometry {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.origin_x && y >= self.origin_y && x < self.origin_x + self.width && y < self.origin_y + self.height
    }

    /// Desktop pixel to video pixel: relative to the display's top-left,
    /// scaled by the same factor the encoder applies to the whole display.
    pub fn to_output(&self, x: i32, y: i32) -> (f64, f64) {
        let sx = self.out_width as f64 / self.width.max(1) as f64;
        let sy = self.out_height as f64 / self.height.max(1) as f64;
        ((x - self.origin_x) as f64 * sx, (y - self.origin_y) as f64 * sy)
    }
}

/// One stored poll: capture-clock time (100 ns), desktop pixels, button bits.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sample {
    pub t: i64,
    pub x: i32,
    pub y: i32,
    pub flags: u8,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ButtonEvent {
    pub t: i64,
    pub down: bool,
    pub button: u8,
    pub x: i32,
    pub y: i32,
}

/// Samples and button events for the replay window. Samples are stored only
/// when something changed or a heartbeat is due.
pub struct CursorRing {
    samples: VecDeque<Sample>,
    events: VecDeque<ButtonEvent>,
    retain: i64,
    /// Previous poll (time, held buttons), stored or not.
    last_poll: Option<(i64, u8)>,
}

impl CursorRing {
    pub fn new(retain_hns: i64) -> CursorRing {
        CursorRing { samples: VecDeque::new(), events: VecDeque::new(), retain: retain_hns, last_poll: None }
    }

    /// Records one poll at `t`. `held` are the buttons down now; `tapped`
    /// are buttons pressed and released again since the previous poll.
    pub fn record(&mut self, t: i64, x: i32, y: i32, held: u8, tapped: u8, on_display: bool) {
        let (prev_t, prev_held) = self.last_poll.unwrap_or((t, 0));
        // A transition happened somewhere between the two polls; the
        // midpoint halves the worst-case error (half a poll period).
        let at = prev_t + (t - prev_t) / 2;
        let first = self.last_poll.is_none();
        for b in BUTTONS {
            let (was, now) = (prev_held & b != 0, held & b != 0);
            if first {
                // Buttons already down when tracking starts show in the
                // sample; there was no press to report.
                continue;
            }
            if was != now {
                self.events.push_back(ButtonEvent { t: at, down: now, button: b, x, y });
            } else if !was && tapped & b != 0 {
                self.events.push_back(ButtonEvent { t: at, down: true, button: b, x, y });
                self.events.push_back(ButtonEvent { t: at, down: false, button: b, x, y });
            }
        }
        self.last_poll = Some((t, held));
        let flags = (held & (LEFT | RIGHT | MIDDLE)) | if on_display { 0 } else { OFF_DISPLAY };
        let store = match self.samples.back() {
            None => true,
            Some(s) => s.x != x || s.y != y || s.flags != flags || t - s.t >= HEARTBEAT_HNS,
        };
        if store {
            self.samples.push_back(Sample { t, x, y, flags });
        }
        self.evict(t);
    }

    /// Drops what is older than the replay window, keeping the newest sample
    /// before it so a clip starting there knows where the pointer was.
    fn evict(&mut self, now: i64) {
        let cutoff = now - self.retain;
        while self.samples.len() > 1 && self.samples[1].t <= cutoff {
            self.samples.pop_front();
        }
        while self.events.front().is_some_and(|e| e.t < cutoff) {
            self.events.pop_front();
        }
    }

    /// Samples and events in `[from, until)`. The pointer's state at `from`
    /// comes first, moved to `from`, so the track starts with the clip.
    pub fn clip(&self, from: i64, until: i64) -> (Vec<Sample>, Vec<ButtonEvent>) {
        let mut samples = Vec::new();
        let start = self.samples.partition_point(|s| s.t <= from);
        if start > 0 {
            samples.push(Sample { t: from, ..self.samples[start - 1] });
        }
        samples.extend(self.samples.range(start..).take_while(|s| s.t < until).copied());
        let events = self.events.iter().filter(|e| e.t >= from && e.t < until).copied().collect();
        (samples, events)
    }
}

/// Shared between the sampler thread and saves.
pub struct CursorTrack {
    pub geometry: Geometry,
    pub ring: Mutex<CursorRing>,
}

impl CursorTrack {
    /// Writes the track for the video window `[from, until)` beside `video`,
    /// atomically. Returns the sidecar path.
    pub fn write(&self, video: &Path, from: i64, until: i64) -> Result<PathBuf> {
        let (samples, events) = self.ring.lock().unwrap().clip(from, until);
        let name = video.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let json = sidecar_json(&name, &self.geometry, from, &samples, &events)?;
        let path = cursor_track_path(video);
        let partial = path.with_extension("json.writing");
        if let Err(e) = std::fs::write(&partial, json).and_then(|_| std::fs::rename(&partial, &path)) {
            let _ = std::fs::remove_file(&partial);
            return Err(e.into());
        }
        Ok(path)
    }
}

// ------------------------------------------------------------ sidecar

/// A JSON number without a trailing `.0` when it is whole.
#[derive(Clone, Copy, Debug)]
struct Num(f64);

impl Serialize for Num {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if self.0.fract() == 0.0 && self.0.abs() < 9.0e15 { s.serialize_i64(self.0 as i64) } else { s.serialize_f64(self.0) }
    }
}

/// Rounded to a tenth: milliseconds for times, video pixels for positions.
fn tenth(v: f64) -> Num {
    Num((v * 10.0).round() / 10.0)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sidecar<'a> {
    version: u32,
    video: &'a str,
    display: SidecarDisplay,
    output: SidecarOutput,
    sample_hz: u32,
    button_bits: SidecarBits,
    samples: Vec<(Num, Num, Num, u8)>,
    events: Vec<SidecarEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarDisplay {
    index: usize,
    origin_x: i32,
    origin_y: i32,
    width: i32,
    height: i32,
    dpi_scale: Num,
}

#[derive(Serialize)]
struct SidecarOutput {
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarBits {
    left: u8,
    right: u8,
    middle: u8,
    off_display: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarEvent {
    t_ms: Num,
    #[serde(rename = "type")]
    kind: &'static str,
    button: &'static str,
    x: Num,
    y: Num,
}

/// Sidecar version 1. Times are milliseconds from the clip's first frame;
/// positions are video pixels (they fall outside the frame, and carry
/// `OFF_DISPLAY`, while the pointer is on another display).
pub fn sidecar_json(video: &str, g: &Geometry, from: i64, samples: &[Sample], events: &[ButtonEvent]) -> Result<Vec<u8>> {
    let ms = |t: i64| tenth((t - from) as f64 / 10_000.0);
    let doc = Sidecar {
        version: 1,
        video,
        display: SidecarDisplay {
            index: g.index,
            origin_x: g.origin_x,
            origin_y: g.origin_y,
            width: g.width,
            height: g.height,
            dpi_scale: Num((g.dpi_scale * 100.0).round() / 100.0),
        },
        output: SidecarOutput { width: g.out_width, height: g.out_height },
        sample_hz: SAMPLE_HZ,
        button_bits: SidecarBits { left: LEFT, right: RIGHT, middle: MIDDLE, off_display: OFF_DISPLAY },
        samples: samples
            .iter()
            .map(|s| {
                let (x, y) = g.to_output(s.x, s.y);
                (ms(s.t), tenth(x), tenth(y), s.flags)
            })
            .collect(),
        events: events
            .iter()
            .map(|e| {
                let (x, y) = g.to_output(e.x, e.y);
                SidecarEvent {
                    t_ms: ms(e.t),
                    kind: if e.down { "down" } else { "up" },
                    button: match e.button {
                        LEFT => "left",
                        RIGHT => "right",
                        _ => "middle",
                    },
                    x: tenth(x),
                    y: tenth(y),
                }
            })
            .collect(),
    };
    Ok(serde_json::to_vec(&doc)?)
}

// ------------------------------------------------------------ Windows

/// Runs `f` with this thread per-monitor DPI aware, so monitor rectangles
/// and cursor positions are physical pixels whatever the process declared.
fn per_monitor_aware<T>(f: impl FnOnce() -> T) -> T {
    use windows::Win32::UI::HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetThreadDpiAwarenessContext};
    let previous = unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
    let out = f();
    if !previous.0.is_null() {
        unsafe { SetThreadDpiAwarenessContext(previous) };
    }
    out
}

/// Geometry of the captured display, encoded at `out_width` x `out_height`.
pub(crate) fn display_geometry(display: &DisplayInfo, out_width: u32, out_height: u32) -> Geometry {
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITORINFO};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    per_monitor_aware(|| {
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        let (mut dx, mut dy) = (96u32, 96u32);
        unsafe {
            let _ = GetDpiForMonitor(display.hmonitor(), MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
        }
        let ok = unsafe { GetMonitorInfoW(display.hmonitor(), &mut info) }.as_bool();
        let r = info.rcMonitor;
        let (ox, oy, w, h) = if ok && r.right > r.left && r.bottom > r.top {
            (r.left, r.top, r.right - r.left, r.bottom - r.top)
        } else {
            (display.origin_x, display.origin_y, display.width, display.height)
        };
        Geometry {
            index: display.index,
            origin_x: ox,
            origin_y: oy,
            width: w,
            height: h,
            dpi_scale: dx.max(1) as f64 / 96.0,
            out_width,
            out_height,
        }
    })
}

/// Logical buttons held now, and those pressed and already released since
/// the previous call. `GetAsyncKeyState` reads physical buttons, so a
/// swapped mouse maps the physical right button to `LEFT` (primary).
fn read_buttons() -> (u8, u8) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};
    let swapped = unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0;
    let map = [
        (VK_LBUTTON, if swapped { RIGHT } else { LEFT }),
        (VK_RBUTTON, if swapped { LEFT } else { RIGHT }),
        (VK_MBUTTON, MIDDLE),
    ];
    let (mut held, mut tapped) = (0u8, 0u8);
    for (vk, bit) in map {
        let s = unsafe { GetAsyncKeyState(vk.0 as i32) } as u16;
        if s & 0x8000 != 0 {
            held |= bit;
        } else if s & 1 != 0 {
            tapped |= bit;
        }
    }
    (held, tapped)
}

/// Sampler thread: polls at `SAMPLE_HZ` on a high-resolution timer until
/// the engine stops.
pub(crate) fn run(track: Arc<CursorTrack>, stop: Arc<Stop>) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    per_monitor_aware(|| {
        let timer = crate::video::Timer::new().ok();
        let period = HNS_PER_SECOND / SAMPLE_HZ as i64;
        // Clear "pressed since the last call" bits from before capture.
        let _ = read_buttons();
        let mut next = now_hns();
        loop {
            next += period;
            let stopped = match &timer {
                Some(t) => t.wait_until(next, &stop),
                None => stop.sleep((period / 10_000) as u32),
            };
            if stopped || stop.is_set() {
                return;
            }
            let mut pt = POINT::default();
            // Fails on the secure desktop (UAC, lock screen): no sample.
            if unsafe { GetCursorPos(&mut pt) }.is_ok() {
                let t = now_hns();
                let (held, tapped) = read_buttons();
                let on = track.geometry.contains(pt.x, pt.y);
                track.ring.lock().unwrap().record(t, pt.x, pt.y, held, tapped, on);
            }
            // After a system stall, resume on time instead of catching up.
            let now = now_hns();
            if now - next > 4 * period {
                next = now;
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: i64 = 10_000;
    const PERIOD: i64 = HNS_PER_SECOND / SAMPLE_HZ as i64;

    fn geometry() -> Geometry {
        // A secondary display left of and above the primary, encoded at 720p.
        Geometry {
            index: 1,
            origin_x: -1920,
            origin_y: -200,
            width: 1920,
            height: 1080,
            dpi_scale: 1.25,
            out_width: 1280,
            out_height: 720,
        }
    }

    #[test]
    fn negative_origin_maps_into_the_scaled_video() {
        let g = geometry();
        assert_eq!(g.to_output(-1920, -200), (0.0, 0.0));
        assert_eq!(g.to_output(-960, 340), (640.0, 360.0));
        let (x, y) = g.to_output(-1, 879);
        assert!((x - 1279.333).abs() < 0.001 && (y - 719.333).abs() < 0.001, "{x} {y}");
        assert!(g.contains(-1920, -200) && g.contains(-1, 879));
        // The primary display at the origin is off the captured one.
        assert!(!g.contains(0, 0) && !g.contains(-1, 880) && !g.contains(-1921, 0));
        // Off-display positions still convert, landing outside the frame.
        let (x, _) = g.to_output(100, 0);
        assert!(x > 1280.0);
    }

    #[test]
    fn button_transitions_become_events_at_the_poll_midpoint() {
        let mut r = CursorRing::new(60 * HNS_PER_SECOND);
        let t0 = 1_000 * HNS_PER_SECOND;
        // Held when tracking starts: in the sample, no event.
        r.record(t0, 0, 0, RIGHT, 0, true);
        r.record(t0 + PERIOD, 0, 0, RIGHT | LEFT, 0, true);
        r.record(t0 + 2 * PERIOD, 5, 5, RIGHT | LEFT, 0, true);
        r.record(t0 + 3 * PERIOD, 5, 5, 0, 0, true);
        // Middle pressed and released between two polls.
        r.record(t0 + 4 * PERIOD, 5, 5, 0, MIDDLE, true);
        let (_, ev) = r.clip(t0, t0 + HNS_PER_SECOND);
        let got: Vec<(i64, bool, u8, i32)> = ev.iter().map(|e| (e.t - t0, e.down, e.button, e.x)).collect();
        let mid = |n: i64| (n - 1) * PERIOD + PERIOD / 2;
        assert_eq!(
            got,
            vec![
                (mid(1), true, LEFT, 0),
                (mid(3), false, LEFT, 5),
                (mid(3), false, RIGHT, 5),
                (mid(4), true, MIDDLE, 5),
                (mid(4), false, MIDDLE, 5),
            ]
        );
    }

    #[test]
    fn samples_are_stored_on_change_plus_a_heartbeat() {
        let mut r = CursorRing::new(60 * HNS_PER_SECOND);
        // Five seconds of a still pointer at 120 Hz, then one move.
        let polls = 5 * SAMPLE_HZ as i64;
        for i in 0..polls {
            r.record(i * PERIOD, 10, 10, 0, 0, true);
        }
        r.record(polls * PERIOD, 11, 10, 0, 0, true);
        let (s, _) = r.clip(0, i64::MAX);
        // Five heartbeats about a second apart (within one poll), then the move.
        assert_eq!(s.len(), 6);
        for w in s[..5].windows(2) {
            let gap = w[1].t - w[0].t;
            assert!((HNS_PER_SECOND..HNS_PER_SECOND + PERIOD).contains(&gap), "gap {} ms", gap / MS);
        }
        assert_eq!(s.last().unwrap().x, 11);
        // Leaving the display is a change too.
        r.record((polls + 1) * PERIOD, 11, 10, 0, 0, false);
        assert_eq!(r.clip(0, i64::MAX).0.last().unwrap().flags, OFF_DISPLAY);
    }

    #[test]
    fn ring_trims_to_the_clip_and_its_retention() {
        let retain = 10 * HNS_PER_SECOND;
        let mut r = CursorRing::new(retain);
        let t0 = 500 * HNS_PER_SECOND;
        // Thirty seconds of movement with a click every second.
        for i in 0..30 * SAMPLE_HZ as i64 {
            let held = if i % SAMPLE_HZ as i64 == 5 { LEFT } else { 0 };
            r.record(t0 + i * PERIOD, i as i32, 0, held, 0, true);
        }
        let now = t0 + (30 * SAMPLE_HZ as i64 - 1) * PERIOD;
        let (all, all_ev) = r.clip(0, i64::MAX);
        // Retention keeps the window plus one sample before it.
        assert!(all[0].t <= now - retain && all[1].t > now - retain);
        assert!(all_ev.iter().all(|e| e.t >= now - retain));

        // A clip from 22.5 s to 25 s.
        let (from, until) = (t0 + 22 * HNS_PER_SECOND + HNS_PER_SECOND / 2, t0 + 25 * HNS_PER_SECOND);
        let (s, ev) = r.clip(from, until);
        assert_eq!(s[0].t, from, "the first sample is the state at the first frame");
        assert_eq!(s[0].x, ((from - t0) / PERIOD) as i32);
        assert!(s.iter().skip(1).all(|s| s.t > from && s.t < until));
        assert_eq!(s.len() as i64, 1 + (until - from) / PERIOD);
        // Clicks at 23, 24 s: down and up each.
        assert_eq!(ev.len(), 4);
        assert!(ev.iter().all(|e| e.t >= from && e.t < until));

        // A window that starts before tracking began has no invented start.
        let mut fresh = CursorRing::new(retain);
        fresh.record(t0 + HNS_PER_SECOND, 1, 1, 0, 0, true);
        let (s, _) = fresh.clip(t0, t0 + 2 * HNS_PER_SECOND);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].t, t0 + HNS_PER_SECOND);
    }

    #[test]
    fn sidecar_matches_the_version_1_schema() {
        let g = geometry();
        let from = 42 * HNS_PER_SECOND;
        let samples = [
            Sample { t: from, x: -960, y: 340, flags: 0 },
            Sample { t: from + 166_670, x: -959, y: 340, flags: LEFT },
            Sample { t: from + 2 * HNS_PER_SECOND, x: 300, y: 10, flags: OFF_DISPLAY },
        ];
        let events = [
            ButtonEvent { t: from + 125_000, down: true, button: LEFT, x: -959, y: 340 },
            ButtonEvent { t: from + 90 * MS, down: false, button: RIGHT, x: -959, y: 340 },
            ButtonEvent { t: from + 95 * MS, down: true, button: MIDDLE, x: -959, y: 340 },
        ];
        let json = sidecar_json("SB_Game_2026-10-08_12-00-00.mp4", &g, from, &samples, &events).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&json).unwrap();
        assert_eq!(v["version"], 1);
        assert_eq!(v["video"], "SB_Game_2026-10-08_12-00-00.mp4");
        assert_eq!(
            v["display"],
            serde_json::json!({ "index": 1, "originX": -1920, "originY": -200, "width": 1920, "height": 1080, "dpiScale": 1.25 })
        );
        assert_eq!(v["output"], serde_json::json!({ "width": 1280, "height": 720 }));
        assert_eq!(v["sampleHz"], SAMPLE_HZ);
        assert_eq!(v["buttonBits"], serde_json::json!({ "left": 1, "right": 2, "middle": 4, "offDisplay": 8 }));
        assert_eq!(
            v["samples"],
            serde_json::json!([[0, 640, 360, 0], [16.7, 640.7, 360, 1], [2000, 1480, 140, 8]])
        );
        assert_eq!(
            v["events"],
            serde_json::json!([
                { "tMs": 12.5, "type": "down", "button": "left", "x": 640.7, "y": 360 },
                { "tMs": 90, "type": "up", "button": "right", "x": 640.7, "y": 360 },
                { "tMs": 95, "type": "down", "button": "middle", "x": 640.7, "y": 360 },
            ])
        );
        // Whole numbers carry no ".0".
        let text = String::from_utf8(json).unwrap();
        assert!(text.contains("[0,640,360,0]"), "{text}");
    }

    /// Runs the real sampler briefly. Reads only the pointer; no capture.
    #[test]
    fn live_sampler_records_and_stops_promptly() {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let displays = crate::gpu::list_displays().unwrap_or_default();
        let Some(display) = displays.first() else { return };
        let g = display_geometry(display, 1280, 720);
        assert!(g.width > 0 && g.height > 0 && g.dpi_scale >= 1.0, "{g:?}");
        let track = Arc::new(CursorTrack { geometry: g, ring: Mutex::new(CursorRing::new(60 * HNS_PER_SECOND)) });
        let stop = Arc::new(Stop::new().unwrap());
        let (t, s) = (track.clone(), stop.clone());
        let worker = std::thread::spawn(move || run(t, s));
        std::thread::sleep(std::time::Duration::from_millis(300));
        let asked = std::time::Instant::now();
        stop.set();
        worker.join().unwrap();
        assert!(asked.elapsed() < std::time::Duration::from_millis(100), "stop took {:?}", asked.elapsed());
        // Without an interactive desktop there is no pointer to read.
        let mut pt = POINT::default();
        if unsafe { GetCursorPos(&mut pt) }.is_ok() {
            let (samples, _) = track.ring.lock().unwrap().clip(0, i64::MAX);
            assert!(!samples.is_empty(), "no samples in 300 ms");
        }
    }

    #[test]
    fn write_is_atomic_and_named_after_the_clip() {
        let dir = std::env::temp_dir().join(format!("sb-cursor-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("SB_Test_2026-10-08_12-00-00.mp4");
        let track = CursorTrack { geometry: geometry(), ring: Mutex::new(CursorRing::new(60 * HNS_PER_SECOND)) };
        track.ring.lock().unwrap().record(HNS_PER_SECOND, -960, 340, 0, 0, true);
        let path = track.write(&video, HNS_PER_SECOND, 2 * HNS_PER_SECOND).unwrap();
        assert_eq!(path, dir.join("SB_Test_2026-10-08_12-00-00.cursor.json"));
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v["samples"], serde_json::json!([[0, 640, 360, 0]]));
        let leftovers = std::fs::read_dir(&dir).unwrap().count();
        assert_eq!(leftovers, 1, "no partial file left behind");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
