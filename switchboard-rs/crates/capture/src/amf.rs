use std::collections::VecDeque;
use std::ffi::c_void;
use std::mem::{offset_of, size_of};
use std::ptr::null_mut;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::{Result, anyhow, bail};
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};
use windows::Win32::Media::MediaFoundation::{IMFAsyncCallback, IMFDXGIBuffer, IMFSample, IMFTrackedSample};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW};
use windows::core::{GUID, Interface, PCWSTR, s, w};

use crate::clock::{HNS_PER_SECOND, now_hns};
use crate::gpu::Gpu;
use crate::video::VideoCodec;

const AMF_OK: i32 = 0;
const AMF_EOF: i32 = 23;
const AMF_REPEAT: i32 = 24;
const AMF_INPUT_FULL: i32 = 25;

const AMF_DX11_0: i32 = 110;
const AMF_SURFACE_NV12: i32 = 1;

const VARIANT_BOOL: i32 = 1;
const VARIANT_INT64: i32 = 2;
const VARIANT_SIZE: i32 = 5;
const VARIANT_RATE: i32 = 7;

const USAGE_LOW_LATENCY: i64 = 2;
const PROFILE_HIGH: i64 = 100;
const RATE_CONTROL_PEAK_CONSTRAINED_VBR: i64 = 2;
const QUALITY_PRESET_BALANCED: i64 = 0;
const OUTPUT_DATA_TYPE_IDR: i64 = 0;
const PICTURE_TYPE_IDR: i64 = 2;
const BT709: i64 = 1;

const LEVELS: [(i64, u64, u64); 7] = [
    (42, 8_704, 522_240),
    (50, 22_080, 589_824),
    (51, 36_864, 983_040),
    (52, 36_864, 2_073_600),
    (60, 139_264, 4_177_920),
    (61, 139_264, 8_355_840),
    (62, 139_264, 16_711_680),
];

fn h264_level(w: u32, h: u32, fps: u32) -> i64 {
    let macroblocks = w.div_ceil(16) as u64 * h.div_ceil(16) as u64;
    let rate = macroblocks * fps as u64;
    LEVELS.iter().find(|(_, frame, second)| macroblocks <= *frame && rate <= *second).map_or(62, |l| l.0)
}

const SDK_VERSION: u64 = 1 << 48 | 5 << 32 | 3 << 16;
const OLDEST_RUNTIME: u64 = 1 << 48 | 4 << 32;

const IID_AMF_BUFFER: GUID = GUID::from_values(0xb04b7248, 0xb6f0, 0x4321, [0xb6, 0x91, 0xba, 0xa4, 0x74, 0x0f, 0x9f, 0xcb]);

pub(crate) const AMD_VENDOR_ID: u32 = 0x1002;

#[repr(C)]
#[derive(Clone, Copy)]
struct Variant {
    kind: i32,
    value: [u64; 2],
}

impl Variant {
    fn int(v: i64) -> Variant {
        Variant { kind: VARIANT_INT64, value: [v as u64, 0] }
    }
    fn bool(v: bool) -> Variant {
        Variant { kind: VARIANT_BOOL, value: [v as u64, 0] }
    }
    fn pair(kind: i32, a: u32, b: u32) -> Variant {
        Variant { kind, value: [a as u64 | (b as u64) << 32, 0] }
    }
    fn empty() -> Variant {
        Variant { kind: 0, value: [0, 0] }
    }
}

type Fn0 = unsafe extern "system" fn(*mut c_void) -> i32;

#[repr(C)]
struct Base {
    acquire: Fn0,
    release: Fn0,
    query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
}

#[repr(C)]
struct FactoryVtbl {
    create_context: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32,
    create_component: unsafe extern "system" fn(*mut c_void, *mut c_void, *const u16, *mut *mut c_void) -> i32,
}

#[repr(C)]
struct ContextVtbl {
    base: Base,
    _properties: [usize; 10],
    terminate: Fn0,
    _dx9: [usize; 4],
    init_dx11: unsafe extern "system" fn(*mut c_void, *mut c_void, i32) -> i32,
    _between: [usize; 30],
    create_surface_from_dx11_native: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut *mut c_void, *mut c_void) -> i32,
}

