//! Media Foundation helpers: thread init, Source Reader creation, stream
//! enumeration and seeking.

use std::path::Path;
use std::sync::OnceLock;

use anyhow::{Context, Result, anyhow};
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};
use windows::core::{GUID, HSTRING, Interface};

pub const HNS_PER_MS: f64 = 10_000.0;

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

/// QueryPerformanceCounter in 100 ns units (the unit IAudioClock reports).
pub fn now_hns() -> i64 {
    static FREQ: OnceLock<i64> = OnceLock::new();
    let freq = *FREQ.get_or_init(|| {
        let mut f = 0i64;
        unsafe {
            let _ = QueryPerformanceFrequency(&mut f);
        }
        f.max(1)
    });
    let mut c = 0i64;
    unsafe {
        let _ = QueryPerformanceCounter(&mut c);
    }
    (c as i128 * 10_000_000 / freq as i128) as i64
}

pub fn pack(hi: u32, lo: u32) -> u64 {
    ((hi as u64) << 32) | lo as u64
}

pub fn unpack(v: u64) -> (u32, u32) {
    ((v >> 32) as u32, v as u32)
}

pub fn attributes(capacity: u32) -> Result<IMFAttributes> {
    let mut a = None;
    unsafe { MFCreateAttributes(&mut a, capacity)? };
    a.ok_or_else(|| anyhow!("no attribute store"))
}

/// Opens a Source Reader, mapping the common failures to plain messages.
pub fn open_reader(path: &Path, attrs: Option<&IMFAttributes>) -> Result<IMFSourceReader> {
    if !path.is_file() {
        return Err(anyhow!("{} doesn't exist", path.display()));
    }
    let url = HSTRING::from(path.as_os_str());
    unsafe { MFCreateSourceReaderFromURL(&url, attrs) }.map_err(|e| {
        if e.code() == MF_E_UNSUPPORTED_BYTESTREAM_TYPE {
            anyhow!("this file isn't a video Windows can read")
        } else {
            anyhow!("couldn't open the file: {}", e.message())
        }
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Major {
    Video,
    Audio,
    Other,
}

#[derive(Clone, Debug)]
pub struct StreamInfo {
    /// Source Reader stream index.
    pub index: u32,
    pub major: Major,
    /// MF_SD_STREAM_NAME, if the source exposes it.
    pub name: String,
}

/// Lists the reader's streams in source order.
pub fn streams(reader: &IMFSourceReader) -> Vec<StreamInfo> {
    // Stream descriptors carry the stream name. (Their identifiers are MF's
    // own numbering, not MP4 track IDs.)
    let pd = unsafe {
        let mut source: *mut core::ffi::c_void = std::ptr::null_mut();
        let ok = reader
            .GetServiceForStream(
                MF_SOURCE_READER_MEDIASOURCE.0 as u32,
                &GUID::zeroed(),
                &IMFMediaSource::IID,
                &mut source,
            )
            .is_ok();
        if ok && !source.is_null() {
            let source = IMFMediaSource::from_raw(source);
            source.CreatePresentationDescriptor().ok()
        } else {
            None
        }
    };
    let mut out = Vec::new();
    for index in 0..64u32 {
        let major = match unsafe { reader.GetNativeMediaType(index, 0) } {
            Ok(t) => match unsafe { t.GetGUID(&MF_MT_MAJOR_TYPE) } {
                Ok(g) if g == MFMediaType_Video => Major::Video,
                Ok(g) if g == MFMediaType_Audio => Major::Audio,
                _ => Major::Other,
            },
            Err(e) if e.code() == MF_E_NO_MORE_TYPES => Major::Other,
            Err(_) => break, // MF_E_INVALIDSTREAMNUMBER: past the last stream
        };
        let mut name = String::new();
        if let Some(pd) = &pd {
            let mut selected = windows::core::BOOL::default();
            let mut sd = None;
            if unsafe { pd.GetStreamDescriptorByIndex(index, &mut selected, &mut sd) }.is_ok()
                && let Some(sd) = sd
            {
                name = string_attr(&sd.cast::<IMFAttributes>().ok(), &MF_SD_STREAM_NAME);
            }
        }
        out.push(StreamInfo { index, major, name });
    }
    out
}

fn string_attr(attrs: &Option<IMFAttributes>, key: &GUID) -> String {
    let Some(a) = attrs else { return String::new() };
    unsafe {
        let Ok(len) = a.GetStringLength(key) else { return String::new() };
        let mut buf = vec![0u16; len as usize + 1];
        if a.GetString(key, &mut buf, None).is_err() {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize]).trim().to_string()
    }
}

/// Byte sizes of the first `n` compressed samples of each stream (reader
/// must still be on native types). Streams interleave in ~0.5 s chunks, so
/// this reads a few chunks at most.
pub fn first_sample_sizes(reader: &IMFSourceReader, streams: &[u32], n: usize) -> Vec<Vec<u32>> {
    let mut out = vec![Vec::new(); streams.len()];
    let mut done = vec![false; streams.len()];
    unsafe {
        let _ = reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false);
        for &s in streams {
            let _ = reader.SetStreamSelection(s, true);
        }
    }
    for _ in 0..(n * streams.len() * 4 + 16) {
        if done.iter().all(|d| *d) {
            break;
        }
        let mut actual = 0u32;
        let mut flags = 0u32;
        let mut sample = None;
        let read = unsafe {
            reader.ReadSample(
                MF_SOURCE_READER_ANY_STREAM.0 as u32,
                0,
                Some(&mut actual),
                Some(&mut flags),
                None,
                Some(&mut sample),
            )
        };
        if read.is_err() || flags & MF_SOURCE_READERF_ERROR.0 as u32 != 0 {
            break;
        }
        let Some(k) = streams.iter().position(|&s| s == actual) else { continue };
        if let Some(sample) = sample
            && out[k].len() < n
        {
            out[k].push(unsafe { sample.GetTotalLength() }.unwrap_or(0));
        }
        if out[k].len() >= n || flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
            done[k] = true;
            unsafe {
                let _ = reader.SetStreamSelection(actual, false);
            }
        }
    }
    out
}

