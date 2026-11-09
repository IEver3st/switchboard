//! Video path, entirely on the GPU: latest BGRA capture texture ->
//! D3D11 video processor (scale + BGRA->NV12, BT.709 limited) -> hardware
//! H.264 MFT -> AVCC packets in the replay ring. Raw frames never reach
//! system memory.

use std::mem::ManuallyDrop;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};

use anyhow::{Context, Result, anyhow, bail};
use windows::Win32::Foundation::{CloseHandle, E_ACCESSDENIED, E_NOTIMPL, HANDLE, RECT};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709, DXGI_FORMAT_NV12,
    DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::Threading::{CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateWaitableTimerExW, SetWaitableTimer};
use windows::core::{GUID, Interface, PCWSTR, Ref, implement};

use crate::amf::{self, AMD_VENDOR_ID, AmfEncoder};
use crate::apps::{self, AppFollow, AppStatus};
use crate::bitstream::{HevcHeaders, av1_temporal_unit, hevc_annexb_to_lengths};
use crate::clock::{HNS_PER_SECOND, now_hns};
use crate::gpu::Gpu;
use crate::mf::{self, codec_bool, codec_u32, pack};
use crate::ring::TrackRing;
use crate::signal::{Stop, Woke, wait_any};
use crate::wgc::{Capture, CaptureShared};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum VideoCodec {
    #[default]
    H264,
    Hevc,
    Av1,
}

impl VideoCodec {
    pub const ALL: [VideoCodec; 3] = [VideoCodec::H264, VideoCodec::Hevc, VideoCodec::Av1];

