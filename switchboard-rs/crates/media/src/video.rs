//! Video decode to small CPU RGBA frames.
//!
//! Hardware path (preferred):
//!
//! ```text
//! Source Reader (compressed samples, seeking, edit lists)
//!   -> decoder MFT on a D3D11 device (DXVA), textures bound DECODER only
//!   -> D3D11 video processor: crop to the display aperture, scale to the
//!      preview size, YCbCr -> RGB (BT.601/709/2020, studio/full range)
//!   -> small RGBA render target -> staging copy -> CPU
//! ```
//!
//! Why not let the Source Reader build the decoder and video processor
//! (MF_SOURCE_READER_D3D_MANAGER + advanced video processing)? It works, but
//! the textures it allocates are shader-readable, and on AMD drivers every
//! shader-readable 4K NV12 texture commits ~13 MB of system memory as
//! backing. Measured on a 2160p clip: ~400 MB private bytes. Decoder-only
//! textures commit nothing, and a D3D11 video processor can read them
//! directly, so this path stays at the D3D device's own overhead plus two
//! preview-sized textures.
//!
//! Software path (no usable GPU decoder): Source Reader with DXVA disabled and
//! advanced video processing scaling to RGB32 on the CPU. Correct, but the
//! decoder's reference frames live in system memory (~450 MB at 2160p).

use std::mem::ManuallyDrop;
use std::path::Path;

