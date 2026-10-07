//! Minimal faststart MP4 writer: one H.264 track plus AAC tracks, moov before
//! mdat, samples interleaved in ~0.5 s chunks. Sample payloads are streamed
//! from a callback, so a clip never sits in memory.

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use anyhow::Result;

pub const MOVIE_TIMESCALE: u32 = 1000;

pub enum Codec {
    H264 { width: u32, height: u32, sps: Vec<u8>, pps: Vec<u8> },
    Aac { sample_rate: u32, channels: u16, asc: Vec<u8>, bitrate: u32 },
}

pub struct Sample {
    pub size: u32,
    pub duration: u32,
    pub key: bool,
}

pub struct Track {
    pub name: String,
    pub codec: Codec,
    pub timescale: u32,
    pub samples: Vec<Sample>,
    /// Movie-time offset (in `timescale` units) where this track's first
    /// sample plays. Positive = delayed start, negative = trim from start.
    pub start_offset: i64,
}

impl Track {
    fn media_duration(&self) -> u64 {
        self.samples.iter().map(|s| s.duration as u64).sum()
    }

    fn presented_duration(&self) -> u64 {
        // Movie timescale; includes a leading gap, excludes trimmed media.
        let media = self.media_duration() as i64 + self.start_offset.min(0);
        let total = media.max(0) + self.start_offset.max(0);
        (total as u64) * MOVIE_TIMESCALE as u64 / self.timescale as u64
    }
}

struct Chunk {
    track: usize,
    first: usize,
    count: usize,
    bytes: u64,
}

/// `fetch(track, sample_index, buf)` must fill `buf` with exactly the sample
/// bytes promised by `Sample::size`.
pub fn write(path: &Path, tracks: &[Track], mut fetch: impl FnMut(usize, usize, &mut Vec<u8>) -> Result<()>) -> Result<()> {
    let chunks = plan_chunks(tracks);
    let mdat_payload: u64 = chunks.iter().map(|c| c.bytes).sum();
    let large = mdat_payload + 16 > u32::MAX as u64;
    let ftyp = ftyp();
    // Chunk offsets depend on the moov size; the moov size does not depend
    // on offset values (fixed-width stco/co64), so build twice.
    let probe = moov(tracks, &chunks, 0, large);
    let mdat_header = if large { 16 } else { 8 };
    let data_start = (ftyp.len() + probe.len()) as u64 + mdat_header;
    let moov = moov(tracks, &chunks, data_start, large);
    debug_assert_eq!(moov.len(), probe.len());

    let mut f = BufWriter::with_capacity(1 << 20, File::create(path)?);
    f.write_all(&ftyp)?;
    f.write_all(&moov)?;
    if large {
        f.write_all(&1u32.to_be_bytes())?;
        f.write_all(b"mdat")?;
        f.write_all(&(mdat_payload + 16).to_be_bytes())?;
    } else {
        f.write_all(&((mdat_payload + 8) as u32).to_be_bytes())?;
        f.write_all(b"mdat")?;
    }
    let mut buf = Vec::new();
    for c in &chunks {
        for i in c.first..c.first + c.count {
            fetch(c.track, i, &mut buf)?;
            anyhow::ensure!(buf.len() == tracks[c.track].samples[i].size as usize, "sample size changed while saving");
            f.write_all(&buf)?;
        }
    }
    f.flush()?;
    f.into_inner()?.sync_all()?;
    Ok(())
}

fn plan_chunks(tracks: &[Track]) -> Vec<Chunk> {
    // Cut every track into ~0.5 s chunks, then order chunks by start time.
    let mut chunks: Vec<(u64, Chunk)> = Vec::new();
    for (ti, t) in tracks.iter().enumerate() {
        let span = t.timescale as u64 / 2;
        let mut first = 0;
        let mut start_time = 0u64;
        let mut time = 0u64;
        let mut bytes = 0u64;
        for (i, s) in t.samples.iter().enumerate() {
            if i > first && time - start_time >= span {
                let at = start_time * 1_000_000 / t.timescale as u64;
                chunks.push((at, Chunk { track: ti, first, count: i - first, bytes }));
                first = i;
                start_time = time;
                bytes = 0;
            }
            bytes += s.size as u64;
            time += s.duration as u64;
        }
        if first < t.samples.len() {
            let at = start_time * 1_000_000 / t.timescale as u64;
            chunks.push((at, Chunk { track: ti, first, count: t.samples.len() - first, bytes }));
        }
    }
    chunks.sort_by_key(|(at, c)| (*at, c.track));
    chunks.into_iter().map(|(_, c)| c).collect()
}

