//! Clip preview player.
//!
//! Two worker threads share one `State` under a mutex + condvar:
//!
//! - Video: owns the decoder, keeps at most `AHEAD` RGBA frames decoded ahead
//!   of the clock, publishes the latest frame with pts <= position, and
//!   services seeks (latest request wins, so drags never queue up).
//! - Audio: owns one Source Reader per track and, only while playing at 1x,
//!   a WASAPI stream. It mixes 10 ms blocks with the caller's gains and
//!   publishes the device clock, which then drives `position_ms`.
//!
//! Clock: while audio runs, position = device position (IAudioClock)
//! extrapolated with QPC between readings. Without audio (no tracks, no
//! output device, rate != 1) it is a wall clock scaled by the rate.
//!
//! Rate != 1: audio is not rendered (the stream is stopped and released),
//! video follows the scaled wall clock. Pitch-preserving time stretch is out
//! of scope for preview.
//!
//! Idle: paused, both threads block on the condvar (1 s safety timeout), the
//! audio device is released, and nothing decodes.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, mpsc};
use std::thread::JoinHandle;
use std::time::Duration;

use anyhow::{Result, anyhow};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::{
    CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateEventW, CreateWaitableTimerExW, SetEvent, SetWaitableTimer,
    WaitForMultipleObjects, WaitForSingleObject,
};
use windows::core::PCWSTR;

use crate::audio::{self, BLOCK, CHANNELS, Output, TrackReader};
use crate::mf;
use crate::video::{Decoded, VideoDecoder};
use crate::{Frame, GainProvider, MediaInfo, mp4};

/// Decoded frames kept ahead of the one on screen.
const AHEAD: usize = 3;
/// Exact seeks within this distance ahead of the decoder decode forward
/// instead of seeking (one GOP on recorder clips).
const FORWARD_SEEK_MS: f64 = 1000.0;
/// How long the clock holds for the audio device to start before falling
/// back to the wall clock.
const AUDIO_START_GRACE_MS: f64 = 500.0;
/// Extrapolation limit past the last audio clock reading.
const AUDIO_EXTRAPOLATE_MS: f64 = 200.0;

#[derive(Clone, Copy)]
struct SeekReq {
    epoch: u64,
    ms: f64,
    exact: bool,
}

struct State {
    quit: bool,
    playing: bool,
    rate: f64,
    /// Position at `anchor_hns` (QPC, 100 ns).
    anchor_ms: f64,
    anchor_hns: i64,
    /// Bumped on every play/pause/seek/rate change; the audio thread restarts
    /// its stream on change.
    epoch: u64,
    /// The audio thread can drive the clock (tracks decoded, device open).
    audio_ok: bool,
    /// Latest device clock reading for `epoch`: (source ms, QPC 100 ns).
    audio_clock: Option<(f64, i64)>,
    /// Never report a smaller position within one `epoch`.
    last_pos: f64,
    seek: SeekReq,
    range_start: f64,
    range_end: Option<f64>,
    duration_ms: f64,
    /// Requested frame size not yet applied by the video thread.
    resize: Option<(u32, u32)>,
}

impl State {
    fn end_ms(&self) -> f64 {
        self.range_end.map_or(self.duration_ms, |e| e.min(self.duration_ms)).max(0.0)
    }

    fn audio_drives(&self) -> bool {
        self.audio_ok && self.rate == 1.0
    }

    /// Re-anchors the clock at the current position (before a state change).
    fn reanchor(&mut self, now: i64) {
        self.anchor_ms = self.position(now).0;
        self.anchor_hns = now;
    }

    fn bump(&mut self) {
        self.epoch += 1;
        self.audio_clock = None;
        self.last_pos = self.anchor_ms;
    }

    /// (position, reached the end on this call).
    fn position(&mut self, now: i64) -> (f64, bool) {
        if !self.playing {
            return (self.anchor_ms, false);
        }
        let elapsed = (now - self.anchor_hns) as f64 / 10_000.0;
        let p = if self.audio_drives() {
            match self.audio_clock {
                Some((ms, at)) => ms + ((now - at) as f64 / 10_000.0).clamp(0.0, AUDIO_EXTRAPOLATE_MS),
                // Waiting for the device to start: hold, but not forever.
                None => self.anchor_ms + (elapsed - AUDIO_START_GRACE_MS).max(0.0),
            }
        } else {
            self.anchor_ms + elapsed * self.rate
        };
        let p = p.max(self.last_pos);
        self.last_pos = p;
        let end = self.end_ms();
        if p >= end {
            self.playing = false;
            self.anchor_ms = end;
            self.anchor_hns = now;
            self.bump();
            return (end, true);
        }
        (p, false)
    }
}

