//! FFmpeg process plumbing: discovery, encoder probing, media probing, and a
//! cancellable runner that parses `-progress pipe:1`.

use std::io::{BufRead, BufReader, Read};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};

use crate::{ClipSource, Encoder, Encoders};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) fn command(exe: &Path) -> Command {
    let mut c = Command::new(exe);
    c.creation_flags(CREATE_NO_WINDOW).stdin(Stdio::null());
    c
}

fn find_pair_in(dir: &Path) -> Option<(PathBuf, PathBuf)> {
    for sub in [dir.to_path_buf(), dir.join("ffmpeg")] {
        let (f, p) = (sub.join("ffmpeg.exe"), sub.join("ffprobe.exe"));
        if f.is_file() && p.is_file() {
            return Some((f, p));
        }
    }
    None
}

/// Finds FFmpeg and FFprobe. Order: `SWITCHBOARD_FFMPEG`/`SWITCHBOARD_FFPROBE`,
/// beside the current executable (`ffmpeg.exe` or `ffmpeg\ffmpeg.exe`), PATH,
/// then the Electron install's bundled copy.
pub fn locate_ffmpeg() -> Option<(PathBuf, PathBuf)> {
    if let Some(f) = std::env::var_os("SWITCHBOARD_FFMPEG").map(PathBuf::from).filter(|p| p.is_file()) {
        let probe = std::env::var_os("SWITCHBOARD_FFPROBE")
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .or_else(|| f.parent().map(|d| d.join("ffprobe.exe")).filter(|p| p.is_file()));
        if let Some(p) = probe {
            return Some((f, p));
        }
    }
    if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf))
        && let Some(pair) = find_pair_in(&dir)
    {
        return Some(pair);
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let (f, p) = (dir.join("ffmpeg.exe"), dir.join("ffprobe.exe"));
            if f.is_file() && p.is_file() {
                return Some((f, p));
            }
        }
    }
    let local = std::env::var_os("LOCALAPPDATA")?;
    find_pair_in(&PathBuf::from(local).join("Programs\\switchboard\\resources\\capture-host"))
}