// ------------------------------------------------------------------- boxes

struct B(Vec<u8>);

impl B {
    fn new() -> B {
        B(Vec::with_capacity(256))
    }
    fn u8(&mut self, v: u8) -> &mut Self {
        self.0.push(v);
        self
    }
    fn u16(&mut self, v: u16) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    fn u32(&mut self, v: u32) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    fn i32(&mut self, v: i32) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    fn u64(&mut self, v: u64) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    fn bytes(&mut self, v: &[u8]) -> &mut Self {
        self.0.extend_from_slice(v);
        self
    }
    fn zeros(&mut self, n: usize) -> &mut Self {
        self.0.resize(self.0.len() + n, 0);
        self
    }
    fn full(&mut self, version: u8, flags: u32) -> &mut Self {
        self.u32(((version as u32) << 24) | flags)
    }
    fn wrap(self, kind: &[u8; 4]) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.0.len() + 8);
        out.extend_from_slice(&((self.0.len() + 8) as u32).to_be_bytes());
        out.extend_from_slice(kind);
        out.extend_from_slice(&self.0);
        out
    }
}

fn container(kind: &[u8; 4], children: &[Vec<u8>]) -> Vec<u8> {
    let mut b = B::new();
    for c in children {
        b.bytes(c);
    }
    b.wrap(kind)
}

const MATRIX: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];

fn ftyp() -> Vec<u8> {
    let mut b = B::new();
    b.bytes(b"isom").u32(0x200).bytes(b"isom").bytes(b"iso2").bytes(b"avc1").bytes(b"mp41");
    b.wrap(b"ftyp")
}

fn moov(tracks: &[Track], chunks: &[Chunk], data_start: u64, large: bool) -> Vec<u8> {
    let duration = tracks.iter().map(|t| t.presented_duration()).max().unwrap_or(0);
    let mut mvhd = B::new();
    mvhd.full(0, 0).u32(0).u32(0).u32(MOVIE_TIMESCALE).u32(duration as u32);
    mvhd.u32(0x0001_0000).u16(0x0100).zeros(10);
    for m in MATRIX {
        mvhd.u32(m);
    }
    mvhd.zeros(24).u32(tracks.len() as u32 + 1);
    let mut children = vec![mvhd.wrap(b"mvhd")];

    // Absolute file offset of every chunk, per track.
    let mut offsets: Vec<Vec<(u64, usize)>> = vec![Vec::new(); tracks.len()];
    let mut pos = data_start;
    for c in chunks {
        offsets[c.track].push((pos, c.count));
        pos += c.bytes;
    }
    for (i, t) in tracks.iter().enumerate() {
        children.push(trak(t, i as u32 + 1, &offsets[i], large));
    }
    container(b"moov", &children)
}

fn trak(t: &Track, id: u32, chunks: &[(u64, usize)], large: bool) -> Vec<u8> {
    let video = matches!(t.codec, Codec::H264 { .. });
    let mut tkhd = B::new();
    tkhd.full(0, 3).u32(0).u32(0).u32(id).u32(0).u32(t.presented_duration() as u32);
    tkhd.zeros(8).u16(0).u16(0).u16(if video { 0 } else { 0x0100 }).u16(0);
    for m in MATRIX {
        tkhd.u32(m);
    }
    match &t.codec {
        Codec::H264 { width, height, .. } => tkhd.u32(width << 16).u32(height << 16),
        _ => tkhd.u32(0).u32(0),
    };

    let mut parts = vec![tkhd.wrap(b"tkhd")];
    if let Some(edts) = edts(t) {
        parts.push(edts);
    }

    let mut mdhd = B::new();
    mdhd.full(0, 0).u32(0).u32(0).u32(t.timescale).u32(t.media_duration() as u32).u16(0x55c4).u16(0);
    let mut hdlr = B::new();
    hdlr.full(0, 0).u32(0).bytes(if video { b"vide" } else { b"soun" }).zeros(12);
    hdlr.bytes(t.name.as_bytes()).u8(0);

    let media_header = if video {
        let mut v = B::new();
        v.full(0, 1).zeros(8);
        v.wrap(b"vmhd")
    } else {
        let mut s = B::new();
        s.full(0, 0).zeros(4);
        s.wrap(b"smhd")
    };
    let mut dref = B::new();
    dref.full(0, 0).u32(1);
    let mut url = B::new();
    url.full(0, 1);
    dref.bytes(&url.wrap(b"url "));
    let dinf = container(b"dinf", &[dref.wrap(b"dref")]);

    let stbl = stbl(t, chunks, large);
    let minf = container(b"minf", &[media_header, dinf, stbl]);
    let mdia = container(b"mdia", &[mdhd.wrap(b"mdhd"), hdlr.wrap(b"hdlr"), minf]);
    parts.push(mdia);
    container(b"trak", &parts)
}