use anyhow::{Context, Result, anyhow, bail};
use windows::Win32::Foundation::{HMODULE, RECT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::core::Interface;

use crate::Frame;
use crate::mf::{self, HNS_PER_MS, Major};

/// Fits `w x h` inside `max_w x max_h` preserving aspect, never upscaling.
/// Even dimensions keep every video processor happy.
pub fn fit(w: u32, h: u32, max_w: u32, max_h: u32) -> (u32, u32) {
    if w == 0 || h == 0 {
        return (2, 2);
    }
    let scale = f64::min(max_w.max(2) as f64 / w as f64, max_h.max(2) as f64 / h as f64).min(1.0);
    let even = |v: f64| ((v.round() as u32) & !1).max(2);
    (even(w as f64 * scale), even(h as f64 * scale))
}

/// A decoded frame still on the decoder (GPU texture or CPU buffer); turned
/// into RGBA only if it is going to be shown.
pub struct Decoded {
    pub pts_ms: f64,
    pub duration_ms: f64,
    sample: IMFSample,
}

pub struct VideoDecoder {
    backend: Backend,
    /// Preview frame size.
    pub width: u32,
    pub height: u32,
    pub hardware: bool,
    pub frame_ms: f64,
    pub eof: bool,
}

enum Backend {
    Hw(Box<HwDecoder>),
    Sw(SwDecoder),
}

impl VideoDecoder {
    /// `src_w x src_h` is the display size from probing; `out_w x out_h`
    /// the exact frame size to produce (see [`fit`] for an aspect-preserving
    /// size); `fps` the nominal rate (fallback frame duration only).
    pub fn open(path: &Path, src_w: u32, src_h: u32, fps: f64, out_w: u32, out_h: u32) -> Result<VideoDecoder> {
        mf::init_thread();
        let (w, h) = (out_w.max(2), out_h.max(2));
        let frame_ms = if fps > 0.0 { 1000.0 / fps } else { 1000.0 / 30.0 };
        let (backend, hardware) = match HwDecoder::open(path, w, h, src_w, src_h) {
            Ok(hw) => (Backend::Hw(Box::new(hw)), true),
            Err(hw_err) => match SwDecoder::open(path, w, h) {
                Ok(sw) => (Backend::Sw(sw), false),
                Err(sw_err) => {
                    // The software error is the user-facing one; keep the
                    // hardware reason for diagnostics.
                    return Err(sw_err.context(format!("hardware decoding unavailable: {hw_err:#}")));
                }
            },
        };
        let (width, height) = match &backend {
            Backend::Hw(_) => (w, h),
            Backend::Sw(s) => (s.width, s.height),
        };
        Ok(VideoDecoder { backend, width, height, hardware, frame_ms, eof: false })
    }

    /// Changes the size of frames rendered from now on. Frames already
    /// decoded are unaffected (they are scaled when rendered). The software
    /// path changes its output type, so callers should seek afterwards.
    pub fn set_output_size(&mut self, w: u32, h: u32) -> Result<()> {
        let (w, h) = (w.max(2), h.max(2));
        if (w, h) == (self.width, self.height) {
            return Ok(());
        }
        match &mut self.backend {
            Backend::Hw(d) => d.set_output_size(w, h)?,
            Backend::Sw(d) => d.set_output_size(w, h)?,
        }
        (self.width, self.height) = match &self.backend {
            Backend::Hw(_) => (w, h),
            Backend::Sw(s) => (s.width, s.height),
        };
        Ok(())
    }

    pub fn seek(&mut self, ms: f64) -> Result<()> {
        self.eof = false;
        match &mut self.backend {
            Backend::Hw(d) => d.seek(ms),
            Backend::Sw(d) => mf::seek(&d.reader, ms),
        }
    }

    /// Next decoded frame in presentation order, or None at end of stream.
    pub fn next(&mut self) -> Result<Option<Decoded>> {
        if self.eof {
            return Ok(None);
        }
        let sample = match &mut self.backend {
            Backend::Hw(d) => d.next()?,
            Backend::Sw(d) => d.next()?,
        };
        let Some(sample) = sample else {
            self.eof = true;
            return Ok(None);
        };
        let pts = unsafe { sample.GetSampleTime() }.unwrap_or(0) as f64 / HNS_PER_MS;
        let dur = unsafe { sample.GetSampleDuration() }
            .ok()
            .filter(|d| *d > 0)
            .map(|d| d as f64 / HNS_PER_MS)
            .unwrap_or(self.frame_ms);
        Ok(Some(Decoded { pts_ms: pts, duration_ms: dur, sample }))
    }

    /// Converts a decoded frame to RGBA (alpha 255). `reuse` supplies a
    /// buffer so playback doesn't allocate 2 MB per frame.
    pub fn render(&mut self, d: &Decoded, reuse: Option<Vec<u8>>) -> Result<Frame> {
        let mut rgba = reuse.unwrap_or_default();
        rgba.resize(self.width as usize * self.height as usize * 4, 0);
        match &mut self.backend {
            Backend::Hw(hw) => hw.convert_into(&d.sample, &mut rgba)?,
            Backend::Sw(sw) => sw.convert_into(&d.sample, &mut rgba)?,
        }
        Ok(Frame { source_ms: d.pts_ms, width: self.width, height: self.height, rgba })
    }
}

// --------------------------------------------------------------- hardware

struct HwDecoder {
    reader: IMFSourceReader,
    stream: u32,
    mft: IMFTransform,
    /// Kept so the MFT can be shut down; dropping it is not enough.
    activate: IMFActivate,
    draining: bool,
    /// Visible region of the decoded texture.
    src_rect: RECT,
    color: DXGI_COLOR_SPACE_TYPE,
    /// Container display size (crops coded padding when the decoder doesn't
    /// report an aperture).
    display: (u32, u32),
    converter: Converter,
    _manager: IMFDXGIDeviceManager,
}

enum Pull {
    Sample(IMFSample),
    NeedInput,
    StreamChange,
}

impl HwDecoder {
    fn open(path: &Path, out_w: u32, out_h: u32, src_w: u32, src_h: u32) -> Result<HwDecoder> {
        let (device, context) = create_device()?;
        let manager = unsafe {
            let mut token = 0u32;
            let mut m = None;
            MFCreateDXGIDeviceManager(&mut token, &mut m)?;
            let m = m.ok_or_else(|| anyhow!("no DXGI device manager"))?;
            m.ResetDevice(&device, token)?;
            m
        };
        let reader = mf::open_reader(path, None)?;
        let stream = mf::streams(&reader)
            .iter()
            .find(|s| s.major == Major::Video)
            .map(|s| s.index)
            .ok_or_else(|| anyhow!("the file has no video"))?;
        let native = unsafe {
            reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)?;
            reader.SetStreamSelection(stream, true)?;
            let native = reader.GetNativeMediaType(stream, 0)?;
            // Compressed samples straight from the container.
            reader.SetCurrentMediaType(stream, None, &native)?;
            // The decoder's copy of the type omits the frame size: given one,
            // Microsoft's H.264 decoder commits a software frame pool for it
            // up front (~116 MB at 2160p, never touched in DXVA mode).
            // Without it, it sizes itself from the SPS and allocates nothing
            // on the CPU side.
            let t = MFCreateMediaType()?;
            native.CopyAllItems(&t)?;
            let _ = t.DeleteItem(&MF_MT_FRAME_SIZE);
            t
        };
        let (mft, activate) = find_decoder(&native, &manager)?;
        let converter = Converter::new(&device, &context, out_w, out_h)?;
        let mut d = HwDecoder {
            reader,
            stream,
            mft,
            activate,
            draining: false,
            src_rect: RECT { left: 0, top: 0, right: src_w as i32, bottom: src_h as i32 },
            color: DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
            display: (src_w, src_h),
            converter,
            _manager: manager,
        };
        d.read_output_type()?;
        unsafe {
            d.mft.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            d.mft.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
        }
        // Prove the whole chain once (decode, GPU texture, conversion)
        // so failures fall back to software here, not mid-playback.
        let first = d.next()?.ok_or_else(|| anyhow!("no video frames"))?;
        let mut scratch = vec![0u8; out_w as usize * out_h as usize * 4];
        d.convert_into(&first, &mut scratch)?;
        drop(first);
        d.seek(0.0)?;
        Ok(d)
    }

    fn set_output_size(&mut self, w: u32, h: u32) -> Result<()> {
        let device = unsafe { self.converter.context.GetDevice()? };
        let converter = Converter::new(&device, &self.converter.context, w, h)?;
        // Release the old processor and textures before the new ones are used.
        self.converter.proc = None;
        self.converter = converter;
        Ok(())
    }

    /// Picks NV12 (or P010 for 10-bit) and records aperture and colorimetry.
    fn read_output_type(&mut self) -> Result<()> {
        unsafe {
            let mut chosen = None;
            for i in 0..32 {
                let Ok(t) = self.mft.GetOutputAvailableType(0, i) else { break };
                let sub = t.GetGUID(&MF_MT_SUBTYPE)?;
                if sub == MFVideoFormat_NV12 || sub == MFVideoFormat_P010 {
                    chosen = Some(t);
                    break;
                }
            }
            let t = chosen.ok_or_else(|| anyhow!("the decoder offers no NV12 output"))?;
            self.mft.SetOutputType(0, &t, 0).context("decoder output type")?;
            let (fw, fh) = mf::unpack(t.GetUINT64(&MF_MT_FRAME_SIZE).unwrap_or(0));
            self.src_rect = aperture(&t).unwrap_or(RECT {
                left: 0,
                top: 0,
                right: fw.min(self.display.0.max(1)) as i32,
                bottom: fh.min(self.display.1.max(1)) as i32,
            });
            let matrix = t.GetUINT32(&MF_MT_YUV_MATRIX).unwrap_or(0);
            let full = t.GetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE).unwrap_or(0) == MFNominalRange_0_255.0 as u32;
            self.color = color_space(matrix, full, fh);
        }
        Ok(())
    }

    fn seek(&mut self, ms: f64) -> Result<()> {
        mf::seek(&self.reader, ms)?;
        unsafe { self.mft.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0)? };
        self.draining = false;
        Ok(())
    }

    fn next(&mut self) -> Result<Option<IMFSample>> {
        loop {
            match self.pull()? {
                Pull::Sample(s) => return Ok(Some(s)),
                Pull::StreamChange => {
                    self.read_output_type()?;
                    self.converter.reset();
                }
                Pull::NeedInput => {
                    if self.draining {
                        return Ok(None);
                    }
                    let r = mf::read(&self.reader, self.stream)?;
                    if let Some(s) = &r.sample {
                        unsafe { self.mft.ProcessInput(0, s, 0) }.context("decoder input")?;
                    }
                    if r.end_of_stream() {
                        unsafe { self.mft.ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0)? };
                        self.draining = true;
                    }
                }
            }
        }
    }

    fn pull(&mut self) -> Result<Pull> {
        // D3D-aware decoders allocate their own (texture) samples.
        let mut buffer = MFT_OUTPUT_DATA_BUFFER {
            dwStreamID: 0,
            pSample: ManuallyDrop::new(None),
            dwStatus: 0,
            pEvents: ManuallyDrop::new(None),
        };
        let mut status = 0u32;
        let result = unsafe { self.mft.ProcessOutput(0, std::slice::from_mut(&mut buffer), &mut status) };
        let sample = ManuallyDrop::into_inner(buffer.pSample);
        drop(ManuallyDrop::into_inner(buffer.pEvents));
        match result {
            Ok(()) => sample.map(Pull::Sample).ok_or_else(|| anyhow!("the decoder returned no frame")),
            Err(e) if e.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => Ok(Pull::NeedInput),
            Err(e) if e.code() == MF_E_TRANSFORM_STREAM_CHANGE => Ok(Pull::StreamChange),
            Err(e) => Err(anyhow!("video decode failed: {}", e.message())),
        }
    }

    fn convert_into(&mut self, sample: &IMFSample, out: &mut [u8]) -> Result<()> {
        unsafe {
            let buffer = sample.GetBufferByIndex(0)?;
            let dxgi: IMFDXGIBuffer = buffer.cast().context("decoder output is not a GPU texture")?;
            let mut raw = std::ptr::null_mut();
            dxgi.GetResource(&ID3D11Texture2D::IID, &mut raw)?;
            let tex = ID3D11Texture2D::from_raw(raw);
            let slice = dxgi.GetSubresourceIndex()?;
            self.converter.convert(&tex, slice, self.src_rect, self.color)?;
        }
        self.converter.read(out)
    }
}

