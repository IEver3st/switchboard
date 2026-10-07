//! Audio tracks: WASAPI capture -> QPC-locked PCM timeline -> AAC (Media
//! Foundation) -> replay ring.
//!
//! Game and Chat use process loopback (Windows 10 2004+): Game captures every
//! process except the chat app's tree, Chat captures only that tree. Loopback
//! can deliver nothing while a source is silent, so the timeline fills gaps
//! with silence against the shared clock; that also absorbs device clock
//! drift. Gaps longer than the replay window (sleep/resume, a stalled device)
//! are not filled: the track restarts its clock at the next packet.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, mpsc};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
use windows::Win32::System::Com::{BLOB, CLSCTX_ALL, CLSCTX_INPROC_SERVER, CoCreateInstance};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::System::Variant::VT_BLOB;
use windows::core::{Interface, Ref, implement};

use crate::clock::{HNS_PER_SECOND, now_hns};
use crate::mf;
use crate::ring::{RingWriter, TrackRing};
use crate::signal::{Event, Stop, Woke, wait_any};

pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u16 = 2;
const FRAME_BYTES: usize = 4; // 16-bit stereo
const AAC_FRAME: usize = 1024;
/// One AAC frame of PCM.
const BLOCK: usize = AAC_FRAME * FRAME_BYTES;
static SILENCE: [u8; BLOCK] = [0; BLOCK];

/// Wakeup policy for a capture thread. WASAPI signals every device period
/// (10 ms) and process loopback keeps signalling during silence, so waking
/// per event costs ~100 wakeups/s per track. Instead the thread drains the
/// WASAPI buffer, then sleeps PACE_MS on the stop and save-kick events while
/// packets accumulate (the buffer holds BUFFER_HNS). A save kicks every
/// track to flush at once, so pacing does not delay clip contents. The
/// sleep ends early on stop.
const PACE_MS: u32 = 100;
/// Microphone pacing while reaction levels are consumed, so level frames
/// reach the consumer close to real time.
const PACE_LEVELS_MS: u32 = 20;
/// With no device events (an idle output device), how often the timeline is
/// advanced with silence. Stops on the stop event.
const IDLE_MS: u32 = 200;
const BUFFER_HNS: i64 = 10_000_000; // 1 s
/// Silence is only placed this far behind now, so late real packets are not
/// trimmed as overlap.
const FILL_MARGIN_HNS: i64 = 100 * 10_000;
/// Smaller margin on a save kick so the clip's audio reaches its end.
const KICK_MARGIN_HNS: i64 = 50 * 10_000;
/// Level frames are computed only while drained this recently.
const LEVELS_IDLE_HNS: i64 = 2 * HNS_PER_SECOND;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum TrackKind {
    Game,
    Chat,
    Microphone,
}

impl TrackKind {
    pub fn label(self) -> &'static str {
        match self {
            TrackKind::Game => "Game",
            TrackKind::Chat => "Chat",
            TrackKind::Microphone => "Microphone",
        }
    }
}

#[derive(Clone, Debug)]
pub enum Source {
    /// Everything except this process tree.
    LoopbackExcluding(u32),
    /// Only this process tree.
    LoopbackOnly(u32),
    /// Everything played on one output device.
    OutputDevice(String),
    DefaultMicrophone,
    /// One input device.
    InputDevice(String),
}

#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AudioDevices {
    pub outputs: Vec<AudioDevice>,
    pub inputs: Vec<AudioDevice>,
}

/// Active output and input endpoints with their Windows names.
pub fn list_audio_devices() -> AudioDevices {
    mf::init_thread();
    let list = |flow: EDataFlow| -> Vec<AudioDevice> {
        unsafe {
            let Ok(en) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else {
                return Vec::new();
            };
            let default_id = en.GetDefaultAudioEndpoint(flow, eConsole).ok().and_then(|d| device_id(&d));
            let Ok(coll) = en.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) else { return Vec::new() };
            let n = coll.GetCount().unwrap_or(0);
            let mut out = Vec::new();
            for i in 0..n {
                let Ok(d) = coll.Item(i) else { continue };
                let Some(id) = device_id(&d) else { continue };
                let name = device_name(&d).unwrap_or_else(|| "Audio device".into());
                out.push(AudioDevice { is_default: Some(&id) == default_id.as_ref(), id, name });
            }
            out.sort_by(|a, b| b.is_default.cmp(&a.is_default).then_with(|| a.name.cmp(&b.name)));
            out
        }
    };
    AudioDevices { outputs: list(eRender), inputs: list(eCapture) }
}

fn device_id(d: &IMMDevice) -> Option<String> {
    unsafe {
        let p = d.GetId().ok()?;
        let s = p.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const _));
        s
    }
}

fn device_name(d: &IMMDevice) -> Option<String> {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::System::Com::STGM_READ;
    unsafe {
        let store = d.OpenPropertyStore(STGM_READ).ok()?;
        let v = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
        let s = v.to_string();
        (!s.is_empty()).then_some(s)
    }
}

#[derive(Default)]
pub struct AudioStats {
    pub packets: AtomicU64,
    pub silence_filled: AtomicU64,
    /// Gaps longer than the replay window that restarted the track clock.
    pub discontinuities: AtomicU64,
    pub reopened: AtomicU64,
    /// Thread wakeups (waits that returned), for measuring idle cost.
    pub wakeups: AtomicU64,
    /// Input samples created after the encoder's pool was warm.
    pub encoder_allocations: AtomicU64,
    /// True while the capture thread runs.
    pub running: AtomicBool,
    /// Peak level of the last ~1 s, 0..=32767.
    pub level: AtomicU64,
    /// RMS level per 10 ms of captured audio, in dBFS, for reaction
    /// detection. Bounded: the oldest frames drop if nobody drains them.
    pub frames_dbfs: Mutex<VecDeque<f32>>,
    /// Level frames are computed only while this is set and someone drained
    /// within LEVELS_IDLE_HNS.
    pub levels_wanted: AtomicBool,
    pub levels_drained_at: AtomicI64,
}

