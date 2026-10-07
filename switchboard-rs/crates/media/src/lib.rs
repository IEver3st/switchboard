//! Clip playback and analysis for the native editor, on Media Foundation and
//! WASAPI (no FFmpeg).
//!
//! - [`probe`]: duration, video size/rate/codec and audio track titles/roles,
//!   from the MP4 index alone (MF fallback for other containers).
//! - [`Player`]: hardware-decoded, GPU-scaled preview frames as CPU RGBA,
//!   per-track gain mixing to the default output, audio-clocked position.
//! - [`waveforms`]: per-track peak envelopes.
//! - [`frame_at`] / [`FrameGrabber`]: single frames for thumbnails and filmstrips.

use std::path::Path;

use anyhow::{Result, bail};

mod audio;
mod mf;
mod mp4;
mod player;
mod video;
mod waveform;

pub use player::Player;
pub use video::fit;

/// Normalized peak waveform per audio track: `buckets` values in 0..=1 for
/// each track (in [`MediaInfo::tracks`] order) spanning the clip duration.
/// Each track is normalized to its own peak and shaped with exponent 0.58,
/// as in the Electron app. Tracks decode in parallel.
pub fn waveforms(path: &Path, buckets: usize) -> Result<Vec<Vec<f32>>> {
    waveform::waveforms(path, buckets)
}

/// Diagnostics: private-bytes checkpoints through video decoder setup.
#[doc(hidden)]
pub fn debug_mem_steps(path: &Path, mark: &mut dyn FnMut(&str)) -> Result<()> {
    video::debug_mem_steps(path, mark)
}

/// Diagnostics: (MF timestamp of the first decoded sample, edit-list offset
/// from the MP4 index) per audio track, in ms.
#[doc(hidden)]
pub fn debug_audio_starts(path: &Path) -> Result<Vec<(f64, f64)>> {
    let movie = mp4::parse_file(path).ok();
    let streams = audio_streams(path, movie.as_ref())?;
    let mut out = Vec::new();
    for (i, s) in streams.iter().enumerate() {
        let r = mf::open_reader(path, None)?;
        unsafe {
            use windows::Win32::Media::MediaFoundation::MF_SOURCE_READER_ALL_STREAMS;
            r.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)?;
            r.SetStreamSelection(s.index, true)?;
        }
        let first = mf::read(&r, s.index)?;
        let t = first.sample.as_ref().and_then(|x| unsafe { x.GetSampleTime() }.ok()).unwrap_or(first.time_hns);
        let offset = movie.as_ref().and_then(|m| m.audio().nth(i)).map_or(0.0, |t| t.edit_offset_ms);
        out.push((t as f64 / mf::HNS_PER_MS, offset));
    }
    Ok(out)
}

#[derive(Clone, Debug, PartialEq)]
pub struct MediaInfo {
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    /// "H.264", "HEVC", ...; empty when the file has no video.
    pub video_codec: String,
    pub tracks: Vec<AudioTrackInfo>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioTrackInfo {
    /// 0-based audio stream order (the `track` argument of [`GainProvider::gain`]).
    pub index: usize,
    /// The title stored in the file, or "Audio N" when it has none.
    pub title: String,
    pub role: Option<TrackRole>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TrackRole {
    Game,
    Chat,
    Microphone,
    Media,
}

/// One decoded preview frame.
pub struct Frame {
    pub source_ms: f64,
    pub width: u32,
    pub height: u32,
    /// Tightly packed RGBA8, alpha 255.
    pub rgba: Vec<u8>,
}

impl std::fmt::Debug for Frame {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Frame({}x{} @ {:.3} ms)", self.width, self.height, self.source_ms)
    }
}

/// Gain applied per track at a given source time; called from the audio
/// thread once per 10 ms block per track, so it must be cheap and must not
/// block. Gains are ramped linearly between blocks (no zipper noise).
pub trait GainProvider: Send + Sync {
    fn gain(&self, track: usize, source_ms: f64) -> f32;
    fn master(&self) -> f32;
}

/// Unity gain on every track.
pub struct UnityGains;

impl GainProvider for UnityGains {
    fn gain(&self, _: usize, _: f64) -> f32 {
        1.0
    }
    fn master(&self) -> f32 {
        1.0
    }
}

// ------------------------------------------------------------------ roles

/// Maps a stored track title to a role. Accepts the current recorder's
/// titles ("Game", "Chat", "Microphone"), the FFmpeg recorder's ("Game audio",
/// "Chat audio", "Selected microphone") and common variants. A title naming
/// more than one role ("Game + Chat") gets none.
pub fn role_for_title(title: &str) -> Option<TrackRole> {
    let lower = title.to_lowercase();
    let mut found: Option<TrackRole> = None;
    for word in lower.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()) {
        let role = match word {
            "game" | "games" | "gameplay" | "desktop" | "system" => TrackRole::Game,
            "chat" | "discord" | "teamspeak" | "comms" | "party" => TrackRole::Chat,
            "mic" | "mics" | "microphone" | "microphones" => TrackRole::Microphone,
            "media" | "music" | "spotify" => TrackRole::Media,
            _ => continue,
        };
        match found {
            Some(r) if r != role => return None,
            _ => found = Some(role),
        }
    }
    found
}