type Callback = Arc<dyn Fn() + Send + Sync>;

struct Shared {
    state: Mutex<State>,
    wake: Condvar,
    /// The video thread sleeps on this instead of the condvar: frame
    /// deadlines need sub-millisecond wakeups, and condvar timeouts follow
    /// the 15.6 ms system tick.
    video_wake: Waker,
    frame: Mutex<Option<Arc<Frame>>>,
    callback: Mutex<Option<Callback>>,
    gains: Arc<dyn GainProvider>,
    /// Preview output volume, f32 bits.
    volume: AtomicU32,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, State> {
        // A panicked worker must not take the UI down with it.
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn position_ms(&self) -> f64 {
        let mut st = self.lock();
        let (p, ended) = st.position(mf::now_hns());
        if ended {
            self.notify();
        }
        p
    }

    /// Wakes both workers after a state change.
    fn notify(&self) {
        self.wake.notify_all();
        self.video_wake.wake();
    }

    fn volume(&self) -> f32 {
        f32::from_bits(self.volume.load(Ordering::Relaxed))
    }

    fn notify_frame(&self) {
        let cb = self.callback.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Some(cb) = cb {
            cb();
        }
    }
}

pub struct Player {
    shared: Arc<Shared>,
    info: MediaInfo,
    hardware: bool,
    threads: Vec<JoinHandle<()>>,
}

impl Player {
    /// Opens video and audio. Returns once the first frame is decoded (so
    /// `frame()` is immediately useful) or with an error if the video can't
    /// be decoded. Audio problems are not fatal: the player falls back to a
    /// wall clock and plays silently.
    ///
    /// Frames fit `max_w x max_h` (aspect kept, never upscaled).
    pub fn open(path: &Path, max_w: u32, max_h: u32, gains: Arc<dyn GainProvider>) -> Result<Player> {
        Player::open_with(path, gains, |info| crate::video::fit(info.width, info.height, max_w, max_h))
    }

    /// Like [`Player::open`], with frames of exactly the size `size` returns
    /// for the clip's facts (e.g. the pixel size the preview is drawn at).
    pub fn open_sized(path: &Path, gains: Arc<dyn GainProvider>, size: impl FnOnce(&MediaInfo) -> (u32, u32)) -> Result<Player> {
        Player::open_with(path, gains, size)
    }

    fn open_with(path: &Path, gains: Arc<dyn GainProvider>, size: impl FnOnce(&MediaInfo) -> (u32, u32)) -> Result<Player> {
        let (info, movie) = crate::probe_full(path)?;
        let (out_w, out_h) = size(&info);
        let duration_ms = info.duration_ms.max(0) as f64;
        let state = State {
            quit: false,
            playing: false,
            rate: 1.0,
            anchor_ms: 0.0,
            anchor_hns: mf::now_hns(),
            epoch: 0,
            audio_ok: !info.tracks.is_empty(),
            audio_clock: None,
            last_pos: 0.0,
            seek: SeekReq { epoch: 0, ms: 0.0, exact: true },
            range_start: 0.0,
            range_end: None,
            duration_ms,
            resize: None,
        };
        let shared = Arc::new(Shared {
            state: Mutex::new(state),
            wake: Condvar::new(),
            video_wake: Waker::new()?,
            frame: Mutex::new(None),
            callback: Mutex::new(None),
            gains,
            volume: AtomicU32::new(1.0f32.to_bits()),
        });
        let mut threads = Vec::new();
        let mut hardware = false;
        let has_video = !info.video_codec.is_empty() || info.width > 0;
        if has_video {
            let (tx, rx) = mpsc::channel();
            let s = shared.clone();
            let p = path.to_path_buf();
            let (w, h, fps) = (info.width, info.height, info.fps);
            let handle = std::thread::Builder::new()
                .name("media-video".into())
                .spawn(move || video_main(s, &p, (w, h, fps, out_w, out_h), tx))?;
            match rx.recv() {
                Ok(Ok(hw)) => {
                    hardware = hw;
                    threads.push(handle);
                }
                Ok(Err(e)) => {
                    let _ = handle.join();
                    return Err(e);
                }
                Err(_) => {
                    let _ = handle.join();
                    return Err(anyhow!("the video decoder stopped unexpectedly"));
                }
            }
        }
        if !info.tracks.is_empty() {
            let s = shared.clone();
            let p = path.to_path_buf();
            let n = info.tracks.len();
            let spawned = std::thread::Builder::new().name("media-audio".into()).spawn(move || audio_main(s, p, movie, n));
            match spawned {
                Ok(h) => threads.push(h),
                Err(_) => shared.lock().audio_ok = false,
            }
        }
        Ok(Player { shared, info, hardware, threads })
    }