impl AudioStats {
    fn levels_active(&self, now: i64) -> bool {
        self.levels_wanted.load(Ordering::Relaxed)
            && now - self.levels_drained_at.load(Ordering::Relaxed) < LEVELS_IDLE_HNS
    }
}

const MAX_LEVEL_FRAMES: usize = 1000;

/// Appends 10 ms RMS levels (dBFS) for a block of 16-bit stereo PCM.
/// Allocation-free once the queue has reached its bound.
fn push_levels(stats: &AudioStats, pcm: &[u8], carry: &mut (f64, usize)) {
    const FRAME: usize = (SAMPLE_RATE / 100) as usize; // 480 frames = 10 ms
    let mut local = [0f32; 32];
    let mut n = 0;
    let flush = |levels: &[f32]| {
        let mut q = stats.frames_dbfs.lock().unwrap();
        for &l in levels {
            if q.len() >= MAX_LEVEL_FRAMES {
                q.pop_front();
            }
            q.push_back(l);
        }
    };
    for f in pcm.chunks_exact(FRAME_BYTES) {
        let l = i16::from_le_bytes([f[0], f[1]]) as f64;
        let r = i16::from_le_bytes([f[2], f[3]]) as f64;
        let m = (l + r) / 2.0 / 32768.0;
        carry.0 += m * m;
        carry.1 += 1;
        if carry.1 == FRAME {
            let rms = (carry.0 / FRAME as f64).sqrt().max(1e-6);
            local[n] = (20.0 * rms.log10()) as f32;
            n += 1;
            *carry = (0.0, 0);
            if n == local.len() {
                flush(&local[..n]);
                n = 0;
            }
        }
    }
    if n > 0 {
        flush(&local[..n]);
    }
}

/// Lets a save ask a track to flush everything captured so far into its
/// ring, and wait for that to happen.
pub(crate) struct Kick {
    event: Event,
    requested: AtomicU64,
    done: Mutex<u64>,
    cv: Condvar,
}

impl Kick {
    pub fn new() -> Result<Kick> {
        Ok(Kick { event: Event::auto()?, requested: AtomicU64::new(0), done: Mutex::new(0), cv: Condvar::new() })
    }

    pub fn request(&self, seq: u64) {
        self.requested.fetch_max(seq, Ordering::Relaxed);
        self.event.set();
    }

    /// Waits until request `seq` has been served or `deadline` passes.
    pub fn wait(&self, seq: u64, deadline: Instant) -> bool {
        let mut done = self.done.lock().unwrap();
        while *done < seq {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return false;
            }
            done = self.cv.wait_timeout(done, left).unwrap().0;
        }
        true
    }

    fn requested(&self) -> u64 {
        self.requested.load(Ordering::Relaxed)
    }

    fn complete(&self, seq: u64) {
        let mut done = self.done.lock().unwrap();
        if seq > *done {
            *done = seq;
            self.cv.notify_all();
        }
    }
}

pub(crate) struct AudioSetup {
    pub kind: TrackKind,
    pub source: Source,
    pub ring: Arc<TrackRing>,
    pub stats: Arc<AudioStats>,
    pub stop: Arc<Stop>,
    pub kick: Arc<Kick>,
    pub t0: i64,
    /// Longest gap filled with silence. Longer gaps are discontinuities.
    pub max_fill_hns: i64,
    pub error: Arc<Mutex<Option<String>>>,
}

/// Fixed PCM format we ask WASAPI to deliver (it converts for us).
fn wave_format() -> WAVEFORMATEX {
    WAVEFORMATEX {
        wFormatTag: WAVE_FORMAT_PCM as u16,
        nChannels: CHANNELS,
        nSamplesPerSec: SAMPLE_RATE,
        nAvgBytesPerSec: SAMPLE_RATE * FRAME_BYTES as u32,
        nBlockAlign: FRAME_BYTES as u16,
        wBitsPerSample: 16,
        cbSize: 0,
    }
}

struct Running<'a>(&'a AudioStats);

impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.running.store(false, Ordering::Relaxed);
    }
}

pub(crate) fn run(setup: AudioSetup) {
    setup.stats.running.store(true, Ordering::Relaxed);
    let _running = Running(&setup.stats);
    mf::init_thread();
    let encoder = match AacEncoder::new() {
        Ok(e) => e,
        Err(e) => {
            *setup.error.lock().unwrap() = Some(format!("{}: AAC encoder unavailable: {e:#}", setup.kind.label()));
            return;
        }
    };
    let mut track = Track {
        timeline: Timeline::new(setup.t0, setup.max_fill_hns),
        encoder,
        ring: setup.ring.writer(true),
        out: Vec::new(),
        t0: setup.t0,
    };
    // Reopen on device loss (unplug, default device switch, audio service restart).
    while !setup.stop.is_set() {
        match capture_session(&setup, &mut track) {
            Ok(Session::Stopped) => break,
            Ok(Session::DefaultChanged) => continue,
            Err(e) => {
                *setup.error.lock().unwrap() = Some(format!("{}: {e:#}", setup.kind.label()));
                setup.stats.reopened.fetch_add(1, Ordering::Relaxed);
                // Keep the track continuous while the device is gone; retry in 1 s.
                let handles = [setup.stop.handle(), setup.kick.event.handle()];
                for _ in 0..10 {
                    let woke = wait_any(&handles, 100);
                    setup.stats.wakeups.fetch_add(1, Ordering::Relaxed);
                    if woke == Woke::Handle(0) {
                        return;
                    }
                    let kicked = woke == Woke::Handle(1);
                    let seq = setup.kick.requested();
                    let margin = if kicked { KICK_MARGIN_HNS } else { FILL_MARGIN_HNS };
                    let _ = track.fill_to(now_hns() - margin, &setup.stats);
                    let _ = track.ring.flush();
                    if kicked {
                        setup.kick.complete(seq);
                    }
                }
            }
        }
    }
}

