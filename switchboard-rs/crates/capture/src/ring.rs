//! Disk-backed replay ring. Encoded packets go to short segment files; only a
//! small index stays in memory. Files are created with
//! FILE_ATTRIBUTE_TEMPORARY so short-lived segments usually stay in the OS
//! cache instead of being flushed to disk.
//!
//! Writers stage packets and publish them to the index only after their bytes
//! are in the file, so anything a reader can see is readable. Audio stages
//! many small packets per write; video writes each packet as it arrives.
//! Evicted files are deleted outside the index lock.

use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::windows::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{Result, bail};

const FILE_ATTRIBUTE_TEMPORARY: u32 = 0x100;
const SEGMENT_HNS: i64 = 10_000_000;
/// Bytes a reader fetches per file read during a save.
const READ_AHEAD: usize = 512 * 1024;

#[derive(Clone, Copy, Debug)]
pub struct Packet {
    /// Presentation time, absolute QPC in 100 ns units.
    pub pts: i64,
    pub dur: i64,
    pub key: bool,
    seg: u64,
    off: u64,
    pub len: u32,
}

struct Segment {
    id: u64,
    first_pts: i64,
    path: PathBuf,
}

struct Index {
    packets: VecDeque<Packet>,
    segments: VecDeque<Segment>,
    /// First segment id each live save still needs.
    pins: Vec<u64>,
    bytes: u64,
}

#[derive(Default)]
pub struct RingCounters {
    /// File writes issued by the writer.
    pub writes: AtomicU64,
    /// Pinned segments evicted anyway because the ring hit its byte ceiling.
    pub forced_evictions: AtomicU64,
    /// Segment files whose deletion failed at least once.
    pub delete_retries: AtomicU64,
}

pub struct TrackRing {
    dir: PathBuf,
    prefix: String,
    retain_hns: i64,
    /// Hard cap on indexed bytes. Normal retention stays far below it; it
    /// only bites when a stalled save pins segments for too long.
    max_bytes: u64,
    index: Mutex<Index>,
    pub counters: RingCounters,
}

impl TrackRing {
    pub fn new(dir: &Path, prefix: &str, retain_hns: i64, max_bytes: u64) -> Arc<TrackRing> {
        Arc::new(TrackRing {
            dir: dir.to_path_buf(),
            prefix: prefix.to_string(),
            retain_hns,
            max_bytes,
            index: Mutex::new(Index { packets: VecDeque::new(), segments: VecDeque::new(), pins: Vec::new(), bytes: 0 }),
            counters: RingCounters::default(),
        })
    }

    /// `batched` writers keep packets in memory until `flush`; others write
    /// and publish every packet immediately.
    pub fn writer(self: &Arc<Self>, batched: bool) -> RingWriter {
        RingWriter {
            ring: self.clone(),
            file: None,
            seg: 0,
            off: 0,
            seg_start: i64::MIN,
            buf: Vec::new(),
            staged: Vec::new(),
            batched,
            retry: Vec::new(),
        }
    }

    /// Packets overlapping `[from, to)`, with their segments pinned against
    /// eviction until the returned `Pin` drops.
    pub fn range(self: &Arc<Self>, from: i64, to: i64) -> (Vec<Packet>, Pin) {
        let mut ix = self.index.lock().unwrap();
        let packets: Vec<Packet> = ix.packets.iter().filter(|p| p.pts + p.dur > from && p.pts < to).copied().collect();
        let pin = self.pin_locked(&mut ix, &packets);
        (packets, pin)
    }

    /// Video packets from the last keyframe at or before `from` through `to`,
    /// pinned like `range`.
    pub fn range_from_keyframe(self: &Arc<Self>, from: i64, to: i64) -> (Vec<Packet>, Pin) {
        let mut ix = self.index.lock().unwrap();
        let start = ix
            .packets
            .iter()
            .rposition(|p| p.key && p.pts <= from)
            .or_else(|| ix.packets.iter().position(|p| p.key))
            .unwrap_or(ix.packets.len());
        let packets: Vec<Packet> = ix.packets.iter().skip(start).take_while(|p| p.pts <= to).copied().collect();
        let pin = self.pin_locked(&mut ix, &packets);
        (packets, pin)
    }

