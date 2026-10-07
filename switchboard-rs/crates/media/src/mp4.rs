//! Just enough ISO BMFF parsing for `probe`: track kinds, titles, sizes,
//! frame rate and edit-list offsets. Only the `moov` box is read, wherever it
//! sits in the file, so probing a 250 MB clip touches ~50 KB.
//!
//! Titles come from two places, depending on the recorder:
//! - Switchboard's own muxer writes them as the `hdlr` handler name.
//! - FFmpeg writes a generic handler name ("SoundHandler") and puts the title
//!   in `trak/udta/name`.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use anyhow::{Context, Result, bail};

/// Leading sample sizes kept per track.
pub const FINGERPRINT: usize = 24;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Video,
    Audio,
    Other,
}

#[derive(Clone, Debug)]
pub struct Track {
    pub kind: Kind,
    /// `hdlr` name with generic recorder defaults removed.
    pub handler_name: String,
    /// `trak/udta/name` (FFmpeg's per-stream title).
    pub udta_name: String,
    pub timescale: u32,
    pub media_duration: u64,
    pub sample_count: u32,
    /// Sizes of the first few samples (identifies the track among MF's
    /// streams, whose order differs from the file's).
    pub first_sizes: Vec<u32>,
    /// Sample entry four-cc (`avc1`, `mp4a`, ...).
    pub codec: [u8; 4],
    pub width: u32,
    pub height: u32,
    /// Presentation time (ms) of media time zero, from the edit list:
    /// positive when the track starts late (empty edit), negative when the
    /// start of the media is trimmed.
    pub edit_offset_ms: f64,
}

impl Track {
    /// The best human title the file carries, or "" if none.
    pub fn title(&self) -> &str {
        if !self.udta_name.is_empty() { &self.udta_name } else { &self.handler_name }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Movie {
    pub timescale: u32,
    pub duration: u64,
    pub tracks: Vec<Track>,
}

impl Movie {
    pub fn duration_ms(&self) -> i64 {
        if self.timescale == 0 {
            return 0;
        }
        (self.duration as f64 * 1000.0 / self.timescale as f64).round() as i64
    }

    pub fn video(&self) -> Option<&Track> {
        self.tracks.iter().find(|t| t.kind == Kind::Video)
    }

    pub fn audio(&self) -> impl Iterator<Item = &Track> {
        self.tracks.iter().filter(|t| t.kind == Kind::Audio)
    }
}

/// Reads and parses the `moov` box of an MP4/MOV file.
pub fn parse_file(path: &Path) -> Result<Movie> {
    let mut f = File::open(path).with_context(|| format!("can't open {}", path.display()))?;
    let len = f.metadata()?.len();
    let mut pos = 0u64;
    while pos + 8 <= len {
        f.seek(SeekFrom::Start(pos))?;
        let mut h = [0u8; 16];
        f.read_exact(&mut h[..8])?;
        let mut size = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) as u64;
        let kind = [h[4], h[5], h[6], h[7]];
        let mut header = 8u64;
        if size == 1 {
            f.read_exact(&mut h[8..16])?;
            size = u64::from_be_bytes(h[8..16].try_into().unwrap());
            header = 16;
        } else if size == 0 {
            size = len - pos;
        }
        if size < header || pos + size > len {
            break;
        }
        if &kind == b"moov" {
            let body = size - header;
            if body > 256 << 20 {
                bail!("the file's index is implausibly large");
            }
            let mut buf = vec![0u8; body as usize];
            f.read_exact(&mut buf)?;
            return parse_moov(&buf);
        }
        if pos == 0 && &kind != b"ftyp" && &kind != b"free" && &kind != b"skip" && &kind != b"wide" && &kind != b"mdat" {
            bail!("not an MP4 file");
        }
        pos += size;
    }
    bail!("not an MP4 file, or the recording was not finished (no index)")
}

/// Iterates the child boxes of a container body: (type, body).
struct Boxes<'a> {
    data: &'a [u8],
}

impl<'a> Iterator for Boxes<'a> {
    type Item = ([u8; 4], &'a [u8]);
    fn next(&mut self) -> Option<Self::Item> {
        if self.data.len() < 8 {
            return None;
        }
        let d = self.data;
        let mut size = u32::from_be_bytes([d[0], d[1], d[2], d[3]]) as u64;
        let kind = [d[4], d[5], d[6], d[7]];
        let mut header = 8usize;
        if size == 1 {
            if d.len() < 16 {
                return None;
            }
            size = u64::from_be_bytes(d[8..16].try_into().unwrap());
            header = 16;
        } else if size == 0 {
            size = d.len() as u64;
        }
        if size < header as u64 || size > d.len() as u64 {
            self.data = &[];
            return None;
        }
        let body = &d[header..size as usize];
        self.data = &d[size as usize..];
        Some((kind, body))
    }
}

fn boxes(data: &[u8]) -> Boxes<'_> {
    Boxes { data }
}