enum Session {
    Stopped,
    /// The default microphone changed; reopen on the new one right away.
    DefaultChanged,
}

fn capture_session(setup: &AudioSetup, track: &mut Track) -> Result<Session> {
    let watcher = match &setup.source {
        Source::DefaultMicrophone => Some(DefaultWatcher::register()?),
        _ => None,
    };
    let client = open_client(&setup.source, &setup.stop)?;
    let event = Event::auto()?;
    unsafe {
        client.SetEventHandle(event.handle())?;
    }
    let capture: IAudioCaptureClient = unsafe { client.GetService()? };
    unsafe { client.Start()? };
    // Pacing must stay well inside the buffer Windows actually allocated.
    // Process loopback keeps only a few device periods whatever size is
    // requested (sleeping 100 ms there lost ~75% of the audio), so those
    // tracks wake on every device event instead.
    let buffer_ms = unsafe { client.GetBufferSize()? } as u64 * 1000 / SAMPLE_RATE as u64;
    let event_driven = matches!(setup.source, Source::LoopbackExcluding(_) | Source::LoopbackOnly(_));
    let max_pace = if event_driven { 0 } else { (buffer_ms / 3) as u32 };
    *setup.error.lock().unwrap() = None;
    let handles = [setup.stop.handle(), setup.kick.event.handle(), event.handle()];
    let result = (|| -> Result<Session> {
        let mut peak_window_start = now_hns();
        let mut peak = 0i32;
        let mut level_carry = (0.0f64, 0usize);
        let mut kicked = false;
        loop {
            if setup.stop.is_set() {
                return Ok(Session::Stopped);
            }
            if watcher.as_ref().is_some_and(|w| w.changed.swap(false, Ordering::Relaxed)) {
                return Ok(Session::DefaultChanged);
            }
            if !kicked {
                let woke = wait_any(&handles, IDLE_MS);
                setup.stats.wakeups.fetch_add(1, Ordering::Relaxed);
                match woke {
                    Woke::Handle(0) => return Ok(Session::Stopped),
                    Woke::Handle(1) => kicked = true,
                    _ => {}
                }
            }
            let seq = setup.kick.requested();
            let wake = now_hns();
            let levels = setup.kind == TrackKind::Microphone && setup.stats.levels_active(wake);
            if !levels {
                level_carry = (0.0, 0);
            }
            loop {
                let frames = unsafe { capture.GetNextPacketSize()? };
                if frames == 0 {
                    break;
                }
                let mut data = std::ptr::null_mut();
                let mut count = 0u32;
                let mut flags = 0u32;
                let mut qpc = 0u64;
                unsafe { capture.GetBuffer(&mut data, &mut count, &mut flags, None, Some(&mut qpc))? };
                let bytes = count as usize * FRAME_BYTES;
                let silent = flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
                let slice = if silent || data.is_null() {
                    None
                } else {
                    Some(unsafe { std::slice::from_raw_parts(data, bytes) })
                };
                if let Some(s) = slice {
                    peak = peak.max(peak_of(s));
                    if levels {
                        push_levels(&setup.stats, s, &mut level_carry);
                    }
                }
                let at = if qpc == 0 { now_hns() } else { qpc as i64 };
                let pushed = track.push(at, count as usize, slice, &setup.stats);
                unsafe { capture.ReleaseBuffer(count)? };
                pushed?;
                setup.stats.packets.fetch_add(1, Ordering::Relaxed);
            }
            let now = now_hns();
            let margin = if kicked { KICK_MARGIN_HNS } else { FILL_MARGIN_HNS };
            track.fill_to(now - margin, &setup.stats)?;
            track.ring.flush()?;
            if kicked {
                setup.kick.complete(seq);
                kicked = false;
            }
            if now - peak_window_start > HNS_PER_SECOND {
                setup.stats.level.store(peak as u64, Ordering::Relaxed);
                peak = 0;
                peak_window_start = now;
            }
            // Let device packets accumulate; see PACE_MS.
            let pace = if levels { PACE_LEVELS_MS } else { PACE_MS }.min(max_pace);
            let spent = ((now_hns() - wake) / 10_000).max(0) as u32;
            if spent < pace {
                let woke = wait_any(&handles[..2], pace - spent);
                setup.stats.wakeups.fetch_add(1, Ordering::Relaxed);
                match woke {
                    Woke::Handle(0) => return Ok(Session::Stopped),
                    Woke::Handle(1) => kicked = true,
                    _ => {}
                }
            }
        }
    })();
    unsafe {
        let _ = client.Stop();
    }
    result
}

fn peak_of(pcm: &[u8]) -> i32 {
    pcm.chunks_exact(2).map(|b| (i16::from_le_bytes([b[0], b[1]]) as i32).abs()).max().unwrap_or(0)
}

