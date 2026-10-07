//! Media host: a short-lived helper process that does all video decoding for
//! the window.
//!
//!   switchboard-rs --media-host
//!
//! Why a process: opening the hardware decoder costs ~190 MB and the AMD
//! driver / Media Foundation keep ~160 MB of it committed after the decoder
//! is released. Only process exit returns it. The window starts this helper
//! on demand (see media_client.rs) inside a kill-on-close job, and it exits
//! as soon as the window closes its stdin.
//!
//! Control: one JSON message per line, [`Cmd`] on stdin and [`Event`] on
//! stdout. Frames never go through the pipes: the window creates a shared
//! section ([`frames`]) and hands the helper a duplicated handle; the helper
//! writes the newest frame there and the window copies it when it paints.
//!
//! Work done here:
//! - Editor playback: the segment controller that used to run in the window
//!   (players per clip, speed, freezes, segment changes, live gains).
//! - Thumbnail decode for cache misses (written to the cache file).

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock, mpsc};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use switchboard_media::{Frame, GainProvider, Player};
use switchboard_project::{AudioAutomation, Project, Segment, TrackTrim, automation_gain_at, source_to_edited_ms, speed_at};

/// Frame size for clips the window hasn't asked a size for yet.
const DEFAULT_W: u32 = 1280;
const DEFAULT_H: u32 = 720;
/// Longest gap between position-only status updates while playing.
const STATUS_INTERVAL: Duration = Duration::from_millis(40);
/// Longest accepted command line (a project is a few KB).
const MAX_LINE: usize = 8 << 20;