    fn pin_locked(self: &Arc<Self>, ix: &mut Index, packets: &[Packet]) -> Pin {
        let first = packets.first().map(|p| p.seg);
        if let Some(seg) = first {
            ix.pins.push(seg);
        }
        Pin { ring: self.clone(), seg: first }
    }

    pub fn newest_pts(&self) -> Option<i64> {
        self.index.lock().unwrap().packets.back().map(|p| p.pts + p.dur)
    }

    pub fn oldest_pts(&self) -> Option<i64> {
        self.index.lock().unwrap().packets.front().map(|p| p.pts)
    }

    pub fn bytes(&self) -> u64 {
        self.index.lock().unwrap().bytes
    }

    fn seg_path(&self, id: u64) -> PathBuf {
        self.dir.join(format!("{}_{id:06}.bin", self.prefix))
    }

    pub fn reader(&self) -> RingReader<'_> {
        RingReader { ring: self, open: None, cache: Vec::new(), cache_seg: 0, cache_off: 0 }
    }

    /// Removes expired segments from the index and returns their files for
    /// deletion after the lock is released.
    fn evict(&self, ix: &mut Index, newest: i64, doomed: &mut Vec<PathBuf>) {
        let cutoff = newest - self.retain_hns;
        let pinned_from = ix.pins.iter().copied().min();
        // Always keep the segment being written.
        while ix.segments.len() > 1 {
            let over = ix.bytes > self.max_bytes;
            let expired = ix.segments[1].first_pts <= cutoff;
            if !over && !expired {
                break;
            }
            let id = ix.segments[0].id;
            if pinned_from.is_some_and(|p| id >= p) {
                if !over {
                    break;
                }
                // A save stalled long enough to hit the ceiling loses its
                // oldest data rather than letting the cache grow without bound.
                self.counters.forced_evictions.fetch_add(1, Ordering::Relaxed);
            }
            while ix.packets.front().is_some_and(|p| p.seg == id) {
                let p = ix.packets.pop_front().unwrap();
                ix.bytes -= p.len as u64;
            }
            doomed.push(ix.segments.pop_front().unwrap().path);
        }
    }
}

pub struct Pin {
    ring: Arc<TrackRing>,
    seg: Option<u64>,
}

impl Drop for Pin {
    fn drop(&mut self) {
        if let Some(seg) = self.seg {
            let mut ix = self.ring.index.lock().unwrap();
            if let Some(i) = ix.pins.iter().position(|&s| s == seg) {
                ix.pins.swap_remove(i);
            }
        }
    }
}

pub struct RingWriter {
    ring: Arc<TrackRing>,
    file: Option<File>,
    seg: u64,
    /// File offset of the next staged byte.
    off: u64,
    seg_start: i64,
    buf: Vec<u8>,
    staged: Vec<Packet>,
    batched: bool,
    /// Evicted files whose deletion failed; retried on later evictions.
    retry: Vec<PathBuf>,
}

impl RingWriter {
    /// Appends one packet. `can_split` marks a valid segment boundary
    /// (a keyframe for video, any packet for audio).
    pub fn push(&mut self, pts: i64, dur: i64, key: bool, can_split: bool, data: &[u8]) -> Result<()> {
        if self.file.is_none() || (can_split && pts - self.seg_start >= SEGMENT_HNS) {
            self.flush()?;
            self.seg += 1;
            let path = self.ring.seg_path(self.seg);
            let file = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .attributes(FILE_ATTRIBUTE_TEMPORARY)
                .open(&path)?;
            self.file = Some(file);
            self.off = 0;
            self.seg_start = pts;
            self.ring.index.lock().unwrap().segments.push_back(Segment { id: self.seg, first_pts: pts, path });
        }
        self.staged.push(Packet { pts, dur, key, seg: self.seg, off: self.off, len: data.len() as u32 });
        self.off += data.len() as u64;
        if self.batched {
            self.buf.extend_from_slice(data);
            Ok(())
        } else {
            self.write_and_publish(data)
        }
    }

    /// Writes staged bytes and publishes their packets.
    pub fn flush(&mut self) -> Result<()> {
        if self.staged.is_empty() {
            return Ok(());
        }
        let buf = std::mem::take(&mut self.buf);
        let result = self.write_and_publish(&buf);
        self.buf = buf;
        self.buf.clear();
        result
    }

