//! Audio decode (one Source Reader per track, float32 48 kHz stereo), the
//! per-track timeline queue, the gain mixer, and WASAPI shared-mode output.

use std::collections::VecDeque;
use std::path::Path;

use anyhow::{Context, Result, anyhow};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::{CLSCTX_ALL, CoCreateInstance};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

use crate::mf::{self, HNS_PER_MS};

pub const RATE: u32 = 48_000;
pub const CHANNELS: usize = 2;
/// Gains are sampled once per block and ramped linearly across it.
pub const BLOCK: usize = 480; // 10 ms

pub fn ms_to_frame(ms: f64) -> i64 {
    (ms * RATE as f64 / 1000.0).round() as i64
}

pub fn frame_to_ms(frame: i64) -> f64 {
    frame as f64 * 1000.0 / RATE as f64
}

// ------------------------------------------------------------------ queue

/// Decoded PCM placed on the source timeline. Frame `i` of the clip plays at
/// `i / RATE` seconds. Frames before `start` are silence (nothing was decoded
/// there, e.g. a track that begins late); frames at or after `end()` are
/// not decoded yet (or silence after end of stream).
#[derive(Default)]
pub struct PcmQueue {
    start: i64,
    data: VecDeque<f32>,
}

/// Packets within this many frames of the expected position are appended
/// as-is; AAC timestamps round to the nearest frame.
const JITTER: i64 = 8;

impl PcmQueue {
    pub fn reset(&mut self, at: i64) {
        self.start = at;
        self.data.clear();
    }

    pub fn end(&self) -> i64 {
        self.start + (self.data.len() / CHANNELS) as i64
    }

    /// Adds interleaved stereo `samples` beginning at frame `at`. Gaps
    /// become silence; overlaps and data before the read position are trimmed.
    pub fn push(&mut self, at: i64, samples: &[f32]) {
        let frames = (samples.len() / CHANNELS) as i64;
        if self.data.is_empty() {
            // Nothing pending: the read position is `start`. Skip whatever
            // lies before it; a late first packet just moves `start` (the
            // frames before it read as silence without being stored).
            let skip = (self.start - at).clamp(0, frames);
            if skip < frames {
                self.start = self.start.max(at);
                self.data.extend(&samples[skip as usize * CHANNELS..]);
            }
            return;
        }
        let end = self.end();
        let mut skip = 0i64;
        if at > end + JITTER {
            let gap = (at - end) as usize * CHANNELS;
            self.data.extend(std::iter::repeat_n(0.0, gap));
        } else if at < end - JITTER {
            skip = (end - at).min(frames);
        }
        self.data.extend(&samples[skip as usize * CHANNELS..]);
    }

    /// Adds frames `[from, from + n)` into `out` (interleaved stereo) with a
    /// gain ramping linearly from `g0` to `g1`, then drops them.
    pub fn mix_into(&mut self, from: i64, out: &mut [f32], g0: f32, g1: f32) {
        let n = out.len() / CHANNELS;
        self.discard_before(from);
        let silent = g0 == 0.0 && g1 == 0.0;
        if !silent {
            let step = (g1 - g0) / n.max(1) as f32;
            let first = (self.start - from).max(0) as usize; // frames of leading silence
            let avail = self.data.len() / CHANNELS;
            let (a, b) = self.data.as_slices();
            for i in first..n {
                let k = i - first;
                if k >= avail {
                    break;
                }
                let g = g0 + step * i as f32;
                for c in 0..CHANNELS {
                    let j = k * CHANNELS + c;
                    let s = if j < a.len() { a[j] } else { b[j - a.len()] };
                    out[i * CHANNELS + c] += s * g;
                }
            }
        }
        self.discard_before(from + n as i64);
    }

    fn discard_before(&mut self, frame: i64) {
        if frame <= self.start {
            return;
        }
        let drop = ((frame - self.start) as usize * CHANNELS).min(self.data.len());
        self.data.drain(..drop);
        self.start = frame;
    }
}

// ----------------------------------------------------------------- reader

/// One audio track decoded to float32 48 kHz stereo.
pub struct TrackReader {
    reader: IMFSourceReader,
    stream: u32,
    pub queue: PcmQueue,
    pub eof: bool,
    scratch: Vec<f32>,
}