#[repr(C)]
struct ComponentVtbl {
    base: Base,
    set_property: unsafe extern "system" fn(*mut c_void, *const u16, Variant) -> i32,
    _get_property: usize,
    _properties: [usize; 8],
    _properties_ex: [usize; 4],
    init: unsafe extern "system" fn(*mut c_void, i32, i32, i32) -> i32,
    _reinit: usize,
    terminate: Fn0,
    _drain: usize,
    _flush: usize,
    submit_input: unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32,
    query_output: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32,
}

#[repr(C)]
struct DataVtbl {
    base: Base,
    set_property: unsafe extern "system" fn(*mut c_void, *const u16, Variant) -> i32,
    get_property: unsafe extern "system" fn(*mut c_void, *const u16, *mut Variant) -> i32,
    _properties: [usize; 8],
    _data: [usize; 6],
    set_pts: unsafe extern "system" fn(*mut c_void, i64),
    get_pts: unsafe extern "system" fn(*mut c_void) -> i64,
    set_duration: unsafe extern "system" fn(*mut c_void, i64),
    _get_duration: usize,
    _set_size: usize,
    get_size: unsafe extern "system" fn(*mut c_void) -> usize,
    get_native: unsafe extern "system" fn(*mut c_void) -> *mut c_void,
}

const SLOT: usize = size_of::<usize>();
const _: () = {
    assert!(size_of::<Variant>() == 24);
    assert!(offset_of!(ContextVtbl, terminate) == 13 * SLOT);
    assert!(offset_of!(ContextVtbl, init_dx11) == 18 * SLOT);
    assert!(offset_of!(ContextVtbl, create_surface_from_dx11_native) == 49 * SLOT);
    assert!(offset_of!(ComponentVtbl, init) == 17 * SLOT);
    assert!(offset_of!(ComponentVtbl, terminate) == 19 * SLOT);
    assert!(offset_of!(ComponentVtbl, submit_input) == 22 * SLOT);
    assert!(offset_of!(ComponentVtbl, query_output) == 23 * SLOT);
    assert!(offset_of!(DataVtbl, set_property) == 3 * SLOT);
    assert!(offset_of!(DataVtbl, get_property) == 4 * SLOT);
    assert!(offset_of!(DataVtbl, set_pts) == 19 * SLOT);
    assert!(offset_of!(DataVtbl, set_duration) == 21 * SLOT);
    assert!(offset_of!(DataVtbl, get_size) == 24 * SLOT);
    assert!(offset_of!(DataVtbl, get_native) == 25 * SLOT);
};

unsafe fn vtbl<'a, T>(object: *mut c_void) -> &'a T {
    unsafe { &**(object as *const *const T) }
}

unsafe fn release(object: *mut c_void) {
    if !object.is_null() {
        unsafe { (vtbl::<Base>(object).release)(object) };
    }
}

struct Factory(*mut c_void);
unsafe impl Send for Factory {}
unsafe impl Sync for Factory {}

