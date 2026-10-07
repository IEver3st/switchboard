//! Automatic updates from GitHub releases.
//!
//! A release is for this app when it carries `switchboard-native-<version>.exe`
//! and `switchboard-native-<version>.exe.sha256` assets; other releases in the
//! repository (the Electron app's) are ignored. The service checks shortly
//! after it starts and then hourly on its own thread, which sleeps between
//! checks and stops when automatic updates are turned off. A newer build is
//! downloaded, checked against the published SHA-256 and staged; it is
//! installed when the user picks "Restart to update" or the next time the
//! service starts, never in the middle of a session.
//!
//! Installing renames the running exe to `<exe>.old` (Windows allows renaming
//! a running exe), copies the staged build into place and starts it with
//! `--after-update`; the new process waits for the old one to exit.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};

use crate::service::Msg;
use crate::settings::data_dir;

const REPO: &str = "IEver3st/switchboard";
const ASSET_PREFIX: &str = "switchboard-native-";
const FIRST_CHECK: Duration = Duration::from_secs(15);
const CHECK_EVERY: Duration = Duration::from_secs(60 * 60);
const USER_AGENT: &str = "Switchboard-Native-Updater";

pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

pub fn now_unix_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Checking,
    UpToDate,
    Downloading { version: String, fraction: f32 },
    Ready { version: String },
    Failed { message: String },
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct UpdateStatus {
    pub current: String,
    pub phase: UpdatePhase,
    /// Unix ms of the last finished check.
    pub checked_at_ms: Option<u64>,
}

enum Ctl {
    CheckNow,
}

/// Owned by the service. The worker thread exists only while automatic
/// updates are on or a manual check is running.
pub struct Updater {
    pub status: UpdateStatus,
    worker: Option<mpsc::Sender<Ctl>>,
    tx: mpsc::Sender<Msg>,
}

impl Updater {
    pub fn new(tx: mpsc::Sender<Msg>) -> Updater {
        let mut status = UpdateStatus { current: CURRENT.into(), ..Default::default() };
        if let Some((version, _)) = staged() {
            status.phase = UpdatePhase::Ready { version };
        }
        Updater { status, worker: None, tx }
    }

    /// Starts or stops the background checker to match the setting.
    pub fn set_automatic(&mut self, on: bool) {
        match (on, self.worker.is_some()) {
            (true, false) => self.worker = Some(spawn(self.tx.clone(), Some(FIRST_CHECK))),
            (false, true) => self.worker = None, // dropping the sender ends the thread
            _ => {}
        }
    }

    pub fn check_now(&mut self) {
        if matches!(self.status.phase, UpdatePhase::Checking | UpdatePhase::Downloading { .. }) {
            return;
        }
        match &self.worker {
            Some(w) => {
                let _ = w.send(Ctl::CheckNow);
            }
            // One-shot: the thread ends after this check since nothing holds its sender.
            None => drop(spawn(self.tx.clone(), None)),
        }
    }

}