impl TrackReader {
    /// Timestamps come from MF's MP4 source, which applies edit lists
    /// itself (verified: a track behind an 11.016 s empty edit reports its
    /// first sample at 11016 ms), so they are already on the clip timeline.
    pub fn open(path: &Path, stream_index: u32) -> Result<TrackReader> {
        let reader = mf::open_reader(path, None)?;
        unsafe {
            reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)?;
            reader.SetStreamSelection(stream_index, true)?;
            let t = mf::float_audio_type(Some(RATE), Some(CHANNELS as u32))?;
            reader
                .SetCurrentMediaType(stream_index, None, &t)
                .map_err(|e| anyhow!("this PC can't decode the file's audio: {}", e.message()))?;
        }
        Ok(TrackReader {
            reader,
            stream: stream_index,
            queue: PcmQueue::default(),
            eof: false,
            scratch: Vec::new(),
        })
    }

    /// Positions the track so the next mixed frame is `frame`.
    pub fn seek(&mut self, frame: i64) -> Result<()> {
        // Seek a little early: MF may land after the target on some sources,
        // and the queue trims whatever precedes the read position anyway.
        mf::seek(&self.reader, (frame_to_ms(frame) - 50.0).max(0.0))?;
        self.queue.reset(frame);
        self.eof = false;
        Ok(())
    }

    /// Decodes until the queue covers `until` (exclusive) or the track ends.
    pub fn fill(&mut self, until: i64) -> Result<()> {
        while !self.eof && self.queue.end() < until {
            let r = mf::read(&self.reader, self.stream)?;
            if let Some(sample) = &r.sample {
                let time = unsafe { sample.GetSampleTime() }.unwrap_or(r.time_hns);
                let at = ms_to_frame(time as f64 / HNS_PER_MS);
                let scratch = &mut self.scratch;
                mf::with_bytes(sample, |b| mf::f32s(b, scratch))?;
                self.queue.push(at, &self.scratch);
            }
            if r.end_of_stream() {
                self.eof = true;
            }
        }
        Ok(())
    }
}

// ----------------------------------------------------------------- output

/// WASAPI shared-mode render stream on the default endpoint, fed float32
/// 48 kHz stereo (Windows converts to the mix format).
pub struct Output {
    client: IAudioClient,
    render: IAudioRenderClient,
    clock: IAudioClock,
    clock_freq: u64,
    pub buffer_frames: u32,
    event: HANDLE,
    started: bool,
}

// The COM pointers are only used from the audio thread that created them.
impl Output {
    pub fn open() -> Result<Output> {
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).context("no audio output device")?;
            let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
            let format = WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
                nChannels: CHANNELS as u16,
                nSamplesPerSec: RATE,
                nAvgBytesPerSec: RATE * 4 * CHANNELS as u32,
                nBlockAlign: 4 * CHANNELS as u16,
                wBitsPerSample: 32,
                cbSize: 0,
            };
            // 60 ms buffer: small enough that seeks and volume changes feel
            // immediate, large enough to ride out a scheduling hiccup.
            client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                        | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                        | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                    600_000,
                    0,
                    &format,
                    None,
                )
                .context("audio output Initialize")?;
            let event = CreateEventW(None, false, false, None)?;
            if let Err(e) = client.SetEventHandle(event) {
                let _ = CloseHandle(event);
                return Err(e.into());
            }
            let buffer_frames = client.GetBufferSize()?;
            let render: IAudioRenderClient = client.GetService()?;
            let clock: IAudioClock = client.GetService()?;
            let clock_freq = clock.GetFrequency()?.max(1);
            Ok(Output { client, render, clock, clock_freq, buffer_frames, event, started: false })
        }
    }

    /// Frames that can be written now.
    pub fn writable(&self) -> Result<u32> {
        let padding = unsafe { self.client.GetCurrentPadding()? };
        Ok(self.buffer_frames.saturating_sub(padding))
    }

    /// Writes interleaved stereo frames.
    pub fn write(&self, pcm: &[f32]) -> Result<()> {
        let frames = (pcm.len() / CHANNELS) as u32;
        if frames == 0 {
            return Ok(());
        }
        unsafe {
            let ptr = self.render.GetBuffer(frames)? as *mut f32;
            std::ptr::copy_nonoverlapping(pcm.as_ptr(), ptr, pcm.len());
            self.render.ReleaseBuffer(frames, 0)?;
        }
        Ok(())
    }

    pub fn start(&mut self) -> Result<()> {
        if !self.started {
            unsafe { self.client.Start()? };
            self.started = true;
        }
        Ok(())
    }

    /// Stops and discards everything queued; the clock restarts at zero.
    pub fn stop_and_flush(&mut self) {
        unsafe {
            let _ = self.client.Stop();
            let _ = self.client.Reset();
        }
        self.started = false;
    }

    /// (frames played since the last flush, QPC time of that reading in 100 ns).
    pub fn played(&self) -> Result<(f64, i64)> {
        let mut pos = 0u64;
        let mut qpc = 0u64;
        unsafe { self.clock.GetPosition(&mut pos, Some(&mut qpc))? };
        Ok((pos as f64 * RATE as f64 / self.clock_freq as f64, qpc as i64))
    }

    /// Waits for the device to want more data (bounded).
    pub fn wait(&self, timeout_ms: u32) -> bool {
        unsafe { WaitForSingleObject(self.event, timeout_ms) == WAIT_OBJECT_0 }
    }
}