    pub fn info(&self) -> &MediaInfo {
        &self.info
    }

    /// True when video is decoded and scaled on the GPU.
    pub fn hardware_video(&self) -> bool {
        self.hardware
    }

    /// Starts playback. If the position is outside the play range (or at its
    /// end), playback restarts from the range start.
    pub fn play(&self) {
        let mut st = self.shared.lock();
        if st.playing {
            return;
        }
        let now = mf::now_hns();
        let pos = st.position(now).0;
        let end = st.end_ms();
        if pos >= end - 1.0 || pos < st.range_start {
            let start = st.range_start.min(end);
            st.anchor_ms = start;
            st.seek = SeekReq { epoch: st.seek.epoch + 1, ms: start, exact: true };
        }
        st.anchor_hns = now;
        st.playing = true;
        st.bump();
        self.shared.notify();
    }

    pub fn pause(&self) {
        let mut st = self.shared.lock();
        if !st.playing {
            return;
        }
        let now = mf::now_hns();
        st.reanchor(now);
        st.playing = false;
        st.bump();
        self.shared.notify();
    }

    pub fn is_playing(&self) -> bool {
        let mut st = self.shared.lock();
        let (_, ended) = st.position(mf::now_hns());
        if ended {
            self.shared.notify();
        }
        st.playing
    }

    /// Seeks to `source_ms`. `exact` shows the frame at that time (decodes
    /// from the previous keyframe); otherwise the keyframe at or before it,
    /// which is much cheaper for drags. Playback continues if playing.
    pub fn seek(&self, source_ms: f64, exact: bool) {
        let mut st = self.shared.lock();
        let ms = if source_ms.is_finite() { source_ms.clamp(0.0, st.duration_ms) } else { 0.0 };
        st.anchor_ms = ms;
        st.anchor_hns = mf::now_hns();
        st.seek = SeekReq { epoch: st.seek.epoch + 1, ms, exact };
        st.bump();
        self.shared.notify();
    }

    /// Playback rate, clamped to 0.25..=4. At any rate other than 1 audio is
    /// muted (not time-stretched) and video follows a wall clock.
    pub fn set_rate(&self, rate: f64) {
        let rate = if rate.is_finite() { rate.clamp(0.25, 4.0) } else { 1.0 };
        let mut st = self.shared.lock();
        if st.rate == rate {
            return;
        }
        st.reanchor(mf::now_hns());
        st.rate = rate;
        st.bump();
        self.shared.notify();
    }

    pub fn rate(&self) -> f64 {
        self.shared.lock().rate
    }

    /// Current position in source ms: the audio device clock while audio
    /// plays, else a wall clock.
    pub fn position_ms(&self) -> f64 {
        self.shared.position_ms()
    }

    /// The frame for the current position (latest decoded frame with pts <=
    /// position). Compare `source_ms` to skip re-uploading an unchanged frame.
    pub fn frame(&self) -> Option<Arc<Frame>> {
        self.shared.frame.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Called from the video thread whenever a new frame is published.
    /// Keep it cheap (e.g. request a repaint).
    pub fn set_frame_callback(&self, cb: Box<dyn Fn() + Send + Sync>) {
        *self.shared.callback.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::from(cb));
    }

