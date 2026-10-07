//! Moving Electron users (Switchboard 0.9.x) to this build, and installing
//! and uninstalling it.
//!
//! Native releases also carry an electron-updater `latest.yml` that points at
//! this executable, so the Electron app's own updater downloads it and runs
//! it the way it runs an NSIS update: `<exe> --updated /S --force-run`.
//! That first run copies the executable to its install folder and starts the
//! copy with `--migrate-from-electron`, which:
//!
//! 1. waits for the Electron app and its capture host to exit;
//! 2. carries over settings (if this build has none yet) and clip favorites
//!    and renamed titles;
//! 3. copies FFmpeg from the Electron install so exports keep working;
//! 4. runs the Electron uninstaller silently and removes its autostart entry;
//! 5. creates the Start menu (and, if Electron had one, desktop) shortcut,
//!    sets autostart to match, and registers an uninstall entry in Settings
//!    > Apps.
//!
//! Then it starts normally with the window open. Clips are never touched.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use serde_json::Value;

use crate::library_index::LibraryIndex;
use crate::settings::{Settings, default_clips_dir, set_autostart};

const UNINSTALL_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SwitchboardNative";
const ELECTRON_RUN_VALUE: &str = "dev.switchboard.prototype";
const SHORTCUT: &str = "Switchboard.lnk";

fn local_app_data() -> PathBuf {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir)
}

/// Where this build installs itself.
pub fn install_dir() -> PathBuf {
    local_app_data().join("Programs").join("Switchboard Native")
}

fn electron_dir() -> PathBuf {
    local_app_data().join("Programs").join("switchboard")
}

fn electron_state() -> PathBuf {
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    roaming.join("switchboard-prototype").join("switchboard-state.json")
}

/// Run by the Electron updater: install this executable and hand over.
pub fn install_from_electron_update() -> Result<()> {
    let dir = install_dir();
    std::fs::create_dir_all(&dir)?;
    let target = dir.join("Switchboard.exe");
    let me = std::env::current_exe()?;
    if target.exists() {
        // A copy that is running can't be overwritten, but it can be renamed.
        let old = dir.join("Switchboard.exe.old");
        let _ = std::fs::remove_file(&old);
        std::fs::rename(&target, &old).context("couldn't move the installed copy aside")?;
    }
    std::fs::copy(&me, &target).context("couldn't install Switchboard")?;
    std::process::Command::new(&target).arg("--migrate-from-electron").spawn().context("couldn't start Switchboard")?;
    Ok(())
}

/// Run by the installed copy. Best effort: each step that fails is skipped so
/// the user always ends up with a working app.
pub fn migrate_from_electron() {
    let edir = electron_dir();
    wait_for_exit(&edir, Duration::from_secs(60));

    if !crate::settings::settings_path().exists()
        && let Ok(bytes) = std::fs::read(electron_state())
        && let Ok(state) = serde_json::from_slice::<Value>(&bytes)
    {
        let settings = settings_from_electron(&state);
        let _ = settings.save();
        let mut index = LibraryIndex::load();
        if merge_clip_metadata(&state, &mut index) {
            let _ = index.save();
        }
    }
    let settings = Settings::load();

    if let Ok(exe) = std::env::current_exe()
        && let Some(dir) = exe.parent()
    {
        for name in ["ffmpeg.exe", "ffprobe.exe"] {
            let from = edir.join("resources").join("capture-host").join("ffmpeg").join(name);
            let to = dir.join(name);
            if from.is_file() && !to.is_file() {
                let _ = std::fs::copy(&from, &to);
            }
        }
    }

    // Tests run the copy and data steps in a temp profile; everything below
    // touches the real user's registry, shortcuts or Electron install.
    if sandboxed() {
        return;
    }
    let had_desktop_shortcut = known_folder(Folder::Desktop).is_some_and(|d| d.join(SHORTCUT).exists());
    let uninstaller = edir.join("Uninstall switchboard.exe");
    if uninstaller.is_file() && std::process::Command::new(&uninstaller).arg("/S").spawn().is_ok() {
        // The NSIS uninstaller relaunches itself from %TEMP% and returns at
        // once; it is finished when the app's executable is gone.
        let deadline = Instant::now() + Duration::from_secs(90);
        while edir.join("switchboard.exe").exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(500));
        }
    }
    remove_electron_autostart(&edir);

    let _ = set_autostart(settings.start_with_windows);
    let _ = create_shortcuts(had_desktop_shortcut);
    let _ = register_uninstall();
}