fn spawn(tx: mpsc::Sender<Msg>, first_wait: Option<Duration>) -> mpsc::Sender<Ctl> {
    let (ctl_tx, ctl_rx) = mpsc::channel();
    let _ = std::thread::Builder::new().name("sb-update".into()).spawn(move || {
        let mut wait = first_wait;
        loop {
            if let Some(d) = wait {
                match ctl_rx.recv_timeout(d) {
                    Ok(Ctl::CheckNow) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            let send = |phase: UpdatePhase| tx.send(Msg::Update(phase)).is_ok();
            if !send(UpdatePhase::Checking) {
                return;
            }
            let result = check_and_stage(&|fraction, version: &str| {
                let _ = tx.send(Msg::Update(UpdatePhase::Downloading { version: version.into(), fraction }));
            });
            let phase = match result {
                Ok(Some(version)) => UpdatePhase::Ready { version },
                Ok(None) => UpdatePhase::UpToDate,
                Err(e) => UpdatePhase::Failed { message: format!("{e:#}") },
            };
            if !send(phase) {
                return;
            }
            if first_wait.is_none() {
                return; // one-shot manual check
            }
            wait = Some(CHECK_EVERY);
        }
    });
    ctl_tx
}

// ---------------------------------------------------------------- releases

#[derive(Deserialize)]
struct Release {
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// "1.2.3" -> (1, 2, 3); anything else is not a version.
pub fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let mut it = v.trim().trim_start_matches('v').split('.');
    let n = |s: Option<&str>| s.and_then(|s| s.parse().ok());
    let v = (n(it.next())?, n(it.next())?, n(it.next())?);
    it.next().is_none().then_some(v)
}

fn asset_version(name: &str) -> Option<String> {
    let v = name.strip_prefix(ASSET_PREFIX)?.strip_suffix(".exe")?;
    parse_version(v).map(|_| v.to_string())
}

/// The newest published native build, if newer than this one.
fn newest(releases: &[Release]) -> Option<(String, String, String)> {
    let current = parse_version(CURRENT)?;
    let mut best: Option<((u32, u32, u32), String, String, String)> = None;
    for r in releases.iter().filter(|r| !r.draft && !r.prerelease) {
        for a in &r.assets {
            let Some(version) = asset_version(&a.name) else { continue };
            let parsed = parse_version(&version)?;
            let sha_name = format!("{}.sha256", a.name);
            let Some(sha) = r.assets.iter().find(|s| s.name == sha_name) else { continue };
            if parsed > current && best.as_ref().is_none_or(|b| parsed > b.0) {
                best = Some((parsed, version, a.browser_download_url.clone(), sha.browser_download_url.clone()));
            }
        }
    }
    best.map(|(_, v, exe, sha)| (v, exe, sha))
}

fn updates_dir() -> PathBuf {
    data_dir().join("updates")
}

/// A verified build waiting to be installed: (version, path).
pub fn staged() -> Option<(String, PathBuf)> {
    let current = parse_version(CURRENT)?;
    std::fs::read_dir(updates_dir())
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter_map(|p| {
            let v = asset_version(p.file_name()?.to_str()?)?;
            Some((parse_version(&v)?, v, p))
        })
        .filter(|(parsed, ..)| *parsed > current)
        .max_by_key(|(parsed, ..)| *parsed)
        .map(|(_, v, p)| (v, p))
}

fn check_and_stage(progress: &dyn Fn(f32, &str)) -> Result<Option<String>> {
    if let Some((version, _)) = staged() {
        return Ok(Some(version));
    }
    let body = http_get(&format!("https://api.github.com/repos/{REPO}/releases?per_page=30"), None)?;
    let releases: Vec<Release> = serde_json::from_slice(&body).context("unexpected reply from GitHub")?;
    let Some((version, exe_url, sha_url)) = newest(&releases) else { return Ok(None) };

    let sha_text = String::from_utf8(http_get(&sha_url, None)?).context("checksum file is not text")?;
    let expected = sha_text.split_whitespace().next().unwrap_or_default().to_ascii_lowercase();
    if expected.len() != 64 {
        bail!("the published checksum for {version} is malformed");
    }
    let bytes = http_get(&exe_url, Some(&|f| progress(f, &version)))?;
    if sha256_hex(&bytes)? != expected {
        bail!("the download for {version} didn't match its checksum, so it was discarded");
    }
    let dir = updates_dir();
    std::fs::create_dir_all(&dir)?;
    // Only one staged build at a time.
    for e in std::fs::read_dir(&dir)?.flatten() {
        let _ = std::fs::remove_file(e.path());
    }
    let part = dir.join(format!("{ASSET_PREFIX}{version}.exe.part"));
    std::fs::write(&part, &bytes)?;
    std::fs::rename(&part, dir.join(format!("{ASSET_PREFIX}{version}.exe")))?;
    Ok(Some(version))
}

// ---------------------------------------------------------------- install

/// Swaps the staged build in and starts it. The caller quits right after.
pub fn install(staged: &Path, open_ui: bool) -> Result<()> {
    let exe = std::env::current_exe()?;
    let old = old_path(&exe);
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).context("couldn't move the running version aside")?;
    if let Err(e) = std::fs::copy(staged, &exe) {
        let _ = std::fs::rename(&old, &exe);
        return Err(anyhow!(e).context("couldn't put the new version in place"));
    }
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("--after-update");
    if !open_ui {
        cmd.arg("--background");
    }
    if let Err(e) = cmd.spawn() {
        let _ = std::fs::remove_file(&exe);
        let _ = std::fs::rename(&old, &exe);
        return Err(anyhow!(e).context("couldn't start the new version"));
    }
    let _ = std::fs::remove_dir_all(updates_dir());
    Ok(())
}

fn old_path(exe: &Path) -> PathBuf {
    let mut s = exe.as_os_str().to_owned();
    s.push(".old");
    PathBuf::from(s)
}

/// A build running from a Cargo `target` folder. Every push publishes a
/// release, so development builds would otherwise replace themselves with
/// the published one at their next start; they install only on request.
pub fn is_dev_build() -> bool {
    std::env::current_exe().is_ok_and(|exe| exe.components().any(|c| c.as_os_str().eq_ignore_ascii_case("target")))
}

/// After an update: remove the previous version once it has exited.
pub fn cleanup_previous() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(old_path(&exe));
    }
}

// ---------------------------------------------------------------- plumbing

fn sha256_hex(data: &[u8]) -> Result<String> {
    use windows::Win32::Security::Cryptography::{BCRYPT_SHA256_ALG_HANDLE, BCryptHash};
    let mut out = [0u8; 32];
    let status = unsafe { BCryptHash(BCRYPT_SHA256_ALG_HANDLE, None, data, &mut out) };
    if status.is_err() {
        bail!("couldn't hash the download");
    }
    Ok(out.iter().map(|b| format!("{b:02x}")).collect())
}