    /// Renders frames at exactly `w x h` from now on. When paused, the frame
    /// on screen is decoded again at the new size; while playing, the next
    /// frames arrive at it. Frames already published keep their size.
    pub fn set_output_size(&self, w: u32, h: u32) {
        self.shared.lock().resize = Some((w.max(2), h.max(2)));
        self.shared.notify();
    }

    /// Preview output volume 0..=1, applied after the per-track and master
    /// gains. 0 mutes (the mix still runs and drives the clock).
    pub fn set_output_volume(&self, v: f32) {
        let v = if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 };
        self.shared.volume.store(v.to_bits(), Ordering::Relaxed);
    }

    /// Playback stops at `end_ms` (None = file end): it pauses and reports
    /// position = end. `play()` outside `[start, end)` restarts at `start`.
    pub fn set_play_range(&self, start_ms: f64, end_ms: Option<f64>) {
        let mut st = self.shared.lock();
        let now = mf::now_hns();
        st.reanchor(now);
        st.range_start = start_ms.clamp(0.0, st.duration_ms);
        st.range_end = end_ms.filter(|e| e.is_finite()).map(|e| e.clamp(st.range_start, st.duration_ms));
        // Apply the new end right away if we're already past it.
        let (_, ended) = st.position(now);
        st.bump();
        drop(st);
        if ended {
            self.shared.notify();
        }
        self.shared.notify();
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        self.shared.lock().quit = true;
        self.shared.notify();
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
        *self.shared.callback.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

// ------------------------------------------------------------------ video

struct VideoWorker {
    shared: Arc<Shared>,
    dec: VideoDecoder,
    /// Decoded frames after the one on screen, in pts order.
    ahead: VecDeque<Arc<Frame>>,
    /// pts of the last frame the decoder returned.
    decoded_ms: f64,
    seen_seek: u64,
    /// Spare RGBA buffers from frames nobody else holds any more.
    pool: Vec<Vec<u8>>,
}

fn video_main(
    shared: Arc<Shared>,
    path: &Path,
    (w, h, fps, out_w, out_h): (u32, u32, f64, u32, u32),
    ready: mpsc::Sender<Result<bool>>,
) {
    mf::init_thread();
    let dec = match VideoDecoder::open(path, w, h, fps, out_w, out_h) {
        Ok(d) => d,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    let hardware = dec.hardware;
    let mut worker = VideoWorker { shared, dec, ahead: VecDeque::new(), decoded_ms: f64::NEG_INFINITY, seen_seek: 0, pool: Vec::new() };
    // First frame before reporting ready, so the UI has a picture at once.
    if let Err(e) = worker.seek_to(SeekReq { epoch: 0, ms: 0.0, exact: false }) {
        let _ = ready.send(Err(e.context("couldn't decode the first video frame")));
        return;
    }
    let _ = ready.send(Ok(hardware));
    worker.run();
}

impl VideoWorker {
    fn run(&mut self) {
        loop {
            let (seek, playing, resize) = {
                let mut st = self.shared.lock();
                if st.quit {
                    return;
                }
                ((st.seek.epoch != self.seen_seek).then_some(st.seek), st.playing, st.resize.take())
            };
            if let Some((w, h)) = resize {
                if let Err(e) = self.resize(w, h, playing && seek.is_none()) {
                    eprintln!("media: video resize failed: {e:#}");
                }
                continue;
            }
            if let Some(req) = seek {
                self.seen_seek = req.epoch;
                if let Err(e) = self.seek_to(req) {
                    // A broken stretch of video: keep the last frame, don't spin.
                    eprintln!("media: video seek failed: {e:#}");
                }
                continue;
            }
            let wait = if playing {
                match self.advance() {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("media: video decode failed: {e:#}");
                        // Stop decoding this stream; position keeps running.
                        self.dec.eof = true;
                        Duration::from_millis(50)
                    }
                }
            } else {
                Duration::from_secs(1)
            };
            {
                let st = self.shared.lock();
                if st.quit || st.seek.epoch != self.seen_seek || st.playing != playing {
                    continue;
                }
            }
            // Auto-reset event: a notify between the check and here is kept.
            self.shared.video_wake.wait(wait);
        }
    }

    /// Publishes due frames and keeps the queue full. Returns how long to
    /// sleep before the next frame is due.
    fn advance(&mut self) -> Result<Duration> {
        let pos = self.shared.position_ms();
        let mut newest = None;
        while self.ahead.front().is_some_and(|f| f.source_ms <= pos + 0.5) {
            if let Some(old) = newest.replace(self.ahead.pop_front().unwrap()) {
                self.recycle(old);
            }
        }
        if let Some(f) = newest {
            self.publish(f);
        }
        while self.ahead.len() < AHEAD && !self.dec.eof {
            if self.seek_pending() {
                return Ok(Duration::ZERO);
            }
            let Some(d) = self.dec.next()? else { break };
            self.decoded_ms = d.pts_ms;
            let pos = self.shared.position_ms();
            // Late (decode slower than playback): skip the readback entirely.
            if d.pts_ms + d.duration_ms <= pos {
                continue;
            }
            let frame = Arc::new(self.dec.render(&d, self.pool.pop())?);
            if frame.source_ms <= pos + 0.5 {
                self.publish(frame);
            } else {
                self.ahead.push_back(frame);
            }
        }
        let rate = self.shared.lock().rate;
        let pos = self.shared.position_ms();
        Ok(match self.ahead.front() {
            Some(f) => Duration::from_secs_f64(((f.source_ms - pos) / rate).clamp(1.0, 50.0) / 1000.0),
            // End of video while the clock runs on (audio may be longer).
            None => Duration::from_millis(50),
        })
    }

    /// Applies a new frame size. Paused: decodes the shown frame again so the
    /// new size appears at once. Playing: drops queued frames so the next
    /// ones are rendered at the new size (the software path re-seeks, as its
    /// output type change resets the stream).
    fn resize(&mut self, w: u32, h: u32, playing: bool) -> Result<()> {
        let hardware = self.dec.hardware;
        let before = (self.dec.width, self.dec.height);
        self.dec.set_output_size(w, h)?;
        if (self.dec.width, self.dec.height) == before {
            return Ok(());
        }
        self.pool.clear();
        self.clear_ahead();
        if playing && hardware {
            return Ok(());
        }
        let target = match self.shared.frame.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            Some(f) => f.source_ms,
            None => self.shared.position_ms(),
        };
        let target = if playing { self.shared.position_ms() } else { target };
        // Force a real seek: decoding on from here would skip the shown frame.
        self.decoded_ms = f64::INFINITY;
        self.seek_to(SeekReq { epoch: self.seen_seek, ms: target, exact: true })
    }

    fn seek_pending(&self) -> bool {
        let st = self.shared.lock();
        st.quit || st.seek.epoch != self.seen_seek
    }

    fn seek_to(&mut self, req: SeekReq) -> Result<()> {
        let target = req.ms;
        if req.exact {
            // Already queued? (A later queued frame proves frame i covers the target.)
            if let Some(i) = self.ahead.iter().rposition(|f| f.source_ms <= target + 0.5)
                && i + 1 < self.ahead.len()
            {
                let mut f = None;
                for _ in 0..=i {
                    if let Some(old) = f.replace(self.ahead.pop_front().unwrap()) {
                        self.recycle(old);
                    }
                }
                self.publish(f.unwrap());
                return Ok(());
            }
            // On screen with nothing decoded in between?
            let shown = self.shared.frame.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|f| f.source_ms);
            if let Some(s) = shown
                && s <= target + 0.5
                && self.ahead.front().is_some_and(|f| f.source_ms > target + 0.5)
            {
                return Ok(());
            }
        }
        self.clear_ahead();
        // Short hop forward (frame stepping, play after scrub): decode on
        // from where we are instead of seeking back to the keyframe.
        let forward = req.exact && target >= self.decoded_ms && target - self.decoded_ms < FORWARD_SEEK_MS && !self.dec.eof;
        if !forward {
            self.dec.seek(target)?;
        }
        let mut prev: Option<Decoded> = None;
        loop {
            if req.epoch != 0 && self.seek_pending() {
                // A newer seek replaces this one; show what we have so drags
                // still give feedback.
                if let Some(p) = prev.take() {
                    let f = Arc::new(self.dec.render(&p, self.pool.pop())?);
                    self.publish(f);
                }
                return Ok(());
            }
            let Some(d) = self.dec.next()? else {
                if let Some(p) = prev {
                    let f = Arc::new(self.dec.render(&p, self.pool.pop())?);
                    self.publish(f);
                }
                return Ok(());
            };
            self.decoded_ms = d.pts_ms;
            if !req.exact || d.pts_ms + d.duration_ms > target + 0.5 {
                if req.exact && d.pts_ms > target + 0.5 {
                    // Overshot (gap or seek landed late): show the previous
                    // frame and keep this one queued.
                    let next = Arc::new(self.dec.render(&d, self.pool.pop())?);
                    if let Some(p) = prev {
                        let f = Arc::new(self.dec.render(&p, self.pool.pop())?);
                        self.publish(f);
                        self.ahead.push_back(next);
                    } else {
                        self.publish(next);
                    }
                } else {
                    let f = Arc::new(self.dec.render(&d, self.pool.pop())?);
                    self.publish(f);
                }
                return Ok(());
            }
            prev = Some(d);
        }
    }