    pub fn label(self) -> &'static str {
        match self {
            VideoCodec::H264 => "H.264",
            VideoCodec::Hevc => "HEVC",
            VideoCodec::Av1 => "AV1",
        }
    }

    fn subtype(self) -> GUID {
        match self {
            VideoCodec::H264 => MFVideoFormat_H264,
            VideoCodec::Hevc => MFVideoFormat_HEVC,
            VideoCodec::Av1 => MFVideoFormat_AV1,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct VideoParams {
    pub codec: VideoCodec,
    pub width: u32,
    pub height: u32,
    pub vps: Vec<u8>,
    pub sps: Vec<u8>,
    pub pps: Vec<u8>,
    pub seq: Vec<u8>,
}

#[derive(Default)]
pub struct VideoStats {
    pub encoded: AtomicU64,
    pub skipped: AtomicU64,
    /// Frames not submitted because every NV12 target was still held by the
    /// encoder, or the encoder did not ask for input before the next frame.
    pub dropped: AtomicU64,
    /// Frame slots where the encoder had not yet asked for input.
    pub encoder_waits: AtomicU64,
    pub capture_reopens: AtomicU64,
    pub capture_blind: AtomicBool,
    pub encoder: Mutex<Option<String>>,
    /// Set when the pipeline stops on its own (device lost, encoder error).
    pub error: Mutex<Option<String>>,
}

pub(crate) struct VideoSetup {
    pub gpu: Gpu,
    pub capture: Arc<CaptureShared>,
    pub source: Arc<Mutex<Option<Capture>>>,
    pub ring: Arc<TrackRing>,
    pub params: Arc<Mutex<VideoParams>>,
    pub stats: Arc<VideoStats>,
    pub stop: Arc<Stop>,
    pub app: Option<Arc<AppFollow>>,
    pub cursor: bool,
    pub codec: VideoCodec,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u32,
    pub t0: i64,
}

/// Runs on its own thread. Sends the encoder name (or the startup error)
/// through `ready`, then encodes until `stop` is set.
pub(crate) fn run(setup: VideoSetup, ready: mpsc::Sender<Result<String>>) {
    mf::init_thread();
    let mut state = match Pipeline::new(&setup) {
        Ok(p) => {
            let _ = ready.send(Ok(p.encoder.name().to_string()));
            p
        }
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    if let Err(e) = state.run(&setup) {
        if setup.codec != VideoCodec::H264
            && setup.stats.encoded.load(Ordering::Relaxed) == 0
            && setup.capture.frames.load(Ordering::Relaxed) > 0
        {
            remember_broken(&setup.gpu, setup.codec);
        }
        *setup.stats.error.lock().unwrap() = Some(format!("{e:#}"));
    }
    state.encoder.shutdown();
}

struct Pipeline {
    converter: Converter,
    encoder: Encoder,
    timer: Timer,
    avcc: Vec<u8>,
}

enum Encoder {
    MediaFoundation(HwEncoder),
    Amf(AmfEncoder),
}

impl Encoder {
    fn new(gpu: &Gpu, codec: VideoCodec, w: u32, h: u32, fps: u32, bitrate: u32) -> Result<Encoder> {
        if mf_known_silent(gpu, codec)
            && let Ok(e) = AmfEncoder::new(gpu, codec, w, h, fps, bitrate)
        {
            return Ok(Encoder::Amf(e));
        }
        let mf_error = match HwEncoder::new(gpu, codec, w, h, fps, bitrate) {
            Ok(e) => return Ok(Encoder::MediaFoundation(e)),
            Err(e) => e,
        };
        if gpu.vendor_id != AMD_VENDOR_ID {
            return Err(mf_error);
        }
        match AmfEncoder::new(gpu, codec, w, h, fps, bitrate) {
            Ok(e) => {
                switchboard_log::log!("video: Media Foundation encoder unusable ({mf_error:#}); using AMF");
                Ok(Encoder::Amf(e))
            }
            Err(amf_error) => {
                switchboard_log::log!("video: AMF fallback failed: {amf_error:#}");
                Err(anyhow!("{mf_error:#}; AMD's own encoder could not start either"))
            }
        }
    }

    fn replace_silent(&mut self, s: &VideoSetup) -> Result<bool> {
        let Encoder::MediaFoundation(mf) = self else { return Ok(false) };
        if s.gpu.vendor_id != AMD_VENDOR_ID || !mf.silent(now_hns()) {
            return Ok(false);
        }
        let silent = format!("{} accepted frames but never returned any", mf.name);
        let amf = AmfEncoder::new(&s.gpu, s.codec, s.width, s.height, s.fps, s.bitrate).map_err(|e| {
            switchboard_log::log!("video: {silent}; AMF fallback failed: {e:#}");
            anyhow!("the graphics driver's video encoder is not responding, and AMD's own encoder could not start: {e:#}")
        })?;
        switchboard_log::log!("video: {silent}; switching to {}", amf.name);
        mf.shutdown();
        remember_mf_silent(&s.gpu, s.codec);
        *self = Encoder::Amf(amf);
        Ok(true)
    }

    fn name(&self) -> &str {
        match self {
            Encoder::MediaFoundation(e) => &e.name,
            Encoder::Amf(e) => &e.name,
        }
    }

    fn ready(&self) -> bool {
        match self {
            Encoder::MediaFoundation(e) => e.need_input > 0,
            Encoder::Amf(e) => e.ready(),
        }
    }

    fn pump(&mut self, sink: &mut impl FnMut(i64, bool, &[u8]) -> Result<()>) -> Result<()> {
        match self {
            Encoder::MediaFoundation(e) => e.pump(sink),
            Encoder::Amf(e) => e.pump(sink),
        }
    }

    fn submit(&mut self, sample: IMFSample, time: i64, duration: i64, returned: &IMFAsyncCallback) -> Result<bool> {
        match self {
            Encoder::MediaFoundation(e) => e.submit(sample, time, duration, returned).map(|()| true),
            Encoder::Amf(e) => e.submit(sample, time, duration, returned),
        }
    }

    fn shutdown(&mut self) {
        if let Encoder::MediaFoundation(e) = self {
            e.shutdown();
        }
    }
}

type AdapterCodec = (u32, i32, VideoCodec);

static MF_SILENT: Mutex<Vec<AdapterCodec>> = Mutex::new(Vec::new());
static BROKEN: Mutex<Vec<AdapterCodec>> = Mutex::new(Vec::new());

fn key(gpu: &Gpu, codec: VideoCodec) -> AdapterCodec {
    (gpu.luid.LowPart, gpu.luid.HighPart, codec)
}

fn remember(list: &Mutex<Vec<AdapterCodec>>, k: AdapterCodec) {
    let mut known = list.lock().unwrap();
    if !known.contains(&k) {
        known.push(k);
    }
}

fn mf_known_silent(gpu: &Gpu, codec: VideoCodec) -> bool {
    MF_SILENT.lock().unwrap().contains(&key(gpu, codec))
}

fn remember_mf_silent(gpu: &Gpu, codec: VideoCodec) {
    remember(&MF_SILENT, key(gpu, codec));
}

fn remember_broken(gpu: &Gpu, codec: VideoCodec) {
    switchboard_log::log!("video: {} on {} failed before its first frame; using H.264 until restart", codec.label(), gpu.adapter_name);
    remember(&BROKEN, key(gpu, codec));
}

pub(crate) fn known_broken(gpu: &Gpu, codec: VideoCodec) -> bool {
    codec != VideoCodec::H264 && BROKEN.lock().unwrap().contains(&key(gpu, codec))
}

pub(crate) fn can_encode(gpu: &Gpu, codec: VideoCodec) -> bool {
    codec == VideoCodec::H264
        || amf::supports(gpu, codec)
        || (gpu.vendor_id != AMD_VENDOR_ID && hardware_encoders(gpu, codec).is_ok_and(|e| !e.is_empty()))
}

pub(crate) fn can_decode(codec: VideoCodec) -> bool {
    let info = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: codec.subtype() };
    unsafe {
        let mut list: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0u32;
        let found = MFTEnumEx(
            MFT_CATEGORY_VIDEO_DECODER,
            MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_LOCALMFT | MFT_ENUM_FLAG_SORTANDFILTER,
            Some(&info),
            None,
            &mut list,
            &mut count,
        )
        .is_ok();
        if !list.is_null() {
            for i in 0..count as usize {
                drop((*list.add(i)).take());
            }
            CoTaskMemFree(Some(list as *const _));
        }
        found && count > 0
    }
}

impl Pipeline {
    fn new(s: &VideoSetup) -> Result<Pipeline> {
        let converter = Converter::new(&s.gpu, s.width, s.height, s.fps)?;
        let encoder = Encoder::new(&s.gpu, s.codec, s.width, s.height, s.fps, s.bitrate)?;
        *s.params.lock().unwrap() = VideoParams { codec: s.codec, width: s.width, height: s.height, ..VideoParams::default() };
        Ok(Pipeline { converter, encoder, timer: Timer::new()?, avcc: Vec::new() })
    }

    fn run(&mut self, s: &VideoSetup) -> Result<()> {
        let period = HNS_PER_SECOND / s.fps as i64;
        // Exact frame grid: frame n is at n/fps seconds (no truncation drift).
        let at = |n: i64| s.t0 + n * HNS_PER_SECOND / s.fps as i64;
        let mut ring = s.ring.writer(false);
        let mut n = (now_hns() - s.t0) * s.fps as i64 / HNS_PER_SECOND + 1;
        // Stall watchdog: an encoder that stops asking for input or stops
        // returning output raises no error of its own, and the ring would
        // keep its last packets forever (every save repeating old footage).
        let mut stall = Stall::new(s.stats.encoded.load(Ordering::Relaxed), now_hns());
        let mut quiet = Quiet::new(now_hns(), last_input_tick());
        let mut follower = Follower { next: 0, wait: APP_RETRY_HNS, failure: None };
        let _power = DisplayPower::watch();
        let Pipeline { converter, encoder, timer, avcc } = self;
        let mut sink = |time: i64, key: bool, bytes: &[u8]| -> Result<()> {
            let key = packetize(s.codec, bytes, avcc, &s.params) || key;
            // Keyframes start segments so every segment is independently decodable.
            ring.push(s.t0 + time, period, key, key, avcc)?;
            s.stats.encoded.fetch_add(1, Ordering::Relaxed);
            Ok(())
        };
        while !s.stop.is_set() {
            if s.app.is_none() && s.capture.closed.load(Ordering::Relaxed) {
                bail!("the captured display is no longer available");
            }
            let target = at(n);
            if timer.wait_until(target, &s.stop) {
                break;
            }
            if let Some(app) = &s.app {
                follower.follow(s, app);
            } else {
                let frames = s.capture.frames.load(Ordering::Relaxed);
                let last_frame = s.capture.last_frame_hns.load(Ordering::Relaxed);
                if quiet.due(frames, last_frame, now_hns(), last_input_tick) {
                    let target = s.source.lock().unwrap().as_ref().map(Capture::target);
                    let Some(target) = target else { break };
                    if !on_user_desktop() {
                        quiet.postpone(now_hns());
                    } else {
                        let fresh = Capture::reopen(&s.gpu, target, s.capture.clone());
                        let opened = fresh.is_ok();
                        let failure = fresh.as_ref().err().map(|e| format!("{e:#}"));
                        if let Ok(fresh) = fresh {
                            let mut slot = s.source.lock().unwrap();
                            if slot.is_none() || s.stop.is_set() {
                                drop(slot);
                                break;
                            }
                            let old = slot.replace(fresh);
                            drop(slot);
                            drop(old);
                            s.capture.closed.store(false, Ordering::Relaxed);
                            s.stats.capture_reopens.fetch_add(1, Ordering::Relaxed);
                        } else if s.stop.is_set() {
                            break;
                        }
                        if quiet.reopened(opened, frames, now_hns(), last_input_tick(), DISPLAY_ON.load(Ordering::Relaxed)) {
                            match failure {
                                Some(e) => bail!("the captured display is no longer available ({e})"),
                                None => bail!("Windows stopped sending frames for the captured display"),
                            }
                        }
                    }
                }
                if s.stats.capture_blind.load(Ordering::Relaxed) != quiet.held {
                    s.stats.capture_blind.store(quiet.held, Ordering::Relaxed);
                }
            }
            encoder.pump(&mut sink)?;
            let latest = {
                let l = s.capture.latest.lock().unwrap();
                l.texture.clone().map(|t| (t, l.width, l.height, l.generation))
            };
            let latest_seen = latest.is_some();
            if let Some((tex, w, h, generation)) = latest {
                if !encoder.ready() {
                    // The encoder is behind. Poll its event queue in 1 ms
                    // steps (cancellable by stop) until it asks for input or
                    // the next frame is due. Normally a request is already
                    // queued and this never runs.
                    s.stats.encoder_waits.fetch_add(1, Ordering::Relaxed);
                    let deadline = at(n + 1);
                    while !encoder.ready() && now_hns() < deadline {
                        if s.stop.sleep(1) {
                            return Ok(());
                        }
                        encoder.pump(&mut sink)?;
                    }
                }
                let submitted = encoder.ready()
                    && match converter.convert(&tex, w, h, generation)? {
                        Some(sample) => encoder.submit(sample, target - s.t0, at(n + 1) - target, &converter.returned)?,
                        None => false,
                    };
                if submitted {
                    encoder.pump(&mut sink)?;
                } else {
                    s.stats.dropped.fetch_add(1, Ordering::Relaxed);
                }
            }
            if encoder.replace_silent(s)? {
                *s.stats.encoder.lock().unwrap() = Some(encoder.name().to_string());
                stall = Stall::new(s.stats.encoded.load(Ordering::Relaxed), now_hns());
            }
            if stall.check(s.stats.encoded.load(Ordering::Relaxed), now_hns(), latest_seen) {
                let removed = unsafe { s.gpu.device.GetDeviceRemovedReason() };
                match removed {
                    Err(e) => bail!("the GPU reset and the video encoder stopped ({:#010x})", e.code().0),
                    Ok(()) => bail!("the video encoder stopped producing frames"),
                }
            }
            n += 1;
            // If we fell behind (system stall), skip ahead on the frame grid
            // instead of encoding a burst of late frames.
            let behind = (now_hns() - s.t0) * s.fps as i64 / HNS_PER_SECOND + 1 - n;
            if behind > 1 {
                s.stats.skipped.fetch_add(behind as u64, Ordering::Relaxed);
                n += behind;
            }
        }
        Ok(())
    }
}

const APP_CHECK_HNS: i64 = HNS_PER_SECOND;
const APP_RETRY_HNS: i64 = 2 * HNS_PER_SECOND;
const APP_RETRY_MAX_HNS: i64 = 30 * HNS_PER_SECOND;

struct Follower {
    next: i64,
    wait: i64,
    failure: Option<String>,
}

impl Follower {
    fn follow(&mut self, s: &VideoSetup, app: &AppFollow) {
        let now = now_hns();
        let hwnd = app.hwnd.load(Ordering::Relaxed);
        let due = now >= self.next;
        if hwnd != 0 && (s.capture.closed.load(Ordering::Relaxed) || (due && !apps::window_alive(hwnd))) {
            let old = s.source.lock().unwrap().take();
            drop(old);
            {
                let mut latest = s.capture.latest.lock().unwrap();
                latest.texture = None;
                latest.generation += 1;
            }
            app.hwnd.store(0, Ordering::Relaxed);
            app.pid.store(0, Ordering::Relaxed);
            let mut status = app.status.lock().unwrap_or_else(|e| e.into_inner());
            switchboard_log::log!("app: {} closed; waiting for it", status.name);
            status.recording = false;
            self.next = now;
            return;
        }
        if !due || hwnd != 0 {
            return;
        }
        self.next = now + APP_CHECK_HNS;
        let Some(window) = apps::find_app(&app.key) else {
            let mut status = app.status.lock().unwrap_or_else(|e| e.into_inner());
            status.problem = None;
            self.failure = None;
            return;
        };
        let name = app.status.lock().unwrap_or_else(|e| e.into_inner()).name.clone();
        match Capture::start_window(&s.gpu, window.hwnd, s.fps, s.cursor, s.capture.clone()) {
            Ok(capture) => {
                if s.stop.is_set() {
                    return;
                }
                s.capture.closed.store(false, Ordering::Relaxed);
                *s.source.lock().unwrap() = Some(capture);
                app.pid.store(window.pid, Ordering::Relaxed);
                app.since.store(now, Ordering::Relaxed);
                app.hwnd.store(window.hwnd, Ordering::Relaxed);
                let mut status = app.status.lock().unwrap_or_else(|e| e.into_inner());
                *status = AppStatus { name, recording: true, problem: None, recent: false };
                switchboard_log::log!("app: recording {}.exe", window.exe);
                self.wait = APP_RETRY_HNS;
                self.failure = None;
            }
            Err(e) => {
                let denied = e.chain().any(|c| c.downcast_ref::<windows::core::Error>().is_some_and(|w| w.code() == E_ACCESSDENIED));
                let problem = if denied {
                    format!("{name} runs as administrator, so Windows won't let Switchboard record it")
                } else {
                    format!("Windows wouldn't let Switchboard record {name}")
                };
                if self.failure.as_deref() != Some(problem.as_str()) {
                    switchboard_log::log!("app: can't record {}.exe ({e:#})", window.exe);
                }
                self.failure = Some(problem.clone());
                app.status.lock().unwrap_or_else(|e| e.into_inner()).problem = Some(problem);
                self.next = now + self.wait;
                self.wait = (self.wait * 2).min(APP_RETRY_MAX_HNS);
            }
        }
    }
}

const QUIET_REOPEN_HNS: i64 = 2 * HNS_PER_SECOND;
const QUIET_REOPEN_MAX_HNS: i64 = 16 * HNS_PER_SECOND;
const QUIET_MISSES: u32 = 3;
const AWAY_MS: u32 = 4000;

struct Quiet {
    wait: i64,
    checked_at: i64,
    frames_at_reopen: u64,
    input_at_reopen: u32,
    away_at_reopen: bool,
    misses: u32,
    held: bool,
}

impl Quiet {
    fn new(now: i64, input: u32) -> Quiet {
        Quiet {
            wait: QUIET_REOPEN_HNS,
            checked_at: now,
            frames_at_reopen: 0,
            input_at_reopen: input,
            away_at_reopen: false,
            misses: 0,
            held: false,
        }
    }

    fn due(&mut self, frames: u64, last_frame: i64, now: i64, input: impl FnOnce() -> u32) -> bool {
        if frames > self.frames_at_reopen + HEALTHY_FRAMES && BLIND_RESTARTED.load(Ordering::Relaxed) {
            BLIND_RESTARTED.store(false, Ordering::Relaxed);
        }
        if frames > self.frames_at_reopen + 1 {
            self.wait = QUIET_REOPEN_HNS;
            self.held = false;
        }
        let quiet_for = now - last_frame.max(self.checked_at);
        if quiet_for < QUIET_REOPEN_HNS {
            return false;
        }
        if self.away_at_reopen && input() != self.input_at_reopen {
            self.wait = QUIET_REOPEN_HNS;
        }
        quiet_for >= self.wait
    }

    fn postpone(&mut self, now: i64) {
        self.checked_at = now;
    }

    fn reopened(&mut self, opened: bool, frames: u64, now: i64, input: u32, display_on: bool) -> bool {
        let blind = frames == self.frames_at_reopen && display_on;
        if !opened || blind {
            self.misses += 1;
            self.held = true;
        } else if frames > self.frames_at_reopen {
            self.misses = 0;
            self.held = false;
        }
        let still = opened && !blind && frames <= self.frames_at_reopen + 1;
        self.wait = if still { (self.wait * 2).min(QUIET_REOPEN_MAX_HNS) } else { QUIET_REOPEN_HNS };
        self.checked_at = now;
        self.frames_at_reopen = frames;
        self.input_at_reopen = input;
        self.away_at_reopen = unsafe { windows::Win32::System::SystemInformation::GetTickCount() }.wrapping_sub(input) >= AWAY_MS;
        if self.misses < QUIET_MISSES {
            return false;
        }
        if opened && BLIND_RESTARTED.swap(true, Ordering::Relaxed) {
            self.misses = 0;
            self.wait = QUIET_REOPEN_MAX_HNS;
            self.held = true;
            return false;
        }
        true
    }
}

static BLIND_RESTARTED: AtomicBool = AtomicBool::new(false);
const HEALTHY_FRAMES: u64 = 1800;
static DISPLAY_ON: AtomicBool = AtomicBool::new(true);
const CONSOLE_DISPLAY_STATE: GUID = GUID::from_u128(0x6fe69556_704a_47a0_8f24_c28d936fda47);
const PBT_POWERSETTINGCHANGE: u32 = 0x8013;

struct DisplayPower {
    handle: *mut core::ffi::c_void,
    _params: Box<windows::Win32::System::Power::DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS>,
}

impl DisplayPower {
    fn watch() -> DisplayPower {
        use windows::Win32::System::Power::{DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS, PowerSettingRegisterNotification};
        use windows::Win32::UI::WindowsAndMessaging::DEVICE_NOTIFY_CALLBACK;
        DISPLAY_ON.store(true, Ordering::Relaxed);
        let params = Box::new(DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS { Callback: Some(on_power), Context: std::ptr::null_mut() });
        let mut handle = std::ptr::null_mut();
        let recipient = HANDLE(&*params as *const DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS as *mut core::ffi::c_void);
        let result = unsafe { PowerSettingRegisterNotification(&CONSOLE_DISPLAY_STATE, DEVICE_NOTIFY_CALLBACK, recipient, &mut handle) };
        if result.is_err() {
            handle = std::ptr::null_mut();
        }
        DisplayPower { handle, _params: params }
    }
}

impl Drop for DisplayPower {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                let _ = windows::Win32::System::Power::PowerSettingUnregisterNotification(
                    windows::Win32::System::Power::HPOWERNOTIFY(self.handle as isize),
                );
            }
        }
    }
}