fn child<'a>(data: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
    boxes(data).find(|(k, _)| k == kind).map(|(_, b)| b)
}

/// Bounds-checked big-endian reader.
struct Cursor<'a> {
    d: &'a [u8],
    p: usize,
}

impl<'a> Cursor<'a> {
    fn new(d: &'a [u8]) -> Self {
        Cursor { d, p: 0 }
    }
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.d.get(self.p..self.p.checked_add(n)?)?;
        self.p += n;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        self.take(1).map(|b| b[0])
    }
    fn u32(&mut self) -> Option<u32> {
        self.take(4).map(|b| u32::from_be_bytes(b.try_into().unwrap()))
    }
    fn u64(&mut self) -> Option<u64> {
        self.take(8).map(|b| u64::from_be_bytes(b.try_into().unwrap()))
    }
    fn skip(&mut self, n: usize) -> Option<()> {
        self.take(n).map(|_| ())
    }
}

pub fn parse_moov(moov: &[u8]) -> Result<Movie> {
    let mut movie = Movie::default();
    let mvhd = child(moov, b"mvhd").context("the file's index has no movie header")?;
    let mut c = Cursor::new(mvhd);
    let version = c.u8().context("short mvhd")?;
    c.skip(3);
    if version == 1 {
        c.skip(16);
        movie.timescale = c.u32().context("short mvhd")?;
        movie.duration = c.u64().context("short mvhd")?;
    } else {
        c.skip(8);
        movie.timescale = c.u32().context("short mvhd")?;
        movie.duration = c.u32().context("short mvhd")? as u64;
    }
    for (kind, body) in boxes(moov) {
        if &kind == b"trak"
            && let Some(t) = parse_trak(body, movie.timescale)
        {
            movie.tracks.push(t);
        }
    }
    // Some writers leave mvhd duration at 0; fall back to the longest track.
    if movie.duration == 0 && movie.timescale > 0 {
        let longest = movie
            .tracks
            .iter()
            .filter(|t| t.timescale > 0)
            .map(|t| t.media_duration as f64 / t.timescale as f64 + t.edit_offset_ms.max(0.0) / 1000.0)
            .fold(0.0, f64::max);
        movie.duration = (longest * movie.timescale as f64) as u64;
    }
    Ok(movie)
}