    fn publish(&mut self, f: Arc<Frame>) {
        let old = self.shared.frame.lock().unwrap_or_else(|e| e.into_inner()).replace(f);
        if let Some(old) = old {
            self.recycle(old);
        }
        self.shared.notify_frame();
    }

    fn clear_ahead(&mut self) {
        while let Some(f) = self.ahead.pop_front() {
            self.recycle(f);
        }
    }

    fn recycle(&mut self, f: Arc<Frame>) {
        if self.pool.len() < 2
            && let Ok(frame) = Arc::try_unwrap(f)
        {
            self.pool.push(frame.rgba);
        }
    }
}

// ------------------------------------------------------------------ audio

struct AudioWorker {
    shared: Arc<Shared>,
    /// Indexed like `MediaInfo::tracks`; None if a track can't be decoded.
    tracks: Vec<Option<TrackReader>>,
    out: Option<Output>,
    /// Gains at the end of the previous block (ramp start).
    prev_gain: Vec<f32>,
    prev_master: f32,
    mix: Vec<f32>,
}

struct Session {
    epoch: u64,
    start_frame: i64,
    next_frame: i64,
    end_frame: i64,
}

fn audio_main(shared: Arc<Shared>, path: PathBuf, movie: Option<mp4::Movie>, count: usize) {
    mf::init_thread();
    let _mmcss = Mmcss::join();
    let tracks = open_tracks(&path, movie.as_ref(), count);
    if tracks.iter().all(Option::is_none) {
        shared.lock().audio_ok = false;
        return;
    }
    let mut w = AudioWorker {
        shared,
        prev_gain: vec![1.0; tracks.len()],
        tracks,
        out: None,
        prev_master: 1.0,
        mix: vec![0.0; BLOCK * CHANNELS],
    };
    w.run();
}