/// SB_MIGRATE_SANDBOX: test runs with LOCALAPPDATA/APPDATA pointed at a
/// temp folder.
pub fn sandboxed() -> bool {
    std::env::var_os("SB_MIGRATE_SANDBOX").is_some()
}

/// Settings from the Electron state file, starting from this build's
/// defaults; anything missing or unrecognised keeps the default.
pub fn settings_from_electron(state: &Value) -> Settings {
    let mut s = Settings::default();
    let config = &state["capture"]["config"];
    if let Some(v) = config["replaySeconds"].as_u64() {
        s.replay_seconds = v as u32;
    }
    if let Some(v) = config["fps"].as_u64() {
        s.fps = v as u32;
    }
    if let Some(h) = config["hotkey"].as_str().filter(|h| !h.trim().is_empty()) {
        s.hotkey = h.to_string();
    }
    match config["resolution"].as_str() {
        // "native" records at the display's size; this build never upscales past it.
        Some("native") => s.resolution = 2160,
        Some(r) => {
            if let Ok(h) = r.trim_end_matches('p').parse::<u32>() {
                s.resolution = h;
            }
        }
        None => {}
    }
    let clips = config["clipsDirectory"].as_str().or_else(|| state["capture"]["storage"]["clipsDirectory"].as_str());
    if let Some(dir) = clips.filter(|d| !d.is_empty()).map(PathBuf::from)
        && dir != default_clips_dir()
    {
        s.clips_dir = Some(dir);
    }
    if let Some(v) = state["settings"]["launchAtStartup"].as_bool() {
        s.start_with_windows = v;
    }
    if let Ok(auto) = serde_json::from_value(state["capture"]["autoCapture"]["settings"].clone()) {
        s.auto_capture = auto;
    }
    s.sanitized()
}

/// Copies favorites and renamed titles for clips this build doesn't know yet.
pub fn merge_clip_metadata(state: &Value, index: &mut LibraryIndex) -> bool {
    let mut changed = false;
    for clip in state["clips"].as_array().into_iter().flatten() {
        let Some(file) = clip["path"].as_str().and_then(|p| Path::new(p).file_name()).and_then(|f| f.to_str()) else { continue };
        if index.get(file).is_some() {
            continue;
        }
        let favorite = clip["favorite"].as_bool().unwrap_or(false);
        let title = clip["titleEdited"].as_bool().unwrap_or(false).then(|| clip["name"].as_str()).flatten();
        if favorite || title.is_some() {
            let entry = index.entry(file);
            entry.favorite = favorite;
            entry.title = title.map(str::to_string);
            changed = true;
        }
    }
    changed
}

/// Waits until no process runs from `dir` (the app and its capture host).
fn wait_for_exit(dir: &Path, limit: Duration) {
    let deadline = Instant::now() + limit;
    while processes_in(dir) > 0 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn processes_in(dir: &Path) -> usize {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::EnumProcesses;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    let prefix = folder_prefix(dir);
    let mut pids = vec![0u32; 4096];
    let mut bytes = 0u32;
    if unsafe { EnumProcesses(pids.as_mut_ptr(), (pids.len() * 4) as u32, &mut bytes) }.is_err() {
        return 0;
    }
    pids.truncate(bytes as usize / 4);
    pids.into_iter()
        .filter(|&pid| {
            let Ok(h) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }) else { return false };
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = unsafe { QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len) }.is_ok();
            unsafe {
                let _ = CloseHandle(h);
            }
            ok && String::from_utf16_lossy(&buf[..len as usize]).to_lowercase().starts_with(&prefix)
        })
        .count()
}

/// `dir` lowercased with a trailing separator, so the Electron folder
/// `...\switchboard\` doesn't also match our own `...\Switchboard Native\`.
fn folder_prefix(dir: &Path) -> String {
    format!("{}\\", dir.to_string_lossy().trim_end_matches('\\').to_lowercase())
}

fn remove_electron_autostart(edir: &Path) {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_SZ, RegDeleteKeyValueW, RegGetValueW};
    use windows::core::HSTRING;
    let key = HSTRING::from("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let name = HSTRING::from(ELECTRON_RUN_VALUE);
    let mut buf = [0u16; 1024];
    let mut len = (buf.len() * 2) as u32;
    let read = unsafe { RegGetValueW(HKEY_CURRENT_USER, &key, &name, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut len)) };
    if read.is_ok() {
        let value = String::from_utf16_lossy(&buf[..(len as usize / 2).saturating_sub(1)]).to_lowercase();
        // Only Electron Switchboard's own entry.
        if value.contains(&folder_prefix(edir)) {
            let _ = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, &key, &name) };
        }
    }
}