impl Drop for Output {
    fn drop(&mut self) {
        unsafe {
            let _ = self.client.Stop();
            let _ = CloseHandle(self.event);
        }
    }
}

/// True for errors that mean the endpoint went away (unplug, default device
/// change, audio service restart); the stream must be reopened.
pub fn device_lost(e: &anyhow::Error) -> bool {
    e.downcast_ref::<windows::core::Error>().is_some_and(|w| {
        w.code() == AUDCLNT_E_DEVICE_INVALIDATED || w.code() == AUDCLNT_E_SERVICE_NOT_RUNNING
    })
}

/// Final output stage: master gain ramp and hard clip.
pub fn apply_master(out: &mut [f32], g0: f32, g1: f32) {
    let n = (out.len() / CHANNELS).max(1);
    let step = (g1 - g0) / n as f32;
    for (i, frame) in out.chunks_exact_mut(CHANNELS).enumerate() {
        let g = g0 + step * i as f32;
        for s in frame {
            *s = (*s * g).clamp(-1.0, 1.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stereo(frames: usize, v: f32) -> Vec<f32> {
        vec![v; frames * CHANNELS]
    }

    #[test]
    fn late_track_reads_as_silence_without_storing_it() {
        // A track whose first packet sits 11 s in (empty edit list entry).
        let mut q = PcmQueue::default();
        q.reset(0);
        q.push(528_768, &stereo(1024, 0.5));
        assert_eq!(q.data.len(), 1024 * CHANNELS);
        let mut out = stereo(BLOCK, 0.0);
        q.mix_into(0, &mut out, 1.0, 1.0);
        assert!(out.iter().all(|&s| s == 0.0));
        // Reading across the start picks the data up at the right frame.
        let mut out = stereo(BLOCK, 0.0);
        q.mix_into(528_768 - 10, &mut out, 1.0, 1.0);
        assert_eq!(out[9 * CHANNELS], 0.0);
        assert_eq!(out[10 * CHANNELS], 0.5);
    }

    #[test]
    fn data_before_the_read_position_is_trimmed() {
        let mut q = PcmQueue::default();
        q.reset(1000);
        let mut pkt = stereo(1024, 0.0);
        pkt[1000 * CHANNELS] = 0.25; // frame 1000 lands at the read position
        q.push(0, &pkt);
        assert_eq!(q.end(), 1024);
        let mut out = stereo(4, 0.0);
        q.mix_into(1000, &mut out, 1.0, 1.0);
        assert_eq!(out[0], 0.25);
    }

    #[test]
    fn gaps_are_filled_and_overlaps_trimmed() {
        let mut q = PcmQueue::default();
        q.reset(0);
        q.push(0, &stereo(100, 1.0));
        q.push(200, &stereo(100, 1.0)); // 100-frame gap
        assert_eq!(q.end(), 300);
        q.push(250, &stereo(100, 1.0)); // overlaps by 50
        assert_eq!(q.end(), 350);
        let mut out = stereo(350, 0.0);
        q.mix_into(0, &mut out, 1.0, 1.0);
        assert_eq!(out[150 * CHANNELS], 0.0);
        assert_eq!(out[320 * CHANNELS], 1.0);
    }

    #[test]
    fn mixing_sums_tracks_with_ramped_gain() {
        let mut a = PcmQueue::default();
        let mut b = PcmQueue::default();
        a.reset(0);
        b.reset(0);
        a.push(0, &stereo(BLOCK, 0.5));
        b.push(0, &stereo(BLOCK, 0.25));
        let mut out = stereo(BLOCK, 0.0);
        a.mix_into(0, &mut out, 1.0, 1.0);
        b.mix_into(0, &mut out, 0.0, 1.0);
        assert!((out[0] - 0.5).abs() < 1e-6);
        let last = (BLOCK - 1) * CHANNELS;
        assert!((out[last] - (0.5 + 0.25 * (BLOCK - 1) as f32 / BLOCK as f32)).abs() < 1e-5);
        apply_master(&mut out, 4.0, 4.0);
        assert_eq!(out[last], 1.0); // clipped
    }

    #[test]
    fn frame_conversions_round_trip() {
        assert_eq!(ms_to_frame(11_016.0), 528_768);
        assert_eq!(frame_to_ms(48_000), 1000.0);
    }
}