fn open_client(source: &Source, stop: &Stop) -> Result<IAudioClient> {
    let format = wave_format();
    unsafe {
        match source {
            Source::LoopbackExcluding(pid) | Source::LoopbackOnly(pid) => {
                let include = matches!(source, Source::LoopbackOnly(_));
                let client = activate_process_loopback(*pid, include, stop)?;
                client
                    .Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                        BUFFER_HNS,
                        0,
                        &format,
                        None,
                    )
                    .context("process loopback Initialize")?;
                Ok(client)
            }
            Source::OutputDevice(id) => {
                let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
                let device = enumerator
                    .GetDevice(&windows::core::HSTRING::from(id.as_str()))
                    .context("the chosen output device isn't connected")?;
                let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
                client
                    .Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                        BUFFER_HNS,
                        0,
                        &format,
                        None,
                    )
                    .context("output device loopback Initialize")?;
                Ok(client)
            }
            Source::DefaultMicrophone | Source::InputDevice(_) => {
                let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
                let device = match source {
                    Source::InputDevice(id) => enumerator
                        .GetDevice(&windows::core::HSTRING::from(id.as_str()))
                        .context("the chosen microphone isn't connected")?,
                    _ => enumerator.GetDefaultAudioEndpoint(eCapture, eConsole).context("no microphone")?,
                };
                let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
                client
                    .Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                            | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                            | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                        BUFFER_HNS,
                        0,
                        &format,
                        None,
                    )
                    .context("microphone Initialize")?;
                Ok(client)
            }
        }
    }
}

/// Event-driven default-microphone tracking (no polling).
struct DefaultWatcher {
    enumerator: IMMDeviceEnumerator,
    client: IMMNotificationClient,
    changed: Arc<AtomicBool>,
}

#[implement(IMMNotificationClient)]
struct DefaultChanged(Arc<AtomicBool>);

impl IMMNotificationClient_Impl for DefaultChanged_Impl {
    fn OnDeviceStateChanged(&self, _: &windows::core::PCWSTR, _: DEVICE_STATE) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnDeviceAdded(&self, _: &windows::core::PCWSTR) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnDeviceRemoved(&self, _: &windows::core::PCWSTR) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnDefaultDeviceChanged(&self, flow: EDataFlow, role: ERole, _: &windows::core::PCWSTR) -> windows::core::Result<()> {
        if flow == eCapture && role == eConsole {
            self.0.store(true, Ordering::Relaxed);
        }
        Ok(())
    }
    fn OnPropertyValueChanged(
        &self,
        _: &windows::core::PCWSTR,
        _: &windows::Win32::Foundation::PROPERTYKEY,
    ) -> windows::core::Result<()> {
        Ok(())
    }
}

impl DefaultWatcher {
    fn register() -> Result<DefaultWatcher> {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let changed = Arc::new(AtomicBool::new(false));
        let client: IMMNotificationClient = DefaultChanged(changed.clone()).into();
        unsafe { enumerator.RegisterEndpointNotificationCallback(&client)? };
        Ok(DefaultWatcher { enumerator, client, changed })
    }
}

impl Drop for DefaultWatcher {
    fn drop(&mut self) {
        unsafe {
            let _ = self.enumerator.UnregisterEndpointNotificationCallback(&self.client);
        }
    }
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct Activated(Mutex<Option<mpsc::Sender<()>>>);

impl IActivateAudioInterfaceCompletionHandler_Impl for Activated_Impl {
    fn ActivateCompleted(&self, _op: Ref<IActivateAudioInterfaceAsyncOperation>) -> windows::core::Result<()> {
        if let Some(tx) = self.0.lock().unwrap().take() {
            let _ = tx.send(());
        }
        Ok(())
    }
}

fn activate_process_loopback(pid: u32, include: bool, stop: &Stop) -> Result<IAudioClient> {
    let params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: pid,
                ProcessLoopbackMode: if include {
                    PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                } else {
                    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
                },
            },
        },
    };
    // The blob points at `params` on this stack frame. PROPVARIANT's Drop
    // calls PropVariantClear, which would free that pointer, so never drop it.
    let pv = std::mem::ManuallyDrop::new(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    blob: BLOB {
                        cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                        pBlobData: &params as *const _ as *mut u8,
                    },
                },
            }),
        },
    });
    let (tx, rx) = mpsc::channel();
    let handler: IActivateAudioInterfaceCompletionHandler = Activated(Mutex::new(Some(tx))).into();
    let op = unsafe {
        ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&*pv), &handler)?
    };
    // Activation usually completes in milliseconds. Check stop between
    // 50 ms slices so a stuck activation never delays shutdown; give up at 5 s.
    let mut waited = 0;
    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(()) => break,
            Err(_) if stop.is_set() => return Err(anyhow!("stopped during activation")),
            Err(_) if waited >= 5_000 => return Err(anyhow!("process loopback activation timed out")),
            Err(_) => waited += 50,
        }
    }
    let mut hr = windows::core::HRESULT(0);
    let mut unknown = None;
    unsafe { op.GetActivateResult(&mut hr, &mut unknown)? };
    hr.ok().context("process loopback activation")?;
    let client: IAudioClient = unknown.ok_or_else(|| anyhow!("no audio client"))?.cast()?;
    Ok(client)
}

pub fn own_pid() -> u32 {
    unsafe { GetCurrentProcessId() }
}

// ----------------------------------------------------------------- timeline

/// Receives PCM in whole AAC frames, in timeline order.
trait PcmSink {
    fn block(&mut self, pcm: &[u8]) -> Result<()>;
    /// The next block starts at timeline frame `frame`, not right after the
    /// previous one.
    fn jump(&mut self, frame: i64);
}

/// Places PCM on the shared clock. Sample index `i` belongs at
/// `t0 + i / SAMPLE_RATE`. Gaps up to `max_fill` frames become silence;
/// longer gaps restart the clock at the next packet; overlaps are trimmed.
/// Memory is one AAC frame of carry regardless of gap length.
struct Timeline {
    t0: i64,
    /// Timeline index of the next frame.
    written: i64,
    /// Partial AAC frame, never longer than BLOCK.
    carry: Vec<u8>,
    max_fill: i64,
}