enum Folder {
    Programs,
    Desktop,
}

fn known_folder(f: Folder) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_Programs, KF_FLAG_DEFAULT, SHGetKnownFolderPath};
    let id = match f {
        Folder::Programs => &FOLDERID_Programs,
        Folder::Desktop => &FOLDERID_Desktop,
    };
    let p = unsafe { SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None) }.ok()?;
    let s = unsafe { p.to_string() }.ok();
    unsafe { CoTaskMemFree(Some(p.0 as *const _)) };
    s.filter(|s| !s.is_empty()).map(PathBuf::from)
}

fn create_shortcuts(desktop: bool) -> Result<()> {
    let exe = std::env::current_exe()?;
    if let Some(dir) = known_folder(Folder::Programs) {
        shortcut(&exe, &dir.join(SHORTCUT))?;
    }
    if desktop && let Some(dir) = known_folder(Folder::Desktop) {
        shortcut(&exe, &dir.join(SHORTCUT))?;
    }
    Ok(())
}

fn shortcut(exe: &Path, lnk: &Path) -> Result<()> {
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, IPersistFile,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    use windows::core::{HSTRING, Interface};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&HSTRING::from(exe.as_os_str()))?;
        if let Some(dir) = exe.parent() {
            link.SetWorkingDirectory(&HSTRING::from(dir.as_os_str()))?;
        }
        link.SetDescription(&HSTRING::from("Switchboard"))?;
        link.SetIconLocation(&HSTRING::from(exe.as_os_str()), 0)?;
        let file: IPersistFile = link.cast()?;
        file.Save(&HSTRING::from(lnk.as_os_str()), true)?;
    }
    Ok(())
}

/// The entry in Settings > Apps, whose Uninstall runs `--uninstall`.
fn register_uninstall() -> Result<()> {
    use windows::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_DWORD, REG_OPTION_NON_VOLATILE, REG_SZ, RegCloseKey, RegCreateKeyExW,
        RegSetValueExW,
    };
    use windows::core::HSTRING;
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or_else(|| anyhow!("no install folder"))?.to_path_buf();
    let size_kb = std::fs::metadata(&exe).map(|m| (m.len() / 1024) as u32).unwrap_or(0);
    unsafe {
        let mut key = HKEY::default();
        RegCreateKeyExW(HKEY_CURRENT_USER, &HSTRING::from(UNINSTALL_KEY), None, None, REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, None, &mut key, None)
            .ok()?;
        let text = |name: &str, value: &str| {
            let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
            let bytes = std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2);
            let _ = RegSetValueExW(key, &HSTRING::from(name), None, REG_SZ, Some(bytes));
        };
        let number = |name: &str, value: u32| {
            let _ = RegSetValueExW(key, &HSTRING::from(name), None, REG_DWORD, Some(&value.to_le_bytes()));
        };
        text("DisplayName", "Switchboard");
        text("DisplayVersion", crate::update::CURRENT);
        text("Publisher", "Means");
        text("DisplayIcon", &exe.to_string_lossy());
        text("InstallLocation", &dir.to_string_lossy());
        text("UninstallString", &format!("\"{}\" --uninstall", exe.display()));
        number("EstimatedSize", size_kb);
        number("NoModify", 1);
        number("NoRepair", 1);
        let _ = RegCloseKey(key);
    }
    Ok(())
}