fn track_info(index: usize, stored_title: &str) -> AudioTrackInfo {
    let title = stored_title.trim();
    AudioTrackInfo {
        index,
        title: if title.is_empty() { format!("Audio {}", index + 1) } else { title.to_string() },
        role: role_for_title(title),
    }
}

// ------------------------------------------------------------------ probe

/// Duration, video format and audio tracks. Reads only the MP4 index
/// (typically well under 5 ms); other containers go through Media Foundation.
pub fn probe(path: &Path) -> Result<MediaInfo> {
    probe_full(path).map(|(info, _)| info)
}

pub(crate) fn probe_full(path: &Path) -> Result<(MediaInfo, Option<mp4::Movie>)> {
    if !path.is_file() {
        bail!("{} doesn't exist", path.display());
    }
    match mp4::parse_file(path) {
        Ok(movie) if movie.video().is_some() || movie.audio().next().is_some() => {
            let info = info_from_movie(&movie);
            Ok((info, Some(movie)))
        }
        _ => probe_mf(path).map(|i| (i, None)),
    }
}

fn info_from_movie(movie: &mp4::Movie) -> MediaInfo {
    let (mut width, mut height, mut fps, mut video_codec) = (0, 0, 0.0, String::new());
    if let Some(v) = movie.video() {
        width = v.width;
        height = v.height;
        video_codec = mp4::codec_name(v.codec);
        if v.media_duration > 0 && v.timescale > 0 {
            fps = nominal_fps(v.sample_count as f64 * v.timescale as f64 / v.media_duration as f64);
        }
    }
    let tracks = movie.audio().enumerate().map(|(i, t)| track_info(i, t.title())).collect();
    MediaInfo { duration_ms: movie.duration_ms(), width, height, fps, video_codec, tracks }
}

/// Snaps a measured average rate to the common rate it is within 0.5% of
/// (recorders stamp real capture times, so averages wobble slightly).
fn nominal_fps(measured: f64) -> f64 {
    const COMMON: [f64; 12] = [23.976, 24.0, 25.0, 29.97, 30.0, 48.0, 50.0, 59.94, 60.0, 90.0, 120.0, 144.0];
    COMMON
        .iter()
        .copied()
        .filter(|c| (measured - c).abs() / c < 0.005)
        .min_by(|a, b| (measured - a).abs().total_cmp(&(measured - b).abs()))
        .unwrap_or((measured * 1000.0).round() / 1000.0)
}

fn probe_mf(path: &Path) -> Result<MediaInfo> {
    use windows::Win32::Media::MediaFoundation::*;
    mf::init_thread();
    let reader = mf::open_reader(path, None)?;
    let streams = mf::streams(&reader);
    if streams.iter().all(|s| s.major == mf::Major::Other) {
        bail!("the file has no video or audio");
    }
    let (mut width, mut height, mut fps, mut video_codec) = (0, 0, 0.0, String::new());
    if let Some(v) = streams.iter().find(|s| s.major == mf::Major::Video)
        && let Ok(t) = unsafe { reader.GetNativeMediaType(v.index, 0) }
    {
        unsafe {
            if let Ok(size) = t.GetUINT64(&MF_MT_FRAME_SIZE) {
                (width, height) = mf::unpack(size);
            }
            if let Ok(rate) = t.GetUINT64(&MF_MT_FRAME_RATE) {
                let (n, d) = mf::unpack(rate);
                if d > 0 {
                    fps = nominal_fps(n as f64 / d as f64);
                }
            }
            if let Ok(sub) = t.GetGUID(&MF_MT_SUBTYPE) {
                video_codec = if sub == MFVideoFormat_H264 {
                    "H.264".into()
                } else if sub == MFVideoFormat_HEVC {
                    "HEVC".into()
                } else if sub == MFVideoFormat_AV1 {
                    "AV1".into()
                } else if sub == MFVideoFormat_VP90 {
                    "VP9".into()
                } else {
                    // FourCC subtypes keep the code in Data1.
                    String::from_utf8_lossy(&sub.data1.to_le_bytes()).trim().to_string()
                };
            }
        }
    }
    let tracks = streams
        .iter()
        .filter(|s| s.major == mf::Major::Audio)
        .enumerate()
        .map(|(i, s)| track_info(i, &s.name))
        .collect();
    let duration_ms = mf::duration_ms(&reader).unwrap_or(0.0).round() as i64;
    Ok(MediaInfo { duration_ms, width, height, fps, video_codec, tracks })
}