fn edts(t: &Track) -> Option<Vec<u8>> {
    if t.start_offset == 0 {
        return None;
    }
    let to_movie = |v: u64| v * MOVIE_TIMESCALE as u64 / t.timescale as u64;
    let mut elst = B::new();
    if t.start_offset > 0 {
        elst.full(0, 0).u32(2);
        elst.u32(to_movie(t.start_offset as u64) as u32).i32(-1).u32(0x0001_0000);
        elst.u32(to_movie(t.media_duration()) as u32).i32(0).u32(0x0001_0000);
    } else {
        let skip = (-t.start_offset) as u64;
        let remaining = t.media_duration().saturating_sub(skip);
        elst.full(0, 0).u32(1);
        elst.u32(to_movie(remaining) as u32).i32(skip as i32).u32(0x0001_0000);
    }
    Some(container(b"edts", &[elst.wrap(b"elst")]))
}

fn stbl(t: &Track, chunks: &[(u64, usize)], large: bool) -> Vec<u8> {
    let mut stsd = B::new();
    stsd.full(0, 0).u32(1).bytes(&sample_entry(&t.codec));

    // stts: run-length encoded durations.
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for s in &t.samples {
        match runs.last_mut() {
            Some((n, d)) if *d == s.duration => *n += 1,
            _ => runs.push((1, s.duration)),
        }
    }
    let mut stts = B::new();
    stts.full(0, 0).u32(runs.len() as u32);
    for (n, d) in runs {
        stts.u32(n).u32(d);
    }

    let mut stsc_runs: Vec<(u32, u32)> = Vec::new();
    for (i, (_, count)) in chunks.iter().enumerate() {
        if stsc_runs.last().map(|r| r.1) != Some(*count as u32) {
            stsc_runs.push((i as u32 + 1, *count as u32));
        }
    }
    let mut stsc = B::new();
    stsc.full(0, 0).u32(stsc_runs.len() as u32);
    for (first, count) in stsc_runs {
        stsc.u32(first).u32(count).u32(1);
    }

    let mut stsz = B::new();
    stsz.full(0, 0).u32(0).u32(t.samples.len() as u32);
    for s in &t.samples {
        stsz.u32(s.size);
    }

    let mut stco = B::new();
    stco.full(0, 0).u32(chunks.len() as u32);
    for (off, _) in chunks {
        if large {
            stco.u64(*off);
        } else {
            stco.u32(*off as u32);
        }
    }

    let mut boxes = vec![stsd.wrap(b"stsd"), stts.wrap(b"stts")];
    if t.samples.iter().any(|s| !s.key) {
        let keys: Vec<u32> =
            t.samples.iter().enumerate().filter(|(_, s)| s.key).map(|(i, _)| i as u32 + 1).collect();
        let mut stss = B::new();
        stss.full(0, 0).u32(keys.len() as u32);
        for k in keys {
            stss.u32(k);
        }
        boxes.push(stss.wrap(b"stss"));
    }
    boxes.push(stsc.wrap(b"stsc"));
    boxes.push(stsz.wrap(b"stsz"));
    boxes.push(stco.wrap(if large { b"co64" } else { b"stco" }));
    container(b"stbl", &boxes)
}