impl Drop for HwDecoder {
    fn drop(&mut self) {
        unsafe {
            let _ = self.mft.ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
            // Make the decoder let go of the device (and its video decoder)
            // now rather than whenever it is finally released.
            let _ = self.mft.ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, 0);
            let _ = self.activate.ShutdownObject();
            // D3D11 destroys released objects lazily; flush so the driver's
            // decoder allocations go with this decoder.
            self.converter.proc = None;
            self.converter.context.ClearState();
            self.converter.context.Flush();
        }
    }
}

impl HwDecoder {
    #[doc(hidden)]
    pub fn device(&self) -> Option<ID3D11Device> {
        unsafe { self.converter.context.GetDevice().ok() }
    }
}

/// First decoder (system-sorted: hardware-friendly MS decoders first) that
/// accepts the D3D11 device and the stream's input type.
fn find_decoder(input: &IMFMediaType, manager: &IMFDXGIDeviceManager) -> Result<(IMFTransform, IMFActivate)> {
    let sub = unsafe { input.GetGUID(&MF_MT_SUBTYPE)? };
    let info = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: sub };
    let activates: Vec<IMFActivate> = unsafe {
        let mut list: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0u32;
        MFTEnumEx(
            MFT_CATEGORY_VIDEO_DECODER,
            MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_LOCALMFT | MFT_ENUM_FLAG_SORTANDFILTER,
            Some(&info),
            None,
            &mut list,
            &mut count,
        )?;
        // Take ownership of each element, then free the array itself.
        let v = (0..count as usize).filter_map(|i| std::ptr::read(list.add(i))).collect();
        CoTaskMemFree(Some(list as *const _));
        v
    };
    let mut last = anyhow!("no decoder for this video format");
    for activate in activates {
        let attempt = (|| -> Result<IMFTransform> {
            unsafe {
                let mft: IMFTransform = activate.ActivateObject()?;
                let attrs = mft.GetAttributes()?;
                if attrs.GetUINT32(&MF_SA_D3D11_AWARE).unwrap_or(0) == 0 {
                    bail!("decoder is not Direct3D 11 aware");
                }
                let _ = attrs.SetUINT32(&MF_LOW_LATENCY, 1);
                // Decoder-only textures: no system-memory backing (see top).
                let out = mft.GetOutputStreamAttributes(0)?;
                out.SetUINT32(&MF_SA_D3D11_BINDFLAGS, D3D11_BIND_DECODER.0 as u32)?;
                mft.ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, manager.as_raw() as usize)
                    .context("decoder rejected the D3D11 device")?;
                mft.SetInputType(0, input, 0).context("decoder input type")?;
                Ok(mft)
            }
        })();
        match attempt {
            Ok(mft) => return Ok((mft, activate)),
            Err(e) => {
                unsafe {
                    let _ = activate.ShutdownObject();
                }
                last = e;
            }
        }
    }
    Err(last)
}

