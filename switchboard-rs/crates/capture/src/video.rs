//! Video path, entirely on the GPU: latest BGRA capture texture ->
//! D3D11 video processor (scale + BGRA->NV12, BT.709 limited) -> hardware
//! H.264 MFT -> AVCC packets in the replay ring. Raw frames never reach
//! system memory.

use std::mem::ManuallyDrop;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};

use anyhow::{Context, Result, anyhow, bail};
use windows::Win32::Foundation::{CloseHandle, E_NOTIMPL, HANDLE, RECT};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709, DXGI_FORMAT_NV12,
    DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::Threading::{CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateWaitableTimerExW, SetWaitableTimer};
use windows::core::{GUID, Interface, PCWSTR, Ref, implement};

use crate::clock::{HNS_PER_SECOND, now_hns};
use crate::gpu::Gpu;
use crate::mf::{self, codec_bool, codec_u32, pack};
use crate::ring::TrackRing;
use crate::signal::{Stop, Woke, wait_any};
use crate::wgc::CaptureShared;

#[derive(Clone, Debug, Default)]
pub struct VideoParams {
    pub width: u32,
    pub height: u32,
    pub sps: Vec<u8>,
    pub pps: Vec<u8>,
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
    /// Set when the pipeline stops on its own (device lost, encoder error).
    pub error: Mutex<Option<String>>,
}

pub(crate) struct VideoSetup {
    pub gpu: Gpu,
    pub capture: Arc<CaptureShared>,
    pub ring: Arc<TrackRing>,
    pub params: Arc<Mutex<VideoParams>>,
    pub stats: Arc<VideoStats>,
    pub stop: Arc<Stop>,
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
            let _ = ready.send(Ok(p.encoder.name.clone()));
            p
        }
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    if let Err(e) = state.run(&setup) {
        *setup.stats.error.lock().unwrap() = Some(format!("{e:#}"));
    }
    state.encoder.shutdown();
}

struct Pipeline {
    converter: Converter,
    encoder: HwEncoder,
    timer: Timer,
    scratch: Vec<u8>,
    avcc: Vec<u8>,
}

impl Pipeline {
    fn new(s: &VideoSetup) -> Result<Pipeline> {
        let converter = Converter::new(&s.gpu, s.width, s.height, s.fps)?;
        let encoder = HwEncoder::new(&s.gpu, s.width, s.height, s.fps, s.bitrate)?;
        *s.params.lock().unwrap() =
            VideoParams { width: s.width, height: s.height, sps: Vec::new(), pps: Vec::new() };
        Ok(Pipeline { converter, encoder, timer: Timer::new()?, scratch: Vec::new(), avcc: Vec::new() })
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
        let Pipeline { converter, encoder, timer, scratch, avcc } = self;
        let mut sink = |sample: &IMFSample| -> Result<()> {
            let time = unsafe { sample.GetSampleTime()? };
            let key = unsafe { sample.GetUINT32(&MFSampleExtension_CleanPoint) }.unwrap_or(0) == 1;
            mf::sample_bytes(sample, scratch)?;
            let idr = annexb_to_avcc(scratch, avcc, &s.params);
            let key = key || idr;
            // Keyframes start segments so every segment is independently decodable.
            ring.push(s.t0 + time, period, key, key, avcc)?;
            s.stats.encoded.fetch_add(1, Ordering::Relaxed);
            Ok(())
        };
        while !s.stop.is_set() {
            if s.capture.closed.load(Ordering::Relaxed) {
                bail!("the captured display is no longer available");
            }
            let target = at(n);
            if timer.wait_until(target, &s.stop) {
                break;
            }
            encoder.pump(&mut sink)?;
            let latest = {
                let l = s.capture.latest.lock().unwrap();
                l.texture.clone().map(|t| (t, l.width, l.height, l.generation))
            };
            let latest_seen = latest.is_some();
            if let Some((tex, w, h, generation)) = latest {
                if encoder.need_input == 0 {
                    // The encoder is behind. Poll its event queue in 1 ms
                    // steps (cancellable by stop) until it asks for input or
                    // the next frame is due. Normally a request is already
                    // queued and this never runs.
                    s.stats.encoder_waits.fetch_add(1, Ordering::Relaxed);
                    let deadline = at(n + 1);
                    while encoder.need_input == 0 && now_hns() < deadline {
                        if s.stop.sleep(1) {
                            return Ok(());
                        }
                        encoder.pump(&mut sink)?;
                    }
                }
                let submitted = encoder.need_input > 0
                    && match converter.convert(&tex, w, h, generation)? {
                        Some(sample) => {
                            encoder.submit(sample, target - s.t0, at(n + 1) - target, &converter.returned)?;
                            true
                        }
                        None => false,
                    };
                if submitted {
                    encoder.pump(&mut sink)?;
                } else {
                    s.stats.dropped.fetch_add(1, Ordering::Relaxed);
                }
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
    name: String,
}

impl HwEncoder {
    fn new(gpu: &Gpu, w: u32, h: u32, fps: u32, bitrate: u32) -> Result<HwEncoder> {
        unsafe {
            let mut token = 0u32;
            let mut manager = None;
            MFCreateDXGIDeviceManager(&mut token, &mut manager)?;
            let manager = manager.ok_or_else(|| anyhow!("no DXGI device manager"))?;
            manager.ResetDevice(&gpu.device, token)?;

            let (transform, activate, name) = find_encoder(gpu)?;
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
            out.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
            out.SetUINT32(&MF_MT_AVG_BITRATE, bitrate)?;
            out.SetUINT64(&MF_MT_FRAME_SIZE, pack(w, h))?;
            out.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
            out.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1))?;
            out.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            out.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)?;
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
            Ok(HwEncoder { transform, activate, events, _manager: manager, need_input: 0, output, name })
        }
    }