fn sample_entry(codec: &Codec) -> Vec<u8> {
    match codec {
        Codec::H264 { width, height, sps, pps } => {
            let mut avcc = B::new();
            let (profile, compat, level) = if sps.len() >= 4 { (sps[1], sps[2], sps[3]) } else { (100, 0, 51) };
            avcc.u8(1).u8(profile).u8(compat).u8(level).u8(0xff).u8(0xe1);
            avcc.u16(sps.len() as u16).bytes(sps).u8(1).u16(pps.len() as u16).bytes(pps);
            if matches!(profile, 100 | 110 | 122 | 144) {
                // 4:2:0, 8-bit, no SPS extensions.
                avcc.u8(0xfc | 1).u8(0xf8).u8(0xf8).u8(0);
            }
            let mut colr = B::new();
            // nclx: BT.709 primaries/transfer/matrix, limited range.
            colr.bytes(b"nclx").u16(1).u16(1).u16(1).u8(0);
            let mut e = B::new();
            e.zeros(6).u16(1).zeros(16).u16(*width as u16).u16(*height as u16);
            e.u32(0x0048_0000).u32(0x0048_0000).u32(0).u16(1).zeros(32).u16(0x18).u16(0xffff);
            e.bytes(&avcc.wrap(b"avcC")).bytes(&colr.wrap(b"colr"));
            e.wrap(b"avc1")
        }
        Codec::Aac { sample_rate, channels, asc, bitrate } => {
            let mut e = B::new();
            e.zeros(6).u16(1).zeros(8).u16(*channels).u16(16).u16(0).u16(0).u32(sample_rate << 16);
            e.bytes(&esds(asc, *bitrate));
            e.wrap(b"mp4a")
        }
    }
}

fn descriptor(tag: u8, body: &[u8]) -> Vec<u8> {
    let mut out = vec![tag];
    let len = body.len() as u32;
    // Four-byte length form, as most muxers emit.
    out.extend_from_slice(&[0x80 | ((len >> 21) & 0x7f) as u8, 0x80 | ((len >> 14) & 0x7f) as u8, 0x80 | ((len >> 7) & 0x7f) as u8, (len & 0x7f) as u8]);
    out.extend_from_slice(body);
    out
}

fn esds(asc: &[u8], bitrate: u32) -> Vec<u8> {
    let dsi = descriptor(0x05, asc);
    let mut dcd = B::new();
    dcd.u8(0x40).u8(0x15).u8(0).u16(0).u32(bitrate).u32(bitrate).bytes(&dsi);
    let dcd = descriptor(0x04, &dcd.0);
    let sl = descriptor(0x06, &[0x02]);
    let mut es = B::new();
    es.u16(0).u8(0).bytes(&dcd).bytes(&sl);
    let es = descriptor(0x03, &es.0);
    let mut b = B::new();
    b.full(0, 0).bytes(&es);
    b.wrap(b"esds")
}

/// Facts about an MP4 read from its `moov`, without decoding.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ProbeInfo {
    pub seconds: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub audio_tracks: usize,
}

/// Reads the duration of an MP4 file from its `mvhd`, without decoding.
pub fn probe_duration(path: &Path) -> Option<f64> {
    probe(path).map(|p| p.seconds)
}

/// Walks the top-level boxes to `moov` (at most 8 MiB is read) and parses
/// the movie header and each track's header, media header and sample times.
pub fn probe(path: &Path) -> Option<ProbeInfo> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let mut pos = 0u64;
    while pos + 8 <= len {
        f.seek(SeekFrom::Start(pos)).ok()?;
        let mut h = [0u8; 16];
        f.read_exact(&mut h[..8]).ok()?;
        let mut size = u32::from_be_bytes(h[0..4].try_into().ok()?) as u64;
        let kind: [u8; 4] = h[4..8].try_into().ok()?;
        let mut header = 8;
        if size == 1 {
            f.read_exact(&mut h[8..16]).ok()?;
            size = u64::from_be_bytes(h[8..16].try_into().ok()?);
            header = 16;
        } else if size == 0 {
            size = len - pos;
        }
        if &kind == b"moov" {
            let body = size.checked_sub(header)?;
            if body > 8 << 20 {
                return None;
            }
            let mut moov = vec![0u8; body as usize];
            f.read_exact(&mut moov).ok()?;
            return parse_moov(&moov);
        }
        if size < 8 {
            return None;
        }
        pos += size;
    }
    None
}

fn boxes(data: &[u8]) -> impl Iterator<Item = (&[u8], &[u8])> {
    let mut pos = 0usize;
    std::iter::from_fn(move || {
        if pos + 8 > data.len() {
            return None;
        }
        let size = u32::from_be_bytes(data[pos..pos + 4].try_into().ok()?) as usize;
        let kind = &data[pos + 4..pos + 8];
        if size < 8 || pos + size > data.len() {
            return None;
        }
        let body = &data[pos + 8..pos + size];
        pos += size;
        Some((kind, body))
    })
}