unsafe extern "system" fn on_power(_: *const core::ffi::c_void, kind: u32, setting: *const core::ffi::c_void) -> u32 {
    use windows::Win32::System::Power::POWERBROADCAST_SETTING;
    if kind != PBT_POWERSETTINGCHANGE || setting.is_null() {
        return 0;
    }
    let setting = unsafe { &*(setting as *const POWERBROADCAST_SETTING) };
    if setting.PowerSetting == CONSOLE_DISPLAY_STATE && setting.DataLength >= 4 {
        let state = unsafe { std::ptr::read_unaligned(setting.Data.as_ptr() as *const u32) };
        DISPLAY_ON.store(state != 0, Ordering::Relaxed);
    }
    0
}

fn last_input_tick() -> u32 {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        let _ = GetLastInputInfo(&mut info);
    }
    info.dwTime
}

fn on_user_desktop() -> bool {
    use windows::Win32::System::StationsAndDesktops::{CloseDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_READOBJECTS, OpenInputDesktop};
    match unsafe { OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) } {
        Ok(desktop) => {
            unsafe {
                let _ = CloseDesktop(desktop);
            }
            true
        }
        Err(_) => false,
    }
}

/// How long the encoder may go without producing a packet while frames are
/// available before the pipeline gives up and the service restarts it.
const STALL_HNS: i64 = 4 * HNS_PER_SECOND;

