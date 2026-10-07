//! Thumbnails: decode one frame with Media Foundation, scale to
//! THUMB_W x THUMB_H, cache as raw RGBA keyed by path, size and modification
//! time. Textures are then resized to the exact pixels they cover on screen,
//! so the software renderer copies them instead of filtering every pixel.
//!
//! The window only reads cache files. A cache miss is decoded by the media
//! helper process (media_host.rs), which writes the cache file: decoding a
//! 4K frame leaves hundreds of MB behind in whichever process does it.

use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use anyhow::{Result, anyhow};
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::Win32::System::Variant::VT_I8;
use windows::core::{GUID, HSTRING};

use super::library::{THUMB_H, THUMB_W};

/// Window side: nothing to set up (decoding happens in the media helper).
pub fn init() {}

/// Helper side: COM and Media Foundation for [`make_cached`].
pub fn init_decoder() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let _ = MFStartup(MF_VERSION, MFSTARTUP_LITE);
    }
}

fn clip_key(clip: &Path) -> u64 {
    let meta = std::fs::metadata(clip).ok();
    let mut h = std::collections::hash_map::DefaultHasher::new();
    clip.hash(&mut h);
    meta.as_ref().map(|m| m.len()).hash(&mut h);
    meta.and_then(|m| m.modified().ok()).hash(&mut h);
    h.finish()
}

pub fn cache_path(dir: &Path, clip: &Path) -> PathBuf {
    // The size is part of the name so builds with other sizes don't fight.
    dir.join(format!("{:016x}-{THUMB_W}.rgba", clip_key(clip)))
}

/// Where the previous (640x360) build cached this clip's thumbnail.
pub fn legacy_cache_path(dir: &Path, clip: &Path) -> PathBuf {
    dir.join(format!("{:016x}-640.rgba", clip_key(clip)))
}

/// Writes a thumbnail made elsewhere (the capture engine's GPU snapshot at
/// save time) into the cache, complete or not at all.
pub fn store(clip: &Path, rgba: &[u8]) -> Result<()> {
    anyhow::ensure!(rgba.len() == THUMB_W * THUMB_H * 4, "thumbnail has the wrong size");
    store_at(&cache_path(&crate::settings::thumbnails_dir(), clip), rgba)
}

pub fn load_or_make(clip: &Path, dir: &Path) -> Option<(usize, usize, Vec<u8>)> {
    let cache = cache_path(dir, clip);
    if let Ok(bytes) = std::fs::read(&cache)
        && bytes.len() == THUMB_W * THUMB_H * 4 {
            return Some((THUMB_W, THUMB_H, bytes));
        }
    // A thumbnail cached at the previous size converts without decoding.
    let legacy = legacy_cache_path(dir, clip);
    if let Ok(bytes) = std::fs::read(&legacy)
        && bytes.len() == 640 * 360 * 4
    {
        let rgba = resize_rgba(&bytes, 640, 360, THUMB_W, THUMB_H);
        if store_at(&cache, &rgba).is_ok() {
            let _ = std::fs::remove_file(&legacy);
        }
        return Some((THUMB_W, THUMB_H, rgba));
    }
    let _ = std::fs::create_dir_all(dir);
    if let Err(e) = crate::media_client::thumbnail(clip, &cache) {
        eprintln!("thumbnail for {}: {e:#}", clip.display());
        return None;
    }
    let bytes = std::fs::read(&cache).ok()?;
    (bytes.len() == THUMB_W * THUMB_H * 4).then_some((THUMB_W, THUMB_H, bytes))
}

/// Helper side: decodes `clip` and writes its thumbnail to `cache`
/// (complete or not at all).
pub fn make_cached(clip: &Path, cache: &Path) -> Result<()> {
    // Hardware first: measured over 11 cold 4K clips it peaks at ~265 MB
    // in the helper and decodes on the GPU, where the software reader below
    // peaked near 500 MB and over a full core.
    let rgba = match decode_hw(clip) {
        Ok(rgba) => rgba,
        Err(_) => decode(clip)?,
    };
    if let Some(dir) = cache.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = cache.with_extension(format!("tmp{}", std::process::id()));
    std::fs::write(&tmp, &rgba)?;
    if let Err(e) = std::fs::rename(&tmp, cache) {
        let _ = std::fs::remove_file(&tmp);
        // Another writer got there first with the same content.
        if !cache.is_file() {
            return Err(e.into());
        }
    }
    Ok(())
}