    fn write_and_publish(&mut self, bytes: &[u8]) -> Result<()> {
        let Some(file) = self.file.as_mut() else {
            self.staged.clear();
            bail!("ring segment is not open")
        };
        if let Err(e) = file.write_all(bytes) {
            // The file offset is now unknown: drop the staged packets and
            // start a fresh segment on the next push.
            self.staged.clear();
            self.file = None;
            return Err(e.into());
        }
        self.ring.counters.writes.fetch_add(1, Ordering::Relaxed);
        let mut doomed = Vec::new();
        {
            let mut ix = self.ring.index.lock().unwrap();
            let newest = self.staged.last().map(|p| p.pts).unwrap_or(i64::MIN);
            for p in self.staged.drain(..) {
                ix.bytes += p.len as u64;
                ix.packets.push_back(p);
            }
            self.ring.evict(&mut ix, newest, &mut doomed);
        }
        if !doomed.is_empty() {
            let retry = std::mem::take(&mut self.retry);
            for path in retry.into_iter().chain(doomed) {
                self.delete(path);
            }
        }
        Ok(())
    }

    fn delete(&mut self, path: PathBuf) {
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                self.ring.counters.delete_retries.fetch_add(1, Ordering::Relaxed);
                self.retry.push(path);
            }
        }
    }
}

impl Drop for RingWriter {
    fn drop(&mut self) {
        let _ = self.flush();
        for path in std::mem::take(&mut self.retry) {
            let _ = std::fs::remove_file(path);
        }
    }
}

pub struct RingReader<'a> {
    ring: &'a TrackRing,
    open: Option<(u64, File)>,
    /// Read-ahead window: consecutive packets of one segment are contiguous
    /// in the file, so a save reads large runs instead of seeking per packet.
    cache: Vec<u8>,
    cache_seg: u64,
    cache_off: u64,
}