fn encoder_works(ffmpeg: &Path, encoder: Encoder) -> bool {
    let args = [
        "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=30", "-frames:v", "1",
        "-pix_fmt", "yuv420p", "-c:v", encoder.name(), "-f", "null", "-",
    ];
    let Ok(mut child) = command(ffmpeg).args(args).stdout(Stdio::null()).stderr(Stdio::null()).spawn() else {
        return false;
    };
    assign_to_job(&child);
    // A broken driver can hang a session open; give up after 15 s.
    for _ in 0..150 {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => return false,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    false
}

static ENCODERS: Mutex<Option<(PathBuf, Encoders)>> = Mutex::new(None);

/// Which hardware H.264 encoders complete a one-frame test encode. Cached per
/// FFmpeg path for the process lifetime.
pub fn detect_encoders(ffmpeg: &Path) -> Encoders {
    let mut cache = ENCODERS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((p, e)) = cache.as_ref()
        && p == ffmpeg
    {
        return *e;
    }
    // Only the preferred working encoder is used, so stop at the first one
    // that passes instead of test-encoding with every vendor.
    let mut e = Encoders::default();
    if encoder_works(ffmpeg, Encoder::Nvenc) {
        e.nvenc = true;
    } else if encoder_works(ffmpeg, Encoder::Amf) {
        e.amf = true;
    } else if encoder_works(ffmpeg, Encoder::Qsv) {
        e.qsv = true;
    }
    *cache = Some((ffmpeg.to_path_buf(), e));
    e
}

fn probe_json(ffprobe: &Path, args: &[&str], path: &Path) -> Result<serde_json::Value> {
    let out = command(ffprobe)
        .args(args)
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("could not run {}", ffprobe.display()))?;
    if !out.status.success() {
        bail!("ffprobe failed: {}", String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(serde_json::from_slice(&out.stdout)?)
}

/// Probed facts about a clip file.
#[derive(Clone, Debug)]
pub struct ProbedClip {
    pub source: ClipSource,
    pub duration_ms: i64,
    /// Audio stream labels in stream order (title, name, or handler name).
    pub track_titles: Vec<String>,
}

fn parse_rate(r: &str) -> f64 {
    match r.split_once('/') {
        Some((n, d)) => {
            let (n, d) = (n.parse::<f64>().unwrap_or(0.0), d.parse::<f64>().unwrap_or(0.0));
            if d > 0.0 { n / d } else { 0.0 }
        }
        None => r.parse().unwrap_or(0.0),
    }
}

/// Probes a clip: size, frame rate, duration, audio tracks and which one is
/// titled "Microphone".
pub fn probe_clip(ffprobe: &Path, clip_id: &str, path: &Path) -> Result<ProbedClip> {
    let v = probe_json(
        ffprobe,
        &["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate:stream_tags=title,name,handler_name"],
        path,
    )?;
    let streams = v["streams"].as_array().cloned().unwrap_or_default();
    let video = streams.iter().find(|s| s["codec_type"] == "video").ok_or_else(|| anyhow!("no video stream"))?;
    let titles: Vec<String> = streams
        .iter()
        .filter(|s| s["codec_type"] == "audio")
        .map(|s| {
            // FFmpeg writes `title` as `name`; Switchboard's muxer names the handler.
            ["title", "name", "handler_name"]
                .iter()
                .filter_map(|k| s["tags"][*k].as_str())
                .find(|v| !v.is_empty() && *v != "SoundHandler")
                .unwrap_or("")
                .to_string()
        })
        .collect();
    let mut fps = parse_rate(video["avg_frame_rate"].as_str().unwrap_or(""));
    if fps.is_nan() || fps <= 0.0 {
        fps = parse_rate(video["r_frame_rate"].as_str().unwrap_or(""));
    }
    let duration_ms = (v["format"]["duration"].as_str().and_then(|d| d.parse::<f64>().ok()).unwrap_or(0.0) * 1000.0).round() as i64;
    Ok(ProbedClip {
        source: ClipSource {
            clip_id: clip_id.into(),
            path: path.to_path_buf(),
            width: video["width"].as_u64().unwrap_or(0) as u32,
            height: video["height"].as_u64().unwrap_or(0) as u32,
            fps,
            audio_tracks: titles.len().min(8),
            mic_track: titles.iter().position(|t| t.to_ascii_lowercase().contains("mic")),
        },
        duration_ms,
        track_titles: titles,
    })
}

/// Duration and codec of an audio file; rejects files without usable audio.
pub fn probe_audio(ffprobe: &Path, path: &Path) -> Result<(i64, Option<String>)> {
    let v = probe_json(ffprobe, &["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=codec_type,codec_name"], path)?;
    let audio = v["streams"].as_array().and_then(|s| s.iter().find(|s| s["codec_type"] == "audio").cloned());
    let duration_ms = (v["format"]["duration"].as_str().and_then(|d| d.parse::<f64>().ok()).unwrap_or(0.0) * 1000.0).round() as i64;
    match audio {
        Some(a) if duration_ms >= 100 => Ok((duration_ms, a["codec_name"].as_str().map(String::from))),
        _ => bail!("The selected file does not contain a usable audio stream."),
    }
}

/// Peak waveform of an audio file's first stream, `buckets` values in 0..=1
/// with the old app's 0.58 gamma.
pub fn audio_waveform(ffmpeg: &Path, path: &Path, duration_ms: i64, buckets: usize) -> Result<Vec<f32>> {
    let buckets = buckets.max(1);
    let mut child = command(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(path)
        .args(["-map", "0:a:0", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    assign_to_job(&child);
    let stderr = drain(child.stderr.take());
    let expected = ((duration_ms as f64 / 1000.0 * 8000.0).round() as u64).max(1);
    let mut peaks = vec![0f32; buckets];
    let mut reader = BufReader::with_capacity(64 * 1024, child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?);
    let mut index = 0u64;
    let mut pair = [0u8; 2];
    while reader.read_exact(&mut pair).is_ok() {
        let bucket = ((index as f64 / expected as f64 * buckets as f64) as usize).min(buckets - 1);
        let amp = (i16::from_le_bytes(pair) as f32).abs() / 32768.0;
        if amp > peaks[bucket] {
            peaks[bucket] = amp;
        }
        index += 1;
    }
    let status = child.wait()?;
    if !status.success() {
        bail!("{}", stderr.join().unwrap_or_default().trim());
    }
    let peak = peaks.iter().copied().fold(0f32, f32::max);
    if peak <= 0.0 {
        return Ok(vec![0.0; buckets]);
    }
    Ok(peaks.iter().map(|v| ((v / peak).powf(0.58) * 1000.0).round() / 1000.0).collect())
}

fn drain<R: Read + Send + 'static>(r: Option<R>) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut out = String::new();
        if let Some(r) = r {
            for line in BufReader::new(r).lines().map_while(Result::ok) {
                if out.len() < 65_536 {
                    out.push_str(&line);
                    out.push('\n');
                }
            }
        }
        out
    })
}

pub(crate) enum RunError {
    Cancelled,
    Failed(String),
}

/// Runs FFmpeg to completion. `on_time` receives `out_time_us` in seconds.
/// Cancellation is checked every 100 ms and kills the process.
pub(crate) fn run(ffmpeg: &Path, args: &[String], cancel: &AtomicBool, mut on_time: impl FnMut(f64)) -> Result<(), RunError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(RunError::Cancelled);
    }
    let mut child: Child = command(ffmpeg)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| RunError::Failed(format!("could not start FFmpeg: {e}")))?;
    assign_to_job(&child);
    let stderr = drain(child.stderr.take());
    let stdout = child.stdout.take();
    let (tx, rx) = mpsc::channel::<f64>();
    let reader = std::thread::spawn(move || {
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Some(v) = line.trim().strip_prefix("out_time_us=")
                    && let Ok(us) = v.parse::<f64>()
                {
                    let _ = tx.send(us / 1_000_000.0);
                }
            }
        }
    });
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            let _ = stderr.join();
            return Err(RunError::Cancelled);
        }
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(t) => on_time(t),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Ok(Some(_)) | Err(_) = child.try_wait() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        }
    }
    let status = child.wait().map_err(|e| RunError::Failed(e.to_string()))?;
    let _ = reader.join();
    let err = stderr.join().unwrap_or_default();
    if cancel.load(Ordering::Relaxed) {
        return Err(RunError::Cancelled);
    }
    if status.success() {
        Ok(())
    } else {
        let tail: String = err.trim().lines().rev().take(12).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        Err(RunError::Failed(if tail.is_empty() { format!("FFmpeg exited with {status}") } else { tail }))
    }
}