fn child<'a>(data: &'a [u8], name: &[u8; 4]) -> Option<&'a [u8]> {
    boxes(data).find(|(k, _)| k == name).map(|(_, b)| b)
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn parse_moov(moov: &[u8]) -> Option<ProbeInfo> {
    let mvhd = child(moov, b"mvhd")?;
    let seconds = if mvhd[0] == 1 {
        let ts = be32(mvhd, 20)?;
        let d = u64::from_be_bytes(mvhd.get(24..32)?.try_into().ok()?);
        d as f64 / ts.max(1) as f64
    } else {
        be32(mvhd, 16)? as f64 / be32(mvhd, 12)?.max(1) as f64
    };
    let mut info = ProbeInfo { seconds, ..Default::default() };
    for (kind, trak) in boxes(moov) {
        if kind != b"trak" {
            continue;
        }
        let Some(mdia) = child(trak, b"mdia") else { continue };
        let handler = child(mdia, b"hdlr").and_then(|h| h.get(8..12));
        match handler {
            Some(b"soun") => info.audio_tracks += 1,
            Some(b"vide") if info.width == 0 => {
                if let Some(tkhd) = child(trak, b"tkhd") {
                    // Width and height are the last two 16.16 fields.
                    let n = tkhd.len();
                    info.width = be32(tkhd, n - 8).unwrap_or(0) >> 16;
                    info.height = be32(tkhd, n - 4).unwrap_or(0) >> 16;
                }
                let timescale = child(mdia, b"mdhd").and_then(|m| if m[0] == 1 { be32(m, 20) } else { be32(m, 12) });
                let stts = child(mdia, b"minf").and_then(|m| child(m, b"stbl")).and_then(|s| child(s, b"stts"));
                if let (Some(ts), Some(stts)) = (timescale, stts) {
                    let entries = be32(stts, 4).unwrap_or(0) as usize;
                    let (mut samples, mut ticks) = (0u64, 0u64);
                    for i in 0..entries.min(100_000) {
                        let (Some(n), Some(d)) = (be32(stts, 8 + i * 8), be32(stts, 12 + i * 8)) else { break };
                        samples += n as u64;
                        ticks += n as u64 * d as u64;
                    }
                    if ticks > 0 {
                        info.fps = samples as f64 * ts as f64 / ticks as f64;
                    }
                }
            }
            _ => {}
        }
    }
    Some(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn boxes(data: &[u8]) -> Vec<(String, usize)> {
        let mut out = Vec::new();
        let mut pos = 0;
        while pos + 8 <= data.len() {
            let size = u32::from_be_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
            out.push((String::from_utf8_lossy(&data[pos + 4..pos + 8]).to_string(), size));
            pos += size;
        }
        out
    }

    #[test]
    fn writes_faststart_file_with_consistent_sizes() {
        let video = Track {
            name: "Video".into(),
            codec: Codec::H264 { width: 1280, height: 720, sps: vec![0x67, 0x64, 0, 0x1f], pps: vec![0x68, 0xee] },
            timescale: 90_000,
            samples: (0..120).map(|i| Sample { size: 50 + i % 7, duration: 1500, key: i % 60 == 0 }).collect(),
            start_offset: 0,
        };
        let audio = Track {
            name: "Game".into(),
            codec: Codec::Aac { sample_rate: 48_000, channels: 2, asc: vec![0x11, 0x90], bitrate: 192_000 },
            timescale: 48_000,
            samples: (0..94).map(|_| Sample { size: 20, duration: 1024, key: true }).collect(),
            start_offset: 480,
        };
        let path = std::env::temp_dir().join(format!("sb-mp4-test-{}.mp4", std::process::id()));
        let tracks = [video, audio];
        write(&path, &tracks, |t, i, buf| {
            buf.clear();
            buf.resize(tracks[t].samples[i].size as usize, (t * 100 + i % 100) as u8);
            Ok(())
        })
        .unwrap();
        let data = std::fs::read(&path).unwrap();
        let top = boxes(&data);
        let kinds: Vec<&str> = top.iter().map(|b| b.0.as_str()).collect();
        assert_eq!(kinds, ["ftyp", "moov", "mdat"]);
        assert_eq!(top.iter().map(|b| b.1).sum::<usize>(), data.len());
        let payload: usize = tracks.iter().flat_map(|t| &t.samples).map(|s| s.size as usize).sum();
        assert_eq!(top[2].1, payload + 8);
        let d = probe_duration(&path).unwrap();
        assert!((d - 2.0).abs() < 0.02, "duration {d}");
        let p = probe(&path).unwrap();
        assert_eq!((p.width, p.height, p.audio_tracks), (1280, 720, 1));
        assert!((p.fps - 60.0).abs() < 0.1, "fps {}", p.fps);
        let _ = std::fs::remove_file(&path);
    }
}
