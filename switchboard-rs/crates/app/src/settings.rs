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
    /// On-screen 9:16 framing guide for short-form content.
    pub vertical_guide: VerticalGuide,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GuideColor {
    White,
    Violet,
    Lime,
}

impl GuideColor {
    pub fn rgb(self) -> u32 {
        match self {
            GuideColor::White => 0xffffff,
            GuideColor::Violet => 0xb9aaff,
            GuideColor::Lime => 0xcefa76,
        }
    }
}

/// A click-through outline on screen showing what a 9:16 crop keeps. It is a
/// framing aid only: it never appears in clips and never crops them.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct VerticalGuide {
    pub enabled: bool,
    /// Display to draw on; None follows the captured display.
    pub display_index: Option<usize>,
    /// Frame height as a percentage of the largest 9:16 frame that fits (25..=100).
    pub size: u8,
    /// Free space left of / above the frame, as a percentage (0..=100, 50 = centred).
    pub horizontal: u8,
    pub vertical: u8,
    /// How much to darken outside the frame (0..=80 %).
    pub dim: u8,
    pub color: GuideColor,
}

impl Default for VerticalGuide {
    fn default() -> Self {
        VerticalGuide { enabled: false, display_index: None, size: 100, horizontal: 50, vertical: 50, dim: 35, color: GuideColor::White }
    }
}

impl VerticalGuide {
    pub fn sanitized(mut self) -> VerticalGuide {
        self.size = self.size.clamp(25, 100);
        self.horizontal = self.horizontal.min(100);
        self.vertical = self.vertical.min(100);
        self.dim = self.dim.min(80);
        self
    }

    /// The frame on a `w` x `h` display, as (x, y, width, height) in that
    /// display's pixels: exactly 9:16, never larger than the display.
    pub fn frame(&self, w: i32, h: i32) -> (i32, i32, i32, i32) {
        let largest = (h as f64 / 16.0).min(w as f64 / 9.0);
        let unit = ((largest * self.size as f64 / 100.0).floor() as i32).max(1);
        let (fw, fh) = (unit * 9, unit * 16);
        let x = ((w - fw).max(0) as f64 * self.horizontal as f64 / 100.0).round() as i32;
        let y = ((h - fh).max(0) as f64 * self.vertical as f64 / 100.0).round() as i32;
        (x, y, fw, fh)
    }
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
            vertical_guide: VerticalGuide::default(),
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
        self.vertical_guide = self.vertical_guide.sanitized();
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
    fn guide_frame_is_nine_by_sixteen_and_stays_on_screen() {
        let g = VerticalGuide::default();
        // 1440p: the largest frame is the full height, centred.
        assert_eq!(g.frame(2560, 1440), (875, 0, 810, 1440));
        // Portrait display: limited by width.
        let (x, y, w, h) = g.frame(1080, 1920);
        assert_eq!((w, h), (1080, 1920));
        assert_eq!((x, y), (0, 0));
        // Half size, pushed to the right edge and the bottom.
        let g = VerticalGuide { size: 50, horizontal: 100, vertical: 100, ..Default::default() };
        let (x, y, w, h) = g.frame(3840, 2160);
        assert_eq!(w * 16, h * 9);
        assert_eq!((x + w, y + h), (3840, 2160));
        let s = VerticalGuide { size: 0, horizontal: 200, vertical: 255, dim: 99, ..Default::default() }.sanitized();
        assert_eq!((s.size, s.horizontal, s.vertical, s.dim), (25, 100, 100, 80));
    }

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