/// One kill-on-close job for every FFmpeg child, so a crashed app never
/// leaves an encoder running.
fn job() -> Option<isize> {
    static JOB: OnceLock<Option<isize>> = OnceLock::new();
    *JOB.get_or_init(|| unsafe {
        use windows::Win32::System::JobObjects::*;
        let job = CreateJobObjectW(None, windows::core::PCWSTR::null()).ok()?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
        .ok()?;
        Some(job.0 as isize)
    })
}

pub(crate) fn assign_to_job(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    if let Some(j) = job() {
        unsafe {
            let _ = windows::Win32::System::JobObjects::AssignProcessToJobObject(
                windows::Win32::Foundation::HANDLE(j as *mut core::ffi::c_void),
                windows::Win32::Foundation::HANDLE(child.as_raw_handle()),
            );
        }
    }
}

/// Free bytes available to this user on the volume holding `dir`.
pub fn free_bytes(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    let mut probe = dir.to_path_buf();
    while !probe.exists() {
        probe = probe.parent()?.to_path_buf();
    }
    let wide: Vec<u16> = probe.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut free = 0u64;
    unsafe {
        windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            windows::core::PCWSTR(wide.as_ptr()),
            Some(&mut free),
            None,
            None,
        )
        .ok()?;
    }
    Some(free)
}

pub(crate) fn format_bytes(bytes: u64) -> String {
    let v = bytes as f64;
    if v >= 1024f64.powi(3) {
        format!("{} GB", (v / 1024f64.powi(3) * 10.0).ceil() / 10.0)
    } else {
        format!("{} MB", (v / 1024f64.powi(2)).ceil())
    }
}
