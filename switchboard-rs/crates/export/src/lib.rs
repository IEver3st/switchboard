//! Export pipeline: renders a `switchboard_project::Project` to an MP4 by
//! driving the FFmpeg CLI, ported from the Electron app's montage-v2
//! renderer. Every export (single-clip edit, trimmed share, montage) takes
//! the same path:
//!
//! 1. each segment renders to an intermediate MP4 (H.264 yuv420p, AAC 48 kHz
//!    stereo) through a simple or advanced filtergraph,
//! 2. the segments concatenate with stream copy, or with an audio-only music
//!    pass (fades, loop, automation, sidechain ducking keyed by the mic),
//! 3. size-targeted exports that overshoot retry up to twice with libx264
//!    two-pass, the second time with a measured bitrate correction.
//!
//! A single unedited clip at Original quality is copied instead.
//!
//! FFmpeg runs only while an export is active; cancellation kills it and
//! removes partial output. All children sit in a kill-on-close job object.

mod ffmpeg;
pub mod graph;
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::thread::JoinHandle;

use anyhow::{Result, anyhow, bail};
use switchboard_project::{Canvas, Project, Segment, TrackTrim, canvas_dimensions};

pub use ffmpeg::{ProbedClip, audio_waveform, detect_encoders, free_bytes, locate_ffmpeg, probe_audio, probe_clip};
use graph::Target;

pub const METADATA_COMMENT: &str = "comment=Created with Switchboard";
/// Share size presets offered for single clips.
pub const SHARE_PRESETS_MB: [u64; 3] = [10, 25, 50];
const MB: u64 = 1_048_576;
/// Graphs longer than this go through `-/filter_complex <file>` to stay
/// under the Windows command-line limit.
const INLINE_GRAPH_LIMIT: usize = 24_000;

#[derive(Clone, Debug, PartialEq)]
pub struct ClipSource {
    pub clip_id: String,
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    /// Audio stream count, in stream order (at most 8 are used).
    pub audio_tracks: usize,
    /// Audio stream index of the Microphone track; keys music ducking.
    pub mic_track: Option<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SizeTarget {
    /// Quality mode, no size cap.
    Original,
    Megabytes(u64),
}

impl SizeTarget {
    pub fn bytes(self) -> Option<u64> {
        match self {
            SizeTarget::Original => None,
            SizeTarget::Megabytes(mb) => Some(mb * MB),
        }
    }
}

#[derive(Clone, Debug)]
pub struct ExportJob {
    pub project: Project,
    pub sources: Vec<ClipSource>,
    pub music_path: Option<PathBuf>,
    pub target: SizeTarget,
    pub output: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Encoder {
    Nvenc,
    Amf,
    Qsv,
    Libx264,
}

impl Encoder {
    pub fn name(self) -> &'static str {
        match self {
            Encoder::Nvenc => "h264_nvenc",
            Encoder::Amf => "h264_amf",
            Encoder::Qsv => "h264_qsv",
            Encoder::Libx264 => "libx264",
        }
    }

    pub fn is_hardware(self) -> bool {
        self != Encoder::Libx264
    }

    /// Encoder arguments: constant quality without a bitrate, otherwise the
    /// size-limited VBV settings. Always ends with yuv420p.
    pub fn args(self, video_kbps: Option<u32>) -> Vec<String> {
        let name = self.name();
        let mut a: Vec<&str> = match (self, video_kbps) {
            (Encoder::Nvenc, None) => vec!["-c:v", name, "-preset", "p4", "-rc", "vbr", "-cq", "18", "-b:v", "0"],
            (Encoder::Amf, None) => vec!["-c:v", name, "-quality", "balanced", "-rc", "cqp", "-qp_i", "18", "-qp_p", "18"],
            (Encoder::Qsv, None) => vec!["-c:v", name, "-preset", "fast", "-global_quality", "18"],
            (Encoder::Libx264, None) => vec!["-c:v", name, "-preset", "veryfast", "-crf", "18"],
            (Encoder::Nvenc, Some(_)) => vec!["-c:v", name, "-preset", "p4", "-tune", "hq", "-rc", "vbr", "-multipass", "qres"],
            (Encoder::Amf, Some(_)) => vec!["-c:v", name, "-quality", "balanced", "-rc", "vbr_peak"],
            (Encoder::Qsv, Some(_)) => vec!["-c:v", name, "-preset", "medium"],
            (Encoder::Libx264, Some(_)) => vec!["-c:v", name, "-preset", "veryfast"],
        };
        let mut out: Vec<String> = a.drain(..).map(String::from).collect();
        if let Some(k) = video_kbps {
            out.extend(["-b:v".into(), format!("{k}k"), "-maxrate".into(), format!("{k}k"), "-bufsize".into(), format!("{}k", k * 2)]);
        }
        out.extend(["-pix_fmt".into(), "yuv420p".into()]);
        out
    }
}

/// Hardware H.264 encoders that completed a test encode.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Encoders {
    pub nvenc: bool,
    pub amf: bool,
    pub qsv: bool,
}