/// MF audio streams in file order: entry `i` is the stream behind
/// `MediaInfo::tracks[i]`.
///
/// Windows' MP4 source lists tracks in reverse file order and numbers them
/// with its own IDs (measured: a Video/Game/Chat/Microphone file comes back as
/// Microphone, Chat, Game, Video), so the order can't be trusted. Each MF
/// stream is matched to an MP4 track by its leading compressed sample sizes
/// (exact, order-free); tracks with identical prints (e.g. two digitally
/// silent tracks) fall back to MF's stream name, then to the reversed order.
pub(crate) fn audio_streams(path: &Path, movie: Option<&mp4::Movie>) -> Result<Vec<mf::StreamInfo>> {
    mf::init_thread();
    let reader = mf::open_reader(path, None)?;
    let streams: Vec<mf::StreamInfo> = mf::streams(&reader).into_iter().filter(|s| s.major == mf::Major::Audio).collect();
    let Some(movie) = movie else { return Ok(streams) };
    let tracks: Vec<&mp4::Track> = movie.audio().collect();
    if tracks.len() != streams.len() || streams.len() <= 1 {
        return Ok(streams);
    }
    let indices: Vec<u32> = streams.iter().map(|s| s.index).collect();
    let prints = mf::first_sample_sizes(&reader, &indices, 8);
    let names: Vec<&str> = streams.iter().map(|s| s.name.as_str()).collect();
    let order = match_streams(&tracks, &prints, &names);
    Ok(order.into_iter().map(|k| streams[k].clone()).collect())
}

/// For each MP4 audio track (file order), the index into the MF stream list.
fn match_streams(tracks: &[&mp4::Track], prints: &[Vec<u32>], names: &[&str]) -> Vec<usize> {
    let n = tracks.len();
    let mut taken = vec![false; n];
    let mut map: Vec<Option<usize>> = vec![None; n];
    let fits = |t: &mp4::Track, p: &[u32]| !p.is_empty() && t.first_sizes.windows(p.len()).any(|w| w == p);
    // 1. Sample-size fingerprints, only where unambiguous both ways.
    for (k, p) in prints.iter().enumerate() {
        let cands: Vec<usize> = (0..n).filter(|&i| fits(tracks[i], p)).collect();
        let rivals = prints.iter().filter(|q| *q == p).count();
        if cands.len() == 1 && rivals == 1 && map[cands[0]].is_none() {
            map[cands[0]] = Some(k);
            taken[k] = true;
        }
    }
    // 2. Names.
    for i in 0..n {
        if map[i].is_some() || tracks[i].title().is_empty() {
            continue;
        }
        let title = tracks[i].title();
        let cands: Vec<usize> = (0..n).filter(|&k| !taken[k] && names[k].eq_ignore_ascii_case(title)).collect();
        if cands.len() == 1 {
            map[i] = Some(cands[0]);
            taken[cands[0]] = true;
        }
    }
    // 3. The rest: MF lists MP4 tracks last to first.
    let mut rest = (0..n).rev().filter(|&k| !taken[k]);
    map.into_iter().map(|m| m.or_else(|| rest.next()).unwrap_or(0)).collect()
}

// ---------------------------------------------------------- single frames

/// Decode a single frame near `source_ms` (the sync frame at or before it;
/// within one GOP, so at most ~1 s early on recorder clips), scaled to fit
/// `max_w x max_h`, as RGBA. For many frames from one file use
/// [`FrameGrabber`], which keeps the decoder open.
pub fn frame_at(path: &Path, source_ms: f64, max_w: u32, max_h: u32) -> Result<Frame> {
    FrameGrabber::open(path, max_w, max_h)?.grab(source_ms, false)
}

/// Reusable single-frame decoder for filmstrips and thumbnails. Not `Send`:
/// use it on the thread that opened it.
pub struct FrameGrabber {
    decoder: video::VideoDecoder,
    duration_ms: f64,
}

impl FrameGrabber {
    pub fn open(path: &Path, max_w: u32, max_h: u32) -> Result<FrameGrabber> {
        let info = probe(path)?;
        if info.video_codec.is_empty() && info.width == 0 {
            bail!("the file has no video");
        }
        let (w, h) = video::fit(info.width, info.height, max_w, max_h);
        let decoder = video::VideoDecoder::open(path, info.width, info.height, info.fps, w, h)?;
        Ok(FrameGrabber { decoder, duration_ms: info.duration_ms as f64 })
    }

    /// True when frames are decoded and scaled on the GPU.
    pub fn hardware(&self) -> bool {
        self.decoder.hardware
    }

