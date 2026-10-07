//! Persisted user settings and well-known paths. The tray process owns the
//! file; the UI edits a copy and sends it back through IPC.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use switchboard_capture::{EngineConfig, Quality};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub replay_enabled: bool,
    pub replay_seconds: u32,
    pub display_index: usize,
    pub fps: u32,
    /// Output height; the source is never upscaled.
    pub resolution: u32,
    pub quality: Quality,
    pub game_audio: bool,
    pub chat_audio: bool,
    pub microphone: bool,
    /// None: every app (Game) / the Discord app (Chat) / Windows default (Mic).
    pub game_device: Option<String>,
    pub chat_device: Option<String>,
    pub mic_device: Option<String>,
    pub cursor: bool,
    pub hotkey: String,
    pub clips_dir: Option<PathBuf>,
    pub show_toast: bool,
    pub start_with_windows: bool,
    pub auto_capture: switchboard_autocapture::AutoCaptureSettings,
    /// Levels new edits start with: Game, Chat, Microphone (0..=100).
    pub default_levels: [u8; 3],
    /// Check for, download and stage new versions in the background.
    pub auto_update: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            replay_enabled: true,
            replay_seconds: 60,
            display_index: 0,
            fps: 60,
            resolution: 1440,
            quality: Quality::High,
            game_audio: true,
            chat_audio: true,
            microphone: true,
            game_device: None,
            chat_device: None,
            mic_device: None,
            cursor: false,
            hotkey: "Ctrl+Shift+F10".into(),
            clips_dir: None,
            show_toast: true,
            start_with_windows: false,
            auto_capture: Default::default(),
            default_levels: [100, 100, 100],
            auto_update: true,
        }
    }
}

impl Settings {
    pub fn load() -> Settings {
        std::fs::read(settings_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<Settings>(&b).ok())
            .map(|s| s.sanitized())
            .unwrap_or_default()
    }

    pub fn save(&self) -> std::io::Result<()> {
        let path = settings_path();
        std::fs::create_dir_all(path.parent().unwrap())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(self).unwrap())?;
        std::fs::rename(tmp, path)
    }

    pub fn sanitized(mut self) -> Settings {
        self.replay_seconds = self.replay_seconds.clamp(10, 20 * 60);
        self.fps = match self.fps {
            0..=45 => 30,
            46..=90 => 60,
            91..=130 => 120,
            _ => 144,
        };
        self.resolution = self.resolution.clamp(480, 2160);
        self.auto_capture = self.auto_capture.sanitized();
        self.default_levels = self.default_levels.map(|v| v.min(100));
        self
    }

    pub fn clips_dir(&self) -> PathBuf {
        self.clips_dir.clone().unwrap_or_else(default_clips_dir)
    }

    /// Settings that require restarting capture when they change.
    pub fn engine_key(&self) -> impl PartialEq + use<> {
        (
            self.replay_seconds,
            self.display_index,
            self.fps,
            self.resolution,
            self.quality,
            self.game_audio,
            self.chat_audio,
            self.microphone,
            self.cursor,
            self.game_device.clone(),
            self.chat_device.clone(),
            self.mic_device.clone(),
        )
    }

    pub fn engine_config(&self) -> EngineConfig {
        EngineConfig {
            display_index: self.display_index,
            fps: self.fps,
            target_height: self.resolution,
            quality: self.quality,
            replay_seconds: self.replay_seconds,
            game_audio: self.game_audio,
            chat_audio: self.chat_audio,
            microphone: self.microphone,
            game_device: self.game_device.clone(),
            chat_device: self.chat_device.clone(),
            mic_device: self.mic_device.clone(),
            cursor: self.cursor,
            cache_dir: data_dir().join("ReplayCache"),
        }
    }
}

pub fn data_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("Switchboard Native")
}

pub(crate) fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn thumbnails_dir() -> PathBuf {
    data_dir().join("Thumbnails")
}

/// Same folder the Electron app uses, so existing clips show up.
pub fn default_clips_dir() -> PathBuf {
    use windows::Win32::UI::Shell::{FOLDERID_Videos, KF_FLAG_DEFAULT, SHGetKnownFolderPath};
    let videos = unsafe { SHGetKnownFolderPath(&FOLDERID_Videos, KF_FLAG_DEFAULT, None) }
        .ok()
        .map(|p| {
            let s = unsafe { p.to_string() }.unwrap_or_default();
            unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const _)) };
            PathBuf::from(s)
        })
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()).join("Videos"));
    videos.join("Switchboard").join("Clips")
}

// ------------------------------------------------------------- autostart

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE: &str = "Switchboard Native";

pub fn set_autostart(enabled: bool) -> anyhow::Result<()> {
    use windows::Win32::System::Registry::*;
    use windows::core::HSTRING;
    unsafe {
        let mut key = HKEY::default();
        RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(RUN_KEY), Some(0), KEY_SET_VALUE, &mut key).ok()?;
        let name = HSTRING::from(RUN_VALUE);
        let result = if enabled {
            let exe = std::env::current_exe()?;
            let cmd = format!("\"{}\" --background", exe.display());
            let wide: Vec<u16> = cmd.encode_utf16().chain(std::iter::once(0)).collect();
            let bytes = std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2);
            RegSetValueExW(key, &name, Some(0), REG_SZ, Some(bytes)).ok()
        } else {
            let r = RegDeleteValueW(key, &name);
            if r == windows::Win32::Foundation::ERROR_FILE_NOT_FOUND { Ok(()) } else { r.ok() }
        };
        let _ = RegCloseKey(key);
        Ok(result?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_clamps_untrusted_values() {
        let s = Settings { replay_seconds: 1, fps: 75, resolution: 99_999, ..Default::default() }.sanitized();
        assert_eq!((s.replay_seconds, s.fps, s.resolution), (10, 60, 2160));
        let s = Settings { replay_seconds: 999_999, fps: 1000, ..Default::default() }.sanitized();
        assert_eq!((s.replay_seconds, s.fps), (1200, 144));
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let s: Settings = serde_json::from_str(r#"{"fps": 30}"#).unwrap();
        assert_eq!(s.fps, 30);
        assert_eq!(s.hotkey, Settings::default().hotkey);
    }
}
