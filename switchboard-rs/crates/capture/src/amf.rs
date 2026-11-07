use std::collections::VecDeque;
use std::ffi::c_void;
use std::mem::{offset_of, size_of};
use std::ptr::null_mut;
use std::sync::Mutex;

use anyhow::{Result, anyhow, bail};
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Media::MediaFoundation::{IMFAsyncCallback, IMFDXGIBuffer, IMFSample, IMFTrackedSample};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW};
use windows::core::{GUID, Interface, PCWSTR, s, w};

use crate::gpu::Gpu;

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

pub(crate) struct AmfEncoder {
    context: *mut c_void,
    component: *mut c_void,
    held: VecDeque<(i64, IMFSample)>,
    full: bool,
    keyframe_interval: u64,
    submitted: u64,
    pub name: String,
}

impl AmfEncoder {
    pub fn new(gpu: &Gpu, w: u32, h: u32, fps: u32, bitrate: u32) -> Result<AmfEncoder> {
        if gpu.vendor_id != AMD_VENDOR_ID {
            bail!("{} is not an AMD graphics card", gpu.adapter_name);
        }
        let factory = factory()?;
        let mut enc = AmfEncoder {
            context: null_mut(),
            component: null_mut(),
            held: VecDeque::new(),
            full: false,
            keyframe_interval: fps.max(1) as u64,
            submitted: 0,
            name: "AMD AMF H.264".into(),
        };
        unsafe {
            let f = vtbl::<FactoryVtbl>(factory);
            check((f.create_context)(factory, &mut enc.context), "CreateContext")?;
            let c = vtbl::<ContextVtbl>(enc.context);
            check((c.init_dx11)(enc.context, gpu.device.as_raw(), AMF_DX11_0), "InitDX11")?;
            let id = w!("AMFVideoEncoderVCE_AVC");
            check((f.create_component)(factory, enc.context, id.as_ptr(), &mut enc.component), "CreateComponent")?;
        }
        enc.set(w!("Usage"), Variant::int(USAGE_LOW_LATENCY))?;
        enc.set(w!("Profile"), Variant::int(PROFILE_HIGH))?;
        let _ = enc.set(w!("ProfileLevel"), Variant::int(h264_level(w, h, fps)));
        enc.set(w!("FrameSize"), Variant::pair(VARIANT_SIZE, w, h))?;
        enc.set(w!("FrameRate"), Variant::pair(VARIANT_RATE, fps, 1))?;
        enc.set(w!("RateControlMethod"), Variant::int(RATE_CONTROL_PEAK_CONSTRAINED_VBR))?;
        enc.set(w!("TargetBitrate"), Variant::int(bitrate as i64))?;
        enc.set(w!("PeakBitrate"), Variant::int(bitrate as i64 / 2 * 3))?;
        enc.set(w!("BPicturesPattern"), Variant::int(0))?;
        let _ = enc.set(w!("QualityPreset"), Variant::int(QUALITY_PRESET_BALANCED));
        let _ = enc.set(w!("OutColorProfile"), Variant::int(BT709));
        let _ = enc.set(w!("OutColorTransferChar"), Variant::int(BT709));
        let _ = enc.set(w!("OutColorPrimaries"), Variant::int(BT709));
        let _ = enc.set(w!("FullRangeColor"), Variant::bool(false));
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
                for (name, value) in [
                    (w!("ForcePictureType"), Variant::int(PICTURE_TYPE_IDR)),
                    (w!("InsertSPS"), Variant::bool(true)),
                    (w!("InsertPPS"), Variant::bool(true)),
                ] {
                    (d.set_property)(surface, name.as_ptr(), value);
                }
            }
            let r = (vtbl::<ComponentVtbl>(self.component).submit_input)(self.component, surface);
            release(surface);
            match r {
                AMF_OK => {
                    self.submitted += 1;
                    self.held.push_back((time, sample));
                    Ok(true)
                }
                AMF_INPUT_FULL => {
                    self.full = true;
                    Ok(false)
                }
                r => bail!("AMF SubmitInput failed ({r})"),
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
                    r => Err(anyhow!("AMF QueryOutput failed ({r})")),
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
            let key = int(w!("OutputDataType")) == Some(OUTPUT_DATA_TYPE_IDR);
            let (native, size) = ((b.get_native)(buffer) as *const u8, (b.get_size)(buffer));
            let result = if native.is_null() || size == 0 { Ok(()) } else { sink(time, key, std::slice::from_raw_parts(native, size)) };
            release(buffer);
            while self.held.front().is_some_and(|(t, _)| *t <= time) {
                self.held.pop_front();
            }
            self.full = false;
            result
        }
    }
}

impl Drop for AmfEncoder {
    fn drop(&mut self) {
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