/// Duration from the media source, in ms.
pub fn duration_ms(reader: &IMFSourceReader) -> Option<f64> {
    let v = unsafe { reader.GetPresentationAttribute(MF_SOURCE_READER_MEDIASOURCE.0 as u32, &MF_PD_DURATION) }.ok()?;
    // VT_UI8; reading the union directly avoids the property-system dependency.
    let hns = unsafe { v.Anonymous.Anonymous.Anonymous.uhVal };
    Some(hns as f64 / HNS_PER_MS)
}

/// Seeks the whole reader to `ms`. MF lands on the sync sample at or before
/// the target; callers decode forward when they need more precision.
pub fn seek(reader: &IMFSourceReader, ms: f64) -> Result<()> {
    let hns = (ms.max(0.0) * HNS_PER_MS).round() as i64;
    // VT_I8 owns no memory, so letting it drop (PropVariantClear) is fine.
    let pv = PROPVARIANT::from(hns);
    unsafe { reader.SetCurrentPosition(&GUID::zeroed(), &pv) }.context("seek")
}

/// One ReadSample result.
pub struct Read {
    pub sample: Option<IMFSample>,
    pub flags: u32,
    pub time_hns: i64,
}

impl Read {
    pub fn end_of_stream(&self) -> bool {
        self.flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0
    }
    pub fn type_changed(&self) -> bool {
        self.flags & MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED.0 as u32 != 0
    }
}

pub fn read(reader: &IMFSourceReader, stream: u32) -> Result<Read> {
    let mut flags = 0u32;
    let mut time = 0i64;
    let mut sample = None;
    unsafe {
        reader.ReadSample(stream, 0, None, Some(&mut flags), Some(&mut time), Some(&mut sample))?;
    }
    if flags & MF_SOURCE_READERF_ERROR.0 as u32 != 0 {
        return Err(anyhow!("the decoder stopped with an error"));
    }
    Ok(Read { sample, flags, time_hns: time })
}

/// Float32 interleaved PCM output type; rate/channels only when given
/// (the Source Reader inserts a resampler / channel mixer as needed).
pub fn float_audio_type(rate: Option<u32>, channels: Option<u32>) -> Result<IMFMediaType> {
    unsafe {
        let t = MFCreateMediaType()?;
        t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
        t.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_Float)?;
        t.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 32)?;
        if let (Some(r), Some(c)) = (rate, channels) {
            t.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, r)?;
            t.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, c)?;
            t.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 4 * c)?;
            t.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 4 * c * r)?;
        }
        Ok(t)
    }
}

/// Runs `f` over the sample's contiguous bytes without copying when the
/// sample has a single buffer.
pub fn with_bytes<R>(sample: &IMFSample, f: impl FnOnce(&[u8]) -> R) -> Result<R> {
    unsafe {
        let buffer = if sample.GetBufferCount()? == 1 { sample.GetBufferByIndex(0)? } else { sample.ConvertToContiguousBuffer()? };
        let mut ptr = std::ptr::null_mut();
        let mut len = 0u32;
        buffer.Lock(&mut ptr, None, Some(&mut len))?;
        let r = if ptr.is_null() { f(&[]) } else { f(std::slice::from_raw_parts(ptr, len as usize)) };
        let _ = buffer.Unlock();
        Ok(r)
    }
}

/// Decodes little-endian f32 PCM bytes into `scratch`.
pub fn f32s(bytes: &[u8], scratch: &mut Vec<f32>) {
    scratch.clear();
    scratch.extend(bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])));
}