impl Encoders {
    /// NVENC, then AMF, then QSV, then libx264 (the old app's order).
    pub fn best(&self) -> Encoder {
        if self.nvenc {
            Encoder::Nvenc
        } else if self.amf {
            Encoder::Amf
        } else if self.qsv {
            Encoder::Qsv
        } else {
            Encoder::Libx264
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Progress {
    Preparing,
    /// Monotonic 0..=1 across every FFmpeg step and retry.
    Rendering { fraction: f32 },
    Finalizing,
    Done { path: PathBuf, bytes: u64 },
    Failed { message: String },
    Cancelled,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PlanKind {
    /// Unedited single clip at Original quality: copy the file.
    Copy { source: PathBuf },
    Render,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepKind {
    Segment { index: usize, pass: Option<u8> },
    /// Stream-copy concatenation of the rendered segments.
    Concat,
    /// Concatenation with the music pass (video copied, audio re-encoded).
    Music,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Step {
    pub kind: StepKind,
    /// FFmpeg arguments, excluding the executable.
    pub args: Vec<String>,
    /// Output duration this step writes, for `out_time_us` progress.
    pub expected_s: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PlannedFile {
    pub path: PathBuf,
    pub contents: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Plan {
    pub kind: PlanKind,
    pub output: PathBuf,
    /// Hidden file beside `output`; renamed over it when the export succeeds.
    pub working_output: PathBuf,
    /// Temporary directory for segments and lists; removed afterwards.
    pub work_dir: PathBuf,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub canvas: Canvas,
    /// Encoder for the first attempt.
    pub encoder: Encoder,
    /// Video bitrate for size targets; `None` for quality mode.
    pub video_kbps: Option<u32>,
    pub audio_kbps: u32,
    pub target_bytes: Option<u64>,
    /// Edited output duration.
    pub duration_ms: i64,
    /// Segments also carry the microphone as a second audio stream for ducking.
    pub include_voice: bool,
    /// Files to write before running the steps.
    pub files: Vec<PlannedFile>,
    pub steps: Vec<Step>,
}

/// False when the export is a plain file copy, so no encoder test is needed.
pub fn needs_encoder(job: &ExportJob) -> bool {
    Ctx::new(job, "probe").map(|ctx| ctx.copy_source().is_none()).unwrap_or(true)
}

/// Builds the first-attempt plan with a fresh work directory.
pub fn plan(job: &ExportJob, encoders: &Encoders) -> Result<Plan> {
    plan_with_id(job, encoders, &switchboard_project::uuid())
}

/// Like [`plan`] with a fixed id for the work directory and working output.
pub fn plan_with_id(job: &ExportJob, encoders: &Encoders, id: &str) -> Result<Plan> {
    let ctx = Ctx::new(job, id)?;
    if let Some(source) = ctx.copy_source() {
        return Ok(ctx.plan(PlanKind::Copy { source }, encoders.best(), vec![], vec![]));
    }
    let encoder = encoders.best();
    let attempt = Attempt { video_kbps: ctx.video_kbps, two_pass: false };
    let mut steps = Vec::new();
    let mut files = Vec::new();
    for i in 0..job.project.segments.len() {
        let (s, f) = ctx.segment_steps(i, encoder, attempt);
        steps.extend(s);
        files.extend(f);
    }
    let (step, list) = ctx.final_step();
    steps.push(step);
    files.push(list);
    Ok(ctx.plan(PlanKind::Render, encoder, steps, files))
}

#[derive(Clone, Copy)]
struct Attempt {
    video_kbps: Option<u32>,
    two_pass: bool,
}

struct Ctx<'a> {
    job: &'a ExportJob,
    sources: Vec<&'a ClipSource>,
    work_dir: PathBuf,
    working_output: PathBuf,
    target_bytes: Option<u64>,
    video_kbps: Option<u32>,
    audio_kbps: u32,
    duration_ms: i64,
    music: Option<(PathBuf, String)>,
    include_voice: bool,
}

impl<'a> Ctx<'a> {
    fn new(job: &'a ExportJob, id: &str) -> Result<Ctx<'a>> {
        let p = &job.project;
        if p.segments.is_empty() {
            bail!("Add at least one clip before exporting the montage.");
        }
        let mut sources = Vec::with_capacity(p.segments.len());
        let mut missing = Vec::new();
        for s in &p.segments {
            match job.sources.iter().find(|c| c.clip_id == s.clip_id) {
                Some(c) => sources.push(c),
                None => missing.push(s.clip_id.clone()),
            }
        }
        if !missing.is_empty() {
            let more = if missing.len() > 3 { format!(" and {} more", missing.len() - 3) } else { String::new() };
            bail!("Montage source unavailable: {}{more}. Remove or restore it before exporting.", missing[..missing.len().min(3)].join(", "));
        }
        let out = path_key(&job.output);
        if sources.iter().any(|c| path_key(&c.path) == out) {
            bail!("Choose a different file name so every source clip stays intact.");
        }
        if job.music_path.as_deref().is_some_and(|m| path_key(m) == out) {
            bail!("Choose a different file name so the imported music stays intact.");
        }
        if p.music.is_some() && job.music_path.is_none() {
            bail!("The imported music file is missing. Replace it or remove the music track before exporting.");
        }
        let duration_ms = p.segments.iter().map(Segment::duration_ms).sum::<i64>().max(1);
        let target_bytes = job.target.bytes();
        let (video_kbps, audio_kbps) = size_budget(target_bytes, duration_ms)?;
        let music = match (&p.music, &job.music_path) {
            (Some(m), Some(path)) => graph::music_mix_graph(&m.normalized(duration_ms), duration_ms).map(|g| (path.clone(), g)),
            _ => None,
        };
        let include_voice = music.is_some() && p.music.as_ref().and_then(|m| m.ducking).is_some_and(|d| d.enabled);
        let dir = job.output.parent().map(Path::to_path_buf).unwrap_or_default();
        Ok(Ctx {
            job,
            sources,
            work_dir: std::env::temp_dir().join(format!("switchboard-montage-v2-{id}")),
            working_output: dir.join(format!(".switchboard-{id}.mp4")),
            target_bytes,
            video_kbps,
            audio_kbps,
            duration_ms,
            music,
            include_voice,
        })
    }

    fn copy_source(&self) -> Option<PathBuf> {
        let p = &self.job.project;
        let s = &p.segments[0];
        let unedited = self.job.target == SizeTarget::Original
            && p.segments.len() == 1
            && p.canvas_size == Canvas::Original
            && p.music.is_none()
            && s.trim_start_ms == 0
            && s.trim_end_ms >= s.source_duration_ms
            && s.volume == 1.0
            && !s.muted
            && s.audio_track_levels.as_ref().is_none_or(|l| l.iter().all(|&v| v == 100))
            && s.audio_track_trims.as_ref().is_none_or(|t| t.iter().all(Option::is_none))
            && s.edits().is_none_or(|e| e.is_empty());
        unedited.then(|| self.sources[0].path.clone())
    }

    fn target(&self, video_kbps: Option<u32>) -> Result<Target> {
        video_target(self.sources[0], self.job.project.canvas_size, video_kbps)
    }

    fn plan(&self, kind: PlanKind, encoder: Encoder, steps: Vec<Step>, files: Vec<PlannedFile>) -> Plan {
        let t = self.target(self.video_kbps).unwrap_or(Target { width: 0, height: 0, fps: 0.0, canvas: Canvas::Original });
        Plan {
            kind,
            output: self.job.output.clone(),
            working_output: self.working_output.clone(),
            work_dir: self.work_dir.clone(),
            width: t.width,
            height: t.height,
            fps: t.fps,
            canvas: t.canvas,
            encoder,
            video_kbps: self.video_kbps,
            audio_kbps: self.audio_kbps,
            target_bytes: self.target_bytes,
            duration_ms: self.duration_ms,
            include_voice: self.include_voice,
            files,
            steps,
        }
    }

    fn segment_path(&self, i: usize) -> PathBuf {
        self.work_dir.join(format!("segment-{i:04}.mp4"))
    }

    /// Steps (one, or two for two-pass) rendering segment `i`.
    fn segment_steps(&self, i: usize, encoder: Encoder, attempt: Attempt) -> (Vec<Step>, Vec<PlannedFile>) {
        let seg = &self.job.project.segments[i];
        let src = self.sources[i];
        let target = self.target(attempt.video_kbps).expect("target validated in Ctx::new");
        let streams = src.audio_tracks.min(8);
        let start = seg.trim_start_ms;
        let duration_ms = seg.duration_ms();
        let duration = graph::fixed3(duration_ms as f64 / 1000.0);
        let mut args: Vec<String> = ["-progress", "pipe:1", "-nostats", "-hide_banner", "-loglevel", "error", "-ss"]
            .map(String::from)
            .to_vec();
        args.push(graph::fixed3(start as f64 / 1000.0));
        args.extend(["-t".into(), graph::fixed3((seg.trim_end_ms - start) as f64 / 1000.0), "-i".into(), path_arg(&src.path)]);
        let advanced = graph::has_advanced_edits(seg.edits())
            || !matches!(target.canvas, Canvas::Original | Canvas::Vertical)
            || self.include_voice;
        let (filter, audio_map) = if advanced {
            let v = graph::advanced_video_graph(src.width, src.height, seg, &target);
            let a = graph::advanced_audio_graph(seg, streams, src.mic_track, self.include_voice);
            (format!("{v};{a}"), "[aout]".to_string())
        } else {
            let rebased = rebase(seg);
            let v = graph::simple_video_filter(&rebased, &target);
            match graph::simple_audio_filter(&rebased, streams) {
                Some(a) => (format!("{v};{a}"), "[aout]".to_string()),
                None => {
                    args.extend(["-f", "lavfi", "-t", &duration, "-i", "anullsrc=r=48000:cl=stereo"].map(String::from));
                    (v, "1:a:0".to_string())
                }
            }
        };
        let mut files = Vec::new();
        args.extend(["-filter_complex_threads".into(), "2".into()]);
        if filter.len() > INLINE_GRAPH_LIMIT {
            let path = self.work_dir.join(format!("segment-{i:04}.graph.txt"));
            args.extend(["-/filter_complex".into(), path_arg(&path)]);
            files.push(PlannedFile { path, contents: filter });
        } else {
            args.extend(["-filter_complex".into(), filter]);
        }
        args.extend(["-map".into(), "[vout]".into(), "-map".into(), audio_map]);
        if self.include_voice {
            args.extend(["-map".into(), "[voiceout]".into()]);
        }
        args.extend(encoder.args(attempt.video_kbps));
        args.extend(["-c:a", "aac", "-b:a"].map(String::from));
        args.push(format!("{}k", self.audio_kbps));
        args.extend(["-ar", "48000", "-ac", "2", "-t"].map(String::from));
        args.push(duration);
        let expected_s = duration_ms as f64 / 1000.0;
        let out = path_arg(&self.segment_path(i));
        let steps = if attempt.two_pass {
            let log = path_arg(&self.work_dir.join(format!("segment-{i:04}.pass")));
            let mut p1 = args.clone();
            p1.extend(["-pass", "1", "-passlogfile", &log, "-f", "null", "-y", "NUL"].map(String::from));
            let mut p2 = args;
            p2.extend(["-pass", "2", "-passlogfile", &log, "-movflags", "+faststart", "-y", &out].map(String::from));
            vec![
                Step { kind: StepKind::Segment { index: i, pass: Some(1) }, args: p1, expected_s },
                Step { kind: StepKind::Segment { index: i, pass: Some(2) }, args: p2, expected_s },
            ]
        } else {
            args.extend(["-movflags", "+faststart", "-y", &out].map(String::from));
            vec![Step { kind: StepKind::Segment { index: i, pass: None }, args, expected_s }]
        };
        (steps, files)
    }

    fn final_step(&self) -> (Step, PlannedFile) {
        let list_path = self.work_dir.join("segments.txt");
        let list = (0..self.job.project.segments.len())
            .map(|i| graph::concat_line(&path_arg(&self.segment_path(i))))
            .collect::<Vec<_>>()
            .join("\n");
        let mut args: Vec<String> = ["-progress", "pipe:1", "-nostats", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i"]
            .map(String::from)
            .to_vec();
        args.push(path_arg(&list_path));
        let kind = match &self.music {
            None => {
                args.extend(["-map", "0:v:0", "-map", "0:a:0", "-c", "copy"].map(String::from));
                StepKind::Concat
            }
            Some((path, graph)) => {
                args.extend(["-i".into(), path_arg(path), "-filter_complex".into(), graph.clone()]);
                args.extend(["-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a"].map(String::from));
                args.push(format!("{}k", self.audio_kbps));
                args.extend(["-ar", "48000", "-ac", "2"].map(String::from));
                StepKind::Music
            }
        };
        args.extend(["-metadata", METADATA_COMMENT, "-movflags", "+faststart", "-y"].map(String::from));
        args.push(path_arg(&self.working_output));
        (
            Step { kind, args, expected_s: self.duration_ms as f64 / 1000.0 },
            PlannedFile { path: list_path, contents: list },
        )
    }
}

/// Video and audio bitrates for a size target: 90% of the budget, AAC
/// 128 kbps (64 below 420 kbps total), rejecting video under 120 kbps.
pub fn size_budget(target_bytes: Option<u64>, duration_ms: i64) -> Result<(Option<u32>, u32)> {
    let Some(bytes) = target_bytes else { return Ok((None, 128)) };
    let budget = bytes as f64 * 8.0 * 0.9 / (duration_ms as f64 / 1000.0).max(0.1) / 1000.0;
    let audio = if budget < 420.0 { 64 } else { 128 };
    let video = (budget - audio as f64).floor();
    if video < 120.0 {
        bail!("This size is too small for the montage runtime. Choose a larger target.");
    }
    Ok((Some(video as u32), audio))
}

/// Resolution cap for a video bitrate, normalized to 60 fps:
/// <1.2 Mbps 360p, <2.4 480p, <6 720p, <12 1080p, <24 1440p, else none.
/// Returns (width, height) with the long edge following orientation.
pub fn share_video_bounds(width: u32, height: u32, fps: f64, video_kbps: u32) -> Option<(u32, u32)> {
    let fps = if fps > 0.0 { fps.max(1.0) } else { 30.0 };
    let at60 = video_kbps as f64 * 60.0 / fps;
    let h = if at60 < 1200.0 {
        360
    } else if at60 < 2400.0 {
        480
    } else if at60 < 6000.0 {
        720
    } else if at60 < 12_000.0 {
        1080
    } else if at60 < 24_000.0 {
        1440
    } else {
        return None;
    };
    let long = ((h as f64 * 16.0 / 9.0 / 2.0).round() * 2.0) as u32;
    Some(if height > width { (h, long) } else { (long, h) })
}

fn video_target(first: &ClipSource, canvas: Canvas, video_kbps: Option<u32>) -> Result<Target> {
    if first.width == 0 || first.height == 0 {
        bail!("Video dimensions are unavailable for {}.", first.clip_id);
    }
    let (w, h) = canvas_dimensions(first.width, first.height, canvas);
    let fps = if first.fps > 0.0 { first.fps.max(1.0) } else { 30.0 };
    let scale = video_kbps
        .and_then(|k| share_video_bounds(w, h, fps, k))
        .map(|(bw, bh)| (bw as f64 / w as f64).min(bh as f64 / h as f64).min(1.0))
        .unwrap_or(1.0);
    let even = |v: f64| (((v / 2.0).floor() as u32) * 2).max(2);
    Ok(Target { width: even(w as f64 * scale), height: even(h as f64 * scale), fps, canvas })
}

/// The segment with its trim moved to 0, for inputs already seeked to the
/// trim start (the simple path).
fn rebase(seg: &Segment) -> Segment {
    let start = seg.trim_start_ms;
    let mut s = seg.clone();
    s.trim_start_ms = 0;
    s.trim_end_ms = seg.trim_end_ms - start;
    s.audio_track_trims = seg.audio_track_trims.as_ref().map(|t| {
        t.iter()
            .map(|t| t.map(|t| TrackTrim { start_ms: (t.start_ms - start).max(0), end_ms: (t.end_ms - start).max(0) }))
            .collect()
    });
    if let Some(e) = &mut s.video_edits
        && let Some(t) = &mut e.text
    {
        t.start_ms -= start;
        t.end_ms -= start;
    }
    s
}

fn path_arg(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn path_key(p: &Path) -> String {
    let abs = std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf());
    abs.to_string_lossy().replace('/', "\\").to_lowercase()
}

/// Free space an export needs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DiskNeeds {
    /// On the output's drive: final size estimate + 96 MB (copy: source + 64 MB).
    pub destination: u64,
    /// On the temp drive: 1.35x the proportional source size + 192 MB.
    pub temporary: u64,
}

/// Estimates disk needs from the source file sizes.
pub fn disk_needs(job: &ExportJob, copy: bool) -> DiskNeeds {
    let size = |c: &ClipSource| std::fs::metadata(&c.path).map(|m| m.len()).unwrap_or(0);
    if copy {
        let bytes = job.sources.iter().find(|c| c.clip_id == job.project.segments[0].clip_id).map(size).unwrap_or(0);
        return DiskNeeds { destination: bytes + 64 * MB, temporary: 0 };
    }
    let proportional: f64 = job
        .project
        .segments
        .iter()
        .filter_map(|s| {
            let c = job.sources.iter().find(|c| c.clip_id == s.clip_id)?;
            Some(size(c) as f64 * (s.trim_end_ms - s.trim_start_ms) as f64 / s.source_duration_ms.max(1) as f64)
        })
        .sum();
    let final_bytes = job.target.bytes().map(|b| b as f64).unwrap_or(proportional);
    DiskNeeds {
        destination: (final_bytes + (96 * MB) as f64).ceil() as u64,
        temporary: (proportional * 1.35 + (192 * MB) as f64).ceil() as u64,
    }
}

fn ensure_space(dir: &Path, needed: u64, label: &str) -> Result<()> {
    if needed == 0 {
        return Ok(());
    }
    if let Some(free) = free_bytes(dir)
        && free < needed
    {
        bail!(
            "Not enough free space on the {label} drive. Free at least {} and try again.",
            ffmpeg::format_bytes(needed - free)
        );
    }
    Ok(())
}

// ---------------------------------------------------------------- share files

/// This process's share folder: `%TEMP%\Switchboard\Share\<pid>`.
pub fn share_dir() -> PathBuf {
    std::env::temp_dir().join("Switchboard").join("Share").join(std::process::id().to_string())
}

/// `%TEMP%\Switchboard\Share\<pid>\<export_id>\<sanitized name><suffix>.mp4`.
pub fn share_path(export_id: &str, name: &str, suffix: &str) -> PathBuf {
    let id: String = export_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(64).collect();
    let id = if id.is_empty() { "export".to_string() } else { id };
    let suffix: String = suffix.chars().filter(|c| !is_bad_file_char(*c)).collect();
    share_dir().join(id).join(format!("{}{suffix}.mp4", sanitize_file_base(name)))
}

/// Removes one prepared share (after failure, cancel, or when it is no longer needed).
pub fn discard_share(export_id: &str) {
    if let Some(dir) = share_path(export_id, "x", "").parent() {
        let _ = std::fs::remove_dir_all(dir);
    }
}

/// Removes this process's whole share folder (call at shutdown).
pub fn cleanup_share_dir() {
    let _ = std::fs::remove_dir_all(share_dir());
}

fn is_bad_file_char(c: char) -> bool {
    matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 0x20
}

/// File-name stem: strips reserved characters and trailing dots/spaces, at
/// most 100 characters, "Switchboard montage" when empty.
pub fn sanitize_file_base(name: &str) -> String {
    let s: String = name.chars().filter(|c| !is_bad_file_char(*c)).collect();
    let s = s.trim_end_matches(['.', ' ']).trim();
    let s: String = s.chars().take(100).collect();
    if s.is_empty() { "Switchboard montage".into() } else { s }
}

/// The old app's suffix: `-9x16` for a canvas, then `-10mb` for a size target.
pub fn export_suffix(project: &Project, target: SizeTarget) -> String {
    let canvas = match project.canvas_size {
        Canvas::Original => String::new(),
        c => format!("-{}", serde_json::to_value(c).ok().and_then(|v| v.as_str().map(|s| s.replace(':', "x"))).unwrap_or_default()),
    };
    let size = match target {
        SizeTarget::Original => String::new(),
        SizeTarget::Megabytes(mb) => format!("-{mb}mb"),
    };
    format!("{canvas}{size}")
}

// ---------------------------------------------------------------- runner

pub struct ExportHandle {
    cancel: Arc<AtomicBool>,
    encoder: Arc<AtomicU8>,
    thread: Option<JoinHandle<()>>,
}

impl ExportHandle {
    /// Kills the running FFmpeg step (within ~100 ms) and removes partial output.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    /// Video encoder that rendered the last segment so far (after a hardware
    /// failure this reads libx264). `None` before rendering or for a copy.
    pub fn encoder_used(&self) -> Option<Encoder> {
        match self.encoder.load(Ordering::Relaxed) {
            1 => Some(Encoder::Nvenc),
            2 => Some(Encoder::Amf),
            3 => Some(Encoder::Qsv),
            4 => Some(Encoder::Libx264),
            _ => None,
        }
    }

    pub fn is_finished(&self) -> bool {
        self.thread.as_ref().is_none_or(JoinHandle::is_finished)
    }

    /// Blocks until the worker exits (after Done, Failed, or Cancelled).
    pub fn join(mut self) {
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// Runs on a worker thread; reports progress through the callback;
/// cancellation kills FFmpeg and deletes partial output. Dropping the handle
/// does not cancel.
pub fn start(job: ExportJob, encoders: Encoders, ffmpeg: PathBuf, on_progress: Box<dyn Fn(Progress) + Send>) -> ExportHandle {
    let cancel = Arc::new(AtomicBool::new(false));
    let flag = cancel.clone();
    let encoder = Arc::new(AtomicU8::new(0));
    let used = encoder.clone();
    let thread = std::thread::Builder::new()
        .name("switchboard-export".into())
        .spawn(move || {
            let mut runner = Runner { ffmpeg, cancel: flag, report: on_progress, reported: 0.0, used };
            match runner.execute(&job, encoders) {
                Ok((path, bytes)) => (runner.report)(Progress::Done { path, bytes }),
                Err(Stop::Cancelled) => (runner.report)(Progress::Cancelled),
                Err(Stop::Failed(e)) => (runner.report)(Progress::Failed { message: format!("{e:#}") }),
            }
        })
        .expect("spawn export thread");
    ExportHandle { cancel, encoder, thread: Some(thread) }
}

enum Stop {
    Cancelled,
    Failed(anyhow::Error),
}

impl From<anyhow::Error> for Stop {
    fn from(e: anyhow::Error) -> Self {
        Stop::Failed(e)
    }
}

impl From<std::io::Error> for Stop {
    fn from(e: std::io::Error) -> Self {
        Stop::Failed(e.into())
    }
}

struct Runner {
    ffmpeg: PathBuf,
    cancel: Arc<AtomicBool>,
    report: Box<dyn Fn(Progress) + Send>,
    reported: f64,
    used: Arc<AtomicU8>,
}

impl Runner {
    fn progress(&mut self, f: f64) {
        let f = f.clamp(0.0, 1.0);
        // Skip sub-0.2% steps; the callback may cross a thread or IPC boundary.
        if f > self.reported + 0.002 || (f >= 1.0 && self.reported < 1.0) {
            self.reported = f;
            (self.report)(Progress::Rendering { fraction: f as f32 });
        }
    }

    fn check(&self) -> Result<(), Stop> {
        if self.cancel.load(Ordering::Relaxed) { Err(Stop::Cancelled) } else { Ok(()) }
    }

    fn run_step(&mut self, step: &Step, map: impl Fn(f64) -> f64) -> Result<(), Stop> {
        let (ffmpeg, cancel) = (self.ffmpeg.clone(), self.cancel.clone());
        let expected = step.expected_s.max(0.001);
        match ffmpeg::run(&ffmpeg, &step.args, &cancel, |t| self.progress(map((t / expected).clamp(0.0, 1.0)))) {
            Ok(()) => Ok(()),
            Err(ffmpeg::RunError::Cancelled) => Err(Stop::Cancelled),
            Err(ffmpeg::RunError::Failed(m)) => Err(Stop::Failed(anyhow!(m))),
        }
    }

    fn execute(&mut self, job: &ExportJob, encoders: Encoders) -> Result<(PathBuf, u64), Stop> {
        (self.report)(Progress::Preparing);
        let id = switchboard_project::uuid();
        let first = plan_with_id(job, &encoders, &id)?;
        for c in &job.sources {
            if job.project.segments.iter().any(|s| s.clip_id == c.clip_id) && !c.path.is_file() {
                return Err(anyhow!("Montage source unavailable: {}. Remove or restore it before exporting.", c.path.display()).into());
            }
        }
        if let Some(m) = &job.music_path
            && job.project.music.is_some()
            && !m.is_file()
        {
            return Err(anyhow!("The imported music file is missing. Replace it or remove the music track before exporting.").into());
        }
        if let Some(dir) = job.output.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir)?;
        }
        let copy = matches!(first.kind, PlanKind::Copy { .. });
        let needs = disk_needs(job, copy);
        let out_dir = job.output.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."));
        ensure_space(&out_dir, needs.destination, "destination")?;
        ensure_space(&std::env::temp_dir(), needs.temporary, "temporary export")?;
        self.check()?;

        let result = self.render(job, encoders, &id, &first);
        let _ = std::fs::remove_dir_all(&first.work_dir);
        match result {
            Ok(()) => {
                if let Err(e) = self.check() {
                    let _ = std::fs::remove_file(&first.working_output);
                    return Err(e);
                }
                (self.report)(Progress::Finalizing);
                std::fs::rename(&first.working_output, &job.output).inspect_err(|_| {
                    let _ = std::fs::remove_file(&first.working_output);
                })?;
                let bytes = std::fs::metadata(&job.output)?.len();
                Ok((job.output.clone(), bytes))
            }
            Err(e) => {
                let _ = std::fs::remove_file(&first.working_output);
                Err(e)
            }
        }
    }

    fn render(&mut self, job: &ExportJob, encoders: Encoders, id: &str, first: &Plan) -> Result<(), Stop> {
        if let PlanKind::Copy { source } = &first.kind {
            std::fs::copy(source, &first.working_output)?;
            self.progress(1.0);
            return Ok(());
        }
        std::fs::create_dir_all(&first.work_dir)?;
        let ctx = Ctx::new(job, id)?;
        let total_ms = ctx.duration_ms as f64;
        let attempts = if ctx.target_bytes.is_some() { 3 } else { 1 };
        let mut video_kbps = ctx.video_kbps;
        for attempt in 0..attempts {
            self.check()?;
            let (p0, p1) = match (attempt, ctx.target_bytes.is_some()) {
                (_, false) => (0.0, 0.92),
                (0, true) => (0.0, 0.8),
                (1, true) => (0.8, 0.88),
                _ => (0.88, 0.91),
            };
            let a = Attempt { video_kbps, two_pass: attempt > 0 };
            let mut encoder = if attempt == 0 { encoders.best() } else { Encoder::Libx264 };
            let mut before_ms = 0.0;
            for i in 0..job.project.segments.len() {
                self.check()?;
                let seg_ms = job.project.segments[i].duration_ms() as f64;
                let span = move |f: f64| p0 + (before_ms + f * seg_ms) / total_ms * (p1 - p0) * 0.98;
                let result = self.render_segment(&ctx, i, encoder, a, span);
                match result {
                    Err(Stop::Failed(_)) if encoder.is_hardware() => {
                        // Hardware sessions can fail mid-export; finish in software.
                        encoder = Encoder::Libx264;
                        self.render_segment(&ctx, i, encoder, a, span)?;
                    }
                    r => r?,
                }
                before_ms += seg_ms;
                self.progress(p0 + before_ms / total_ms * (p1 - p0) * 0.98);
            }
            let (step, list) = ctx.final_step();
            std::fs::write(&list.path, &list.contents)?;
            let base = p0 + (p1 - p0) * 0.98;
            self.run_step(&step, |f| base + f * (p1 - base))?;
            self.progress(p1);
            let bytes = std::fs::metadata(&ctx.working_output)?.len();
            match ctx.target_bytes {
                None => {
                    self.progress(1.0);
                    return Ok(());
                }
                Some(t) if bytes <= t => {
                    self.progress(1.0);
                    return Ok(());
                }
                Some(t) => {
                    if attempt > 0 {
                        // Two-pass still overshot: scale video by the measured size, keep audio.
                        let audio_bytes = ctx.audio_kbps as f64 * 1000.0 * total_ms / 8000.0;
                        let correction = ((t as f64 * 0.9 - audio_bytes) / (bytes as f64 - audio_bytes).max(1.0)).min(0.85);
                        video_kbps = video_kbps.map(|k| ((k as f64 * correction).floor() as u32).max(1));
                    }
                }
            }
        }
        Err(anyhow!("The video encoder could not finish compressing this export.").into())
    }

    fn render_segment(&mut self, ctx: &Ctx, i: usize, encoder: Encoder, a: Attempt, span: impl Fn(f64) -> f64) -> Result<(), Stop> {
        let code = match encoder {
            Encoder::Nvenc => 1,
            Encoder::Amf => 2,
            Encoder::Qsv => 3,
            Encoder::Libx264 => 4,
        };
        self.used.store(code, Ordering::Relaxed);
        let (steps, files) = ctx.segment_steps(i, encoder, a);
        for f in &files {
            std::fs::write(&f.path, &f.contents)?;
        }
        let two = steps.len() > 1;
        for (n, step) in steps.iter().enumerate() {
            let (lo, hi) = if two { (n as f64 * 0.5, n as f64 * 0.5 + 0.5) } else { (0.0, 1.0) };
            self.run_step(step, |f| span(lo + f * (hi - lo)))?;
        }
        Ok(())
    }
}