const TOLERANCE: i64 = 480; // 10 ms

impl Timeline {
    fn new(t0: i64, max_fill_hns: i64) -> Timeline {
        let max_fill = (max_fill_hns as i128 * SAMPLE_RATE as i128 / HNS_PER_SECOND as i128) as i64;
        Timeline { t0, written: 0, carry: Vec::with_capacity(BLOCK), max_fill: max_fill.max(TOLERANCE) }
    }

    fn index_at(&self, hns: i64) -> i64 {
        ((hns - self.t0) as i128 * SAMPLE_RATE as i128 / HNS_PER_SECOND as i128) as i64
    }

    fn push(&mut self, at: i64, frames: usize, data: Option<&[u8]>, stats: &AudioStats, sink: &mut dyn PcmSink) -> Result<()> {
        let start = self.index_at(at);
        let mut skip = 0usize;
        if start > self.written + TOLERANCE {
            self.advance_to(start, stats, sink)?;
        } else if start < self.written - TOLERANCE {
            skip = ((self.written - start) as usize).min(frames);
        }
        let keep = frames - skip;
        self.put(data.map(|d| &d[skip * FRAME_BYTES..frames * FRAME_BYTES]), keep, sink)
    }

    fn fill_silence_to(&mut self, hns: i64, stats: &AudioStats, sink: &mut dyn PcmSink) -> Result<()> {
        let target = self.index_at(hns);
        if target > self.written + TOLERANCE {
            self.advance_to(target, stats, sink)?;
        }
        Ok(())
    }

    fn advance_to(&mut self, start: i64, stats: &AudioStats, sink: &mut dyn PcmSink) -> Result<()> {
        let gap = start - self.written;
        if gap > self.max_fill {
            // Longer than the ring keeps: filling it would only encode
            // silence that is evicted at once. Finish the partial frame so
            // earlier audio keeps its place, then restart the clock at `start`.
            if !self.carry.is_empty() {
                let pad = (BLOCK - self.carry.len()) / FRAME_BYTES;
                self.put(None, pad, sink)?;
            }
            self.written = start;
            sink.jump(start);
            stats.discontinuities.fetch_add(1, Ordering::Relaxed);
        } else {
            self.put(None, gap as usize, sink)?;
            stats.silence_filled.fetch_add(gap as u64, Ordering::Relaxed);
        }
        Ok(())
    }

    /// Appends `frames` of `data` (or silence), handing whole frames to `sink`.
    fn put(&mut self, data: Option<&[u8]>, frames: usize, sink: &mut dyn PcmSink) -> Result<()> {
        self.written += frames as i64;
        let mut left = frames * FRAME_BYTES;
        let mut pos = 0;
        while left > 0 {
            if self.carry.is_empty() && left >= BLOCK {
                sink.block(match data {
                    Some(d) => &d[pos..pos + BLOCK],
                    None => &SILENCE,
                })?;
                pos += BLOCK;
                left -= BLOCK;
            } else {
                let take = (BLOCK - self.carry.len()).min(left);
                match data {
                    Some(d) => self.carry.extend_from_slice(&d[pos..pos + take]),
                    None => self.carry.extend_from_slice(&SILENCE[..take]),
                }
                pos += take;
                left -= take;
                if self.carry.len() == BLOCK {
                    sink.block(&self.carry)?;
                    self.carry.clear();
                }
            }
        }
        Ok(())
    }
}

/// One track's encode state: timeline -> AAC -> ring.
struct Track {
    timeline: Timeline,
    encoder: AacEncoder,
    ring: RingWriter,
    out: Vec<u8>,
    t0: i64,
}

struct EncodeSink<'a> {
    encoder: &'a mut AacEncoder,
    ring: &'a mut RingWriter,
    out: &'a mut Vec<u8>,
    t0: i64,
}

impl PcmSink for EncodeSink<'_> {
    fn block(&mut self, pcm: &[u8]) -> Result<()> {
        let (ring, t0) = (&mut *self.ring, self.t0);
        self.encoder.encode(pcm, &mut |pts, dur, data| ring.push(t0 + pts, dur, true, true, data), self.out)
    }

    fn jump(&mut self, frame: i64) {
        // The MF AAC encoder stamps output from input sample times, so
        // moving its input clock keeps packets after the gap on the QPC
        // timeline.
        self.encoder.samples_in = frame;
    }
}

impl Track {
    fn sink(&mut self) -> (&mut Timeline, EncodeSink<'_>) {
        let Track { timeline, encoder, ring, out, t0 } = self;
        (timeline, EncodeSink { encoder, ring, out, t0: *t0 })
    }

    fn push(&mut self, at: i64, frames: usize, data: Option<&[u8]>, stats: &AudioStats) -> Result<()> {
        let before = self.encoder.allocations;
        let (timeline, mut sink) = self.sink();
        let r = timeline.push(at, frames, data, stats, &mut sink);
        stats.encoder_allocations.fetch_add(self.encoder.allocations - before, Ordering::Relaxed);
        r
    }

    fn fill_to(&mut self, hns: i64, stats: &AudioStats) -> Result<()> {
        let (timeline, mut sink) = self.sink();
        timeline.fill_silence_to(hns, stats, &mut sink)
    }
}

// ---------------------------------------------------------------------- AAC

pub const AAC_BYTES_PER_SECOND: u32 = 24_000; // 192 kbps

/// AudioSpecificConfig for AAC-LC, 48 kHz, stereo.
pub fn audio_specific_config() -> [u8; 2] {
    let object_type = 2u16; // AAC-LC
    let freq_index = 3u16; // 48000
    let v = (object_type << 11) | (freq_index << 7) | ((CHANNELS) << 3);
    v.to_be_bytes()
}