/// HTTPS GET through WinHTTP (system proxy settings, redirects followed).
fn http_get(url: &str, progress: Option<&dyn Fn(f32)>) -> Result<Vec<u8>> {
    use windows::Win32::Networking::WinHttp::*;
    use windows::core::{HSTRING, PCWSTR, w};

    let rest = url.strip_prefix("https://").ok_or_else(|| anyhow!("only https is allowed"))?;
    let (host, path) = rest.split_once('/').map(|(h, p)| (h, format!("/{p}"))).unwrap_or((rest, "/".into()));

    struct Handle(*mut core::ffi::c_void);
    impl Drop for Handle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                let _ = unsafe { WinHttpCloseHandle(self.0) };
            }
        }
    }
    let check = |h: *mut core::ffi::c_void, what: &str| -> Result<Handle> {
        if h.is_null() {
            Err(anyhow!("{what} failed: {}", windows::core::Error::from_thread()))
        } else {
            Ok(Handle(h))
        }
    };
    unsafe {
        let session = check(
            WinHttpOpen(&HSTRING::from(USER_AGENT), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, PCWSTR::null(), PCWSTR::null(), 0),
            "opening a connection",
        )?;
        let _ = WinHttpSetTimeouts(session.0, 10_000, 10_000, 30_000, 60_000);
        let connect = check(WinHttpConnect(session.0, &HSTRING::from(host), INTERNET_DEFAULT_HTTPS_PORT, 0), "connecting")?;
        let request = check(
            WinHttpOpenRequest(connect.0, w!("GET"), &HSTRING::from(path.as_str()), PCWSTR::null(), PCWSTR::null(), std::ptr::null(), WINHTTP_FLAG_SECURE),
            "creating the request",
        )?;
        let headers: Vec<u16> = "Accept: application/vnd.github+json\r\n".encode_utf16().collect();
        WinHttpSendRequest(request.0, Some(&headers), None, 0, 0, 0).context("couldn't reach GitHub")?;
        WinHttpReceiveResponse(request.0, std::ptr::null_mut()).context("no reply from GitHub")?;

        let query_u32 = |level: u32| -> Option<u32> {
            let mut v = 0u32;
            let mut len = 4u32;
            WinHttpQueryHeaders(
                request.0,
                level | WINHTTP_QUERY_FLAG_NUMBER,
                PCWSTR::null(),
                Some(&mut v as *mut u32 as *mut _),
                &mut len,
                std::ptr::null_mut(),
            )
            .ok()
            .map(|_| v)
        };
        let status = query_u32(WINHTTP_QUERY_STATUS_CODE).unwrap_or(0);
        if status != 200 {
            bail!("GitHub answered with HTTP {status}");
        }
        let total = query_u32(WINHTTP_QUERY_CONTENT_LENGTH).unwrap_or(0) as usize;
        let mut body = Vec::with_capacity(total);
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            let mut read = 0u32;
            WinHttpReadData(request.0, buf.as_mut_ptr() as *mut _, buf.len() as u32, &mut read).context("download interrupted")?;
            if read == 0 {
                break;
            }
            body.extend_from_slice(&buf[..read as usize]);
            if let (Some(p), true) = (progress, total > 0) {
                p(body.len() as f32 / total as f32);
            }
        }
        Ok(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rel(names: &[&str]) -> Release {
        Release {
            draft: false,
            prerelease: false,
            assets: names.iter().map(|n| Asset { name: n.to_string(), browser_download_url: format!("https://x/{n}") }).collect(),
        }
    }

    /// Network: `cargo test -p switchboard live_feed -- --ignored`.
    #[test]
    #[ignore]
    fn live_feed() {
        let body = http_get(&format!("https://api.github.com/repos/{REPO}/releases?per_page=30"), None).unwrap();
        let releases: Vec<Release> = serde_json::from_slice(&body).unwrap();
        assert!(!releases.is_empty());
        // Until a native build is published, nothing is offered.
        assert!(newest(&releases).is_none());
    }

    #[test]
    fn versions() {
        assert_eq!(parse_version("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(asset_version("switchboard-native-2.0.1.exe").as_deref(), Some("2.0.1"));
        assert_eq!(asset_version("Switchboard-Setup-0.9.33.exe"), None);
    }

    #[test]
    fn picks_newest_native_release_with_checksum() {
        let releases = vec![
            // The Electron app's releases have no native asset and are ignored.
            rel(&["Switchboard-Setup-0.9.33.exe", "latest.yml"]),
            rel(&["switchboard-native-90.0.0.exe"]), // no checksum: skipped
            rel(&["switchboard-native-50.1.0.exe", "switchboard-native-50.1.0.exe.sha256"]),
            rel(&["switchboard-native-50.0.9.exe", "switchboard-native-50.0.9.exe.sha256"]),
        ];
        let (v, exe, sha) = newest(&releases).unwrap();
        assert_eq!(v, "50.1.0");
        assert!(exe.ends_with("50.1.0.exe") && sha.ends_with(".sha256"));
        assert!(newest(&[rel(&["switchboard-native-0.0.1.exe", "switchboard-native-0.0.1.exe.sha256"])]).is_none());
    }
}
