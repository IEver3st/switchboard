//! Replay engine lifecycle: start capture, encoders and rings; save clips;
//! stop deterministically (threads joined, session cache deleted).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};

use crate::audio::{self, AudioSetup, AudioStats, Kick, Source, TrackKind};
use crate::clock::{HNS_PER_SECOND, now_hns};
use crate::gpu::{Gpu, list_displays};
use crate::mp4;
use crate::ring::{Packet, TrackRing};
use crate::signal::Stop;
use crate::video::{self, VideoParams, VideoSetup, VideoStats};
use crate::wgc::{Capture, CaptureShared};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Quality {
    Standard,
    High,
    Ultra,
}

impl Quality {
    fn bits_per_pixel(self) -> f64 {
        match self {
            Quality::Standard => 0.10,
            Quality::High => 0.14,
            Quality::Ultra => 0.20,
        }
    }
}

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub display_index: usize,
    pub fps: u32,
    pub target_height: u32,
    pub quality: Quality,
    pub replay_seconds: u32,
    pub game_audio: bool,
    pub chat_audio: bool,
    pub microphone: bool,
    /// Output device for Game; None captures every app (except Discord when Chat is on).
    pub game_device: Option<String>,
    /// Output device for Chat; None captures the Discord app.
    pub chat_device: Option<String>,
    /// Input device for Microphone; None follows the Windows default.
    pub mic_device: Option<String>,
    pub cursor: bool,
    pub cache_dir: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineInfo {
    pub display: String,
    pub adapter: String,
    pub encoder: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u32,
    /// Chat app whose audio is split into the Chat track, if one was found.
    pub chat_app: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackStatus {
    pub kind: TrackKind,
    pub level: f32,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineStatus {
    pub buffered_seconds: f32,
    pub frames_captured: u64,
    pub frames_encoded: u64,
    pub frames_skipped: u64,
    /// Frames dropped because the encoder still held every NV12 target or
    /// had not asked for input in time.
    #[serde(default)]
    pub frames_dropped: u64,
    pub cache_bytes: u64,
    pub tracks: Vec<TrackStatus>,
    pub video_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedClip {
    pub path: PathBuf,
    pub seconds: f32,
    pub bytes: u64,
    /// Wall-clock start of the saved video (after keyframe alignment), Unix ms.
    #[serde(default)]
    pub started_unix_ms: u64,
}

struct AudioTrack {
    kind: TrackKind,
    ring: Arc<TrackRing>,
    stats: Arc<AudioStats>,
    kick: Arc<Kick>,
    error: Arc<Mutex<Option<String>>>,
}

/// How long a save waits for audio tracks to flush what they have captured.
const KICK_WAIT: Duration = Duration::from_millis(100);
/// How long stopping waits for workers before leaving them to finish alone.
const JOIN_TIMEOUT: Duration = Duration::from_secs(10);

/// The session's cache directory, deleted when the engine and every worker
/// thread have released it. A worker that outlives a stop therefore never
/// has files deleted under it.
struct SessionDir(PathBuf);

impl Drop for SessionDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Signals `done` when a worker exits, including by panic.
struct DoneGuard(mpsc::Sender<()>);

impl Drop for DoneGuard {
    fn drop(&mut self) {
        let _ = self.0.send(());
    }
}

/// Everything started so far. Dropping it stops capture, then wakes and
/// joins every worker, so a start that fails halfway cleans up what it began.
struct Workers {
    stop: Arc<Stop>,
    capture: Option<Capture>,
    threads: Vec<(String, JoinHandle<()>)>,
    done_tx: mpsc::Sender<()>,
    /// In a Mutex only so `Engine` is Sync; just `shutdown` touches it.
    done: Mutex<mpsc::Receiver<()>>,
    session: Arc<SessionDir>,
    join_timeout: Duration,
}

impl Workers {
    fn new(stop: Arc<Stop>, session: Arc<SessionDir>, join_timeout: Duration) -> Workers {
        let (done_tx, done) = mpsc::channel();
        Workers { stop, capture: None, threads: Vec::new(), done_tx, done: Mutex::new(done), session, join_timeout }
    }

    fn spawn(&mut self, name: String, f: impl FnOnce() + Send + 'static) -> Result<()> {
        let done = DoneGuard(self.done_tx.clone());
        let session = self.session.clone();
        let handle = std::thread::Builder::new().name(name.clone()).spawn(move || {
            let _done = done;
            let _session = session;
            f();
        })?;
        self.threads.push((name, handle));
        Ok(())
    }

    /// Idempotent.
    fn shutdown(&mut self) {
        self.stop.set();
        // Stop new frames first.
        self.capture.take();
        let deadline = Instant::now() + self.join_timeout;
        let mut exited = 0;
        let done = self.done.lock().unwrap();
        while exited < self.threads.len() {
            match done.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(()) => exited += 1,
                Err(_) => break,
            }
        }
        drop(done);
        let all = exited >= self.threads.len();
        for (name, handle) in self.threads.drain(..) {
            if all || handle.is_finished() {
                let _ = handle.join();
            } else {
                // Every wait in the workers ends on the stop event, so this
                // means a driver call is stuck. Leave the thread; its session
                // files go when it exits.
                eprintln!("engine worker {name} did not stop within {:?}", self.join_timeout);
            }
        }
    }
}

impl Drop for Workers {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub struct Engine {
    pub info: EngineInfo,
    workers: Workers,
    capture: Arc<CaptureShared>,
    video_ring: Arc<TrackRing>,
    video_params: Arc<Mutex<VideoParams>>,
    video_stats: Arc<VideoStats>,
    audio: Vec<AudioTrack>,
    save_lock: Mutex<()>,
    kick_seq: AtomicU64,
}

impl Engine {
    pub fn start(cfg: &EngineConfig) -> Result<Engine> {
        crate::mf::init_thread();
        let displays = list_displays()?;
        let display = displays
            .get(cfg.display_index)
            .or_else(|| displays.first())
            .ok_or_else(|| anyhow!("no display attached"))?
            .clone();
        let gpu = Gpu::for_display(&display)?;
        let (width, height) = video::output_size(display.width, display.height, cfg.target_height);
        let bitrate = ((width as f64 * height as f64 * cfg.fps as f64 * cfg.quality.bits_per_pixel()) as u32)
            .clamp(4_000_000, 80_000_000);

        let t0 = now_hns();
        std::fs::create_dir_all(&cfg.cache_dir)?;
        clean_stale_sessions(&cfg.cache_dir);
        let session_dir = cfg.cache_dir.join(format!("session-{}-{}", std::process::id(), t0));
        std::fs::create_dir_all(&session_dir)?;
        let session = Arc::new(SessionDir(session_dir.clone()));
        let stop = Arc::new(Stop::new()?);
        let mut workers = Workers::new(stop.clone(), session, JOIN_TIMEOUT);

        let capture = Capture::start_display(&gpu, &display, cfg.fps, cfg.cursor).context("display capture")?;
        let capture_shared = capture.shared.clone();
        workers.capture = Some(capture);

        // Keep a little more than requested so a save never comes up short.
        let retain_s = cfg.replay_seconds as u64 + 3;
        let retain = retain_s as i64 * HNS_PER_SECOND;
        // Byte ceiling per ring: twice the retained window plus 20 s at the
        // peak rate. Only a save stalled for tens of seconds reaches it.
        let ceiling = |bytes_per_second: u64| (retain_s * 2 + 20) * bytes_per_second;

        let video_ring = TrackRing::new(&session_dir, "video", retain, ceiling(bitrate as u64 / 2 * 3 / 8));
        let video_params = Arc::new(Mutex::new(VideoParams::default()));
        let video_stats = Arc::new(VideoStats::default());
        let (ready_tx, ready_rx) = mpsc::channel();
        let setup = VideoSetup {
            gpu: gpu.clone(),
            capture: capture_shared.clone(),
            ring: video_ring.clone(),
            params: video_params.clone(),
            stats: video_stats.clone(),
            stop: stop.clone(),
            width,
            height,
            fps: cfg.fps,
            bitrate,
            t0,
        };
        workers.spawn("sb-video".into(), move || video::run(setup, ready_tx))?;
        let encoder = match ready_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(name)) => name,
            Ok(Err(e)) => return Err(e.context("hardware encoder")),
            Err(_) => bail!("hardware encoder did not start"),
        };

        // Discord is split out of Game only when Chat follows the Discord app.
        let chat = if cfg.chat_audio && cfg.chat_device.is_none() { find_chat_app() } else { None };
        let mut wanted = Vec::new();
        if cfg.game_audio {
            let source = match &cfg.game_device {
                Some(id) => Source::OutputDevice(id.clone()),
                None => Source::LoopbackExcluding(chat.as_ref().map(|c| c.0).unwrap_or_else(audio::own_pid)),
            };
            wanted.push((TrackKind::Game, source));
        }
        if cfg.chat_audio {
            match (&cfg.chat_device, &chat) {
                (Some(id), _) => wanted.push((TrackKind::Chat, Source::OutputDevice(id.clone()))),
                (None, Some((pid, _))) => wanted.push((TrackKind::Chat, Source::LoopbackOnly(*pid))),
                (None, None) => {}
            }
        }
        if cfg.microphone {
            let source = match &cfg.mic_device {
                Some(id) => Source::InputDevice(id.clone()),
                None => Source::DefaultMicrophone,
            };
            wanted.push((TrackKind::Microphone, source));
        }
        let mut audio_tracks = Vec::new();
        for (kind, source) in wanted {
            let ring = TrackRing::new(&session_dir, kind.label(), retain, ceiling(audio::AAC_BYTES_PER_SECOND as u64 * 2));
            let stats = Arc::new(AudioStats::default());
            let kick = Arc::new(Kick::new()?);
            let error = Arc::new(Mutex::new(None));
            let setup = AudioSetup {
                kind,
                source,
                ring: ring.clone(),
                stats: stats.clone(),
                stop: stop.clone(),
                kick: kick.clone(),
                t0,
                max_fill_hns: retain,
                error: error.clone(),
            };
            workers.spawn(format!("sb-audio-{}", kind.label()), move || audio::run(setup))?;
            audio_tracks.push(AudioTrack { kind, ring, stats, kick, error });
        }

        Ok(Engine {
            info: EngineInfo {
                display: display.label(),
                adapter: gpu.adapter_name.clone(),
                encoder,
                width,
                height,
                fps: cfg.fps,
                bitrate,
                chat_app: chat.map(|c| c.1),
            },
            workers,
            capture: capture_shared,
            video_ring,
            video_params,
            video_stats,
            audio: audio_tracks,
            save_lock: Mutex::new(()),
            kick_seq: AtomicU64::new(0),
        })
    }

    /// Microphone levels captured since the last call (10 ms frames, dBFS).
    ///
    /// Levels cost work on every microphone packet, so they are computed
    /// only while someone consumes them: calling this opts in, and they stop
    /// again once no call has happened for 2 s. `set_mic_levels` controls
    /// the same switch explicitly.
    pub fn drain_mic_levels(&self) -> Vec<f32> {
        let Some(a) = self.mic() else { return Vec::new() };
        a.stats.levels_drained_at.store(now_hns(), Ordering::Relaxed);
        a.stats.levels_wanted.store(true, Ordering::Relaxed);
        a.stats.frames_dbfs.lock().unwrap().drain(..).collect()
    }

    /// Turns microphone level frames on or off (off by default).
    pub fn set_mic_levels(&self, enabled: bool) {
        let Some(a) = self.mic() else { return };
        a.stats.levels_drained_at.store(now_hns(), Ordering::Relaxed);
        a.stats.levels_wanted.store(enabled, Ordering::Relaxed);
        if !enabled {
            a.stats.frames_dbfs.lock().unwrap().clear();
        }
    }

    fn mic(&self) -> Option<&AudioTrack> {
        self.audio.iter().find(|a| a.kind == TrackKind::Microphone)
    }

    pub fn status(&self) -> EngineStatus {
        let buffered = match (self.video_ring.oldest_pts(), self.video_ring.newest_pts()) {
            (Some(a), Some(b)) => (b - a) as f32 / HNS_PER_SECOND as f32,
            _ => 0.0,
        };
        EngineStatus {
            buffered_seconds: buffered,
            frames_captured: self.capture.frames.load(Ordering::Relaxed),
            frames_encoded: self.video_stats.encoded.load(Ordering::Relaxed),
            frames_skipped: self.video_stats.skipped.load(Ordering::Relaxed),
            frames_dropped: self.video_stats.dropped.load(Ordering::Relaxed),
            cache_bytes: self.video_ring.bytes() + self.audio.iter().map(|a| a.ring.bytes()).sum::<u64>(),
            tracks: self
                .audio
                .iter()
                .map(|a| TrackStatus {
                    kind: a.kind,
                    level: a.stats.level.load(Ordering::Relaxed) as f32 / 32767.0,
                    error: a.error.lock().unwrap().clone(),
                })
                .collect(),
            video_error: self.video_stats.error.lock().unwrap().clone(),
        }
    }

    /// Internal counters for soak measurements.
    #[doc(hidden)]
    pub fn debug_counters(&self) -> String {
        let v = &self.video_stats;
        let mut s = format!(
            "video: dropped={} encoder_waits={} ring_writes={} forced_evictions={}",
            v.dropped.load(Ordering::Relaxed),
            v.encoder_waits.load(Ordering::Relaxed),
            self.video_ring.counters.writes.load(Ordering::Relaxed),
            self.video_ring.counters.forced_evictions.load(Ordering::Relaxed),
        );
        for a in &self.audio {
            let st = &a.stats;
            s += &format!(
                "\n{}: packets={} wakeups={} ring_writes={} encoder_allocs={} silence_frames={} discontinuities={} level_frames_queued={}",
                a.kind.label(),
                st.packets.load(Ordering::Relaxed),
                st.wakeups.load(Ordering::Relaxed),
                a.ring.counters.writes.load(Ordering::Relaxed),
                st.encoder_allocations.load(Ordering::Relaxed),
                st.silence_filled.load(Ordering::Relaxed),
                st.discontinuities.load(Ordering::Relaxed),
                st.frames_dbfs.lock().unwrap().len(),
            );
        }
        s
    }

    /// Writes the last `seconds` to `dir`. Starts on the keyframe at or before
    /// the requested point, so clips run up to one second longer, never shorter.
    pub fn save(&self, seconds: u32, dir: &Path, source_name: &str) -> Result<SavedClip> {
        let end = self.video_ring.newest_pts().ok_or_else(|| anyhow!("the replay buffer is still empty"))?;
        self.save_range(end - seconds as i64 * HNS_PER_SECOND, end, dir, source_name)
    }

    /// Asks every running audio track to flush what it has captured into its
    /// ring (they normally batch ~100 ms) and waits briefly for them.
    fn flush_audio(&self) {
        let seq = self.kick_seq.fetch_add(1, Ordering::Relaxed) + 1;
        let running: Vec<&AudioTrack> =
            self.audio.iter().filter(|a| a.stats.running.load(Ordering::Relaxed)).collect();
        for a in &running {
            a.kick.request(seq);
        }
        let deadline = Instant::now() + KICK_WAIT;
        for a in running {
            a.kick.wait(seq, deadline);
        }
    }

    /// Saves an explicit window of the capture clock (100 ns QPC units, see
    /// `clock::system_to_hns`). The end is clamped to what has been encoded;
    /// the start moves back to the previous keyframe.
    /// The newest captured frame fitted into `w` x `h`, as RGBA, scaled on
    /// the GPU. Used for clip thumbnails at save time.
    pub fn snapshot_rgba(&self, w: u32, h: u32) -> Result<Vec<u8>> {
        crate::snapshot::snapshot_rgba(&self.capture, w, h)
    }

    pub fn save_range(&self, from: i64, until: i64, dir: &Path, source_name: &str) -> Result<SavedClip> {
        let _guard = self.save_lock.lock().unwrap();
        self.flush_audio();
        let newest = self.video_ring.newest_pts().ok_or_else(|| anyhow!("the replay buffer is still empty"))?;
        let end = until.min(newest);
        if end <= from {
            bail!("that moment is no longer in the replay buffer");
        }
        // Each range pins only the segments it references until the save ends.
        let mut pins = Vec::new();
        let (vpk, pin) = self.video_ring.range_from_keyframe(from, end);
        pins.push(pin);
        if vpk.is_empty() || !vpk[0].key {
            bail!("the replay buffer has no complete video yet");
        }
        let params = self.video_params.lock().unwrap().clone();
        if params.sps.is_empty() || params.pps.is_empty() {
            bail!("the encoder has not produced stream headers yet");
        }
        let v_start = vpk[0].pts;
        let v_end = vpk.last().map(|p| p.pts + p.dur).unwrap();

        const VIDEO_TS: u32 = 90_000;
        let to_90k = |hns: i64| (hns as i128 * VIDEO_TS as i128 / HNS_PER_SECOND as i128) as i64;
        let mut tracks = Vec::new();
        let samples = vpk
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let next = vpk.get(i + 1).map(|n| n.pts).unwrap_or(p.pts + p.dur);
                let d = to_90k(next - v_start) - to_90k(p.pts - v_start);
                mp4::Sample { size: p.len, duration: d.max(1) as u32, key: p.key }
            })
            .collect();
        tracks.push(mp4::Track {
            name: "Video".into(),
            codec: mp4::Codec::H264 { width: params.width, height: params.height, sps: params.sps, pps: params.pps },
            timescale: VIDEO_TS,
            samples,
            start_offset: 0,
        });
        let mut packet_lists = vec![(None, vpk)];
        for a in &self.audio {
            let (mut pk, pin) = a.ring.range(v_start, v_end);
            pins.push(pin);
            pk.drain(..audio_run_start(&pk));
            if pk.is_empty() {
                continue;
            }
            let rate = audio::SAMPLE_RATE as i64;
            let offset = ((pk[0].pts - v_start) as i128 * rate as i128 / HNS_PER_SECOND as i128) as i64;
            tracks.push(mp4::Track {
                name: a.kind.label().into(),
                codec: mp4::Codec::Aac {
                    sample_rate: audio::SAMPLE_RATE,
                    channels: audio::CHANNELS,
                    asc: audio::audio_specific_config().to_vec(),
                    bitrate: audio::AAC_BYTES_PER_SECOND * 8,
                },
                timescale: audio::SAMPLE_RATE,
                samples: pk.iter().map(|p| mp4::Sample { size: p.len, duration: 1024, key: true }).collect(),
                start_offset: offset,
            });
            packet_lists.push((Some(a), pk));
        }

        std::fs::create_dir_all(dir)?;
        let path = unique_clip_path(dir, source_name);
        let partial = path.with_extension("mp4.clip-writing");
        let mut readers: Vec<_> = packet_lists
            .iter()
            .map(|(a, _)| match a {
                None => self.video_ring.reader(),
                Some(a) => a.ring.reader(),
            })
            .collect();
        let result = mp4::write(&partial, &tracks, |t, i, buf| readers[t].read(&packet_lists[t].1[i], buf));
        drop(readers);
        drop(pins);
        if let Err(e) = result {
            let _ = std::fs::remove_file(&partial);
            return Err(e);
        }
        std::fs::rename(&partial, &path)?;
        let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        Ok(SavedClip {
            path,
            seconds: (v_end - v_start) as f32 / HNS_PER_SECOND as f32,
            bytes,
            started_unix_ms: crate::clock::hns_to_unix_ms(v_start),
        })
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        // Workers stop and join first; the session directory goes when the
        // last reference to it (engine or a straggling worker) is released.
        self.workers.shutdown();
    }
}