// ---------------------------------------------------------------- protocol

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Cmd {
    /// The shared frame section. `handle` is valid in the helper process.
    Frames { handle: u64, bytes: u64 },
    /// The project being edited and the file behind each clip id.
    Project { project: Box<Project>, paths: HashMap<String, PathBuf> },
    /// Move to output time `out_ms`, then play or stay paused.
    Seek { generation: u64, out_ms: f64, exact: bool, playing: bool },
    Pause { generation: u64 },
    Volume { volume: f32, muted: bool },
    /// Exact frame size for a clip's preview.
    Size { clip_id: String, width: u32, height: u32 },
    /// The editor closed: release every player and the frame section.
    Close,
    /// Decode a thumbnail for `clip` into the cache file `cache`.
    Thumbnail { id: u64, clip: PathBuf, cache: PathBuf },
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Status {
    /// The last Seek/Pause applied; older UI commands are superseded.
    pub generation: u64,
    pub out_ms: f64,
    pub segment: usize,
    pub source_ms: f64,
    pub frozen: bool,
    pub playing: bool,
    /// Sequence number of the newest frame in the section (0 = none).
    pub frame: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Event {
    Status { status: Status },
    Error { text: Option<String> },
    Thumbnail { id: u64, error: Option<String> },
}

// ------------------------------------------------------------ frame section

pub mod frames {
    //! Shared frame section: a header page and two frame slots.
    //!
    //! Ownership, one writer (the helper) and one reader (the window):
    //! - The writer only ever writes the slot that doesn't hold the newest
    //!   frame, and never the slot the reader has claimed.
    //! - The reader claims the newest frame's slot (`reading`), then checks
    //!   the slot still holds that frame before copying. The writer marks a
    //!   slot as being written, then checks the claim. Both pairs are SeqCst,
    //!   so either the reader sees the mark and retries, or the writer sees
    //!   the claim and skips this frame (it publishes on its next pass).
    //!   A claimed slot is therefore never written during the copy: no torn
    //!   frames, and the reader never waits.
    //!
    //! Memory: the section is created with SEC_RESERVE. The window commits
    //! the header; the helper commits slot pages as frames reach them, so
    //! commit follows the preview size rather than the 4K maximum.

    use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

    use anyhow::{Result, anyhow};
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Memory::{
        FILE_MAP_READ, FILE_MAP_WRITE, MEM_COMMIT, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile, PAGE_READWRITE,
        UnmapViewOfFile, VirtualAlloc,
    };

    /// Largest frame: a 4K picture. Bigger previews are drawn scaled.
    pub const MAX_PIXELS: usize = 3840 * 2160;
    const HEADER: usize = 4096;
    const SLOT: usize = MAX_PIXELS * 4;
    /// Reserved section size (committed only as far as frames reach).
    pub const BYTES: usize = HEADER + 2 * SLOT;
    const WRITING: u64 = 0;
    const NO_SLOT: u32 = u32::MAX;

    #[repr(C)]
    struct SlotHeader {
        seq: AtomicU64,
        width: AtomicU32,
        height: AtomicU32,
        source_ms: AtomicU64,
    }

    #[repr(C)]
    struct Header {
        latest: AtomicU64,
        /// Slot the reader is copying, or NO_SLOT.
        reading: AtomicU32,
        _pad: u32,
        slots: [SlotHeader; 2],
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    pub struct Meta {
        pub seq: u64,
        pub width: u32,
        pub height: u32,
        pub source_ms: f64,
    }

    /// Result of offering a frame to the section.
    #[derive(Clone, Copy, Debug, PartialEq)]
    pub enum Write {
        Published,
        /// The free slot is claimed by the reader: offer it again shortly.
        Busy,
        /// Larger than a slot, or the pages couldn't be committed.
        Refused,
    }

    /// A mapped view of the section.
    pub struct View {
        base: *mut u8,
        /// Writer side: bytes committed per slot.
        committed: [usize; 2],
    }

    // Plain shared memory: the shared fields are atomics and the pixel areas
    // follow the ownership protocol above.
    unsafe impl Send for View {}
    unsafe impl Sync for View {}

    impl View {
        /// Maps the section (read and write: the reader also claims slots).
        /// `commit_header` is for the creator of a SEC_RESERVE section.
        pub fn map(section: HANDLE, commit_header: bool) -> Result<View> {
            let v = unsafe { MapViewOfFile(section, FILE_MAP_WRITE | FILE_MAP_READ, 0, 0, BYTES) };
            if v.Value.is_null() {
                return Err(anyhow!("couldn't map the frame section: {}", windows::core::Error::from_thread()));
            }
            let view = View { base: v.Value as *mut u8, committed: [0; 2] };
            if commit_header {
                let p = unsafe { VirtualAlloc(Some(view.base as _), HEADER, MEM_COMMIT, PAGE_READWRITE) };
                if p.is_null() {
                    return Err(anyhow!("couldn't commit the frame header: {}", windows::core::Error::from_thread()));
                }
                view.header().reading.store(NO_SLOT, Ordering::SeqCst);
            }
            Ok(view)
        }

        fn header(&self) -> &Header {
            unsafe { &*(self.base as *const Header) }
        }

        fn pixels(&self, slot: usize) -> *mut u8 {
            unsafe { self.base.add(HEADER + slot * SLOT) }
        }

        /// Writer: publishes a frame as `seq` (> 0, increasing).
        pub fn write(&mut self, seq: u64, width: u32, height: u32, source_ms: f64, rgba: &[u8]) -> Write {
            let len = width as usize * height as usize * 4;
            if seq == WRITING || len > SLOT || rgba.len() < len {
                return Write::Refused;
            }
            // Not tied to `&self`: the header lives in the mapping, not in
            // the fields updated below.
            let h: &Header = unsafe { &*(self.base as *const Header) };
            let latest = h.latest.load(Ordering::SeqCst);
            // The slot not holding the newest frame.
            let i = if h.slots[0].seq.load(Ordering::SeqCst) == latest && latest != WRITING { 1 } else { 0 };
            if h.reading.load(Ordering::SeqCst) == i as u32 {
                return Write::Busy;
            }
            let s = &h.slots[i];
            let old = s.seq.load(Ordering::SeqCst);
            s.seq.store(WRITING, Ordering::SeqCst);
            if h.reading.load(Ordering::SeqCst) == i as u32 {
                // The reader claimed it (with the old frame) first.
                s.seq.store(old, Ordering::SeqCst);
                return Write::Busy;
            }
            if self.committed[i] < len {
                let p = unsafe { VirtualAlloc(Some(self.pixels(i) as _), len, MEM_COMMIT, PAGE_READWRITE) };
                if p.is_null() {
                    s.seq.store(old, Ordering::SeqCst);
                    return Write::Refused;
                }
                self.committed[i] = len;
            }
            unsafe { std::ptr::copy_nonoverlapping(rgba.as_ptr(), self.pixels(i), len) };
            s.width.store(width, Ordering::Relaxed);
            s.height.store(height, Ordering::Relaxed);
            s.source_ms.store(source_ms.to_bits(), Ordering::Relaxed);
            s.seq.store(seq, Ordering::Release);
            h.latest.store(seq, Ordering::SeqCst);
            Write::Published
        }

        /// Sequence number of the newest frame (0 = none yet).
        pub fn latest(&self) -> u64 {
            self.header().latest.load(Ordering::SeqCst)
        }

        /// Reader: hands the newest frame (unless it is `have`) to `use_frame`
        /// while its slot is claimed. None when there is nothing newer.
        pub fn read_with<R>(&self, have: u64, use_frame: impl FnOnce(Meta, &[u8]) -> R) -> Option<R> {
            let h = self.header();
            for _ in 0..4 {
                let seq = h.latest.load(Ordering::SeqCst);
                if seq == WRITING || seq == have {
                    return None;
                }
                let Some(i) = (0..2).find(|&i| h.slots[i].seq.load(Ordering::SeqCst) == seq) else { continue };
                h.reading.store(i as u32, Ordering::SeqCst);
                let s = &h.slots[i];
                if s.seq.load(Ordering::SeqCst) != seq {
                    // The writer started on it before the claim landed.
                    h.reading.store(NO_SLOT, Ordering::SeqCst);
                    continue;
                }
                let (w, ht) = (s.width.load(Ordering::Relaxed), s.height.load(Ordering::Relaxed));
                let len = w as usize * ht as usize * 4;
                let meta = Meta { seq, width: w, height: ht, source_ms: f64::from_bits(s.source_ms.load(Ordering::Relaxed)) };
                let r = (len <= SLOT).then(|| use_frame(meta, unsafe { std::slice::from_raw_parts(self.pixels(i), len) }));
                h.reading.store(NO_SLOT, Ordering::SeqCst);
                return r;
            }
            None
        }

        /// Reader: copies the newest frame into `out` unless it is `have`.
        pub fn read(&self, have: u64, out: &mut Vec<u8>) -> Option<Meta> {
            self.read_with(have, |meta, px| {
                out.clear();
                out.extend_from_slice(px);
                meta
            })
        }
    }

    impl Drop for View {
        fn drop(&mut self) {
            unsafe {
                let _ = UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS { Value: self.base as _ });
            }
        }
    }

    /// Creates a reserved (uncommitted) pagefile-backed section of `BYTES`.
    pub fn create() -> Result<HANDLE> {
        use windows::Win32::Foundation::INVALID_HANDLE_VALUE;
        use windows::Win32::System::Memory::{CreateFileMappingW, SEC_RESERVE};
        let bytes = BYTES as u64;
        let h = unsafe {
            CreateFileMappingW(INVALID_HANDLE_VALUE, None, PAGE_READWRITE | SEC_RESERVE, (bytes >> 32) as u32, bytes as u32, None)
        }?;
        Ok(h)
    }

    /// Scales `w x h` down (aspect kept) until it fits one slot.
    pub fn clamp(w: u32, h: u32) -> (u32, u32) {
        let (w, h) = (w.clamp(2, 8192), h.clamp(2, 8192));
        let px = w as f64 * h as f64;
        if px <= MAX_PIXELS as f64 {
            return (w, h);
        }
        let k = (MAX_PIXELS as f64 / px).sqrt();
        (((w as f64 * k) as u32).max(2), ((h as f64 * k) as u32).max(2))
    }
}

// ------------------------------------------------------------------- gains

#[derive(Default, PartialEq)]
struct GainState {
    levels: Vec<f32>,
    volume: f32,
    muted: bool,
    frozen: bool,
    automation: Vec<Option<AudioAutomation>>,
    trims: Vec<Option<TrackTrim>>,
    master: f32,
}

/// Most tracks a clip's gains are cached for (recorder clips have three).
const CACHED_TRACKS: usize = 16;

/// Live per-track gains for one player, read by its audio thread.
///
/// The audio thread never waits: if an update holds the lock it reuses the
/// gain it computed for the previous block. Updates only take the write
/// lock when something changed.
#[derive(Default)]
pub struct Gains {
    state: RwLock<GainState>,
    last: [AtomicU32; CACHED_TRACKS],
    last_master: AtomicU32,
}

impl Gains {
    pub fn update(&self, seg: &Segment, tracks: usize, master: f32, frozen: bool) {
        let next = GainState {
            levels: (0..tracks).map(|t| seg.level(t) as f32).collect(),
            volume: seg.volume as f32,
            muted: seg.muted,
            frozen,
            automation: (0..tracks).map(|t| seg.edits().and_then(|e| e.automation(t)).cloned()).collect(),
            trims: (0..tracks).map(|t| seg.track_trim(t)).collect(),
            master,
        };
        if *self.state.read().unwrap_or_else(|e| e.into_inner()) != next {
            *self.state.write().unwrap_or_else(|e| e.into_inner()) = next;
        }
    }
}

impl GainProvider for Gains {
    fn gain(&self, track: usize, source_ms: f64) -> f32 {
        let Ok(g) = self.state.try_read() else {
            return self.last.get(track).map_or(0.0, |a| f32::from_bits(a.load(Ordering::Relaxed)));
        };
        let v = if g.muted || g.frozen {
            0.0
        } else if let Some(Some(t)) = g.trims.get(track)
            && (source_ms < t.start_ms as f64 || source_ms >= t.end_ms as f64)
        {
            0.0
        } else {
            let level = g.levels.get(track).copied().unwrap_or(1.0);
            let auto = automation_gain_at(g.automation.get(track).and_then(Option::as_ref), source_ms) as f32;
            level * g.volume * auto
        };
        if let Some(a) = self.last.get(track) {
            a.store(v.to_bits(), Ordering::Relaxed);
        }
        v
    }

    fn master(&self) -> f32 {
        match self.state.try_read() {
            Ok(g) => {
                self.last_master.store(g.master.to_bits(), Ordering::Relaxed);
                g.master
            }
            Err(_) => f32::from_bits(self.last_master.load(Ordering::Relaxed)),
        }
    }
}

// -------------------------------------------------------------- controller

enum Msg {
    Cmd(Cmd),
    /// A player published a frame.
    Frame,
    Quit,
}

struct Open {
    player: Player,
    gains: Arc<Gains>,
    last_used: Instant,
}

/// Preview playback across a project's segments: maps output time to
/// (segment, source time), follows speed changes and freezes, and keeps
/// per-track gains live. Moved here unchanged in behaviour from the window.
struct Controller {
    project: Option<Project>,
    paths: HashMap<String, PathBuf>,
    open: HashMap<String, Open>,
    /// Frame size the window asked for, per clip.
    sizes: HashMap<String, (u32, u32)>,
    /// The most recent size asked for: the box for clips without their own.
    last_size: (u32, u32),
    generation: u64,
    playing: bool,
    out_ms: f64,
    segment: usize,
    source_ms: f64,
    frozen: bool,
    freeze_clock: Option<Instant>,
    volume: f32,
    muted: bool,
    error: Option<String>,
    wake: mpsc::Sender<Msg>,
}

impl Controller {
    fn new(wake: mpsc::Sender<Msg>) -> Controller {
        Controller {
            project: None,
            paths: HashMap::new(),
            open: HashMap::new(),
            sizes: HashMap::new(),
            last_size: (DEFAULT_W, DEFAULT_H),
            generation: 0,
            playing: false,
            out_ms: 0.0,
            segment: 0,
            source_ms: 0.0,
            frozen: false,
            freeze_clock: None,
            volume: 1.0,
            muted: false,
            error: None,
            wake,
        }
    }

    fn close(&mut self) {
        self.open.clear();
        self.project = None;
        self.playing = false;
        self.freeze_clock = None;
        self.error = None;
    }

    fn player(&mut self, clip_id: &str) -> Option<&Open> {
        if !self.open.contains_key(clip_id) {
            let path = self.paths.get(clip_id)?.clone();
            // Keep at most two clips open: the current one and the next.
            if self.open.len() >= 2
                && let Some(oldest) = self.open.iter().min_by_key(|(_, o)| o.last_used).map(|(k, _)| k.clone())
            {
                self.open.remove(&oldest);
            }
            let gains = Arc::new(Gains::default());
            let asked = self.sizes.get(clip_id).copied();
            let fallback = self.last_size;
            let size = move |info: &switchboard_media::MediaInfo| match asked {
                Some(s) => s,
                None => switchboard_media::fit(info.width, info.height, fallback.0, fallback.1),
            };
            match Player::open_sized(&path, gains.clone(), size) {
                Ok(player) => {
                    let wake = self.wake.clone();
                    player.set_frame_callback(Box::new(move || {
                        let _ = wake.send(Msg::Frame);
                    }));
                    self.open.insert(clip_id.to_string(), Open { player, gains, last_used: Instant::now() });
                    self.error = None;
                }
                Err(e) => {
                    self.error = Some(format!("Couldn't open {clip_id}: {e:#}"));
                    return None;
                }
            }
        }
        let o = self.open.get_mut(clip_id)?;
        o.last_used = Instant::now();
        Some(o)
    }

    fn output_volume(&self) -> f32 {
        if self.muted { 0.0 } else { self.volume }
    }

    fn set_size(&mut self, clip_id: String, w: u32, h: u32) {
        let (w, h) = frames::clamp(w, h);
        self.last_size = (w, h);
        if let Some(o) = self.open.get(&clip_id) {
            o.player.set_output_size(w, h);
        }
        self.sizes.insert(clip_id, (w, h));
    }

    /// Moves the playhead to output time `t` and shows that frame.
    fn seek(&mut self, t: f64, exact: bool) {
        let Some(project) = self.project.clone() else { return };
        self.out_ms = t.clamp(0.0, project.duration_ms as f64);
        let Some((i, src, frozen)) = project.locate(self.out_ms) else { return };
        self.segment = i;
        self.source_ms = src;
        self.frozen = frozen;
        let seg = &project.segments[i];
        let volume = self.output_volume();
        let playing = self.playing && !frozen;
        let Some(o) = self.player(&seg.clip_id) else { return };
        let tracks = o.player.info().tracks.len();
        o.gains.update(seg, tracks, volume, frozen);
        o.player.pause();
        o.player.set_play_range(seg.trim_start_ms as f64, Some(seg.trim_end_ms as f64));
        o.player.seek(src, exact);
        if playing {
            o.player.set_rate(speed_at(src, seg.edits()));
            o.player.play();
        }
        for (k, other) in &self.open {
            if *k != seg.clip_id {
                other.player.pause();
            }
        }
        self.freeze_clock = frozen.then(Instant::now);
    }

    fn pause(&mut self) {
        self.playing = false;
        self.freeze_clock = None;
        for o in self.open.values() {
            o.player.pause();
        }
    }

    /// Advances the output clock from the active player (or the wall clock
    /// during a freeze) and keeps gains in step with the project.
    fn tick(&mut self) {
        let Some(project) = self.project.clone() else { return };
        let Some(seg) = project.segments.get(self.segment) else { return };
        let starts = project.segment_starts();
        let seg_start = starts[self.segment] as f64;
        let volume = self.output_volume();
        if let Some(o) = self.open.get(&seg.clip_id) {
            let tracks = o.player.info().tracks.len();
            o.gains.update(seg, tracks, volume, self.frozen);
        }
        if !self.playing {
            return;
        }
        if self.frozen {
            // A freeze holds the frame; time passes on the wall clock.
            let started = *self.freeze_clock.get_or_insert_with(Instant::now);
            let held = started.elapsed().as_secs_f64() * 1000.0;
            let at = self.out_ms + held;
            if let Some((_, _, still)) = project.locate(at)
                && !still
            {
                self.seek(at, true);
            }
            return;
        }
        let Some(o) = self.open.get(&seg.clip_id) else { return };
        let pos = o.player.position_ms();
        o.player.set_rate(speed_at(pos, seg.edits()));
        self.source_ms = pos;
        self.out_ms = seg_start + source_to_edited_ms(seg.trim_start_ms as f64, pos, seg.edits());
        // A freeze starts at this source point: hold the frame.
        let crossed_freeze = seg.edits().is_some_and(|e| {
            e.freezes.iter().any(|f| {
                let begins = seg_start + source_to_edited_ms(seg.trim_start_ms as f64, f.time_ms as f64, seg.edits());
                self.out_ms >= begins && self.out_ms < begins + f.duration_ms as f64
            })
        });
        if crossed_freeze {
            let at = self.out_ms;
            self.seek(at, true);
            return;
        }
        let at_end = pos >= seg.trim_end_ms as f64 - 2.0 || !o.player.is_playing();
        if at_end {
            if self.segment + 1 < project.segments.len() {
                let next = starts[self.segment + 1] as f64;
                self.seek(next, true);
            } else {
                self.out_ms = project.duration_ms as f64;
                self.pause();
            }
        }
    }

    /// The frame for the current position, if decoded.
    fn frame(&self) -> Option<Arc<Frame>> {
        let seg = self.project.as_ref()?.segments.get(self.segment)?;
        self.open.get(&seg.clip_id)?.player.frame()
    }

    fn status(&self, frame: u64) -> Status {
        Status {
            generation: self.generation,
            out_ms: self.out_ms,
            segment: self.segment,
            source_ms: self.source_ms,
            frozen: self.frozen,
            playing: self.playing,
            frame,
        }
    }
}

// -------------------------------------------------------------------- main

fn send(out: &Mutex<std::io::Stdout>, event: &Event) {
    if let Ok(mut line) = serde_json::to_vec(event) {
        line.push(b'\n');
        let mut o = out.lock().unwrap_or_else(|e| e.into_inner());
        // A closed pipe means the window is gone; stdin EOF ends the loop.
        let _ = o.write_all(&line).and_then(|_| o.flush());
    }
}

/// Thumbnail decodes run on their own thread so playback never waits.
fn thumbnail_worker(out: Arc<Mutex<std::io::Stdout>>) -> mpsc::Sender<(u64, PathBuf, PathBuf)> {
    let (tx, rx) = mpsc::channel::<(u64, PathBuf, PathBuf)>();
    let _ = std::thread::Builder::new().name("host-thumbs".into()).spawn(move || {
        crate::ui::thumbs::init_decoder();
        for (id, clip, cache) in rx {
            let error = crate::ui::thumbs::make_cached(&clip, &cache).err().map(|e| format!("{e:#}"));
            send(&out, &Event::Thumbnail { id, error });
        }
    });
    tx
}

pub fn run() -> anyhow::Result<()> {
    let out = Arc::new(Mutex::new(std::io::stdout()));
    let (tx, rx) = mpsc::channel::<Msg>();
    {
        let tx = tx.clone();
        std::thread::Builder::new().name("host-stdin".into()).spawn(move || {
            let mut stdin = std::io::stdin().lock();
            let mut line = String::new();
            loop {
                line.clear();
                match stdin.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) if line.len() > MAX_LINE => continue,
                    Ok(_) => match serde_json::from_str::<Cmd>(&line) {
                        Ok(cmd) => {
                            if tx.send(Msg::Cmd(cmd)).is_err() {
                                break;
                            }
                        }
                        Err(e) => eprintln!("media host: bad command: {e}"),
                    },
                }
            }
            let _ = tx.send(Msg::Quit);
        })?;
    }
    let mut thumbs: Option<mpsc::Sender<(u64, PathBuf, PathBuf)>> = None;
    let mut ctl = Controller::new(tx.clone());
    drop(tx);
    let mut view: Option<frames::View> = None;
    let mut published: Option<(usize, u32, u32, f64)> = None;
    let mut seq = 0u64;
    let mut sent_status: Option<Status> = None;
    let mut sent_at = Instant::now();
    let mut sent_error: Option<String> = None;
    // The reader held the free slot: offer the frame again soon.
    let mut retry = false;
    'main: loop {
        // Playing: tick often enough for freezes and segment ends. Paused:
        // nothing changes without a command or a frame, so just block.
        let timeout = if retry {
            Duration::from_millis(2)
        } else if ctl.playing {
            Duration::from_millis(10)
        } else {
            Duration::from_secs(3600)
        };
        let first = match rx.recv_timeout(timeout) {
            Ok(m) => Some(m),
            Err(mpsc::RecvTimeoutError::Timeout) => None,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        let batch: Vec<Msg> = first.into_iter().chain(rx.try_iter()).collect();
        for msg in batch {
            match msg {
                Msg::Quit => break 'main,
                Msg::Frame => {}
                Msg::Cmd(cmd) => match cmd {
                    Cmd::Frames { handle, bytes } => {
                        let section = windows::Win32::Foundation::HANDLE(handle as usize as *mut _);
                        view = None;
                        published = None;
                        if bytes as usize == frames::BYTES {
                            match frames::View::map(section, false) {
                                Ok(v) => {
                                    // Number on from a previous helper's frames, so the
                                    // window never mistakes a new frame for one it has.
                                    seq = seq.max(v.latest());
                                    view = Some(v);
                                }
                                Err(e) => ctl.error = Some(format!("{e:#}")),
                            }
                        }
                        // The view keeps the section alive.
                        unsafe {
                            let _ = windows::Win32::Foundation::CloseHandle(section);
                        }
                    }
                    Cmd::Project { project, paths } => {
                        ctl.project = Some(*project);
                        ctl.paths = paths;
                        let n = ctl.project.as_ref().map_or(0, |p| p.segments.len());
                        ctl.segment = ctl.segment.min(n.saturating_sub(1));
                    }
                    Cmd::Seek { generation, out_ms, exact, playing } => {
                        ctl.generation = generation;
                        ctl.playing = playing;
                        ctl.seek(out_ms, exact);
                    }
                    Cmd::Pause { generation } => {
                        ctl.generation = generation;
                        ctl.pause();
                    }
                    Cmd::Volume { volume, muted } => {
                        ctl.volume = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 1.0 };
                        ctl.muted = muted;
                    }
                    Cmd::Size { clip_id, width, height } => ctl.set_size(clip_id, width, height),
                    Cmd::Close => {
                        ctl.close();
                        view = None;
                        published = None;
                    }
                    Cmd::Thumbnail { id, clip, cache } => {
                        let worker = thumbs.get_or_insert_with(|| thumbnail_worker(out.clone()));
                        let _ = worker.send((id, clip, cache));
                    }
                },
            }
        }
        ctl.tick();
        retry = false;
        if let (Some(v), Some(f)) = (&mut view, ctl.frame()) {
            let key = (Arc::as_ptr(&f) as usize, f.width, f.height, f.source_ms);
            if published != Some(key) {
                match v.write(seq + 1, f.width, f.height, f.source_ms, &f.rgba) {
                    frames::Write::Published => {
                        seq += 1;
                        published = Some(key);
                    }
                    frames::Write::Busy => retry = true,
                    // Never fits: don't offer it again.
                    frames::Write::Refused => published = Some(key),
                }
            }
        }
        // Every status the window receives costs a repaint, so send one per
        // new frame or state change, and position-only updates (freezes,
        // audio past the end of the video) at most every STATUS_INTERVAL.
        let status = ctl.status(seq);
        let due = match &sent_status {
            None => true,
            Some(s) => {
                s.generation != status.generation
                    || s.playing != status.playing
                    || s.segment != status.segment
                    || s.frozen != status.frozen
                    || s.frame != status.frame
                    || (s.out_ms != status.out_ms && sent_at.elapsed() >= STATUS_INTERVAL)
                    || (!status.playing && s.out_ms != status.out_ms)
            }
        };
        if due {
            send(&out, &Event::Status { status: status.clone() });
            sent_status = Some(status);
            sent_at = Instant::now();
        }
        if sent_error != ctl.error {
            sent_error = ctl.error.clone();
            send(&out, &Event::Error { text: sent_error.clone() });
        }
    }
    // The window is gone or done. Release players in order, but never hang
    // around if a driver blocks the teardown.
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(2));
        std::process::exit(0);
    });
    drop(view);
    drop(ctl);
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;
    use switchboard_project::{GainPoint, VideoEdits};

    fn segment() -> Segment {
        Segment::new("a.mp4", 10_000, Some(vec![100, 50, 0]))
    }

    #[test]
    fn gains_follow_levels_mutes_and_automation() {
        let g = Gains::default();
        let mut seg = segment();
        g.update(&seg, 3, 0.8, false);
        assert_eq!(g.gain(0, 100.0), 1.0);
        assert_eq!(g.gain(1, 100.0), 0.5);
        assert_eq!(g.gain(2, 100.0), 0.0);
        assert_eq!(g.master(), 0.8);
        // A fader move in the editor reaches the next block.
        seg.set_level(1, 25, 3);
        g.update(&seg, 3, 0.8, false);
        assert_eq!(g.gain(1, 100.0), 0.25);
        // Segment mute and freeze silence every track.
        seg.muted = true;
        g.update(&seg, 3, 0.8, false);
        assert_eq!(g.gain(0, 100.0), 0.0);
        seg.muted = false;
        g.update(&seg, 3, 0.8, true);
        assert_eq!(g.gain(0, 100.0), 0.0);
        // Automation scales by source time.
        let mut edits = VideoEdits::default();
        edits.audio_automation.push(AudioAutomation {
            track_index: 0,
            points: vec![GainPoint { time_ms: 0, gain: 1.0 }, GainPoint { time_ms: 1000, gain: 0.0 }],
            mutes: vec![],
        });
        seg.video_edits = Some(edits);
        g.update(&seg, 3, 0.8, false);
        assert!(g.gain(0, 0.0) > 0.99);
        assert!(g.gain(0, 1000.0) < 0.01);
        // Track trims silence outside the kept range.
        seg.audio_track_trims = Some(vec![None, Some(TrackTrim { start_ms: 2000, end_ms: 3000 }), None]);
        g.update(&seg, 3, 0.8, false);
        assert_eq!(g.gain(1, 1000.0), 0.0);
        assert_eq!(g.gain(1, 2500.0), 0.25);
    }

    #[test]
    fn contended_gains_reuse_the_last_block() {
        let g = Gains::default();
        g.update(&segment(), 3, 1.0, false);
        // One block before the update, as the audio thread runs.
        assert_eq!(g.gain(1, 0.0), 0.5);
        assert_eq!(g.master(), 1.0);
        let _writer = g.state.write().unwrap();
        // The audio thread doesn't wait for the writer.
        assert_eq!(g.gain(1, 0.0), 0.5);
        assert_eq!(g.master(), 1.0);
    }

    #[test]
    fn commands_round_trip_as_json() {
        let p = Project::for_clip("a.mp4", "A", 5000, None, 0);
        let line = serde_json::to_string(&Cmd::Project { project: Box::new(p.clone()), paths: HashMap::new() }).unwrap();
        match serde_json::from_str::<Cmd>(&line).unwrap() {
            Cmd::Project { project, .. } => assert_eq!(*project, p),
            other => panic!("{other:?}"),
        }
        let e = serde_json::to_string(&Event::Status { status: Status { frame: 3, ..Default::default() } }).unwrap();
        assert!(matches!(serde_json::from_str::<Event>(&e).unwrap(), Event::Status { status } if status.frame == 3));
    }

    fn section() -> (frames::View, frames::View) {
        let section = frames::create().unwrap();
        // The window creates and commits the header; the helper maps it.
        let reader = frames::View::map(section, true).unwrap();
        let writer = frames::View::map(section, false).unwrap();
        unsafe { windows::Win32::Foundation::CloseHandle(section).unwrap() };
        (writer, reader)
    }

    #[test]
    fn frame_section_hands_over_the_newest_frame() {
        use frames::Write::*;
        let (mut writer, reader) = section();
        let mut buf = Vec::new();
        assert_eq!(reader.read(0, &mut buf), None);
        assert_eq!(writer.write(1, 2, 2, 40.0, &[1; 16]), Published);
        assert_eq!(writer.write(2, 3, 1, 56.5, &[7; 12]), Published);
        let m = reader.read(0, &mut buf).unwrap();
        assert_eq!((m.seq, m.width, m.height, m.source_ms), (2, 3, 1, 56.5));
        assert_eq!(buf, vec![7; 12]);
        // Nothing newer than what we have.
        assert_eq!(reader.read(2, &mut buf), None);
        // Oversized frames are refused, not truncated.
        assert_eq!(writer.write(3, 8192, 8192, 0.0, &[]), Refused);
        assert_eq!(frames::clamp(7680, 4320), (3840, 2160));
        assert_eq!(frames::clamp(1919, 1079), (1919, 1079));
    }

    #[test]
    fn a_stalled_reader_keeps_its_frame_intact() {
        use frames::Write::*;
        let (mut writer, reader) = section();
        assert_eq!(writer.write(1, 4, 4, 0.0, &[1; 64]), Published);
        reader
            .read_with(0, |meta, px| {
                assert_eq!(meta.seq, 1);
                // While the reader holds frame 1, the writer fills the other
                // slot once, then has no free slot and must not touch ours.
                assert_eq!(writer.write(2, 4, 4, 0.0, &[2; 64]), Published);
                assert_eq!(writer.write(3, 4, 4, 0.0, &[3; 64]), Busy);
                assert_eq!(writer.write(3, 4, 4, 0.0, &[3; 64]), Busy);
                assert!(px.iter().all(|&b| b == 1), "the held frame was overwritten");
            })
            .unwrap();
        // Released: the writer gets the slot back and the reader sees it.
        assert_eq!(writer.write(3, 4, 4, 0.0, &[3; 64]), Published);
        let mut buf = Vec::new();
        assert_eq!(reader.read(1, &mut buf).map(|m| m.seq), Some(3));
        assert!(buf.iter().all(|&b| b == 3));
    }

    #[test]
    fn concurrent_reads_never_see_a_torn_frame() {
        let (mut writer, reader) = section();
        let w = std::thread::spawn(move || {
            let mut seq = 1u64;
            let mut frame = vec![0u8; 256 * 256 * 4];
            let until = Instant::now() + Duration::from_millis(300);
            while Instant::now() < until {
                frame.fill((seq % 251) as u8);
                if writer.write(seq, 256, 256, seq as f64, &frame) == frames::Write::Published {
                    seq += 1;
                }
            }
            seq
        });
        let mut have = 0;
        let mut reads = 0;
        let mut buf = Vec::new();
        while !w.is_finished() {
            if let Some(m) = reader.read(have, &mut buf) {
                let v = (m.seq % 251) as u8;
                assert!(buf.iter().all(|&b| b == v), "torn frame {}", m.seq);
                assert!(m.seq > have);
                have = m.seq;
                reads += 1;
            }
        }
        let written = w.join().unwrap();
        assert!(reads > 10 && written > 10, "reads {reads}, writes {written}");
    }
}