    /// Handles every queued encoder event without blocking.
    fn pump(&mut self, sink: &mut impl FnMut(&IMFSample) -> Result<()>) -> Result<()> {
        loop {
            let event = match unsafe { self.events.GetEvent(MF_EVENT_FLAG_NO_WAIT) } {
                Ok(e) => e,
                Err(e) if e.code() == MF_E_NO_EVENTS_AVAILABLE => return Ok(()),
                Err(e) => return Err(e.into()),
            };
            let kind = unsafe { event.GetType()? };
            if kind == METransformNeedInput.0 as u32 {
                self.need_input += 1;
            } else if kind == METransformHaveOutput.0 as u32
                && let Some(sample) = self.output()?
            {
                sink(&sample)?;
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
        self.need_input -= 1;
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

/// First hardware H.264 encoder on the capture adapter.
fn find_encoder(gpu: &Gpu) -> Result<(IMFTransform, IMFActivate, String)> {
    unsafe {
        let mut attrs = None;
        MFCreateAttributes(&mut attrs, 1)?;
        let attrs = attrs.unwrap();
        let luid = std::slice::from_raw_parts(&gpu.luid as *const _ as *const u8, std::mem::size_of_val(&gpu.luid));
        attrs.SetBlob(&MFT_ENUM_ADAPTER_LUID, luid)?;
        let input = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: MFVideoFormat_NV12 };
        let output = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: MFVideoFormat_H264 };
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
        let activates: Vec<IMFActivate> =
            (0..count as usize).filter_map(|i| (*list.add(i)).take()).collect();
        CoTaskMemFree(Some(list as *const _));
        for act in activates {
            let name = activate_name(&act);
            match act.ActivateObject::<IMFTransform>() {
                Ok(t) => return Ok((t, act, name)),
                Err(e) => eprintln!("encoder {name} failed to activate: {e}"),
            }
        }
        bail!("no hardware H.264 encoder on {}", gpu.adapter_name)
    }
}

fn activate_name(act: &IMFActivate) -> String {
    unsafe {
        let mut ptr = windows::core::PWSTR::null();
        let mut len = 0u32;
        if act.GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut ptr, &mut len).is_ok() {
            let s = ptr.to_string().unwrap_or_default();
            CoTaskMemFree(Some(ptr.0 as *const _));
            return s;
        }
    }
    "hardware H.264 encoder".into()
}

// ------------------------------------------------------------------- timer

struct Timer(HANDLE);

impl Timer {
    fn new() -> Result<Timer> {
        const TIMER_ALL_ACCESS: u32 = 0x1F0003;
        let h = unsafe {
            CreateWaitableTimerExW(None, PCWSTR::null(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)?
        };
        Ok(Timer(h))
    }

    /// Sleeps until `target_hns`; returns true if stop was requested.
    fn wait_until(&self, target_hns: i64, stop: &Stop) -> bool {
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