fn open_tracks(path: &Path, movie: Option<&mp4::Movie>, count: usize) -> Vec<Option<TrackReader>> {
    // Entry i is the stream behind MediaInfo::tracks[i].
    let streams = crate::audio_streams(path, movie).unwrap_or_default();
    (0..count)
        .map(|i| {
            let s = streams.get(i)?;
            match TrackReader::open(path, s.index) {
                Ok(t) => Some(t),
                Err(e) => {
                    eprintln!("media: audio track {i} unavailable: {e:#}");
                    None
                }
            }
        })
        .collect()
}

impl AudioWorker {
    fn run(&mut self) {
        let mut seen_epoch = u64::MAX;
        let mut session: Option<Session> = None;
        loop {
            let st = self.shared.lock();
            if st.quit {
                break;
            }
            if st.epoch != seen_epoch {
                seen_epoch = st.epoch;
                let want = st.playing && st.rate == 1.0;
                let (start_ms, end_ms, epoch) = (st.anchor_ms, st.end_ms(), st.epoch);
                drop(st);
                session = None;
                if want {
                    match self.start(epoch, start_ms, end_ms) {
                        Ok(s) => session = Some(s),
                        Err(e) => self.fail(&e),
                    }
                } else {
                    // Paused or not at 1x: release the device entirely.
                    self.out = None;
                }
                continue;
            }
            let Some(s) = session.as_mut() else {
                let _ = self.shared.wake.wait_timeout(st, Duration::from_secs(1));
                continue;
            };
            drop(st);
            let out = self.out.as_ref().expect("session implies output");
            out.wait(50);
            if let Err(e) = self.render(s) {
                session = None;
                self.fail(&e);
            }
        }
        self.out = None;
    }

