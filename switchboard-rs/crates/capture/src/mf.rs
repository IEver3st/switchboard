//! Small Media Foundation helpers shared by the video and audio encoders.

use std::mem::ManuallyDrop;
use std::sync::OnceLock;

use anyhow::Result;
use windows::Win32::Media::MediaFoundation::{
    ICodecAPI, IMFMediaBuffer, IMFSample, MF_VERSION, MFCreateMemoryBuffer, MFCreateSample,
    MFSTARTUP_FULL, MFStartup,
};
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_BOOL, VT_UI4};
use windows::Win32::Foundation::VARIANT_BOOL;
use windows::core::GUID;

/// COM (MTA) for the calling thread, plus Media Foundation once per process.
pub fn init_thread() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    static MF: OnceLock<()> = OnceLock::new();
    MF.get_or_init(|| unsafe {
        let _ = MFStartup(MF_VERSION, MFSTARTUP_FULL);
    });
}

fn variant(vt: windows::Win32::System::Variant::VARENUM, value: VARIANT_0_0_0) -> VARIANT {
    VARIANT {
        Anonymous: VARIANT_0 {
            Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                vt,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: value,
            }),
        },
    }
}

/// Best effort: encoders ignore or reject properties they do not support.
pub fn codec_u32(codec: &ICodecAPI, api: &GUID, value: u32) -> bool {
    let v = variant(VT_UI4, VARIANT_0_0_0 { ulVal: value });
    unsafe { codec.SetValue(api, &v).is_ok() }
}

pub fn codec_bool(codec: &ICodecAPI, api: &GUID, value: bool) -> bool {
    let v = variant(VT_BOOL, VARIANT_0_0_0 { boolVal: VARIANT_BOOL(if value { -1 } else { 0 }) });
    unsafe { codec.SetValue(api, &v).is_ok() }
}

pub fn pack(hi: u32, lo: u32) -> u64 {
    ((hi as u64) << 32) | lo as u64
}

/// Copies a sample's bytes out (contiguous).
pub fn sample_bytes(sample: &IMFSample, out: &mut Vec<u8>) -> Result<()> {
    let buffer: IMFMediaBuffer = unsafe { sample.ConvertToContiguousBuffer()? };
    let mut ptr = std::ptr::null_mut();
    let mut len = 0u32;
    unsafe {
        buffer.Lock(&mut ptr, None, Some(&mut len))?;
        out.clear();
        out.extend_from_slice(std::slice::from_raw_parts(ptr, len as usize));
        buffer.Unlock()?;
    }
    Ok(())
}

pub fn empty_sample(capacity: u32) -> Result<IMFSample> {
    unsafe {
        let buffer = MFCreateMemoryBuffer(capacity.max(1))?;
        let sample = MFCreateSample()?;
        sample.AddBuffer(&buffer)?;
        Ok(sample)
    }
}

/// Current COM reference count of `x`, including the caller's own handle.
/// Used to tell whether an encoder still holds a sample we want to reuse.
pub fn ref_count<T: windows::core::Interface>(x: &T) -> u32 {
    unsafe {
        let raw = x.as_raw();
        let vtbl = *(raw as *const *const windows::core::IUnknown_Vtbl);
        ((*vtbl).AddRef)(raw);
        ((*vtbl).Release)(raw)
    }
}