/// MF_MT_MINIMUM_DISPLAY_APERTURE (MFVideoArea) as a pixel rect.
fn aperture(t: &IMFMediaType) -> Option<RECT> {
    let mut blob = [0u8; 16];
    let mut size = 0u32;
    unsafe { t.GetBlob(&MF_MT_MINIMUM_DISPLAY_APERTURE, &mut blob, Some(&mut size)) }.ok()?;
    if size < 16 {
        return None;
    }
    // MFOffset { fract: u16, value: i16 } x2, then SIZE { cx: i32, cy: i32 }.
    let x = i16::from_le_bytes([blob[2], blob[3]]) as i32;
    let y = i16::from_le_bytes([blob[6], blob[7]]) as i32;
    let w = i32::from_le_bytes(blob[8..12].try_into().ok()?);
    let h = i32::from_le_bytes(blob[12..16].try_into().ok()?);
    (w > 0 && h > 0).then_some(RECT { left: x, top: y, right: x + w, bottom: y + h })
}

/// Source colorimetry from the decoder's type. Unspecified matrix follows
/// the usual convention: BT.601 up to SD heights, BT.709 above.
fn color_space(matrix: u32, full_range: bool, height: u32) -> DXGI_COLOR_SPACE_TYPE {
    let m = if matrix == MFVideoTransferMatrix_BT709.0 as u32 {
        709
    } else if matrix == MFVideoTransferMatrix_BT601.0 as u32 || matrix == MFVideoTransferMatrix_SMPTE240M.0 as u32 {
        601
    } else if matrix == MFVideoTransferMatrix_BT2020_10.0 as u32 || matrix == MFVideoTransferMatrix_BT2020_12.0 as u32 {
        2020
    } else if height > 576 {
        709
    } else {
        601
    };
    match (m, full_range) {
        (601, false) => DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P601,
        (601, true) => DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P601,
        (2020, false) => DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P2020,
        (2020, true) => DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P2020,
        (_, true) => DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P709,
        _ => DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
    }
}