    fn start(&mut self, epoch: u64, start_ms: f64, end_ms: f64) -> Result<Session> {
        if let Some(o) = self.out.as_mut() {
            o.stop_and_flush();
        } else {
            self.out = Some(Output::open()?);
        }
        let start_frame = audio::ms_to_frame(start_ms);
        for t in self.tracks.iter_mut().flatten() {
            t.seek(start_frame)?;
        }
        let ms = start_ms;
        for (i, g) in self.prev_gain.iter_mut().enumerate() {
            *g = sanitize(self.shared.gains.gain(i, ms));
        }
        self.prev_master = sanitize(self.shared.gains.master()) * self.shared.volume();
        let mut s = Session { epoch, start_frame, next_frame: start_frame, end_frame: audio::ms_to_frame(end_ms) };
        {
            let mut st = self.shared.lock();
            if st.epoch != epoch {
                return Ok(s); // superseded; the loop restarts immediately
            }
            st.audio_ok = true;
        }
        self.render(&mut s)?;
        self.out.as_mut().unwrap().start()?;
        Ok(s)
    }

    /// Fills the device buffer in whole blocks and publishes the clock.
    fn render(&mut self, s: &mut Session) -> Result<()> {
        let out = self.out.as_ref().expect("output open");
        let mut room = out.writable()? as usize;
        while room >= BLOCK {
            self.mix_block(s.next_frame, s.end_frame);
            self.out.as_ref().unwrap().write(&self.mix)?;
            s.next_frame += BLOCK as i64;
            room -= BLOCK;
        }
        let (played, qpc) = self.out.as_ref().unwrap().played()?;
        let ms = audio::frame_to_ms(s.start_frame) + played * 1000.0 / audio::RATE as f64;
        let mut st = self.shared.lock();
        if st.epoch == s.epoch && played > 0.0 {
            st.audio_clock = Some((ms, qpc));
        }
        Ok(())
    }

    fn mix_block(&mut self, frame: i64, end_frame: i64) {
        self.mix.fill(0.0);
        let ms = audio::frame_to_ms(frame);
        if frame < end_frame {
            for (i, slot) in self.tracks.iter_mut().enumerate() {
                let Some(t) = slot else { continue };
                if let Err(e) = t.fill(frame + BLOCK as i64) {
                    // A damaged stretch: silence this track from here on.
                    eprintln!("media: audio track {i} decode failed: {e:#}");
                    t.eof = true;
                }
                let g = sanitize(self.shared.gains.gain(i, ms));
                t.queue.mix_into(frame, &mut self.mix, self.prev_gain[i], g);
                self.prev_gain[i] = g;
            }
            // Nothing past the play range end.
            let keep = (end_frame - frame).clamp(0, BLOCK as i64) as usize;
            self.mix[keep * CHANNELS..].fill(0.0);
        }
        let master = sanitize(self.shared.gains.master()) * self.shared.volume();
        audio::apply_master(&mut self.mix, self.prev_master, master);
        self.prev_master = master;
    }

    /// Audio can't run: release the device and hand the clock to the wall
    /// clock from the current position. The next play/seek retries.
    fn fail(&mut self, e: &anyhow::Error) {
        if audio::device_lost(e) {
            eprintln!("media: audio output lost; continuing without sound");
        } else {
            eprintln!("media: audio output unavailable: {e:#}");
        }
        self.out = None;
        let mut st = self.shared.lock();
        let now = mf::now_hns();
        st.reanchor(now);
        st.audio_ok = false;
        st.audio_clock = None;
    }
}

fn sanitize(g: f32) -> f32 {
    if g.is_finite() { g.clamp(0.0, 16.0) } else { 0.0 }
}

/// Auto-reset event plus a high-resolution waitable timer.
struct Waker {
    event: HANDLE,
    timer: HANDLE,
}

// Kernel handles are usable from any thread.
unsafe impl Send for Waker {}
unsafe impl Sync for Waker {}