/// Tracks encoder progress for the stall watchdog.
struct Stall {
    count: u64,
    progress_at: i64,
    checked_at: i64,
}

impl Stall {
    fn new(count: u64, now: i64) -> Stall {
        Stall { count, progress_at: now, checked_at: now }
    }

    /// True once `count` has not moved for `STALL_HNS` while frames were
    /// available. Time the loop itself was suspended (sleep, a long system
    /// stall) does not count: the encoder gets a fresh window after it.
    fn check(&mut self, count: u64, now: i64, frames_available: bool) -> bool {
        let suspended = now - self.checked_at > HNS_PER_SECOND;
        self.checked_at = now;
        if count != self.count || !frames_available || suspended {
            self.count = count;
            self.progress_at = now;
            return false;
        }
        now - self.progress_at > STALL_HNS
    }
}

// ---------------------------------------------------------------- converter

/// Sample attribute holding the NV12 slot index.
const SLOT_KEY: GUID = GUID::from_u128(0x5b1d_70c2_4a8e_4f3e_9d61_2f0a_8c3b_51e7);

struct SendSample(IMFSample);
// Media Foundation samples are free-threaded.
unsafe impl Send for SendSample {}

/// NV12 targets the encoder has released. A slot leaves this list when a
/// frame is converted into it and comes back only when the encoder drops
/// its last reference to the slot's tracked sample.
struct Pool {
    free: Mutex<Vec<(usize, SendSample)>>,
    closed: AtomicBool,
}