fn factory() -> Result<*mut c_void> {
    static FACTORY: Mutex<Option<Factory>> = Mutex::new(None);
    let mut slot = FACTORY.lock().unwrap();
    if let Some(f) = slot.as_ref() {
        return Ok(f.0);
    }
    let loaded: std::result::Result<Factory, String> = (|| unsafe {
        let module = LoadLibraryExW(w!("amfrt64.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32)
            .map_err(|e| format!("AMD's encoder runtime is not installed ({e})"))?;
        let query = GetProcAddress(module, s!("AMFQueryVersion")).ok_or("amfrt64.dll has no AMFQueryVersion")?;
        let init = GetProcAddress(module, s!("AMFInit")).ok_or("amfrt64.dll has no AMFInit")?;
        let query: unsafe extern "C" fn(*mut u64) -> i32 = std::mem::transmute(query);
        let init: unsafe extern "C" fn(u64, *mut *mut c_void) -> i32 = std::mem::transmute(init);
        let mut runtime = 0u64;
        if query(&mut runtime) != AMF_OK {
            return Err("AMF did not report its version".into());
        }
        if runtime < OLDEST_RUNTIME {
            return Err(format!("AMF {}.{} is too old", runtime >> 48, (runtime >> 32) & 0xffff));
        }
        let mut factory = null_mut();
        let r = init(runtime.min(SDK_VERSION), &mut factory);
        if r != AMF_OK || factory.is_null() {
            return Err(format!("AMFInit failed ({r})"));
        }
        Ok(Factory(factory))
    })();
    let factory = loaded.map_err(|e| anyhow!("{e}"))?;
    let raw = factory.0;
    *slot = Some(factory);
    Ok(raw)
}

const HEVC_PROFILE_MAIN: i64 = 1;
const HEVC_HEADERS_ON_IDR: i64 = 2;
const HEVC_QUALITY_BALANCED: i64 = 5;
const HEVC_STUDIO_RANGE: i64 = 0;
const AV1_USAGE_LOW_LATENCY: i64 = 1;
const AV1_PROFILE_MAIN: i64 = 1;
const AV1_ALIGNMENT_NO_RESTRICTIONS: i64 = 3;
const AV1_LATENCY_REAL_TIME: i64 = 2;
const AV1_HEADERS_ON_KEY_FRAMES: i64 = 2;
const AV1_QUALITY_BALANCED: i64 = 70;
const AV1_FRAME_TYPE_KEY: i64 = 1;
const AV1_OUTPUT_FRAME_TYPE_KEY: i64 = 0;

struct Names {
    component: PCWSTR,
    force_key: (PCWSTR, i64),
    insert_headers: Vec<PCWSTR>,
    output_type: PCWSTR,
    output_key: i64,
}

fn names(codec: VideoCodec) -> Names {
    match codec {
        VideoCodec::H264 => Names {
            component: w!("AMFVideoEncoderVCE_AVC"),
            force_key: (w!("ForcePictureType"), PICTURE_TYPE_IDR),
            insert_headers: vec![w!("InsertSPS"), w!("InsertPPS")],
            output_type: w!("OutputDataType"),
            output_key: OUTPUT_DATA_TYPE_IDR,
        },
        VideoCodec::Hevc => Names {
            component: w!("AMFVideoEncoderHW_HEVC"),
            force_key: (w!("HevcForcePictureType"), PICTURE_TYPE_IDR),
            insert_headers: vec![w!("HevcInsertHeader")],
            output_type: w!("HevcOutputDataType"),
            output_key: OUTPUT_DATA_TYPE_IDR,
        },
        VideoCodec::Av1 => Names {
            component: w!("AMFVideoEncoderHW_AV1"),
            force_key: (w!("Av1ForceFrameType"), AV1_FRAME_TYPE_KEY),
            insert_headers: vec![w!("Av1ForceInsertSequenceHeader")],
            output_type: w!("Av1OutputFrameType"),
            output_key: AV1_OUTPUT_FRAME_TYPE_KEY,
        },
    }
}

pub(crate) fn supports(gpu: &Gpu, codec: VideoCodec) -> bool {
    if gpu.vendor_id != AMD_VENDOR_ID {
        return false;
    }
    let Ok(factory) = factory() else { return false };
    unsafe {
        let f = vtbl::<FactoryVtbl>(factory);
        let mut context = null_mut();
        if (f.create_context)(factory, &mut context) != AMF_OK {
            return false;
        }
        let c = vtbl::<ContextVtbl>(context);
        let mut component = null_mut();
        let ok = (c.init_dx11)(context, gpu.device.as_raw(), AMF_DX11_0) == AMF_OK
            && (f.create_component)(factory, context, names(codec).component.as_ptr(), &mut component) == AMF_OK;
        if !component.is_null() {
            (vtbl::<ComponentVtbl>(component).terminate)(component);
            release(component);
        }
        (c.terminate)(context);
        release(context);
        ok
    }
}

const UNRESPONSIVE_HNS: i64 = HNS_PER_SECOND;
const ABANDON_LIMIT: u32 = 2;
static ABANDONED: AtomicU32 = AtomicU32::new(0);

pub(crate) struct AmfEncoder {
    context: *mut c_void,
    component: *mut c_void,
    device: ID3D11Device,
    names: Names,
    held: VecDeque<(i64, IMFSample)>,
    full: bool,
    keyframe_interval: u64,
    submitted: u64,
    failed: Option<i32>,
    progress_hns: i64,
    pub name: String,
}

impl AmfEncoder {
    pub fn new(gpu: &Gpu, codec: VideoCodec, w: u32, h: u32, fps: u32, bitrate: u32) -> Result<AmfEncoder> {
        if gpu.vendor_id != AMD_VENDOR_ID {
            bail!("{} is not an AMD graphics card", gpu.adapter_name);
        }
        if ABANDONED.load(Ordering::Relaxed) >= ABANDON_LIMIT {
            bail!("AMD's video encoder stopped working {ABANDON_LIMIT} times; restart Switchboard to record again");
        }
        let factory = factory()?;
        let mut enc = AmfEncoder {
            context: null_mut(),
            component: null_mut(),
            device: gpu.device.clone(),
            names: names(codec),
            held: VecDeque::new(),
            full: false,
            keyframe_interval: fps.max(1) as u64,
            submitted: 0,
            failed: None,
            progress_hns: now_hns(),
            name: format!("AMD AMF {}", codec.label()),
        };
        unsafe {
            let f = vtbl::<FactoryVtbl>(factory);
            check((f.create_context)(factory, &mut enc.context), "CreateContext")?;
            let c = vtbl::<ContextVtbl>(enc.context);
            check((c.init_dx11)(enc.context, gpu.device.as_raw(), AMF_DX11_0), "InitDX11")?;
            check((f.create_component)(factory, enc.context, enc.names.component.as_ptr(), &mut enc.component), "CreateComponent")?;
        }
        let (target, peak) = (bitrate as i64, bitrate as i64 / 2 * 3);
        match codec {
            VideoCodec::H264 => {
                enc.set(w!("Usage"), Variant::int(USAGE_LOW_LATENCY))?;
                enc.set(w!("Profile"), Variant::int(PROFILE_HIGH))?;
                let _ = enc.set(w!("ProfileLevel"), Variant::int(h264_level(w, h, fps)));
                enc.set(w!("FrameSize"), Variant::pair(VARIANT_SIZE, w, h))?;
                enc.set(w!("FrameRate"), Variant::pair(VARIANT_RATE, fps, 1))?;
                enc.set(w!("RateControlMethod"), Variant::int(RATE_CONTROL_PEAK_CONSTRAINED_VBR))?;
                enc.set(w!("TargetBitrate"), Variant::int(target))?;
                enc.set(w!("PeakBitrate"), Variant::int(peak))?;
                enc.set(w!("BPicturesPattern"), Variant::int(0))?;
                let _ = enc.set(w!("QualityPreset"), Variant::int(QUALITY_PRESET_BALANCED));
                let _ = enc.set(w!("OutColorProfile"), Variant::int(BT709));
                let _ = enc.set(w!("OutColorTransferChar"), Variant::int(BT709));
                let _ = enc.set(w!("OutColorPrimaries"), Variant::int(BT709));
                let _ = enc.set(w!("FullRangeColor"), Variant::bool(false));
            }
            VideoCodec::Hevc => {
                enc.set(w!("HevcUsage"), Variant::int(USAGE_LOW_LATENCY))?;
                let _ = enc.set(w!("HevcProfile"), Variant::int(HEVC_PROFILE_MAIN));
                enc.set(w!("HevcFrameSize"), Variant::pair(VARIANT_SIZE, w, h))?;
                enc.set(w!("HevcFrameRate"), Variant::pair(VARIANT_RATE, fps, 1))?;
                enc.set(w!("HevcRateControlMethod"), Variant::int(RATE_CONTROL_PEAK_CONSTRAINED_VBR))?;
                enc.set(w!("HevcTargetBitrate"), Variant::int(target))?;
                enc.set(w!("HevcPeakBitrate"), Variant::int(peak))?;
                let _ = enc.set(w!("HevcGOPSize"), Variant::int(fps as i64));
                let _ = enc.set(w!("HevcHeaderInsertionMode"), Variant::int(HEVC_HEADERS_ON_IDR));
                let _ = enc.set(w!("HevcQualityPreset"), Variant::int(HEVC_QUALITY_BALANCED));
                let _ = enc.set(w!("HevcOutColorProfile"), Variant::int(BT709));
                let _ = enc.set(w!("HevcOutColorTransferChar"), Variant::int(BT709));
                let _ = enc.set(w!("HevcOutColorPrimaries"), Variant::int(BT709));
                let _ = enc.set(w!("HevcNominalRange"), Variant::int(HEVC_STUDIO_RANGE));
            }
            VideoCodec::Av1 => {
                enc.set(w!("Av1Usage"), Variant::int(AV1_USAGE_LOW_LATENCY))?;
                let _ = enc.set(w!("Av1Profile"), Variant::int(AV1_PROFILE_MAIN));
                let _ = enc.set(w!("Av1AlignmentMode"), Variant::int(AV1_ALIGNMENT_NO_RESTRICTIONS));
                enc.set(w!("Av1FrameSize"), Variant::pair(VARIANT_SIZE, w, h))?;
                enc.set(w!("Av1FrameRate"), Variant::pair(VARIANT_RATE, fps, 1))?;
                let _ = enc.set(w!("Av1EncodingLatencyMode"), Variant::int(AV1_LATENCY_REAL_TIME));
                enc.set(w!("Av1RateControlMethod"), Variant::int(RATE_CONTROL_PEAK_CONSTRAINED_VBR))?;
                enc.set(w!("Av1TargetBitrate"), Variant::int(target))?;
                enc.set(w!("Av1PeakBitrate"), Variant::int(peak))?;
                let _ = enc.set(w!("Av1GOPSize"), Variant::int(fps as i64));
                let _ = enc.set(w!("Av1HeaderInsertionMode"), Variant::int(AV1_HEADERS_ON_KEY_FRAMES));
                let _ = enc.set(w!("Av1QualityPreset"), Variant::int(AV1_QUALITY_BALANCED));
                let _ = enc.set(w!("Av1OutputColorProfile"), Variant::int(BT709));
                let _ = enc.set(w!("Av1OutputColorTransferChar"), Variant::int(BT709));
                let _ = enc.set(w!("Av1OutputColorPrimaries"), Variant::int(BT709));
                let _ = enc.set(w!("Av1NominalRange"), Variant::bool(false));
            }
        }
        unsafe {
            let e = vtbl::<ComponentVtbl>(enc.component);
            check((e.init)(enc.component, AMF_SURFACE_NV12, w as i32, h as i32), "encoder Init")?;
        }
        Ok(enc)
    }

    fn set(&self, name: PCWSTR, value: Variant) -> Result<()> {
        let r = unsafe { (vtbl::<ComponentVtbl>(self.component).set_property)(self.component, name.as_ptr(), value) };
        check(r, "SetProperty")
    }

    pub fn ready(&self) -> bool {
        !self.full
    }

    pub fn submit(&mut self, sample: IMFSample, time: i64, duration: i64, returned: &IMFAsyncCallback) -> Result<bool> {
        unsafe {
            sample.cast::<IMFTrackedSample>()?.SetAllocator(returned, None)?;
            let buffer: IMFDXGIBuffer = sample.GetBufferByIndex(0)?.cast()?;
            let mut texture = null_mut();
            buffer.GetResource(&ID3D11Texture2D::IID, &mut texture)?;
            let texture = ID3D11Texture2D::from_raw(texture);
            let mut surface = null_mut();
            let c = vtbl::<ContextVtbl>(self.context);
            check(
                (c.create_surface_from_dx11_native)(self.context, texture.as_raw(), &mut surface, null_mut()),
                "CreateSurfaceFromDX11Native",
            )?;
            let d = vtbl::<DataVtbl>(surface);
            (d.set_pts)(surface, time);
            (d.set_duration)(surface, duration);
            (d.set_property)(surface, w!("SwitchboardTime").as_ptr(), Variant::int(time));
            if self.submitted % self.keyframe_interval == 0 {
                let (force, kind) = self.names.force_key;
                (d.set_property)(surface, force.as_ptr(), Variant::int(kind));
                for name in &self.names.insert_headers {
                    (d.set_property)(surface, name.as_ptr(), Variant::bool(true));
                }
            }
            let r = (vtbl::<ComponentVtbl>(self.component).submit_input)(self.component, surface);
            release(surface);
            match r {
                AMF_OK => {
                    if self.held.is_empty() {
                        self.progress_hns = now_hns();
                    }
                    self.submitted += 1;
                    self.held.push_back((time, sample));
                    Ok(true)
                }
                AMF_INPUT_FULL => {
                    self.full = true;
                    Ok(false)
                }
                r => {
                    self.failed = Some(r);
                    bail!("AMF SubmitInput failed ({r})")
                }
            }
        }
    }

    pub fn pump(&mut self, sink: &mut impl FnMut(i64, bool, &[u8]) -> Result<()>) -> Result<()> {
        loop {
            let mut data = null_mut();
            let r = unsafe { (vtbl::<ComponentVtbl>(self.component).query_output)(self.component, &mut data) };
            if data.is_null() {
                return match r {
                    AMF_OK | AMF_REPEAT | AMF_EOF => Ok(()),
                    r => {
                        self.failed = Some(r);
                        Err(anyhow!("AMF QueryOutput failed ({r})"))
                    }
                };
            }
            let result = unsafe { self.deliver(data, sink) };
            unsafe { release(data) };
            result?;
        }
    }

    unsafe fn deliver(&mut self, data: *mut c_void, sink: &mut impl FnMut(i64, bool, &[u8]) -> Result<()>) -> Result<()> {
        unsafe {
            let mut buffer = null_mut();
            check((vtbl::<Base>(data).query_interface)(data, &IID_AMF_BUFFER, &mut buffer), "QueryInterface(AMFBuffer)")?;
            if buffer.is_null() {
                bail!("AMF returned output that is not a buffer");
            }
            let b = vtbl::<DataVtbl>(buffer);
            let int = |name: PCWSTR| {
                let mut v = Variant::empty();
                ((b.get_property)(buffer, name.as_ptr(), &mut v) == AMF_OK && v.kind == VARIANT_INT64).then_some(v.value[0] as i64)
            };
            let time = int(w!("SwitchboardTime")).unwrap_or_else(|| (b.get_pts)(buffer));
            let key = int(self.names.output_type) == Some(self.names.output_key);
            let (native, size) = ((b.get_native)(buffer) as *const u8, (b.get_size)(buffer));
            let result = if native.is_null() || size == 0 { Ok(()) } else { sink(time, key, std::slice::from_raw_parts(native, size)) };
            release(buffer);
            while self.held.front().is_some_and(|(t, _)| *t <= time) {
                self.held.pop_front();
            }
            self.full = false;
            self.progress_hns = now_hns();
            result
        }
    }

    fn broken(&self) -> Option<String> {
        if let Some(r) = self.failed {
            return Some(format!("it reported error {r}"));
        }
        if let Err(e) = unsafe { self.device.GetDeviceRemovedReason() } {
            return Some(format!("the graphics device was lost ({:#010x})", e.code().0));
        }
        let quiet = now_hns() - self.progress_hns;
        (!self.held.is_empty() && quiet > UNRESPONSIVE_HNS)
            .then(|| format!("it held {} frames without output for {} ms", self.held.len(), quiet / 10_000))
    }
}

impl Drop for AmfEncoder {
    fn drop(&mut self) {
        if let Some(why) = self.broken() {
            switchboard_log::log!("video: {} stopped working ({why}); leaving it to the driver instead of shutting it down", self.name);
            std::mem::forget(std::mem::take(&mut self.held));
            ABANDONED.fetch_add(1, Ordering::Relaxed);
            return;
        }
        unsafe {
            if !self.component.is_null() {
                (vtbl::<ComponentVtbl>(self.component).terminate)(self.component);
                release(self.component);
            }
            self.held.clear();
            if !self.context.is_null() {
                (vtbl::<ContextVtbl>(self.context).terminate)(self.context);
                release(self.context);
            }
        }
    }
}

fn check(r: i32, what: &str) -> Result<()> {
    if r == AMF_OK { Ok(()) } else { Err(anyhow!("AMF {what} failed ({r})")) }
}