impl Waker {
    fn new() -> Result<Waker> {
        const TIMER_ALL_ACCESS: u32 = 0x1F_0003;
        unsafe {
            let event = CreateEventW(None, false, false, None)?;
            let timer = CreateWaitableTimerExW(None, PCWSTR::null(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)
                .or_else(|_| CreateWaitableTimerExW(None, PCWSTR::null(), 0, TIMER_ALL_ACCESS));
            match timer {
                Ok(timer) => Ok(Waker { event, timer }),
                Err(e) => {
                    let _ = CloseHandle(event);
                    Err(e.into())
                }
            }
        }
    }

    fn wake(&self) {
        unsafe {
            let _ = SetEvent(self.event);
        }
    }

    /// Sleeps for `d` or until woken.
    fn wait(&self, d: Duration) {
        unsafe {
            if d >= Duration::from_millis(500) {
                WaitForSingleObject(self.event, d.as_millis() as u32);
                return;
            }
            let due = -((d.as_nanos() / 100).max(1) as i64); // relative, 100 ns units
            if SetWaitableTimer(self.timer, &due, 0, None, None, false).is_ok() {
                WaitForMultipleObjects(&[self.event, self.timer], false, 1000);
            } else {
                WaitForSingleObject(self.event, d.as_millis().max(1) as u32);
            }
        }
    }
}

impl Drop for Waker {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.timer);
            let _ = CloseHandle(self.event);
        }
    }
}

/// Multimedia Class Scheduler registration for the audio thread, so a busy
/// UI or decoder doesn't starve the 10 ms render cadence.
struct Mmcss(HANDLE);

impl Mmcss {
    fn join() -> Option<Mmcss> {
        use windows::Win32::System::Threading::AvSetMmThreadCharacteristicsW;
        let mut index = 0u32;
        unsafe { AvSetMmThreadCharacteristicsW(windows::core::w!("Playback"), &mut index) }.ok().map(Mmcss)
    }
}

impl Drop for Mmcss {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::System::Threading::AvRevertMmThreadCharacteristics(self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(duration: f64) -> State {
        State {
            quit: false,
            playing: false,
            rate: 1.0,
            anchor_ms: 0.0,
            anchor_hns: 0,
            epoch: 0,
            audio_ok: false,
            audio_clock: None,
            last_pos: 0.0,
            seek: SeekReq { epoch: 0, ms: 0.0, exact: true },
            range_start: 0.0,
            range_end: None,
            duration_ms: duration,
            resize: None,
        }
    }

    const MS: i64 = 10_000;

    #[test]
    fn wall_clock_scales_with_rate_and_stops_at_range_end() {
        let mut st = state(10_000.0);
        st.playing = true;
        st.rate = 2.0;
        assert_eq!(st.position(100 * MS).0, 200.0);
        st.range_end = Some(500.0);
        let (p, ended) = st.position(1000 * MS);
        assert_eq!((p, ended), (500.0, true));
        assert!(!st.playing);
        assert_eq!(st.position(5000 * MS).0, 500.0);
    }

    #[test]
    fn audio_clock_holds_until_the_device_starts_then_drives() {
        let mut st = state(10_000.0);
        st.playing = true;
        st.audio_ok = true;
        st.anchor_ms = 1000.0;
        // Device not started yet: hold.
        assert_eq!(st.position(100 * MS).0, 1000.0);
        // First reading: 20 ms played at t = 120 ms; extrapolate from it.
        st.audio_clock = Some((1020.0, 120 * MS));
        assert_eq!(st.position(130 * MS).0, 1030.0);
        // A stale reading can't run away.
        assert_eq!(st.position(10_000 * MS).0, 1020.0 + AUDIO_EXTRAPOLATE_MS);
        // A slightly earlier reading never moves the position backwards.
        st.audio_clock = Some((1000.0, 10_000 * MS));
        assert_eq!(st.position(10_000 * MS).0, 1220.0);
    }

    #[test]
    fn missing_audio_falls_back_after_the_grace_period() {
        let mut st = state(10_000.0);
        st.playing = true;
        st.audio_ok = true;
        let p = st.position(((AUDIO_START_GRACE_MS + 100.0) as i64) * MS).0;
        assert_eq!(p, 100.0);
    }
}