/// D3D11 video processor: decoder texture slice -> preview-sized RGBA.
///
/// The picture is scaled to exactly `out_w x out_h` (any size, odd included)
/// in the top-left of textures rounded up to even dimensions, and only that
/// area is read back.
struct Converter {
    context: ID3D11DeviceContext,
    vdev: ID3D11VideoDevice,
    vctx: ID3D11VideoContext1,
    out_w: u32,
    out_h: u32,
    tex_w: u32,
    tex_h: u32,
    target: ID3D11Texture2D,
    staging: ID3D11Texture2D,
    /// The target is RGBA (no CPU swizzle) when the processor supports it.
    rgba_target: bool,
    proc: Option<Processor>,
}

type ProcKey = (u32, u32, DXGI_FORMAT, [i32; 4], i32);

struct Processor {
    key: ProcKey,
    enumerator: ID3D11VideoProcessorEnumerator,
    vp: ID3D11VideoProcessor,
    out_view: ID3D11VideoProcessorOutputView,
    /// Input views per (texture, array slice); decoders reuse a fixed pool.
    views: Vec<(usize, u32, ID3D11VideoProcessorInputView)>,
}

const MAX_INPUT_VIEWS: usize = 48;

impl Converter {
    fn new(device: &ID3D11Device, context: &ID3D11DeviceContext, out_w: u32, out_h: u32) -> Result<Converter> {
        let vdev: ID3D11VideoDevice = device.cast().context("no D3D11 video device")?;
        let vctx: ID3D11VideoContext1 = context.cast().context("no D3D11 video context")?;
        let (tex_w, tex_h) = ((out_w + 1) & !1, (out_h + 1) & !1);
        // Probe output format support with a representative enumerator.
        let rgba_target = unsafe {
            let desc = content_desc(1920, 1080, tex_w, tex_h);
            vdev.CreateVideoProcessorEnumerator(&desc)
                .ok()
                .and_then(|en| en.CheckVideoProcessorFormat(DXGI_FORMAT_R8G8B8A8_UNORM).ok())
                .is_some_and(|flags| flags & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT.0 as u32 != 0)
        };
        let format = if rgba_target { DXGI_FORMAT_R8G8B8A8_UNORM } else { DXGI_FORMAT_B8G8R8A8_UNORM };
        let make = |usage: D3D11_USAGE, bind: u32, cpu: u32| -> Result<ID3D11Texture2D> {
            let desc = D3D11_TEXTURE2D_DESC {
                Width: tex_w,
                Height: tex_h,
                MipLevels: 1,
                ArraySize: 1,
                Format: format,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: usage,
                BindFlags: bind,
                CPUAccessFlags: cpu,
                MiscFlags: 0,
            };
            let mut t = None;
            unsafe { device.CreateTexture2D(&desc, None, Some(&mut t))? };
            t.ok_or_else(|| anyhow!("texture creation failed"))
        };
        let target = make(D3D11_USAGE_DEFAULT, D3D11_BIND_RENDER_TARGET.0 as u32, 0)?;
        let staging = make(D3D11_USAGE_STAGING, 0, D3D11_CPU_ACCESS_READ.0 as u32)?;
        Ok(Converter { context: context.clone(), vdev, vctx, out_w, out_h, tex_w, tex_h, target, staging, rgba_target, proc: None })
    }