    /// `exact = false`: the sync frame at or before `source_ms` (fast).
    /// `exact = true`: the frame shown at `source_ms` (decodes up to one GOP).
    pub fn grab(&mut self, source_ms: f64, exact: bool) -> Result<Frame> {
        let target = source_ms.clamp(0.0, self.duration_ms.max(0.0));
        self.decoder.seek(target)?;
        let mut prev: Option<video::Decoded> = None;
        loop {
            match self.decoder.next()? {
                Some(d) => {
                    if !exact || d.pts_ms + d.duration_ms > target + 0.5 {
                        // Past the target already (seek landed late): the
                        // previous frame is the one on screen at `target`.
                        let pick = match prev {
                            Some(p) if d.pts_ms > target + 0.5 => p,
                            _ => d,
                        };
                        return self.decoder.render(&pick, None);
                    }
                    prev = Some(d);
                }
                None => {
                    return match prev {
                        Some(p) => self.decoder.render(&p, None),
                        None => bail!("no frame could be decoded at {:.0} ms", target),
                    };
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_map_to_roles_across_recorders() {
        assert_eq!(role_for_title("Game"), Some(TrackRole::Game));
        assert_eq!(role_for_title("Chat"), Some(TrackRole::Chat));
        assert_eq!(role_for_title("Microphone"), Some(TrackRole::Microphone));
        assert_eq!(role_for_title("Game audio"), Some(TrackRole::Game));
        assert_eq!(role_for_title("Chat audio"), Some(TrackRole::Chat));
        assert_eq!(role_for_title("Selected microphone"), Some(TrackRole::Microphone));
        assert_eq!(role_for_title("  MIC "), Some(TrackRole::Microphone));
        assert_eq!(role_for_title("Discord"), Some(TrackRole::Chat));
        assert_eq!(role_for_title("Music"), Some(TrackRole::Media));
        assert_eq!(role_for_title("Game + Chat"), None);
        assert_eq!(role_for_title("SoundHandler"), None);
        assert_eq!(role_for_title(""), None);
        // Substrings don't count: "endgame" is not a role word.
        assert_eq!(role_for_title("Endgame"), None);
    }

    #[test]
    fn untitled_tracks_get_a_numbered_name() {
        let t = track_info(2, "");
        assert_eq!(t.title, "Audio 3");
        assert_eq!(t.role, None);
        assert_eq!(track_info(0, "Game audio").title, "Game audio");
    }

    fn track(title: &str, sizes: &[u32]) -> mp4::Track {
        mp4::Track {
            kind: mp4::Kind::Audio,
            handler_name: String::new(),
            udta_name: title.into(),
            timescale: 48_000,
            media_duration: 0,
            sample_count: sizes.len() as u32,
            first_sizes: sizes.to_vec(),
            codec: *b"mp4a",
            width: 0,
            height: 0,
            edit_offset_ms: 0.0,
        }
    }

    #[test]
    fn streams_match_by_sample_size_prints_regardless_of_mf_order() {
        let t = [track("", &[10, 11, 12, 13]), track("", &[20, 21, 22, 23]), track("", &[30, 31, 32, 33])];
        let refs: Vec<&mp4::Track> = t.iter().collect();
        // MF lists them reversed (as Windows' MP4 source does).
        let prints = vec![vec![30, 31, 32], vec![20, 21, 22], vec![10, 11, 12]];
        assert_eq!(match_streams(&refs, &prints, &["", "", ""]), vec![2, 1, 0]);
        // A source that keeps file order is handled too.
        let prints = vec![vec![11, 12], vec![21, 22], vec![31, 32]];
        assert_eq!(match_streams(&refs, &prints, &["", "", ""]), vec![0, 1, 2]);
    }

    #[test]
    fn identical_prints_fall_back_to_names_then_reverse_order() {
        // Two digitally silent tracks encode to identical frames.
        let t = [track("Game", &[9, 9, 9]), track("Chat", &[6, 6, 6]), track("Microphone", &[6, 6, 6])];
        let refs: Vec<&mp4::Track> = t.iter().collect();
        let prints = vec![vec![6, 6, 6], vec![6, 6, 6], vec![9, 9, 9]];
        assert_eq!(match_streams(&refs, &prints, &["Microphone", "Chat", "Game"]), vec![2, 1, 0]);
        // No names: the ambiguous pair takes MF's reversed order.
        assert_eq!(match_streams(&refs, &prints, &["", "", ""]), vec![2, 1, 0]);
    }

    #[test]
    fn frame_rates_snap_to_nominal() {
        assert_eq!(nominal_fps(1800.0 / 29.999), 60.0);
        assert_eq!(nominal_fps(29.97), 29.97);
        assert_eq!(nominal_fps(59.95), 59.94);
        assert_eq!(nominal_fps(37.5), 37.5);
    }
}