/// Index where the last continuous run of audio packets starts. MP4 audio
/// samples play back to back, so packets before a timeline discontinuity
/// (sleep/resume, a stalled device) would shift everything after it.
fn audio_run_start(pk: &[Packet]) -> usize {
    const SLACK: i64 = 10 * 10_000; // 10 ms
    (1..pk.len()).rev().find(|&i| (pk[i].pts - (pk[i - 1].pts + pk[i - 1].dur)).abs() > SLACK).unwrap_or(0)
}

/// Removes cache directories left by earlier processes. This process's own
/// directories are removed by their `SessionDir` guards.
fn clean_stale_sessions(cache: &Path) {
    let own = format!("session-{}-", std::process::id());
    let Ok(entries) = std::fs::read_dir(cache) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with("session-") && !name.starts_with(&own) {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

// ------------------------------------------------------------ naming

pub fn unique_clip_path(dir: &Path, source: &str) -> PathBuf {
    let stem = format!("SB_{}_{}", sanitize(source), local_timestamp());
    let mut candidate = dir.join(format!("{stem}.mp4"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem}_{n}.mp4"));
        n += 1;
    }
    candidate
}

fn sanitize(name: &str) -> String {
    let s: String = name
        .chars()
        .filter(|c| !c.is_control() && !c.is_whitespace() && !"<>:\"/\\|?*".contains(*c))
        .take(80)
        .collect();
    let s = s.trim_end_matches(['.', ' ']).to_string();
    if s.is_empty() { "Desktop".into() } else { s }
}

fn local_timestamp() -> String {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!("{:04}-{:02}-{:02}_{:02}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond)
}

// ------------------------------------------------------------ processes

struct Proc {
    pid: u32,
    parent: u32,
    exe: String,
}

fn processes() -> Vec<Proc> {
    use windows::Win32::System::Diagnostics::ToolHelp::*;
    let mut out = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(snap, &mut e).is_ok() {
            loop {
                let end = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                out.push(Proc {
                    pid: e.th32ProcessID,
                    parent: e.th32ParentProcessID,
                    exe: String::from_utf16_lossy(&e.szExeFile[..end]),
                });
                if Process32NextW(snap, &mut e).is_err() {
                    break;
                }
            }
        }
        let _ = windows::Win32::Foundation::CloseHandle(snap);
    }
    out
}

const CHAT_APPS: [(&str, &str); 3] =
    [("discord.exe", "Discord"), ("discordptb.exe", "Discord PTB"), ("discordcanary.exe", "Discord Canary")];

/// Root process of a running chat app, so its whole tree can be split out.
pub fn find_chat_app() -> Option<(u32, String)> {
    let procs = processes();
    for (exe, label) in CHAT_APPS {
        let same: Vec<&Proc> = procs.iter().filter(|p| p.exe.eq_ignore_ascii_case(exe)).collect();
        if let Some(root) = same.iter().find(|p| !same.iter().any(|q| q.pid == p.parent)) {
            return Some((root.pid, label.to_string()));
        }
    }
    None
}

/// Name for the clip file: the foreground app, or "Desktop".
pub fn foreground_app_name() -> String {
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return "Desktop".into();
        }
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return "Desktop".into() };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = windows::Win32::Foundation::CloseHandle(h);
        if !ok {
            return "Desktop".into();
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let stem = Path::new(&path).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let lower = stem.to_ascii_lowercase();
        // Switchboard's own window runs in another process; saving from it is
        // not a game.
        if lower == "explorer" || lower == "searchhost" || lower.starts_with("switchboard") || lower.is_empty() {
            return "Desktop".into();
        }
        let mut name = stem;
        for suffix in ["-Win64-Shipping", "-WinGDK-Shipping", "_x64", "-Win64", "_dx12", "_dx11"] {
            if let Some(s) = name.strip_suffix(suffix) {
                name = s.to_string();
            }
        }
        name
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clip_names_are_safe_and_unique() {
        assert_eq!(sanitize("Valorant"), "Valorant");
        assert_eq!(sanitize("a<b>:c/d\\e|f?g*h\"i"), "abcdefghi");
        assert_eq!(sanitize("   "), "Desktop");
        assert_eq!(sanitize("name..."), "name");
        let dir = std::env::temp_dir().join(format!("sb-names-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = unique_clip_path(&dir, "Game");
        std::fs::write(&first, b"x").unwrap();
        let second = unique_clip_path(&dir, "Game");
        assert_ne!(first, second);
        let name = first.file_name().unwrap().to_string_lossy().to_string();
        assert!(name.starts_with("SB_Game_") && name.ends_with(".mp4"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn audio_after_a_discontinuity_is_kept_alone() {
        let frame = 213_333;
        let mut pk: Vec<Packet> = (0..10).map(|i| Packet::at(i * frame, frame)).collect();
        assert_eq!(audio_run_start(&pk), 0);
        // One hour later the track resumes.
        let resume = 3600 * HNS_PER_SECOND;
        pk.extend((0..5).map(|i| Packet::at(resume + i * frame, frame)));
        assert_eq!(audio_run_start(&pk), 10);
        assert_eq!(audio_run_start(&[]), 0);
    }

    fn session(name: &str) -> (PathBuf, Arc<SessionDir>) {
        let dir = std::env::temp_dir().join(format!("sb-workers-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("seg.bin"), b"x").unwrap();
        (dir.clone(), Arc::new(SessionDir(dir)))
    }

    #[test]
    fn dropping_workers_wakes_joins_and_cleans_up() {
        let (dir, session) = session("join");
        let stop = Arc::new(Stop::new().unwrap());
        let mut w = Workers::new(stop.clone(), session, Duration::from_secs(10));
        let exited = Arc::new(AtomicU64::new(0));
        for i in 0..3 {
            let (stop, exited) = (stop.clone(), exited.clone());
            w.spawn(format!("t{i}"), move || {
                // A worker blocked in a long cancellable wait.
                stop.sleep(60_000);
                exited.fetch_add(1, Ordering::Relaxed);
            })
            .unwrap();
        }
        // A start that fails here drops `w` just like this.
        let t = Instant::now();
        drop(w);
        assert!(t.elapsed() < Duration::from_secs(1), "stop took {:?}", t.elapsed());
        assert_eq!(exited.load(Ordering::Relaxed), 3);
        assert!(!dir.exists(), "session files left behind");
    }

    #[test]
    fn files_stay_until_a_straggling_worker_exits() {
        let (dir, session) = session("straggler");
        let stop = Arc::new(Stop::new().unwrap());
        let mut w = Workers::new(stop, session, Duration::from_millis(50));
        let (release_tx, release_rx) = mpsc::channel::<()>();
        // Ignores stop, like a stuck driver call.
        w.spawn("stuck".into(), move || {
            let _ = release_rx.recv();
        })
        .unwrap();
        w.shutdown();
        w.shutdown(); // idempotent
        drop(w);
        assert!(dir.exists(), "deleted while a worker may still use it");
        release_tx.send(()).unwrap();
        let t = Instant::now();
        while dir.exists() && t.elapsed() < Duration::from_secs(2) {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(!dir.exists(), "not deleted after the straggler exited");
    }
}