fn parse_trak(trak: &[u8], movie_timescale: u32) -> Option<Track> {
    let tkhd = child(trak, b"tkhd")?;
    let mut c = Cursor::new(tkhd);
    let version = c.u8()?;
    c.skip(3)?;
    c.skip(if version == 1 { 16 } else { 8 })?;
    c.skip(4)?; // track_ID
    // Display size: last 8 bytes, 16.16 fixed point.
    let (tk_w, tk_h) = if tkhd.len() >= 8 {
        let n = tkhd.len();
        (
            u32::from_be_bytes(tkhd[n - 8..n - 4].try_into().ok()?) >> 16,
            u32::from_be_bytes(tkhd[n - 4..n].try_into().ok()?) >> 16,
        )
    } else {
        (0, 0)
    };

    let mdia = child(trak, b"mdia")?;
    let mdhd = child(mdia, b"mdhd")?;
    let mut c = Cursor::new(mdhd);
    let version = c.u8()?;
    c.skip(3)?;
    let (timescale, media_duration) = if version == 1 {
        c.skip(16)?;
        (c.u32()?, c.u64()?)
    } else {
        c.skip(8)?;
        (c.u32()?, c.u32()? as u64)
    };

    let (kind, handler_name) = match child(mdia, b"hdlr") {
        Some(h) => parse_hdlr(h),
        None => (Kind::Other, String::new()),
    };

    let udta_name = child(trak, b"udta")
        .and_then(|u| child(u, b"name"))
        .map(clean_text)
        .unwrap_or_default();

    let stbl = child(mdia, b"minf").and_then(|m| child(m, b"stbl"));
    let mut codec = [0u8; 4];
    let (mut width, mut height) = (0u32, 0u32);
    let mut sample_count = 0u32;
    let mut first_sizes = Vec::new();
    if let Some(stbl) = stbl {
        if let Some(stsd) = child(stbl, b"stsd") {
            // full box (4) + entry count (4), then the first sample entry.
            if let Some((entry_kind, entry)) = stsd.get(8..).and_then(|d| boxes(d).next()) {
                codec = entry_kind;
                if kind == Kind::Video && entry.len() >= 28 {
                    // VisualSampleEntry: 6 reserved + 2 dref + 16 predefined/reserved, then width, height.
                    width = u16::from_be_bytes([entry[24], entry[25]]) as u32;
                    height = u16::from_be_bytes([entry[26], entry[27]]) as u32;
                }
            }
        }
        if let Some(stsz) = child(stbl, b"stsz") {
            let mut c = Cursor::new(stsz);
            c.skip(4);
            let constant = c.u32().unwrap_or(0);
            sample_count = c.u32().unwrap_or(0);
            let n = sample_count.min(FINGERPRINT as u32) as usize;
            first_sizes = if constant != 0 { vec![constant; n] } else { (0..n).map_while(|_| c.u32()).collect() };
        } else if let Some(stz2) = child(stbl, b"stz2") {
            let mut c = Cursor::new(stz2);
            c.skip(8);
            sample_count = c.u32().unwrap_or(0);
        }
    }
    if width == 0 || height == 0 {
        (width, height) = (tk_w, tk_h);
    }

    let edit_offset_ms = child(trak, b"edts")
        .and_then(|e| child(e, b"elst"))
        .map(|elst| edit_offset_ms(elst, movie_timescale, timescale))
        .unwrap_or(0.0);

    Some(Track {
        kind,
        handler_name,
        udta_name,
        timescale,
        media_duration,
        sample_count,
        first_sizes,
        codec,
        width,
        height,
        edit_offset_ms,
    })
}

fn parse_hdlr(h: &[u8]) -> (Kind, String) {
    // full box (4) + pre_defined (4) + handler_type (4) + reserved (12) + name
    let handler = h.get(8..12).unwrap_or(&[]);
    let kind = match handler {
        b"vide" => Kind::Video,
        b"soun" => Kind::Audio,
        _ => Kind::Other,
    };
    let raw = h.get(24..).unwrap_or(&[]);
    // QuickTime writes a Pascal string (length byte first).
    let raw = match raw.first() {
        Some(&n) if n as usize == raw.len() - 1 && n > 0 && !raw[1..].contains(&0) => &raw[1..],
        _ => raw,
    };
    let name = clean_text(raw);
    (kind, if is_generic_handler(&name) { String::new() } else { name })
}

/// Recorder defaults that say nothing about the track's content.
fn is_generic_handler(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    l.is_empty()
        || l.contains("handler")
        || l.starts_with("core media")
        || l.starts_with("iso media")
        || l.starts_with("gpac")
        || l.starts_with("l-smash")
        || l.starts_with("mainconcept")
}

fn clean_text(raw: &[u8]) -> String {
    let end = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
    String::from_utf8_lossy(&raw[..end]).trim().to_string()
}

/// Presentation offset of media time zero from an `elst` body.
fn edit_offset_ms(elst: &[u8], movie_timescale: u32, media_timescale: u32) -> f64 {
    let mut c = Cursor::new(elst);
    let Some(version) = c.u8() else { return 0.0 };
    c.skip(3);
    let Some(count) = c.u32() else { return 0.0 };
    let mut delay = 0u64; // movie timescale
    for _ in 0..count.min(64) {
        let (dur, media_time) = if version == 1 {
            match (c.u64(), c.u64()) {
                (Some(d), Some(m)) => (d, m as i64),
                _ => break,
            }
        } else {
            match (c.u32(), c.u32()) {
                (Some(d), Some(m)) => (d as u64, m as i32 as i64),
                _ => break,
            }
        };
        if c.skip(4).is_none() {
            break;
        }
        if media_time == -1 {
            delay += dur;
            continue;
        }
        let delay_ms = if movie_timescale > 0 { delay as f64 * 1000.0 / movie_timescale as f64 } else { 0.0 };
        let skip_ms = if media_timescale > 0 { media_time as f64 * 1000.0 / media_timescale as f64 } else { 0.0 };
        return delay_ms - skip_ms;
    }
    0.0
}

