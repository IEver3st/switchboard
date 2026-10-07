//! Peak waveforms per audio track.
//!
//! Each track decodes on its own thread (AAC decode is the cost; tracks are
//! independent), to float32 at the native rate. Samples are placed on the
//! clip timeline by their MF timestamps, which include the MP4 edit list (a
//! track that starts 11 s in shows 11 s of silence), downmixed to mono like the old app's `-ac 1`, and
//! reduced to per-bucket peaks. Each track is normalized to its own peak and
//! shaped with exponent 0.58, matching the Electron app.

use std::path::Path;

use anyhow::{Result, anyhow};
use windows::Win32::Media::MediaFoundation::*;

use crate::mf::{self, HNS_PER_MS};
use crate::mp4;

pub const SHAPE_EXPONENT: f32 = 0.58;

/// Running per-bucket peaks over a fixed timeline.
pub struct Peaks {
    pub peaks: Vec<f32>,
    total_frames: f64,
}

impl Peaks {
    pub fn new(buckets: usize, duration_ms: f64, rate: u32) -> Peaks {
        Peaks { peaks: vec![0.0; buckets], total_frames: (duration_ms * rate as f64 / 1000.0).max(1.0) }
    }

    /// Adds interleaved samples whose first frame sits at timeline frame `at`.
    pub fn add(&mut self, at: i64, samples: &[f32], channels: usize) {
        let n = self.peaks.len();
        if n == 0 || channels == 0 {
            return;
        }
        let scale = n as f64 / self.total_frames;
        let frames = samples.len() / channels;
        let mut i = 0usize;
        while i < frames {
            let frame = at + i as i64;
            if frame < 0 {
                i += (-frame) as usize;
                continue;
            }
            let bucket = (frame as f64 * scale) as usize;
            if bucket >= n {
                break;
            }
            // Frames until the next bucket boundary: scan them in one run.
            let next = ((bucket + 1) as f64 / scale).ceil() as i64;
            let run_end = ((next - at).max(i as i64 + 1) as usize).min(frames);
            let mut peak = self.peaks[bucket];
            let inv = 1.0 / channels as f32;
            for f in samples[i * channels..run_end * channels].chunks_exact(channels) {
                let mono = f.iter().sum::<f32>() * inv;
                peak = peak.max(mono.abs());
            }
            self.peaks[bucket] = peak;
            i = run_end;
        }
    }

    /// Normalizes to this track's peak and applies the display curve.
    pub fn shaped(mut self) -> Vec<f32> {
        let peak = self.peaks.iter().copied().fold(0.0f32, f32::max);
        if peak <= 0.0 || !peak.is_finite() {
            return vec![0.0; self.peaks.len()];
        }
        for p in &mut self.peaks {
            *p = (*p / peak).clamp(0.0, 1.0).powf(SHAPE_EXPONENT);
        }
        self.peaks
    }
}

pub fn waveforms(path: &Path, buckets: usize) -> Result<Vec<Vec<f32>>> {
    let movie = mp4::parse_file(path).ok();
    mf::init_thread();
    // Stream layout and duration come from MF so non-MP4 inputs work too.
    let (streams, duration_ms) = {
        // In MediaInfo::tracks order.
        let streams = crate::audio_streams(path, movie.as_ref())?;
        let reader = mf::open_reader(path, None)?;
        let duration = movie
            .as_ref()
            .map(|m| m.duration_ms() as f64)
            .filter(|d| *d > 0.0)
            .or_else(|| mf::duration_ms(&reader))
            .unwrap_or(0.0);
        (streams, duration)
    };
    if streams.is_empty() || buckets == 0 {
        return Ok(vec![Vec::new(); streams.len()]);
    }
    // Tracks decode in parallel, at most PARALLEL_TRACKS at a time.
    let mut out = Vec::with_capacity(streams.len());
    for group in streams.chunks(PARALLEL_TRACKS) {
        let peaks: Result<Vec<Vec<f32>>> = std::thread::scope(|scope| {
            let handles: Vec<_> = group
                .iter()
                .map(|s| scope.spawn(move || track_peaks(path, s.index, buckets, duration_ms)))
                .collect();
            handles
                .into_iter()
                .map(|h| h.join().map_err(|_| anyhow!("waveform worker failed"))?)
                .collect()
        });
        out.extend(peaks?);
    }
    Ok(out)
}

/// Most audio tracks of one clip decoded at once (recorder clips have three).
const PARALLEL_TRACKS: usize = 4;

fn track_peaks(path: &Path, stream: u32, buckets: usize, duration_ms: f64) -> Result<Vec<f32>> {
    mf::init_thread();
    let reader = mf::open_reader(path, None)?;
    let (rate, channels) = unsafe {
        reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)?;
        reader.SetStreamSelection(stream, true)?;
        // Native rate and channel count: no resampler in the path.
        let t = mf::float_audio_type(None, None)?;
        reader.SetCurrentMediaType(stream, None, &t)?;
        let cur = reader.GetCurrentMediaType(stream)?;
        (
            cur.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND).unwrap_or(48_000).max(1),
            cur.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS).unwrap_or(2).max(1) as usize,
        )
    };
    let mut peaks = Peaks::new(buckets, duration_ms, rate);
    let mut scratch = Vec::new();
    loop {
        let r = mf::read(&reader, stream)?;
        if let Some(sample) = &r.sample {
            let time = unsafe { sample.GetSampleTime() }.unwrap_or(r.time_hns);
            let at_ms = time as f64 / HNS_PER_MS;
            let at = (at_ms * rate as f64 / 1000.0).round() as i64;
            mf::with_bytes(sample, |b| mf::f32s(b, &mut scratch))?;
            peaks.add(at, &scratch, channels);
        }
        if r.end_of_stream() {
            break;
        }
    }
    Ok(peaks.shaped())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peaks_land_in_timeline_buckets() {
        // 1 s at 1 kHz into 10 buckets; a mono spike at 0.55 s.
        let mut p = Peaks::new(10, 1000.0, 1000);
        let mut s = vec![0.0f32; 1000];
        s[550] = -0.5;
        s[90] = 0.25;
        p.add(0, &s, 1);
        assert_eq!(p.peaks[5], 0.5);
        assert_eq!(p.peaks[0], 0.25);
        let shaped = p.shaped();
        assert_eq!(shaped[5], 1.0);
        assert!((shaped[0] - 0.5f32.powf(SHAPE_EXPONENT)).abs() < 1e-6);
        assert_eq!(shaped[3], 0.0);
    }

    #[test]
    fn offset_and_overrun_are_clamped() {
        let mut p = Peaks::new(4, 1000.0, 1000);
        // Starts 100 frames before zero and runs past the end.
        p.add(-100, &vec![0.5f32; 1200 * 2], 2);
        assert!(p.peaks.iter().all(|&v| v == 0.5));
        // Late start: only the last bucket sees data.
        let mut p = Peaks::new(4, 1000.0, 1000);
        p.add(800, &[1.0f32, 1.0], 2);
        assert_eq!(p.peaks, vec![0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn silence_stays_flat() {
        let p = Peaks::new(3, 1000.0, 48_000);
        assert_eq!(p.shaped(), vec![0.0; 3]);
    }

    #[test]
    fn stereo_is_downmixed_like_ffmpeg_ac1() {
        let mut p = Peaks::new(1, 1000.0, 1000);
        p.add(0, &[1.0, -1.0, 0.5, 0.25], 2);
        assert_eq!(p.peaks[0], 0.375);
    }
}