    /// Drops the processor and cached views (decoder textures changed).
    fn reset(&mut self) {
        self.proc = None;
    }

    fn convert(&mut self, tex: &ID3D11Texture2D, slice: u32, src: RECT, color: DXGI_COLOR_SPACE_TYPE) -> Result<()> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { tex.GetDesc(&mut desc) };
        // Clamp the visible rect to the texture.
        let src = RECT {
            left: src.left.clamp(0, desc.Width as i32 - 1),
            top: src.top.clamp(0, desc.Height as i32 - 1),
            right: src.right.clamp(1, desc.Width as i32),
            bottom: src.bottom.clamp(1, desc.Height as i32),
        };
        let key = (desc.Width, desc.Height, desc.Format, [src.left, src.top, src.right, src.bottom], color.0);
        if self.proc.as_ref().is_none_or(|p| p.key != key) {
            self.proc = None;
            self.proc = Some(self.build(key, src, color)?);
        }
        let p = self.proc.as_mut().unwrap();
        let ptr = tex.as_raw() as usize;
        let view = match p.views.iter().find(|v| v.0 == ptr && v.1 == slice) {
            Some(v) => v.2.clone(),
            None => {
                if p.views.len() >= MAX_INPUT_VIEWS {
                    p.views.clear();
                }
                let vdesc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                    FourCC: 0,
                    ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                    Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                        Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: slice },
                    },
                };
                let mut v = None;
                unsafe { self.vdev.CreateVideoProcessorInputView(tex, &p.enumerator, &vdesc, Some(&mut v))? };
                let v = v.ok_or_else(|| anyhow!("no video processor input view"))?;
                p.views.push((ptr, slice, v.clone()));
                v
            }
        };
        let stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: true.into(),
            pInputSurface: ManuallyDrop::new(Some(view)),
            ..Default::default()
        };
        let streams = [stream];
        let result = unsafe { self.vctx.VideoProcessorBlt(&p.vp, &p.out_view, 0, &streams) };
        let [stream] = streams;
        drop(ManuallyDrop::into_inner(stream.pInputSurface));
        result.context("VideoProcessorBlt")
    }

    fn build(&self, key: ProcKey, src: RECT, color: DXGI_COLOR_SPACE_TYPE) -> Result<Processor> {
        unsafe {
            let desc = content_desc(key.0, key.1, self.tex_w, self.tex_h);
            let enumerator = self.vdev.CreateVideoProcessorEnumerator(&desc)?;
            let vp = self.vdev.CreateVideoProcessor(&enumerator, 0)?;
            let dst = RECT { left: 0, top: 0, right: self.out_w as i32, bottom: self.out_h as i32 };
            self.vctx.VideoProcessorSetStreamFrameFormat(&vp, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
            self.vctx.VideoProcessorSetStreamAutoProcessingMode(&vp, 0, false);
            self.vctx.VideoProcessorSetStreamSourceRect(&vp, 0, true, Some(&src));
            self.vctx.VideoProcessorSetStreamDestRect(&vp, 0, true, Some(&dst));
            self.vctx.VideoProcessorSetOutputTargetRect(&vp, true, Some(&dst));
            self.vctx.VideoProcessorSetStreamColorSpace1(&vp, 0, color);
            self.vctx.VideoProcessorSetOutputColorSpace1(&vp, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
            let odesc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
                ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
                Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 } },
            };
            let mut out_view = None;
            self.vdev.CreateVideoProcessorOutputView(&self.target, &enumerator, &odesc, Some(&mut out_view))?;
            let out_view = out_view.ok_or_else(|| anyhow!("no video processor output view"))?;
            Ok(Processor { key, enumerator, vp, out_view, views: Vec::new() })
        }
    }

    /// Copies the converted frame to the CPU as RGBA, alpha 255.
    fn read(&mut self, out: &mut [u8]) -> Result<()> {
        let (w, h) = (self.out_w as usize, self.out_h as usize);
        unsafe {
            self.context.CopyResource(&self.staging, &self.target);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            // Map waits for the GPU work above.
            self.context.Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).context("map preview frame")?;
            let base = mapped.pData as *const u8;
            let pitch = mapped.RowPitch as usize;
            for y in 0..h {
                let row = std::slice::from_raw_parts(base.add(y * pitch), w * 4);
                let dst = &mut out[y * w * 4..(y + 1) * w * 4];
                if self.rgba_target {
                    dst.copy_from_slice(row);
                    // The processor fills alpha opaque; enforce it anyway.
                    for px in dst.chunks_exact_mut(4) {
                        px[3] = 255;
                    }
                } else {
                    bgra_to_rgba(row, dst);
                }
            }
            self.context.Unmap(&self.staging, 0);
        }
        Ok(())
    }
}