/// A memory sample with one buffer, reused while the encoder holds no
/// reference to it.
struct Reusable {
    sample: IMFSample,
    buffer: IMFMediaBuffer,
}

impl Reusable {
    fn new(capacity: u32) -> Result<Reusable> {
        unsafe {
            let buffer = MFCreateMemoryBuffer(capacity)?;
            let sample = MFCreateSample()?;
            sample.AddBuffer(&buffer)?;
            Ok(Reusable { sample, buffer })
        }
    }

    /// Only our handles remain: the sample, and the buffer (sample + ours).
    fn is_free(&self) -> bool {
        mf::ref_count(&self.sample) == 1 && mf::ref_count(&self.buffer) == 2
    }
}

/// Input samples kept for reuse; the encoder normally frees each one before
/// the next block, so one or two suffice.
const INPUT_POOL: usize = 4;

struct AacEncoder {
    transform: IMFTransform,
    samples_in: i64,
    inputs: Vec<Reusable>,
    output: Reusable,
    /// Input samples created after the first (pool growth or overflow).
    allocations: u64,
}

impl AacEncoder {
    fn new() -> Result<AacEncoder> {
        unsafe {
            let transform: IMFTransform = CoCreateInstance(&AACMFTEncoder, None, CLSCTX_INPROC_SERVER)?;
            let input = MFCreateMediaType()?;
            input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            input.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)?;
            input.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            input.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, SAMPLE_RATE)?;
            input.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, CHANNELS as u32)?;
            input.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, FRAME_BYTES as u32)?;
            input.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, SAMPLE_RATE * FRAME_BYTES as u32)?;
            let output = MFCreateMediaType()?;
            output.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            output.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)?;
            output.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            output.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, SAMPLE_RATE)?;
            output.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, CHANNELS as u32)?;
            output.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, AAC_BYTES_PER_SECOND)?;
            output.SetUINT32(&MF_MT_AAC_PAYLOAD_TYPE, 0)?;
            output.SetUINT32(&MF_MT_AAC_AUDIO_PROFILE_LEVEL_INDICATION, 0x29)?;
            if transform.SetInputType(0, &input, 0).is_err() {
                transform.SetOutputType(0, &output, 0).context("AAC output type")?;
                transform.SetInputType(0, &input, 0).context("AAC input type")?;
            } else {
                transform.SetOutputType(0, &output, 0).context("AAC output type")?;
            }
            let info = transform.GetOutputStreamInfo(0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
            Ok(AacEncoder {
                transform,
                samples_in: 0,
                inputs: vec![Reusable::new(BLOCK as u32)?],
                output: Reusable::new(info.cbSize.max(8192))?,
                allocations: 0,
            })
        }
    }

    /// Encodes one block; calls `emit(pts_from_t0, duration, bytes)` per AAC frame.
    fn encode(
        &mut self,
        pcm: &[u8],
        emit: &mut dyn FnMut(i64, i64, &[u8]) -> Result<()>,
        out: &mut Vec<u8>,
    ) -> Result<()> {
        let frames = (pcm.len() / FRAME_BYTES) as i64;
        let time = self.samples_in * HNS_PER_SECOND / SAMPLE_RATE as i64;
        let dur = frames * HNS_PER_SECOND / SAMPLE_RATE as i64;
        self.samples_in += frames;
        let slot = match self.inputs.iter().position(Reusable::is_free) {
            Some(i) => i,
            None => {
                // The encoder still holds every pooled sample: grow the pool
                // (bounded), else replace the oldest entry.
                self.allocations += 1;
                let fresh = Reusable::new(BLOCK.max(pcm.len()) as u32)?;
                if self.inputs.len() < INPUT_POOL {
                    self.inputs.push(fresh);
                    self.inputs.len() - 1
                } else {
                    self.inputs[0] = fresh;
                    0
                }
            }
        };
        let input = &self.inputs[slot];
        unsafe {
            let mut ptr = std::ptr::null_mut();
            let mut max = 0u32;
            input.buffer.Lock(&mut ptr, Some(&mut max), None)?;
            let n = pcm.len().min(max as usize);
            std::ptr::copy_nonoverlapping(pcm.as_ptr(), ptr, n);
            input.buffer.Unlock()?;
            input.buffer.SetCurrentLength(n as u32)?;
            input.sample.SetSampleTime(time)?;
            input.sample.SetSampleDuration(dur)?;
            self.transform.ProcessInput(0, &input.sample, 0)?;
        }
        loop {
            unsafe { self.output.buffer.SetCurrentLength(0)? };
            let mut buffer = MFT_OUTPUT_DATA_BUFFER {
                dwStreamID: 0,
                pSample: std::mem::ManuallyDrop::new(Some(self.output.sample.clone())),
                dwStatus: 0,
                pEvents: std::mem::ManuallyDrop::new(None),
            };
            let mut status = 0u32;
            let result = unsafe { self.transform.ProcessOutput(0, std::slice::from_mut(&mut buffer), &mut status) };
            drop(std::mem::ManuallyDrop::into_inner(buffer.pSample));
            drop(std::mem::ManuallyDrop::into_inner(buffer.pEvents));
            match result {
                Ok(()) => {
                    let sample = &self.output.sample;
                    let pts = unsafe { sample.GetSampleTime()? };
                    let dur = unsafe { sample.GetSampleDuration() }
                        .unwrap_or(AAC_FRAME as i64 * HNS_PER_SECOND / SAMPLE_RATE as i64);
                    mf::sample_bytes(sample, out)?;
                    if !out.is_empty() {
                        emit(pts, dur, out)?;
                    }
                }
                Err(e) if e.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => return Ok(()),
                Err(e) => return Err(e.into()),
            }
        }
    }
}

