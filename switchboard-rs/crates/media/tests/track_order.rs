//! Regression: audio track `i` everywhere (MediaInfo::tracks, waveforms, the
//! Player's GainProvider index) must be the i-th audio track in file order,
//! as FFmpeg numbers them. Windows' MP4 source lists streams in reverse file
//! order, which once shifted waveforms onto the wrong tracks.
//!
//! Writes a synthetic 3-track AAC MP4 with Media Foundation's Sink Writer:
//! track k carries quiet noise throughout (distinct per track) and a loud tone
//! only during second k, so its waveform must peak in bucket k.

use std::path::{Path, PathBuf};

use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::core::HSTRING;

const RATE: u32 = 48_000;
const TRACKS: usize = 3;
const SECONDS: usize = 3;

fn write_clip(path: &Path) -> windows::core::Result<()> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        MFStartup(MF_VERSION, MFSTARTUP_FULL)?;
        let writer = MFCreateSinkWriterFromURL(&HSTRING::from(path.as_os_str()), None, None)?;
        let mut streams = Vec::new();
        for _ in 0..TRACKS {
            let out = MFCreateMediaType()?;
            out.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            out.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)?;
            out.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            out.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, RATE)?;
            out.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2)?;
            out.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 24_000)?;
            let s = writer.AddStream(&out)?;
            let input = MFCreateMediaType()?;
            input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
            input.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)?;
            input.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
            input.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, RATE)?;
            input.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2)?;
            input.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 4)?;
            input.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, RATE * 4)?;
            writer.SetInputMediaType(s, &input, None)?;
            streams.push(s);
        }
        writer.BeginWriting()?;
        // 100 ms chunks, interleaved across tracks.
        let chunk = RATE as usize / 10;
        let mut seed = [0x1234_5678u32, 0x9abc_def0, 0x0f0f_1e1e];
        for c in 0..SECONDS * 10 {
            for (k, &s) in streams.iter().enumerate() {
                let mut pcm = Vec::with_capacity(chunk * 4);
                for i in 0..chunk {
                    let n = c * chunk + i;
                    seed[k] ^= seed[k] << 13;
                    seed[k] ^= seed[k] >> 17;
                    seed[k] ^= seed[k] << 5;
                    let noise = (seed[k] as f32 / u32::MAX as f32 - 0.5) * 0.02 * (k + 1) as f32;
                    let tone = if n / RATE as usize == k { 0.8 * (n as f32 * 0.0577).sin() } else { 0.0 };
                    let v = ((noise + tone) * 32767.0) as i16;
                    pcm.extend_from_slice(&v.to_le_bytes());
                    pcm.extend_from_slice(&v.to_le_bytes());
                }
                let buffer = MFCreateMemoryBuffer(pcm.len() as u32)?;
                let mut ptr = std::ptr::null_mut();
                buffer.Lock(&mut ptr, None, None)?;
                std::ptr::copy_nonoverlapping(pcm.as_ptr(), ptr, pcm.len());
                buffer.Unlock()?;
                buffer.SetCurrentLength(pcm.len() as u32)?;
                let sample = MFCreateSample()?;
                sample.AddBuffer(&buffer)?;
                sample.SetSampleTime((c * chunk) as i64 * 10_000_000 / RATE as i64)?;
                sample.SetSampleDuration(chunk as i64 * 10_000_000 / RATE as i64)?;
                writer.WriteSample(s, &sample)?;
            }
        }
        writer.Finalize()?;
    }
    Ok(())
}

struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[test]
fn waveforms_follow_file_track_order() {
    let path = std::env::temp_dir().join(format!("switchboard-media-order-{}.mp4", std::process::id()));
    let _cleanup = TempFile(path.clone());
    write_clip(&path).expect("write synthetic clip");

    let info = switchboard_media::probe(&path).expect("probe");
    assert_eq!(info.tracks.len(), TRACKS);
    for (i, t) in info.tracks.iter().enumerate() {
        assert_eq!(t.index, i);
    }

    let waves = switchboard_media::waveforms(&path, SECONDS).expect("waveforms");
    assert_eq!(waves.len(), TRACKS);
    for (k, w) in waves.iter().enumerate() {
        let loudest = w.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1)).map(|(i, _)| i);
        assert_eq!(loudest, Some(k), "track {k} should peak in second {k}: {w:?}");
    }
}