/// Codec display name for a sample entry four-cc.
pub fn codec_name(fourcc: [u8; 4]) -> String {
    match &fourcc {
        b"avc1" | b"avc3" => "H.264".into(),
        b"hvc1" | b"hev1" => "HEVC".into(),
        b"av01" => "AV1".into(),
        b"vp09" => "VP9".into(),
        b"mp4v" => "MPEG-4".into(),
        b"\0\0\0\0" => String::new(),
        other => String::from_utf8_lossy(other).trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bx(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut v = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        v.extend_from_slice(kind);
        v.extend_from_slice(body);
        v
    }

    fn hdlr(kind: &[u8; 4], name: &str) -> Vec<u8> {
        let mut b = vec![0u8; 8];
        b.extend_from_slice(kind);
        b.extend_from_slice(&[0u8; 12]);
        b.extend_from_slice(name.as_bytes());
        b.push(0);
        bx(b"hdlr", &b)
    }

    fn mdhd(timescale: u32, duration: u32) -> Vec<u8> {
        let mut b = vec![0u8; 12];
        b.extend_from_slice(&timescale.to_be_bytes());
        b.extend_from_slice(&duration.to_be_bytes());
        b.extend_from_slice(&[0u8; 4]);
        bx(b"mdhd", &b)
    }

    fn tkhd(id: u32) -> Vec<u8> {
        let mut b = vec![0u8; 12];
        b.extend_from_slice(&id.to_be_bytes());
        b.extend_from_slice(&[0u8; 64]);
        bx(b"tkhd", &b)
    }

    fn elst(entries: &[(u32, i32)]) -> Vec<u8> {
        let mut b = vec![0u8; 4];
        b.extend_from_slice(&(entries.len() as u32).to_be_bytes());
        for (d, m) in entries {
            b.extend_from_slice(&d.to_be_bytes());
            b.extend_from_slice(&m.to_be_bytes());
            b.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        }
        bx(b"edts", &bx(b"elst", &b))
    }

    fn mvhd(timescale: u32, duration: u32) -> Vec<u8> {
        let mut b = vec![0u8; 12];
        b.extend_from_slice(&timescale.to_be_bytes());
        b.extend_from_slice(&duration.to_be_bytes());
        b.extend_from_slice(&[0u8; 80]);
        bx(b"mvhd", &b)
    }

    #[test]
    fn reads_ffmpeg_udta_titles_and_empty_edits() {
        // Mirrors an FFmpeg-recorded clip: generic handler, udta name, and an
        // 11.016 s empty edit before the audio.
        let mut trak = tkhd(2);
        trak.extend(elst(&[(11_016, -1), (18_983, 0)]));
        let mut mdia = mdhd(48_000, 911_000);
        mdia.extend(hdlr(b"soun", "SoundHandler"));
        trak.extend(bx(b"mdia", &mdia));
        trak.extend(bx(b"udta", &bx(b"name", b"Chat")));
        let mut moov = mvhd(1000, 29_999);
        moov.extend(bx(b"trak", &trak));
        let m = parse_moov(&moov).unwrap();
        assert_eq!(m.duration_ms(), 29_999);
        let t = &m.tracks[0];
        assert_eq!(t.kind, Kind::Audio);
        assert_eq!(t.title(), "Chat");
        assert_eq!(t.handler_name, "");
        assert!((t.edit_offset_ms - 11_016.0).abs() < 1e-9);
    }

    #[test]
    fn reads_switchboard_handler_titles_and_trims() {
        let mut trak = tkhd(3);
        // Media trimmed by 480 samples at 48 kHz = 10 ms.
        trak.extend(elst(&[(5_000, 480)]));
        let mut mdia = mdhd(48_000, 240_000);
        mdia.extend(hdlr(b"soun", "Microphone"));
        trak.extend(bx(b"mdia", &mdia));
        let mut moov = mvhd(1000, 5_000);
        moov.extend(bx(b"trak", &trak));
        let m = parse_moov(&moov).unwrap();
        assert_eq!(m.tracks[0].title(), "Microphone");
        assert!((m.tracks[0].edit_offset_ms + 10.0).abs() < 1e-9);
    }

    #[test]
    fn garbage_is_rejected_without_panicking() {
        assert!(parse_moov(&[0, 0, 0, 3, 1, 2]).is_err());
        let mut moov = mvhd(1000, 10);
        moov.extend(bx(b"trak", &[0xff; 7]));
        assert!(parse_moov(&moov).unwrap().tracks.is_empty());
    }
}