#[implement(IMFAsyncCallback)]
struct Returned(Arc<Pool>);

impl IMFAsyncCallback_Impl for Returned_Impl {
    fn GetParameters(&self, _flags: *mut u32, _queue: *mut u32) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }

    fn Invoke(&self, result: Ref<IMFAsyncResult>) -> windows::core::Result<()> {
        let Some(result) = result.as_ref() else { return Ok(()) };
        let sample: IMFSample = unsafe { result.GetObject()? }.cast()?;
        if self.0.closed.load(Ordering::Acquire) {
            // The pipeline is gone: dropping the last reference frees it.
            return Ok(());
        }
        let slot = unsafe { sample.GetUINT32(&SLOT_KEY)? } as usize;
        self.0.free.lock().unwrap().push((slot, SendSample(sample)));
        Ok(())
    }
}

struct Converter {
    vdev: ID3D11VideoDevice,
    vctx: ID3D11VideoContext1,
    out_w: u32,
    out_h: u32,
    fps: u32,
    src: (u32, u32),
    generation: u64,
    processor: Option<(ID3D11VideoProcessorEnumerator, ID3D11VideoProcessor)>,
    input_view: Option<ID3D11VideoProcessorInputView>,
    targets: Vec<(ID3D11Texture2D, Option<ID3D11VideoProcessorOutputView>)>,
    pool: Arc<Pool>,
    returned: IMFAsyncCallback,
}

const NV12_POOL: usize = 6;

impl Converter {
    fn new(gpu: &Gpu, out_w: u32, out_h: u32, fps: u32) -> Result<Converter> {
        let vdev: ID3D11VideoDevice = gpu.device.cast().context("no D3D11 video device")?;
        let vctx: ID3D11VideoContext1 = gpu.context.cast().context("no D3D11 video context")?;
        let pool = Arc::new(Pool { free: Mutex::new(Vec::with_capacity(NV12_POOL)), closed: AtomicBool::new(false) });
        let mut targets = Vec::with_capacity(NV12_POOL);
        for i in 0..NV12_POOL {
            let desc = D3D11_TEXTURE2D_DESC {
                Width: out_w,
                Height: out_h,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_NV12,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut tex = None;
            unsafe { gpu.device.CreateTexture2D(&desc, None, Some(&mut tex))? };
            let tex = tex.unwrap();
            let sample = unsafe {
                let sample: IMFSample = MFCreateTrackedSample()?.cast()?;
                let buffer = MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, &tex, 0, false)?;
                if let Ok(b2) = buffer.cast::<IMF2DBuffer>() {
                    buffer.SetCurrentLength(b2.GetContiguousLength()?)?;
                }
                sample.AddBuffer(&buffer)?;
                sample.SetUINT32(&SLOT_KEY, i as u32)?;
                sample
            };
            pool.free.lock().unwrap().push((i, SendSample(sample)));
            targets.push((tex, None));
        }
        let returned: IMFAsyncCallback = Returned(pool.clone()).into();
        Ok(Converter {
            vdev,
            vctx,
            out_w,
            out_h,
            fps,
            src: (0, 0),
            generation: 0,
            processor: None,
            input_view: None,
            targets,
            pool,
            returned,
        })
    }

    fn rebuild(&mut self, w: u32, h: u32) -> Result<()> {
        let rate = DXGI_RATIONAL { Numerator: self.fps, Denominator: 1 };
        let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: rate,
            InputWidth: w,
            InputHeight: h,
            OutputFrameRate: rate,
            OutputWidth: self.out_w,
            OutputHeight: self.out_h,
            Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
        };
        let en = unsafe { self.vdev.CreateVideoProcessorEnumerator(&desc)? };
        let vp = unsafe { self.vdev.CreateVideoProcessor(&en, 0)? };
        // Fit the source inside the output, centred, with black bars.
        let scale = f64::min(self.out_w as f64 / w as f64, self.out_h as f64 / h as f64);
        let dw = ((w as f64 * scale).round() as i32).min(self.out_w as i32);
        let dh = ((h as f64 * scale).round() as i32).min(self.out_h as i32);
        let dx = (self.out_w as i32 - dw) / 2;
        let dy = (self.out_h as i32 - dh) / 2;
        let src_rect = RECT { left: 0, top: 0, right: w as i32, bottom: h as i32 };
        let dst_rect = RECT { left: dx, top: dy, right: dx + dw, bottom: dy + dh };
        let black = D3D11_VIDEO_COLOR { Anonymous: D3D11_VIDEO_COLOR_0 { RGBA: D3D11_VIDEO_COLOR_RGBA { R: 0.0, G: 0.0, B: 0.0, A: 1.0 } } };
        unsafe {
            self.vctx.VideoProcessorSetStreamFrameFormat(&vp, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
            self.vctx.VideoProcessorSetStreamAutoProcessingMode(&vp, 0, false);
            self.vctx.VideoProcessorSetStreamSourceRect(&vp, 0, true, Some(&src_rect));
            self.vctx.VideoProcessorSetStreamDestRect(&vp, 0, true, Some(&dst_rect));
            self.vctx.VideoProcessorSetOutputBackgroundColor(&vp, false, &black);
            self.vctx.VideoProcessorSetStreamColorSpace1(&vp, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
            self.vctx.VideoProcessorSetOutputColorSpace1(&vp, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
        }
        for t in &mut self.targets {
            t.1 = None;
        }
        self.input_view = None;
        self.processor = Some((en, vp));
        self.src = (w, h);
        Ok(())
    }

    /// Converts into a free NV12 target and returns its sample, or None when
    /// the encoder still holds every target (the frame is dropped; nothing
    /// is overwritten).
    fn convert(&mut self, tex: &ID3D11Texture2D, w: u32, h: u32, generation: u64) -> Result<Option<IMFSample>> {
        let Some((slot, SendSample(sample))) = self.pool.free.lock().unwrap().pop() else {
            return Ok(None);
        };
        match self.blt(slot, tex, w, h, generation) {
            Ok(()) => Ok(Some(sample)),
            Err(e) => {
                self.pool.free.lock().unwrap().push((slot, SendSample(sample)));
                Err(e)
            }
        }
    }

    fn blt(&mut self, slot: usize, tex: &ID3D11Texture2D, w: u32, h: u32, generation: u64) -> Result<()> {
        if self.processor.is_none() || self.src != (w, h) {
            self.rebuild(w, h)?;
        }
        let (en, vp) = self.processor.clone().unwrap();
        if self.input_view.is_none() || self.generation != generation {
            let desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                FourCC: 0,
                ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: 0 } },
            };
            let mut view = None;
            unsafe { self.vdev.CreateVideoProcessorInputView(tex, &en, &desc, Some(&mut view))? };
            self.input_view = view;
            self.generation = generation;
        }
        if self.targets[slot].1.is_none() {
            let desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
                ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
                Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 } },
            };
            let mut view = None;
            unsafe { self.vdev.CreateVideoProcessorOutputView(&self.targets[slot].0, &en, &desc, Some(&mut view))? };
            self.targets[slot].1 = view;
        }
        let stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: true.into(),
            pInputSurface: ManuallyDrop::new(self.input_view.clone()),
            ..Default::default()
        };
        let streams = [stream];
        let result = unsafe { self.vctx.VideoProcessorBlt(&vp, self.targets[slot].1.as_ref().unwrap(), 0, &streams) };
        let [stream] = streams;
        drop(ManuallyDrop::into_inner(stream.pInputSurface));
        result.context("VideoProcessorBlt")
    }
}