/// Encodes 2 s of silence with a full-scale impulse at sample 48000 and
/// writes a single-track MP4, for measuring encoder delay.
#[doc(hidden)]
pub fn debug_aac_impulse(path: &std::path::Path) -> Result<()> {
    mf::init_thread();
    let mut enc = AacEncoder::new()?;
    let mut pcm = vec![0u8; 96_000 * FRAME_BYTES];
    for ch in 0..2 {
        let i = 48_000 * FRAME_BYTES + ch * 2;
        pcm[i..i + 2].copy_from_slice(&i16::MAX.to_le_bytes());
    }
    let mut frames: Vec<(i64, Vec<u8>)> = Vec::new();
    let mut out = Vec::new();
    for block in pcm.chunks_exact(BLOCK) {
        enc.encode(block, &mut |pts, _d, data| { frames.push((pts, data.to_vec())); Ok(()) }, &mut out)?;
    }
    eprintln!("first output pts (hns): {:?}", frames.iter().take(3).map(|f| f.0).collect::<Vec<_>>());
    let track = crate::mp4::Track {
        name: "Impulse".into(),
        codec: crate::mp4::Codec::Aac { sample_rate: SAMPLE_RATE, channels: CHANNELS, asc: audio_specific_config().to_vec(), bitrate: 192_000 },
        timescale: SAMPLE_RATE,
        samples: frames.iter().map(|f| crate::mp4::Sample { size: f.1.len() as u32, duration: 1024, key: true }).collect(),
        start_offset: 0,
    };
    crate::mp4::write(path, &[track], |_, i, buf| { buf.clear(); buf.extend_from_slice(&frames[i].1); Ok(()) })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: i64 = 10_000;
    const HOUR: i64 = 3600 * HNS_PER_SECOND;

    /// Collects blocks into memory, recording where each one starts.
    #[derive(Default)]
    struct Collect {
        next: i64,
        blocks: Vec<(i64, Vec<u8>)>,
        jumps: Vec<i64>,
    }

    impl PcmSink for Collect {
        fn block(&mut self, pcm: &[u8]) -> Result<()> {
            assert_eq!(pcm.len(), BLOCK);
            self.blocks.push((self.next, pcm.to_vec()));
            self.next += AAC_FRAME as i64;
            Ok(())
        }
        fn jump(&mut self, frame: i64) {
            self.jumps.push(frame);
            self.next = frame;
        }
    }

    /// Counts blocks without keeping them.
    #[derive(Default)]
    struct Count(usize);

    impl PcmSink for Count {
        fn block(&mut self, _: &[u8]) -> Result<()> {
            self.0 += 1;
            Ok(())
        }
        fn jump(&mut self, _: i64) {}
    }

    fn total_frames(t: &Timeline, c: &Collect) -> i64 {
        c.blocks.len() as i64 * AAC_FRAME as i64 + (t.carry.len() / FRAME_BYTES) as i64
    }

    #[test]
    fn gaps_become_silence_on_the_shared_clock() {
        let stats = AudioStats::default();
        let mut t = Timeline::new(0, 60 * HNS_PER_SECOND);
        let mut c = Collect::default();
        let data = vec![1u8; 480 * FRAME_BYTES];
        t.push(0, 480, Some(&data), &stats, &mut c).unwrap();
        // The next packet arrives 100 ms later: 90 ms of silence goes first.
        t.push(100 * MS, 480, Some(&data), &stats, &mut c).unwrap();
        assert_eq!(total_frames(&t, &c), 480 + 4320 + 480);
        assert_eq!(stats.silence_filled.load(Ordering::Relaxed), 4320);
        // The second packet's bytes sit exactly at 100 ms.
        let mut pcm: Vec<u8> = c.blocks.iter().flat_map(|b| b.1.clone()).collect();
        pcm.extend_from_slice(&t.carry);
        assert!(pcm[480 * FRAME_BYTES..4800 * FRAME_BYTES].iter().all(|&b| b == 0));
        assert!(pcm[4800 * FRAME_BYTES..].iter().all(|&b| b == 1));
    }

    #[test]
    fn overlapping_packets_are_trimmed_not_duplicated() {
        let stats = AudioStats::default();
        let mut t = Timeline::new(0, 60 * HNS_PER_SECOND);
        let mut c = Collect::default();
        let data = vec![1u8; 4800 * FRAME_BYTES];
        t.push(0, 4800, Some(&data), &stats, &mut c).unwrap();
        // A packet stamped 50 ms back (beyond tolerance) only adds its new part.
        t.push(50 * MS, 4800, Some(&data), &stats, &mut c).unwrap();
        assert_eq!(total_frames(&t, &c), 4800 + 2400);
    }

    #[test]
    fn idle_fill_keeps_silent_tracks_moving() {
        let stats = AudioStats::default();
        let mut t = Timeline::new(0, 60 * HNS_PER_SECOND);
        let mut c = Collect::default();
        t.fill_silence_to(1000 * MS, &stats, &mut c).unwrap();
        assert_eq!(total_frames(&t, &c), 48_000);
    }

    #[test]
    fn an_hour_gap_is_a_discontinuity_with_bounded_work() {
        let stats = AudioStats::default();
        let mut t = Timeline::new(0, 33 * HNS_PER_SECOND);
        let mut c = Count::default();
        let data = vec![1u8; 480 * FRAME_BYTES];
        t.push(0, 480, Some(&data), &stats, &mut c).unwrap();
        let cap = t.carry.capacity();
        let started = Instant::now();
        // Sleep/resume: the next packet is stamped one hour later.
        t.push(HOUR, 480, Some(&data), &stats, &mut c).unwrap();
        t.fill_silence_to(HOUR + 2 * HOUR, &stats, &mut c).unwrap();
        // One padding frame per jump, no hour of silence.
        assert!(c.0 <= 2, "{} blocks", c.0);
        assert_eq!(t.carry.capacity(), cap, "carry grew");
        assert!(t.carry.len() < BLOCK);
        assert_eq!(stats.discontinuities.load(Ordering::Relaxed), 2);
        assert!(started.elapsed() < Duration::from_millis(50));
    }

    #[test]
    fn audio_after_a_discontinuity_stays_on_the_qpc_timeline() {
        let stats = AudioStats::default();
        let t0 = 123_456_789;
        let mut t = Timeline::new(t0, 33 * HNS_PER_SECOND);
        let mut c = Collect::default();
        let a = vec![1u8; 700 * FRAME_BYTES];
        let b = vec![2u8; 2048 * FRAME_BYTES];
        t.push(t0, 700, Some(&a), &stats, &mut c).unwrap();
        let resume = t0 + HOUR + 7 * MS;
        t.push(resume, 2048, Some(&b), &stats, &mut c).unwrap();
        let expected = (HOUR + 7 * MS) * SAMPLE_RATE as i64 / HNS_PER_SECOND;
        assert_eq!(c.jumps, vec![expected]);
        // The first block after the jump starts exactly at the packet's QPC
        // position and holds only post-gap audio.
        let after: Vec<_> = c.blocks.iter().filter(|b| b.0 >= expected).collect();
        assert_eq!(after[0].0, expected);
        assert!(after.iter().all(|b| b.1.iter().all(|&x| x == 2)));
        // Pre-gap audio was finished with padding, not lost or shifted.
        assert_eq!(c.blocks[0].0, 0);
        assert!(c.blocks[0].1[..700 * FRAME_BYTES].iter().all(|&x| x == 1));
        assert!(c.blocks[0].1[700 * FRAME_BYTES..].iter().all(|&x| x == 0));
        // Normal packets continue contiguously after the jump.
        let next = resume + 2048 * HNS_PER_SECOND / SAMPLE_RATE as i64;
        t.push(next, 1024, Some(&b[..1024 * FRAME_BYTES]), &stats, &mut c).unwrap();
        assert_eq!(c.blocks.last().unwrap().0, expected + 2048);
        assert_eq!(stats.discontinuities.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn gaps_within_the_window_are_filled_in_bounded_chunks() {
        let stats = AudioStats::default();
        let mut t = Timeline::new(0, 33 * HNS_PER_SECOND);
        let mut c = Count::default();
        let cap = t.carry.capacity();
        t.fill_silence_to(30 * HNS_PER_SECOND, &stats, &mut c).unwrap();
        assert_eq!(c.0, 30 * 48_000 / AAC_FRAME);
        assert_eq!(t.carry.capacity(), cap);
        assert_eq!(stats.discontinuities.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn encoder_follows_the_input_clock_across_a_jump() {
        mf::init_thread();
        let mut enc = AacEncoder::new().unwrap();
        let mut pts = Vec::new();
        let mut out = Vec::new();
        for _ in 0..10 {
            enc.encode(&SILENCE, &mut |p, _, _| { pts.push(p); Ok(()) }, &mut out).unwrap();
        }
        let jump = 3600 * SAMPLE_RATE as i64;
        enc.samples_in = jump;
        let before = pts.len();
        for _ in 0..10 {
            enc.encode(&SILENCE, &mut |p, _, _| { pts.push(p); Ok(()) }, &mut out).unwrap();
        }
        let after = &pts[before..];
        // Frames still inside the encoder at the jump keep their pre-jump
        // times; everything else sits exactly on the new clock. Order holds.
        let at = |base: i64, k: i64| base + k * AAC_FRAME as i64 * HNS_PER_SECOND / SAMPLE_RATE as i64;
        let old: Vec<i64> = (0..10).map(|k| at(0, k)).collect();
        let new: Vec<i64> = (0..10).map(|k| at(HOUR, k)).collect();
        assert!(after.iter().filter(|p| new.contains(p)).count() >= 5, "{after:?}");
        for (i, &p) in after.iter().enumerate() {
            assert!(old.contains(&p) || new.contains(&p), "pts {p} is on neither clock");
            if i > 0 {
                assert!(p > after[i - 1]);
            }
        }
    }

    #[test]
    fn encoder_reuses_its_samples() {
        mf::init_thread();
        let mut enc = AacEncoder::new().unwrap();
        let mut out = Vec::new();
        let mut n = 0;
        for _ in 0..500 {
            enc.encode(&SILENCE, &mut |_, _, _| { n += 1; Ok(()) }, &mut out).unwrap();
        }
        assert!(n >= 490);
        assert!(enc.inputs.len() <= 2, "pool grew to {}", enc.inputs.len());
        assert!(enc.allocations <= 1, "{} fresh input samples", enc.allocations);
    }

    #[test]
    fn levels_are_off_until_drained_recently() {
        let stats = AudioStats::default();
        assert!(!stats.levels_active(now_hns()));
        stats.levels_wanted.store(true, Ordering::Relaxed);
        stats.levels_drained_at.store(now_hns(), Ordering::Relaxed);
        assert!(stats.levels_active(now_hns()));
        assert!(!stats.levels_active(now_hns() + LEVELS_IDLE_HNS + 1));
        let mut carry = (0.0, 0);
        push_levels(&stats, &vec![0u8; 4800 * FRAME_BYTES], &mut carry);
        assert_eq!(stats.frames_dbfs.lock().unwrap().len(), 10);
    }

    #[test]
    fn audio_specific_config_is_aac_lc_48k_stereo() {
        assert_eq!(audio_specific_config(), [0x11, 0x90]);
    }
}