fn store_at(cache: &Path, rgba: &[u8]) -> Result<()> {
    if let Some(dir) = cache.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = cache.with_extension(format!("tmp{}", std::process::id()));
    std::fs::write(&tmp, rgba)?;
    std::fs::rename(&tmp, cache).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })?;
    Ok(())
}

/// The cached thumbnail at `size` pixels (or as cached when `None`).
pub fn load_sized(clip: &Path, dir: &Path, size: Option<[usize; 2]>) -> Option<(usize, usize, Vec<u8>)> {
    let (w, h, base) = load_or_make(clip, dir)?;
    match size {
        Some([dw, dh]) if dw > 0 && dh > 0 && [dw, dh] != [w, h] => Some((dw, dh, resize_rgba(&base, w, h, dw, dh))),
        _ => Some((w, h, base)),
    }
}

/// Bilinear when enlarging, box average when shrinking.
pub fn resize_rgba(src: &[u8], sw: usize, sh: usize, dw: usize, dh: usize) -> Vec<u8> {
    let mut out = vec![0u8; dw * dh * 4];
    let (fx, fy) = (sw as f32 / dw as f32, sh as f32 / dh as f32);
    for y in 0..dh {
        for x in 0..dw {
            let o = (y * dw + x) * 4;
            if fx <= 1.0 && fy <= 1.0 {
                let sx = ((x as f32 + 0.5) * fx - 0.5).max(0.0);
                let sy = ((y as f32 + 0.5) * fy - 0.5).max(0.0);
                let (x0, y0) = ((sx as usize).min(sw - 1), (sy as usize).min(sh - 1));
                let (x1, y1) = ((x0 + 1).min(sw - 1), (y0 + 1).min(sh - 1));
                let (tx, ty) = (sx - x0 as f32, sy - y0 as f32);
                for c in 0..4 {
                    let p = |xx: usize, yy: usize| src[(yy * sw + xx) * 4 + c] as f32;
                    let top = p(x0, y0) * (1.0 - tx) + p(x1, y0) * tx;
                    let bottom = p(x0, y1) * (1.0 - tx) + p(x1, y1) * tx;
                    out[o + c] = (top * (1.0 - ty) + bottom * ty + 0.5) as u8;
                }
            } else {
                let x0 = ((x as f32 * fx) as usize).min(sw - 1);
                let x1 = (((x + 1) as f32 * fx).ceil() as usize).clamp(x0 + 1, sw);
                let y0 = ((y as f32 * fy) as usize).min(sh - 1);
                let y1 = (((y + 1) as f32 * fy).ceil() as usize).clamp(y0 + 1, sh);
                let mut sum = [0u32; 4];
                for yy in y0..y1 {
                    for xx in x0..x1 {
                        let i = (yy * sw + xx) * 4;
                        for c in 0..4 {
                            sum[c] += src[i + c] as u32;
                        }
                    }
                }
                let n = ((x1 - x0) * (y1 - y0)) as u32;
                for c in 0..4 {
                    out[o + c] = (sum[c] / n) as u8;
                }
            }
        }
    }
    out
}

/// One frame a second in (the keyframe at or before it), decoded and
/// scaled on the GPU, letterboxed into THUMB_W x THUMB_H.
fn decode_hw(path: &Path) -> Result<Vec<u8>> {
    let f = switchboard_media::frame_at(path, 1000.0, THUMB_W as u32, THUMB_H as u32)?;
    let (w, h) = (f.width as usize, f.height as usize);
    if w == 0 || h == 0 || w > THUMB_W || h > THUMB_H || f.rgba.len() < w * h * 4 {
        return Err(anyhow!("unexpected frame size {w}x{h}"));
    }
    let mut out = vec![0u8; THUMB_W * THUMB_H * 4];
    for px in out.chunks_exact_mut(4) {
        px[3] = 255;
    }
    let (ox, oy) = ((THUMB_W - w) / 2, (THUMB_H - h) / 2);
    for (y, row) in f.rgba.chunks_exact(w * 4).take(h).enumerate() {
        let o = ((oy + y) * THUMB_W + ox) * 4;
        out[o..o + w * 4].copy_from_slice(row);
    }
    Ok(out)
}