impl RingReader<'_> {
    pub fn read(&mut self, p: &Packet, buf: &mut Vec<u8>) -> Result<()> {
        let len = p.len as usize;
        let hit = self.cache_seg == p.seg
            && p.off >= self.cache_off
            && p.off + len as u64 <= self.cache_off + self.cache.len() as u64;
        if !hit {
            self.fill(p)?;
        }
        let start = (p.off - self.cache_off) as usize;
        buf.clear();
        buf.extend_from_slice(&self.cache[start..start + len]);
        Ok(())
    }

    fn fill(&mut self, p: &Packet) -> Result<()> {
        if self.open.as_ref().map(|(id, _)| *id) != Some(p.seg) {
            self.open = Some((p.seg, File::open(self.ring.seg_path(p.seg))?));
        }
        let f = &mut self.open.as_mut().unwrap().1;
        f.seek(SeekFrom::Start(p.off))?;
        self.cache.resize(READ_AHEAD.max(p.len as usize), 0);
        let mut n = 0;
        while n < self.cache.len() {
            match f.read(&mut self.cache[n..])? {
                0 => break,
                k => n += k,
            }
        }
        self.cache.truncate(n);
        self.cache_seg = p.seg;
        self.cache_off = p.off;
        if n < p.len as usize {
            self.cache.clear();
            bail!("replay segment is shorter than its index");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("sb-ring-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    const S: i64 = 10_000_000;
    const NO_CAP: u64 = u64::MAX;

    #[test]
    fn evicts_whole_segments_older_than_retention() {
        let dir = temp_dir("evict");
        let ring = TrackRing::new(&dir, "v", 5 * S, NO_CAP);
        let mut w = ring.writer(false);
        // 20 s of 10 fps video, a keyframe every second.
        for i in 0..200i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[i as u8; 100]).unwrap();
        }
        let span = ring.newest_pts().unwrap() - ring.oldest_pts().unwrap();
        assert!((5 * S..=7 * S).contains(&span), "kept {} s", span / S);
        let files = std::fs::read_dir(&dir).unwrap().count();
        assert!(files <= 8, "{files} segment files left");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pins_hold_only_the_segments_a_save_needs() {
        let dir = temp_dir("pin");
        let ring = TrackRing::new(&dir, "v", 2 * S, NO_CAP);
        let mut w = ring.writer(false);
        for i in 0..30i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[i as u8; 10]).unwrap();
        }
        // A save of 1.5..2.5 s pins from the segment that starts at 1 s.
        let (packets, pin) = ring.range_from_keyframe(S + S / 2, 2 * S + S / 2);
        assert!(packets[0].key && packets[0].pts == S);
        for i in 30..80i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[i as u8; 10]).unwrap();
        }
        // The segment before the pin was evicted; the pinned ones were not.
        assert_eq!(ring.oldest_pts(), Some(S));
        let mut r = ring.reader();
        let mut buf = Vec::new();
        r.read(&packets[3], &mut buf).unwrap();
        assert_eq!(buf, vec![13u8; 10]);
        drop(r);
        drop(pin);
        w.push(8 * S, S / 10, true, true, &[0; 10]).unwrap();
        assert!(ring.oldest_pts().unwrap() >= 6 * S);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn byte_ceiling_overrides_a_stalled_pin() {
        let dir = temp_dir("ceiling");
        // 100 bytes per packet, 10 per segment: 1000 bytes per segment.
        let ring = TrackRing::new(&dir, "v", 2 * S, 5_000);
        let mut w = ring.writer(false);
        for i in 0..30i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[1; 100]).unwrap();
        }
        let (_packets, _pin) = ring.range(0, 30 * S);
        for i in 30..300i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[1; 100]).unwrap();
        }
        assert!(ring.bytes() <= 5_000 + 1_000, "{} bytes", ring.bytes());
        assert!(ring.counters.forced_evictions.load(Ordering::Relaxed) > 0);
        let files = std::fs::read_dir(&dir).unwrap().count();
        assert!(files <= 7, "{files} files");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn batched_packets_publish_only_after_flush() {
        let dir = temp_dir("batch");
        let ring = TrackRing::new(&dir, "a", 60 * S, NO_CAP);
        let mut w = ring.writer(true);
        let frame = 213_333;
        for i in 0..20i64 {
            w.push(i * frame, frame, true, true, &[i as u8; 300]).unwrap();
        }
        assert_eq!(ring.newest_pts(), None);
        assert_eq!(ring.counters.writes.load(Ordering::Relaxed), 0);
        w.flush().unwrap();
        assert_eq!(ring.counters.writes.load(Ordering::Relaxed), 1);
        let (packets, _pin) = ring.range(0, S);
        assert_eq!(packets.len(), 20);
        let mut r = ring.reader();
        let mut buf = Vec::new();
        for (i, p) in packets.iter().enumerate() {
            r.read(p, &mut buf).unwrap();
            assert_eq!(buf, vec![i as u8; 300]);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_deletes_are_retried() {
        let dir = temp_dir("retry");
        let ring = TrackRing::new(&dir, "v", 2 * S, NO_CAP);
        let mut w = ring.writer(false);
        w.push(0, S / 10, true, true, &[1; 10]).unwrap();
        // Something (antivirus, an indexer) holds the first segment open
        // without delete sharing.
        let first = ring.seg_path(1);
        let blocker = OpenOptions::new().read(true).share_mode(3).open(&first).unwrap();
        for i in 1..50i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[1; 10]).unwrap();
        }
        assert!(ring.oldest_pts().unwrap() > 0, "not evicted from the index");
        assert!(first.exists());
        assert!(ring.counters.delete_retries.load(Ordering::Relaxed) > 0);
        drop(blocker);
        for i in 50..70i64 {
            w.push(i * S / 10, S / 10, i % 10 == 0, i % 10 == 0, &[1; 10]).unwrap();
        }
        assert!(!first.exists(), "retry did not delete the file");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_span_segments_and_large_packets() {
        let dir = temp_dir("read");
        let ring = TrackRing::new(&dir, "v", 600 * S, NO_CAP);
        let mut w = ring.writer(false);
        for i in 0..40i64 {
            let len = if i % 10 == 0 { READ_AHEAD + 7 } else { 1000 + i as usize };
            w.push(i * S / 2, S / 2, i % 10 == 0, i % 10 == 0, &vec![i as u8; len]).unwrap();
        }
        let (packets, _pin) = ring.range_from_keyframe(0, 100 * S);
        assert_eq!(packets.len(), 40);
        let mut r = ring.reader();
        let mut buf = Vec::new();
        for (i, p) in packets.iter().enumerate() {
            r.read(p, &mut buf).unwrap();
            assert_eq!(buf.len(), p.len as usize);
            assert!(buf.iter().all(|&b| b == i as u8));
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
impl Packet {
    pub(crate) fn at(pts: i64, dur: i64) -> Packet {
        Packet { pts, dur, key: true, seg: 0, off: 0, len: 0 }
    }
}