/// `--uninstall` (from Settings > Apps): quits the running app and removes
/// the program, its shortcuts, autostart and uninstall entry. Clips and
/// settings stay.
pub fn uninstall() -> Result<()> {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RegDeleteTreeW};
    use windows::core::HSTRING;
    if let Ok(mut conn) = crate::pipe::connect() {
        let _ = crate::pipe::send(&mut conn.writer, &crate::protocol::Request::Quit);
        std::thread::sleep(Duration::from_secs(2));
    }
    let _ = set_autostart(false);
    for folder in [Folder::Programs, Folder::Desktop] {
        if let Some(dir) = known_folder(folder) {
            let _ = std::fs::remove_file(dir.join(SHORTCUT));
        }
    }
    let _ = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(UNINSTALL_KEY)) };
    // This executable can't delete its own folder while it runs; a detached
    // shell removes it a moment after this process exits.
    let exe = std::env::current_exe()?;
    if let Some(dir) = exe.parent().filter(|d| d.ends_with("Switchboard Native")) {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("cmd")
            .args(["/c", "timeout", "/t", "3", "/nobreak", ">nul", "&", "rmdir", "/s", "/q"])
            .arg(dir)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> Value {
        serde_json::json!({
            "capture": {
                "config": { "fps": 60, "resolution": "native", "replaySeconds": 30, "hotkey": "Alt+S", "clipsDirectory": null },
                "storage": { "clipsDirectory": "D:\\Clips" },
                "autoCapture": { "settings": { "enabled": true, "preRollSeconds": 25, "postRollSeconds": 5 } }
            },
            "settings": { "launchAtStartup": true },
            "clips": [
                { "path": "D:\\Clips\\SB_A.mp4", "name": "Big win", "titleEdited": true, "favorite": true },
                { "path": "D:\\Clips\\SB_B.mp4", "name": "SB B", "titleEdited": false, "favorite": false },
                { "path": "D:\\Clips\\SB_C.mp4", "name": "SB C", "titleEdited": false, "favorite": true }
            ]
        })
    }

    #[test]
    fn settings_carry_over() {
        let s = settings_from_electron(&state());
        assert_eq!(s.replay_seconds, 30);
        assert_eq!(s.fps, 60);
        assert_eq!(s.hotkey, "Alt+S");
        assert_eq!(s.resolution, 2160);
        assert_eq!(s.clips_dir, Some(PathBuf::from("D:\\Clips")));
        assert!(s.start_with_windows);
        assert!(s.auto_capture.enabled);
        assert_eq!(s.auto_capture.pre_roll_seconds, 25);
    }

    /// Reads this machine's Electron state (read-only):
    /// `cargo test -p switchboard real_electron_state -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_electron_state() {
        let state: Value = serde_json::from_slice(&std::fs::read(electron_state()).unwrap()).unwrap();
        let s = settings_from_electron(&state);
        println!(
            "replay={}s fps={} res={} hotkey={} clips={:?} autostart={} auto_capture={}",
            s.replay_seconds, s.fps, s.resolution, s.hotkey, s.clips_dir, s.start_with_windows, s.auto_capture.enabled
        );
    }

    /// Writes a shortcut to a temp file and checks it resolves to this exe.
    #[test]
    #[ignore]
    fn shortcut_file() {
        let lnk = std::env::temp_dir().join("sb-shortcut-test.lnk");
        let exe = std::env::current_exe().unwrap();
        shortcut(&exe, &lnk).unwrap();
        assert!(std::fs::metadata(&lnk).unwrap().len() > 100);
        std::fs::remove_file(&lnk).unwrap();
    }

    /// Registers the Apps entry, reads it back, removes it.
    #[test]
    #[ignore]
    fn uninstall_entry() {
        use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_SZ, RegDeleteTreeW, RegGetValueW};
        use windows::core::HSTRING;
        register_uninstall().unwrap();
        let mut buf = [0u16; 512];
        let mut len = (buf.len() * 2) as u32;
        unsafe {
            RegGetValueW(HKEY_CURRENT_USER, &HSTRING::from(UNINSTALL_KEY), &HSTRING::from("UninstallString"), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut len))
                .ok()
                .unwrap();
        }
        let value = String::from_utf16_lossy(&buf[..(len as usize / 2) - 1]);
        assert!(value.ends_with("--uninstall"), "{value}");
        unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(UNINSTALL_KEY)).ok().unwrap() };
    }

    #[test]
    fn electron_folder_does_not_match_ours() {
        let electron = folder_prefix(Path::new(r"C:\Users\A\AppData\Local\Programs\switchboard"));
        assert!(r"c:\users\a\appdata\local\programs\switchboard\switchboard.exe".starts_with(&electron));
        assert!(!r"c:\users\a\appdata\local\programs\switchboard native\switchboard.exe".starts_with(&electron));
    }

    #[test]
    fn missing_fields_keep_defaults() {
        let s = settings_from_electron(&serde_json::json!({}));
        assert_eq!(s, Settings::default().sanitized());
    }

    #[test]
    fn favorites_and_renamed_titles_carry_over() {
        let mut index = LibraryIndex::default();
        assert!(merge_clip_metadata(&state(), &mut index));
        let a = index.get("SB_A.mp4").unwrap();
        assert!(a.favorite);
        assert_eq!(a.title.as_deref(), Some("Big win"));
        assert!(index.get("SB_B.mp4").is_none());
        let c = index.get("SB_C.mp4").unwrap();
        assert!(c.favorite && c.title.is_none());
    }
}