/// Software fallback: Media Foundation's own decoder and video processor.
fn decode(path: &Path) -> Result<Vec<u8>> {
    const VIDEO: u32 = MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32;
    unsafe {
        let mut attrs = None;
        MFCreateAttributes(&mut attrs, 1)?;
        let attrs = attrs.unwrap();
        attrs.SetUINT32(&MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, 1)?;
        let reader = MFCreateSourceReaderFromURL(&HSTRING::from(path.as_os_str()), &attrs)?;
        reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)?;
        reader.SetStreamSelection(VIDEO, true)?;
        let t = MFCreateMediaType()?;
        t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        t.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)?;
        reader.SetCurrentMediaType(VIDEO, None, &t)?;
        let cur = reader.GetCurrentMediaType(VIDEO)?;
        let size = cur.GetUINT64(&MF_MT_FRAME_SIZE)?;
        let (w, h) = ((size >> 32) as usize, (size & 0xffff_ffff) as usize);
        // One second in, past any black first frame.
        let pos = PROPVARIANT {
            Anonymous: PROPVARIANT_0 {
                Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                    vt: VT_I8,
                    wReserved1: 0,
                    wReserved2: 0,
                    wReserved3: 0,
                    Anonymous: PROPVARIANT_0_0_0 { hVal: 10_000_000 },
                }),
            },
        };
        let _ = reader.SetCurrentPosition(&GUID::zeroed(), &pos);
        for _ in 0..60 {
            let mut flags = 0u32;
            let mut sample = None;
            reader.ReadSample(VIDEO, 0, None, Some(&mut flags), None, Some(&mut sample))?;
            if flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
                break;
            }
            let Some(sample) = sample else { continue };
            let buffer = sample.ConvertToContiguousBuffer()?;
            let mut ptr = std::ptr::null_mut();
            let mut len = 0u32;
            buffer.Lock(&mut ptr, None, Some(&mut len))?;
            let src = std::slice::from_raw_parts(ptr, len as usize);
            let stride = if h > 0 { len as usize / h } else { w * 4 };
            let out = scale_bgrx(src, w, h, stride.max(w * 4));
            buffer.Unlock()?;
            return Ok(out);
        }
        Err(anyhow!("no decodable frame"))
    }
}

/// Box-filters BGRX into a letterboxed THUMB_W x THUMB_H RGBA image.
fn scale_bgrx(src: &[u8], w: usize, h: usize, stride: usize) -> Vec<u8> {
    let mut out = vec![0u8; THUMB_W * THUMB_H * 4];
    for px in out.chunks_exact_mut(4) {
        px[3] = 255;
    }
    if w == 0 || h == 0 {
        return out;
    }
    let scale = f64::min(THUMB_W as f64 / w as f64, THUMB_H as f64 / h as f64);
    let dw = ((w as f64 * scale) as usize).clamp(1, THUMB_W);
    let dh = ((h as f64 * scale) as usize).clamp(1, THUMB_H);
    let (ox, oy) = ((THUMB_W - dw) / 2, (THUMB_H - dh) / 2);
    for y in 0..dh {
        let sy0 = y * h / dh;
        let sy1 = ((y + 1) * h / dh).max(sy0 + 1).min(h);
        for x in 0..dw {
            let sx0 = x * w / dw;
            let sx1 = ((x + 1) * w / dw).max(sx0 + 1).min(w);
            let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
            // Sample a sparse grid inside the box: enough for a thumbnail.
            let step_y = ((sy1 - sy0) / 4).max(1);
            let step_x = ((sx1 - sx0) / 4).max(1);
            let mut sy = sy0;
            while sy < sy1 {
                let row = &src[sy * stride..];
                let mut sx = sx0;
                while sx < sx1 {
                    let p = &row[sx * 4..sx * 4 + 4];
                    b += p[0] as u32;
                    g += p[1] as u32;
                    r += p[2] as u32;
                    n += 1;
                    sx += step_x;
                }
                sy += step_y;
            }
            let o = ((oy + y) * THUMB_W + ox + x) * 4;
            out[o] = (r / n) as u8;
            out[o + 1] = (g / n) as u8;
            out[o + 2] = (b / n) as u8;
        }
    }
    out
}