impl Drop for Converter {
    fn drop(&mut self) {
        // Samples still inside the encoder are freed when it lets go.
        self.pool.closed.store(true, Ordering::Release);
        self.pool.free.lock().unwrap().clear();
    }
}

// ------------------------------------------------------------------ encoder

struct HwEncoder {
    transform: IMFTransform,
    /// Kept so the hardware MFT can be shut down; dropping it is not enough.
    activate: IMFActivate,
    events: IMFMediaEventGenerator,
    _manager: IMFDXGIDeviceManager,
    need_input: u32,
    /// Reused output sample when the encoder does not provide its own.
    output: Option<IMFSample>,
    scratch: Vec<u8>,
    inputs: u32,
    waiting_since: Option<i64>,
    checked_at: i64,
    produced: bool,
    fps: u32,
    name: String,
}

const SILENT_ENCODER_HNS: i64 = HNS_PER_SECOND;

impl HwEncoder {
    fn new(gpu: &Gpu, codec: VideoCodec, w: u32, h: u32, fps: u32, bitrate: u32) -> Result<HwEncoder> {
        unsafe {
            let mut token = 0u32;
            let mut manager = None;
            MFCreateDXGIDeviceManager(&mut token, &mut manager)?;
            let manager = manager.ok_or_else(|| anyhow!("no DXGI device manager"))?;
            manager.ResetDevice(&gpu.device, token)?;

            let (transform, activate, name) = find_encoder(gpu, codec)?;
            let attrs = transform.GetAttributes()?;
            attrs.SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)?;
            let _ = attrs.SetUINT32(&MF_LOW_LATENCY, 1);
            let events: IMFMediaEventGenerator = transform.cast().context("encoder is not async")?;
            transform
                .ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, manager.as_raw() as usize)
                .context("encoder rejected the D3D11 device")?;

            if let Ok(codec) = transform.cast::<ICodecAPI>() {
                codec_u32(&codec, &CODECAPI_AVEncCommonRateControlMode, eAVEncCommonRateControlMode_PeakConstrainedVBR.0 as u32);
                codec_u32(&codec, &CODECAPI_AVEncCommonMeanBitRate, bitrate);
                codec_u32(&codec, &CODECAPI_AVEncCommonMaxBitRate, bitrate / 2 * 3);
                // One keyframe per second keeps clip starts within a second
                // of the request and bounds segment size.
                codec_u32(&codec, &CODECAPI_AVEncMPVGOPSize, fps);
                codec_u32(&codec, &CODECAPI_AVEncMPVDefaultBPictureCount, 0);
                codec_bool(&codec, &CODECAPI_AVLowLatencyMode, true);
            }

            let out = MFCreateMediaType()?;
            out.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            out.SetGUID(&MF_MT_SUBTYPE, &codec.subtype())?;
            out.SetUINT32(&MF_MT_AVG_BITRATE, bitrate)?;
            out.SetUINT64(&MF_MT_FRAME_SIZE, pack(w, h))?;
            out.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
            out.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1))?;
            out.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            match codec {
                VideoCodec::H264 => out.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)?,
                VideoCodec::Hevc => out.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH265VProfile_Main_420_8.0 as u32)?,
                VideoCodec::Av1 => {}
            }
            out.SetUINT32(&MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709.0 as u32)?;
            out.SetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235.0 as u32)?;
            out.SetUINT32(&MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709.0 as u32)?;
            out.SetUINT32(&MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709.0 as u32)?;
            transform.SetOutputType(0, &out, 0).context("encoder output type")?;

            let inp = MFCreateMediaType()?;
            inp.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            inp.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12)?;
            inp.SetUINT64(&MF_MT_FRAME_SIZE, pack(w, h))?;
            inp.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
            inp.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1))?;
            inp.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            transform.SetInputType(0, &inp, 0).context("encoder input type (NV12)")?;

            let info = transform.GetOutputStreamInfo(0)?;
            let provides_samples = info.dwFlags
                & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32 | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES.0 as u32)
                != 0;
            let output = if provides_samples { None } else { Some(mf::empty_sample(info.cbSize.max(1 << 20))?) };

            transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
            Ok(HwEncoder {
                transform,
                activate,
                events,
                _manager: manager,
                need_input: 0,
                output,
                scratch: Vec::new(),
                inputs: 0,
                waiting_since: None,
                checked_at: now_hns(),
                produced: false,
                fps,
                name,
            })
        }
    }

    fn silent(&mut self, now: i64) -> bool {
        if self.produced {
            return false;
        }
        if now - self.checked_at > SILENT_ENCODER_HNS
            && let Some(t) = &mut self.waiting_since
        {
            *t = now;
        }
        self.checked_at = now;
        self.inputs >= 2 * self.fps || self.waiting_since.is_some_and(|t| now - t > SILENT_ENCODER_HNS)
    }

    /// Handles every queued encoder event without blocking.
    fn pump(&mut self, sink: &mut impl FnMut(i64, bool, &[u8]) -> Result<()>) -> Result<()> {
        loop {
            let event = match unsafe { self.events.GetEvent(MF_EVENT_FLAG_NO_WAIT) } {
                Ok(e) => e,
                Err(e) if e.code() == MF_E_NO_EVENTS_AVAILABLE => return Ok(()),
                Err(e) => return Err(e.into()),
            };
            let kind = unsafe { event.GetType()? };
            if kind == METransformNeedInput.0 as u32 {
                self.need_input += 1;
                self.waiting_since = None;
            } else if kind == METransformHaveOutput.0 as u32
                && let Some(sample) = self.output()?
            {
                let time = unsafe { sample.GetSampleTime()? };
                let key = unsafe { sample.GetUINT32(&MFSampleExtension_CleanPoint) }.unwrap_or(0) == 1;
                mf::sample_bytes(&sample, &mut self.scratch)?;
                self.produced = true;
                sink(time, key, &self.scratch)?;
            }
        }
    }

    fn output(&mut self) -> Result<Option<IMFSample>> {
        if let Some(s) = &self.output {
            unsafe { s.GetBufferByIndex(0)?.SetCurrentLength(0)? };
        }
        let mut buffer = MFT_OUTPUT_DATA_BUFFER {
            dwStreamID: 0,
            pSample: ManuallyDrop::new(self.output.clone()),
            dwStatus: 0,
            pEvents: ManuallyDrop::new(None),
        };
        let mut status = 0u32;
        let result = unsafe { self.transform.ProcessOutput(0, std::slice::from_mut(&mut buffer), &mut status) };
        let sample = ManuallyDrop::into_inner(buffer.pSample);
        drop(ManuallyDrop::into_inner(buffer.pEvents));
        match result {
            Ok(()) => Ok(sample),
            Err(e) if e.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                unsafe {
                    let t = self.transform.GetOutputAvailableType(0, 0)?;
                    self.transform.SetOutputType(0, &t, 0)?;
                }
                Ok(None)
            }
            Err(e) if e.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Hands a converted frame to the encoder. Our reference is dropped
    /// here; the slot returns to the pool once the encoder releases it too.
    fn submit(&mut self, sample: IMFSample, time: i64, duration: i64, returned: &IMFAsyncCallback) -> Result<()> {
        unsafe {
            sample.SetSampleTime(time)?;
            sample.SetSampleDuration(duration)?;
            sample.cast::<IMFTrackedSample>()?.SetAllocator(returned, None)?;
            self.transform.ProcessInput(0, &sample, 0).context("encoder ProcessInput")?;
        }
        self.inputs = self.inputs.saturating_add(1);
        self.need_input -= 1;
        if self.need_input == 0 {
            self.waiting_since.get_or_insert_with(now_hns);
        }
        Ok(())
    }

    fn shutdown(&mut self) {
        unsafe {
            let _ = self.transform.ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
            let _ = self.transform.ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
            if let Ok(s) = self.transform.cast::<IMFShutdown>() {
                let _ = s.Shutdown();
            }
            let _ = self.activate.ShutdownObject();
        }
    }
}

