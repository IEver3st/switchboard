use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{Context, Result, anyhow, bail};
use switchboard_export::{PINNED_FFMPEG, provisioned_ffmpeg_dir, provisioned_ffmpeg_root};

use crate::protocol::FfmpegState;
use crate::update::{Sha256, http_stream};

const URLS: [&str; 2] = [
    "https://api.github.com/repos/GyanD/codexffmpeg/releases/assets/574302090",
    "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip",
];
const SIZE: u64 = 114_768_076;
const SHA256: &str = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
const PROGRAMS: [&str; 2] = ["ffmpeg.exe", "ffprobe.exe"];
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const DOWNLOAD_MB: u64 = SIZE.div_ceil(1_000_000);

static STATE: Mutex<FfmpegState> = Mutex::new(FfmpegState::Checking);
static BUSY: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

pub fn state() -> FfmpegState {
    STATE.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

fn set(state: FfmpegState, changed: &dyn Fn()) {
    let mut s = STATE.lock().unwrap_or_else(|e| e.into_inner());
    if *s != state {
        *s = state;
        drop(s);
        changed();
    }
}

pub fn ensure(changed: impl Fn() + Send + 'static) {
    if BUSY.swap(true, Ordering::AcqRel) {
        return;
    }
    CANCEL.store(false, Ordering::Relaxed);
    set(FfmpegState::Checking, &changed);
    let spawned = std::thread::Builder::new().name("ffmpeg-setup".into()).spawn(move || {
        if switchboard_export::locate_ffmpeg().is_some() {
            set(FfmpegState::Ready, &changed);
        } else {
            set(FfmpegState::Downloading { permille: 0 }, &changed);
            let result = install(&CANCEL, &|f| set(FfmpegState::Downloading { permille: (f.clamp(0.0, 1.0) * 100.0) as u32 * 10 }, &changed));
            let state = match result {
                Ok(()) if switchboard_export::locate_ffmpeg().is_some() => FfmpegState::Ready,
                Ok(()) => FfmpegState::Failed { message: "FFmpeg was downloaded but can't be found".into() },
                Err(e) => FfmpegState::Failed { message: format!("{e:#}") },
            };
            set(state, &changed);
        }
        BUSY.store(false, Ordering::Release);
    });
    if spawned.is_err() {
        BUSY.store(false, Ordering::Release);
    }
}

pub fn cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

pub fn install(cancel: &AtomicBool, progress: &dyn Fn(f32)) -> Result<()> {
    let root = provisioned_ffmpeg_root().ok_or_else(|| anyhow!("LOCALAPPDATA is not set"))?;
    let dest = provisioned_ffmpeg_dir().ok_or_else(|| anyhow!("LOCALAPPDATA is not set"))?;
    std::fs::create_dir_all(&root).with_context(|| format!("couldn't create {}", root.display()))?;
    let zip = root.join("download.zip.part");
    let staging = root.join(format!("extract-{}", std::process::id()));
    let ready = root.join(format!("{PINNED_FFMPEG}.part"));
    let result = download(&zip, cancel, progress).and_then(|()| unpack(&zip, &staging, &ready)).and_then(|()| {
        let _ = std::fs::remove_dir_all(&dest);
        std::fs::rename(&ready, &dest).context("couldn't move FFmpeg into place")
    });
    let _ = std::fs::remove_file(&zip);
    let _ = std::fs::remove_dir_all(&staging);
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&ready);
    }
    match &result {
        Ok(()) => switchboard_log::log!("ffmpeg: installed {PINNED_FFMPEG} to {}", dest.display()),
        Err(e) => switchboard_log::log!("ffmpeg: install failed: {e:#}"),
    }
    result
}

fn download(zip: &Path, cancel: &AtomicBool, progress: &dyn Fn(f32)) -> Result<()> {
    let mut last = anyhow!("no download source");
    for url in URLS {
        match fetch(url, zip, cancel, progress) {
            Ok(()) => return Ok(()),
            Err(e) if cancel.load(Ordering::Relaxed) => return Err(e),
            Err(e) => {
                switchboard_log::log!("ffmpeg: {url} failed: {e:#}");
                last = e;
            }
        }
    }
    Err(last)
}

fn fetch(url: &str, zip: &Path, cancel: &AtomicBool, progress: &dyn Fn(f32)) -> Result<()> {
    let mut file = std::fs::File::create(zip).context("couldn't create the download file")?;
    let mut hash = Sha256::new()?;
    let got = http_stream(url, "application/octet-stream", Some(cancel), &mut |chunk, done, total| {
        file.write_all(chunk).context("couldn't write the download")?;
        hash.update(chunk)?;
        progress(done as f32 / if total > 0 { total } else { SIZE } as f32);
        Ok(())
    })?;
    file.sync_all()?;
    drop(file);
    if got != SIZE {
        bail!("the download is {got} bytes, expected {SIZE}");
    }
    if hash.hex()? != SHA256 {
        bail!("the download doesn't match FFmpeg's published checksum");
    }
    Ok(())
}

fn unpack(zip: &Path, staging: &Path, ready: &Path) -> Result<()> {
    let _ = std::fs::remove_dir_all(staging);
    std::fs::create_dir_all(staging)?;
    let tar = std::env::var_os("SystemRoot").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Windows")).join(r"System32\tar.exe");
    let mut cmd = Command::new(&tar);
    cmd.arg("-xf").arg(zip).arg("-C").arg(staging);
    for p in PROGRAMS {
        cmd.arg("--include").arg(format!("*/bin/{p}"));
    }
    let out = cmd.creation_flags(CREATE_NO_WINDOW).stdin(Stdio::null()).output().context("couldn't run Windows' tar")?;
    if !out.status.success() {
        bail!("Windows couldn't unpack the download: {}", String::from_utf8_lossy(&out.stderr).trim());
    }
    let _ = std::fs::remove_dir_all(ready);
    std::fs::create_dir_all(ready)?;
    for p in PROGRAMS {
        let found = find(staging, p).ok_or_else(|| anyhow!("{p} is missing from the download"))?;
        std::fs::rename(&found, ready.join(p)).with_context(|| format!("couldn't move {p}"))?;
    }
    let runs = Command::new(ready.join("ffmpeg.exe"))
        .arg("-version")
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success());
    if !runs {
        bail!("the downloaded FFmpeg doesn't run on this PC");
    }
    Ok(())
}

fn find(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find(&path, name) {
                return Some(found);
            }
        } else if path.file_name().is_some_and(|n| n.eq_ignore_ascii_case(name)) {
            return Some(path);
        }
    }
    None
}

pub fn remove() {
    if let Some(root) = provisioned_ffmpeg_root() {
        let _ = std::fs::remove_dir_all(root);
    }
}