fn content_desc(in_w: u32, in_h: u32, out_w: u32, out_h: u32) -> D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
    let rate = DXGI_RATIONAL { Numerator: 60, Denominator: 1 };
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
        InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
        InputFrameRate: rate,
        InputWidth: in_w,
        InputHeight: in_h,
        OutputFrameRate: rate,
        OutputWidth: out_w,
        OutputHeight: out_h,
        Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
    }
}

fn create_device() -> Result<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_VIDEO_SUPPORT | D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1]),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .context("no Direct3D 11 video device")?;
    }
    let device = device.ok_or_else(|| anyhow!("no Direct3D 11 device"))?;
    let context = context.ok_or_else(|| anyhow!("no Direct3D 11 context"))?;
    // The decoder MFT uses the device internally.
    if let Ok(mt) = device.cast::<ID3D11Multithread>() {
        unsafe {
            let _ = mt.SetMultithreadProtected(true);
        }
    }
    Ok((device, context))
}

// --------------------------------------------------------------- software

struct SwDecoder {
    reader: IMFSourceReader,
    stream: u32,
    width: u32,
    height: u32,
}

impl SwDecoder {
    fn open(path: &Path, w: u32, h: u32) -> Result<SwDecoder> {
        let attrs = mf::attributes(3)?;
        unsafe {
            attrs.SetUINT32(&MF_SOURCE_READER_DISABLE_DXVA, 1)?;
            attrs.SetUINT32(&MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING, 1)?;
            attrs.SetUINT32(&MF_LOW_LATENCY, 1)?;
        }
        let reader = mf::open_reader(path, Some(&attrs))?;
        let stream = mf::streams(&reader)
            .iter()
            .find(|s| s.major == Major::Video)
            .map(|s| s.index)
            .ok_or_else(|| anyhow!("the file has no video"))?;
        unsafe {
            reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)?;
            reader.SetStreamSelection(stream, true)?;
        }
        let mut d = SwDecoder { reader, stream, width: w, height: h };
        d.set_output_size(w, h)?;
        Ok(d)
    }

    fn set_output_size(&mut self, w: u32, h: u32) -> Result<()> {
        unsafe {
            let t = MFCreateMediaType()?;
            t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            t.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)?;
            t.SetUINT64(&MF_MT_FRAME_SIZE, mf::pack(w, h))?;
            t.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, mf::pack(1, 1))?;
            t.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            self.reader.SetCurrentMediaType(self.stream, None, &t).map_err(|e| {
                if e.code() == MF_E_TOPO_CODEC_NOT_FOUND || e.code() == MF_E_INVALIDMEDIATYPE {
                    anyhow!("this PC has no decoder for the file's video format")
                } else {
                    anyhow!("couldn't set up video decoding: {}", e.message())
                }
            })?;
        }
        self.refresh_size()
    }

    fn refresh_size(&mut self) -> Result<()> {
        let t = unsafe { self.reader.GetCurrentMediaType(self.stream)? };
        let (w, h) = mf::unpack(unsafe { t.GetUINT64(&MF_MT_FRAME_SIZE)? });
        if w == 0 || h == 0 {
            bail!("the video has no frame size");
        }
        (self.width, self.height) = (w, h);
        Ok(())
    }

    fn next(&mut self) -> Result<Option<IMFSample>> {
        loop {
            let r = mf::read(&self.reader, self.stream)?;
            if r.type_changed() {
                self.refresh_size()?;
            }
            if let Some(sample) = r.sample {
                return Ok(Some(sample));
            }
            if r.end_of_stream() {
                return Ok(None);
            }
        }
    }

    fn convert_into(&self, sample: &IMFSample, out: &mut [u8]) -> Result<()> {
        let (w, h) = (self.width as usize, self.height as usize);
        unsafe {
            let buffer = sample.GetBufferByIndex(0)?;
            if let Ok(b2) = buffer.cast::<IMF2DBuffer>() {
                let mut scan0 = std::ptr::null_mut();
                let mut pitch = 0i32;
                b2.Lock2D(&mut scan0, &mut pitch).context("read frame")?;
                if !scan0.is_null() {
                    for y in 0..h {
                        // Negative pitch = bottom-up; scan0 is still the top row.
                        let row = std::slice::from_raw_parts(scan0.offset(y as isize * pitch as isize), w * 4);
                        bgra_to_rgba(row, &mut out[y * w * 4..(y + 1) * w * 4]);
                    }
                }
                let _ = b2.Unlock2D();
            } else {
                let mut ptr = std::ptr::null_mut();
                let mut len = 0u32;
                buffer.Lock(&mut ptr, None, Some(&mut len))?;
                if !ptr.is_null() && len as usize >= w * h * 4 {
                    bgra_to_rgba(std::slice::from_raw_parts(ptr, w * h * 4), out);
                }
                let _ = buffer.Unlock();
            }
        }
        Ok(())
    }
}