fn hardware_encoders(gpu: &Gpu, codec: VideoCodec) -> Result<Vec<IMFActivate>> {
    unsafe {
        let mut attrs = None;
        MFCreateAttributes(&mut attrs, 1)?;
        let attrs = attrs.unwrap();
        let luid = std::slice::from_raw_parts(&gpu.luid as *const _ as *const u8, std::mem::size_of_val(&gpu.luid));
        attrs.SetBlob(&MFT_ENUM_ADAPTER_LUID, luid)?;
        let input = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: MFVideoFormat_NV12 };
        let output = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: codec.subtype() };
        let mut list: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0u32;
        MFTEnum2(
            MFT_CATEGORY_VIDEO_ENCODER,
            MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
            Some(&input),
            Some(&output),
            &attrs,
            &mut list,
            &mut count,
        )?;
        let activates = (0..count as usize).filter_map(|i| (*list.add(i)).take()).collect();
        CoTaskMemFree(Some(list as *const _));
        Ok(activates)
    }
}

fn find_encoder(gpu: &Gpu, codec: VideoCodec) -> Result<(IMFTransform, IMFActivate, String)> {
    for act in hardware_encoders(gpu, codec)? {
        let name = activate_name(&act, codec);
        match unsafe { act.ActivateObject::<IMFTransform>() } {
            Ok(t) => return Ok((t, act, name)),
            Err(e) => switchboard_log::log!("encoder {name} failed to activate: {e}"),
        }
    }
    bail!("no hardware {} encoder on {}", codec.label(), gpu.adapter_name)
}

fn activate_name(act: &IMFActivate, codec: VideoCodec) -> String {
    unsafe {
        let mut ptr = windows::core::PWSTR::null();
        let mut len = 0u32;
        if act.GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut ptr, &mut len).is_ok() {
            let s = ptr.to_string().unwrap_or_default();
            CoTaskMemFree(Some(ptr.0 as *const _));
            return s;
        }
    }
    format!("hardware {} encoder", codec.label())
}

// ------------------------------------------------------------------- timer

/// High-resolution waitable timer; also paces the cursor sampler.
pub(crate) struct Timer(HANDLE);

impl Timer {
    pub(crate) fn new() -> Result<Timer> {
        const TIMER_ALL_ACCESS: u32 = 0x1F0003;
        let h = unsafe {
            CreateWaitableTimerExW(None, PCWSTR::null(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)?
        };
        Ok(Timer(h))
    }

    /// Sleeps until `target_hns`; returns true if stop was requested.
    pub(crate) fn wait_until(&self, target_hns: i64, stop: &Stop) -> bool {
        let delta = target_hns - now_hns();
        if delta <= 0 {
            return stop.is_set();
        }
        let due = -delta;
        unsafe {
            if SetWaitableTimer(self.0, &due, 0, None, None, false).is_err() {
                return stop.sleep((delta / 10_000) as u32);
            }
        }
        wait_any(&[self.0, stop.handle()], u32::MAX) == Woke::Handle(1)
    }
}

impl Drop for Timer {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

// --------------------------------------------------------------- bitstream

/// Converts an Annex-B access unit to 4-byte length-prefixed NAL units,
/// moving SPS/PPS into `params` and dropping access unit delimiters.
/// Returns true if the access unit contains an IDR slice.
fn packetize(codec: VideoCodec, data: &[u8], out: &mut Vec<u8>, params: &Mutex<VideoParams>) -> bool {
    match codec {
        VideoCodec::H264 => annexb_to_avcc(data, out, params),
        VideoCodec::Hevc => {
            let mut p = params.lock().unwrap();
            let mut headers = HevcHeaders { vps: std::mem::take(&mut p.vps), sps: std::mem::take(&mut p.sps), pps: std::mem::take(&mut p.pps) };
            let irap = hevc_annexb_to_lengths(data, out, &mut headers);
            (p.vps, p.sps, p.pps) = (headers.vps, headers.sps, headers.pps);
            irap
        }
        VideoCodec::Av1 => {
            av1_temporal_unit(data, out, &mut params.lock().unwrap().seq);
            false
        }
    }
}

fn annexb_to_avcc(data: &[u8], out: &mut Vec<u8>, params: &Mutex<VideoParams>) -> bool {
    out.clear();
    let mut idr = false;
    for nal in nal_units(data) {
        if nal.is_empty() {
            continue;
        }
        match nal[0] & 0x1f {
            7 => {
                let mut p = params.lock().unwrap();
                if p.sps != nal {
                    p.sps = nal.to_vec();
                }
            }
            8 => {
                let mut p = params.lock().unwrap();
                if p.pps != nal {
                    p.pps = nal.to_vec();
                }
            }
            9 => {}
            t => {
                if t == 5 {
                    idr = true;
                }
                out.extend_from_slice(&(nal.len() as u32).to_be_bytes());
                out.extend_from_slice(nal);
            }
        }
    }
    idr
}

pub(crate) fn nal_units(data: &[u8]) -> Vec<&[u8]> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            starts.push(i + 3);
            i += 3;
        } else {
            i += 1;
        }
    }
    let mut out = Vec::with_capacity(starts.len());
    for (k, &s) in starts.iter().enumerate() {
        let mut end = if k + 1 < starts.len() { starts[k + 1] - 3 } else { data.len() };
        while end > s && data[end - 1] == 0 {
            end -= 1;
        }
        out.push(&data[s..end]);
    }
    out
}

/// Output size for a requested height: keep the source aspect, never upscale,
/// even dimensions, within H.264 level limits.
pub fn output_size(src_w: i32, src_h: i32, target_h: u32) -> (u32, u32) {
    let (sw, sh) = (src_w.max(2) as f64, src_h.max(2) as f64);
    let mut h = (target_h as f64).min(sh);
    let mut w = sw * h / sh;
    if w > 4096.0 {
        w = 4096.0;
        h = sh * w / sw;
    }
    let even = |v: f64| ((v.round() as u32) / 2 * 2).max(2);
    (even(w), even(h))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn annexb_becomes_length_prefixed_and_headers_move_to_params() {
        let sps = [0x67, 0x64, 0x00, 0x33, 0xac];
        let pps = [0x68, 0xee, 0x3c, 0x80];
        let idr = [0x65, 0x88, 0x84, 0x00, 0x10];
        let mut au = Vec::new();
        au.extend_from_slice(&[0, 0, 0, 1, 0x09, 0xf0]); // AUD, dropped
        au.extend_from_slice(&[0, 0, 0, 1]);
        au.extend_from_slice(&sps);
        au.extend_from_slice(&[0, 0, 1]);
        au.extend_from_slice(&pps);
        au.extend_from_slice(&[0, 0, 0, 1]);
        au.extend_from_slice(&idr);
        let params = Mutex::new(VideoParams::default());
        let mut out = Vec::new();
        assert!(annexb_to_avcc(&au, &mut out, &params));
        let p = params.lock().unwrap();
        assert_eq!(p.sps, sps);
        assert_eq!(p.pps, pps);
        let mut expected = (idr.len() as u32).to_be_bytes().to_vec();
        expected.extend_from_slice(&idr);
        assert_eq!(out, expected);
    }

    #[test]
    fn stall_fires_only_when_the_encoder_stops_with_frames_available() {
        const MS: i64 = 10_000;
        let mut st = Stall::new(0, 0);
        // Packets keep coming: never a stall.
        for i in 1..1000u64 {
            assert!(!st.check(i, i as i64 * 33 * MS, true));
        }
        let t0 = 1000 * 33 * MS;
        // Output stops: a stall after STALL_HNS of 33 ms iterations.
        let mut t = t0;
        let mut fired = false;
        while t < t0 + STALL_HNS + 100 * MS {
            t += 33 * MS;
            if st.check(999, t, true) {
                fired = true;
                break;
            }
        }
        assert!(fired && t - t0 > STALL_HNS - 66 * MS);
        // No capture frames yet: no output is expected.
        let mut st = Stall::new(0, 0);
        for i in 1..1000i64 {
            assert!(!st.check(0, i * 33 * MS, false));
        }
        // The loop was suspended for an hour: a fresh window, not a stall.
        let mut st = Stall::new(5, 0);
        assert!(!st.check(5, 3600 * HNS_PER_SECOND, true));
        assert!(!st.check(5, 3600 * HNS_PER_SECOND + 33 * MS, true));
    }

    #[test]
    fn output_size_keeps_aspect_and_never_upscales() {
        assert_eq!(output_size(2560, 1440, 1440), (2560, 1440));
        assert_eq!(output_size(3840, 2160, 1440), (2560, 1440));
        assert_eq!(output_size(1920, 1080, 1440), (1920, 1080));
        assert_eq!(output_size(3440, 1440, 1080), (2580, 1080));
        // Super-wide sources stay inside the 4096-pixel H.264 limit.
        let (w, h) = output_size(7680, 2160, 2160);
        assert!(w <= 4096 && h % 2 == 0 && w % 2 == 0);
    }

    #[test]
    fn tracked_slots_return_only_after_the_encoder_releases_them() {
        mf::init_thread();
        let pool = Arc::new(Pool { free: Mutex::new(Vec::new()), closed: AtomicBool::new(false) });
        let returned: IMFAsyncCallback = Returned(pool.clone()).into();
        let wait_free = |n: usize| {
            let t = std::time::Instant::now();
            while pool.free.lock().unwrap().len() < n && t.elapsed() < std::time::Duration::from_secs(2) {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            pool.free.lock().unwrap().len()
        };
        let sample: IMFSample = unsafe { MFCreateTrackedSample() }.unwrap().cast().unwrap();
        unsafe { sample.SetUINT32(&SLOT_KEY, 3).unwrap() };
        unsafe { sample.cast::<IMFTrackedSample>().unwrap().SetAllocator(&returned, None).unwrap() };
        // The "encoder" keeps a reference after we let go of ours.
        let held = sample.clone();
        drop(sample);
        std::thread::sleep(std::time::Duration::from_millis(30));
        assert_eq!(pool.free.lock().unwrap().len(), 0, "returned while still held");
        drop(held);
        assert_eq!(wait_free(1), 1, "never returned after release");
        let (slot, SendSample(back)) = pool.free.lock().unwrap().pop().unwrap();
        assert_eq!(slot, 3);
        // Re-armed and released again: it comes back again.
        unsafe { back.cast::<IMFTrackedSample>().unwrap().SetAllocator(&returned, None).unwrap() };
        drop(back);
        assert_eq!(wait_free(1), 1);
        // After close, released samples are freed instead of pooled.
        let (_, SendSample(back)) = pool.free.lock().unwrap().pop().unwrap();
        pool.closed.store(true, Ordering::Release);
        unsafe { back.cast::<IMFTrackedSample>().unwrap().SetAllocator(&returned, None).unwrap() };
        drop(back);
        std::thread::sleep(std::time::Duration::from_millis(50));
        assert_eq!(pool.free.lock().unwrap().len(), 0);
    }
}