/// BGRX -> RGBA with opaque alpha.
pub fn bgra_to_rgba(src: &[u8], dst: &mut [u8]) {
    for (s, d) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
        d[0] = s[2];
        d[1] = s[1];
        d[2] = s[0];
        d[3] = 255;
    }
}

/// Diagnostics: private-bytes checkpoints through decoder setup and decode.
#[doc(hidden)]
pub fn debug_mem_steps(path: &Path, mark: &mut dyn FnMut(&str)) -> Result<()> {
    mf::init_thread();
    mark("mf init");
    let info = crate::probe(path)?;
    // Repeated open/close shows whether anything accumulates.
    for round in 0..4 {
        let (w, h) = fit(info.width, info.height, 960, 540);
        let mut dec = VideoDecoder::open(path, info.width, info.height, info.fps, w, h)?;
        mark(&format!("round {round}: decoder open (hardware {})", dec.hardware));
        for _ in 0..120 {
            let Some(d) = dec.next()? else { break };
            let _ = dec.render(&d, None)?;
        }
        mark(&format!("round {round}: 120 frames"));
        let device = match &dec.backend {
            Backend::Hw(h) => h.device(),
            Backend::Sw(_) => None,
        };
        drop(dec);
        let refs = device.as_ref().map(|d| unsafe {
            let raw = d.as_raw();
            let vt = d.vtable();
            (vt.base__.AddRef)(raw);
            (vt.base__.Release)(raw) - 1
        });
        drop(device);
        mark(&format!("round {round}: decoder dropped (other device refs: {refs:?})"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_preserves_aspect_and_never_upscales() {
        assert_eq!(fit(3840, 2160, 960, 540), (960, 540));
        assert_eq!(fit(2560, 1440, 960, 960), (960, 540));
        assert_eq!(fit(1280, 720, 1920, 1080), (1280, 720));
        // Portrait source in a landscape box.
        assert_eq!(fit(1080, 1920, 960, 540), (304, 540));
        assert_eq!(fit(0, 0, 960, 540), (2, 2));
    }

    #[test]
    fn swizzle_sets_opaque_alpha() {
        let mut out = [0u8; 8];
        bgra_to_rgba(&[1, 2, 3, 0, 4, 5, 6, 7], &mut out);
        assert_eq!(out, [3, 2, 1, 255, 6, 5, 4, 255]);
    }

    #[test]
    fn colorimetry_defaults_follow_frame_height() {
        assert_eq!(color_space(0, false, 2160), DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
        assert_eq!(color_space(0, false, 480), DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P601);
        assert_eq!(color_space(MFVideoTransferMatrix_BT601.0 as u32, true, 1080), DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P601);
    }
}
