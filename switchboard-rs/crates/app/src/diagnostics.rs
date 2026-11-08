use std::fmt::Write;

use crate::protocol::{ReplayState, ServiceState};

const ISSUES: &str = "https://github.com/IEver3st/switchboard/issues/new";

pub fn windows_version() -> String {
    use windows::Win32::System::Registry::{HKEY, HKEY_LOCAL_MACHINE, KEY_READ, RRF_RT_REG_DWORD, RRF_RT_REG_SZ, RegCloseKey, RegGetValueW, RegOpenKeyExW};
    use windows::core::HSTRING;
    unsafe {
        let mut key = HKEY::default();
        let path = HSTRING::from("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion");
        if RegOpenKeyExW(HKEY_LOCAL_MACHINE, &path, Some(0), KEY_READ, &mut key).is_err() {
            return "Windows".into();
        }
        let text = |name: &str| -> String {
            let mut buf = [0u16; 128];
            let mut len = (buf.len() * 2) as u32;
            let ok = RegGetValueW(key, None, &HSTRING::from(name), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut len)).is_ok();
            if ok { String::from_utf16_lossy(&buf[..(len as usize / 2).saturating_sub(1)]) } else { String::new() }
        };
        let mut ubr = 0u32;
        let mut len = 4u32;
        let _ = RegGetValueW(key, None, &HSTRING::from("UBR"), RRF_RT_REG_DWORD, None, Some(&mut ubr as *mut u32 as *mut _), Some(&mut len));
        let (product, display, build) = (text("ProductName"), text("DisplayVersion"), text("CurrentBuild"));
        let _ = RegCloseKey(key);
        let product = match build.parse::<u32>() {
            Ok(b) if b >= 22000 => product.replace("Windows 10", "Windows 11"),
            _ => product,
        };
        format!("{product} {display} (build {build}.{ubr})").trim().to_string()
    }
}

pub fn report(state: Option<&ServiceState>, ui_memory: u64) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "Switchboard {} (window build {})", crate::update::CURRENT, crate::protocol::BUILD);
    let _ = writeln!(out, "{}", windows_version());
    match state {
        None => {
            let _ = writeln!(out, "Background service: not connected");
        }
        Some(st) => {
            let _ = writeln!(out, "Service build: {}", st.build);
            let replay = match &st.replay {
                ReplayState::Off => "off".to_string(),
                ReplayState::Starting => "starting".to_string(),
                ReplayState::Running => "running".to_string(),
                ReplayState::Failed { message } => format!("failed: {message}"),
            };
            let _ = writeln!(out, "Replay: {replay}");
            if let Some(i) = &st.info {
                let _ = writeln!(out, "Encoder: {} ({}) on {}", i.encoder, i.codec.label(), i.adapter);
                if let Some(note) = &i.codec_note {
                    let _ = writeln!(out, "Format note: {note}");
                }
                let _ = writeln!(out, "Output: {}x{} at {} fps, {:.1} Mbps", i.width, i.height, i.fps, i.bitrate as f64 / 1e6);
                let _ = writeln!(out, "Recording: {}", i.display);
                if let Some(app) = st.status.as_ref().and_then(|x| x.app.as_ref()) {
                    let state = if app.recording { "recording" } else { "waiting" };
                    let _ = writeln!(out, "App: {} ({state}){}", app.name, app.problem.as_ref().map(|p| format!(": {p}")).unwrap_or_default());
                }
                let _ = writeln!(out, "Chat app: {}", i.chat_app.as_deref().unwrap_or("none"));
            }
            for d in &st.displays {
                let _ = writeln!(out, "Display: {} on {}", d.label(), d.adapter_name);
            }
            if let Some(s) = &st.status {
                let _ = writeln!(
                    out,
                    "Frames: {} captured, {} encoded, {} skipped, {} dropped, {} capture reconnects{}",
                    s.frames_captured,
                    s.frames_encoded,
                    s.frames_skipped,
                    s.frames_dropped,
                    s.capture_reopens,
                    if s.capture_blind { ", capture blind" } else { "" }
                );
                if let Some(e) = &s.video_error {
                    let _ = writeln!(out, "Video error: {e}");
                }
                for t in &s.tracks {
                    let _ = writeln!(out, "{}: {}", t.kind.label(), t.error.clone().unwrap_or_else(|| format!("level {:.2}", t.level)));
                }
            }
            let s = &st.settings;
            let _ = writeln!(
                out,
                "Settings: {} s replay, {}p, {} fps, {:?}, {}, game {}, chat {}, mic {}, cursor {}, cursor track {}",
                s.replay_seconds,
                s.resolution,
                s.fps,
                s.quality,
                s.codec.label(),
                track_setting(s.game_audio, &s.game_device),
                track_setting(s.chat_audio, &s.chat_device),
                track_setting(s.microphone, &s.mic_device),
                s.cursor,
                s.cursor_track
            );
            let _ = writeln!(out, "Auto Capture: events {}, reactions {}", s.auto_capture.enabled, s.auto_capture.reaction_clipping.enabled);
            if let Some(e) = &st.hotkey_error {
                let _ = writeln!(out, "Shortcut: {e}");
            }
            let _ = writeln!(out, "Memory: service {:.0} MB, window {:.0} MB", st.service_memory as f64 / 1e6, ui_memory as f64 / 1e6);
        }
    }
    let crashes = switchboard_log::crash_files();
    if let Some(newest) = crashes.last() {
        let names: Vec<String> = crashes.iter().filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string())).collect();
        let _ = writeln!(out, "\nCrash reports: {}", names.join(", "));
        if let Ok(text) = std::fs::read_to_string(newest) {
            let _ = writeln!(out, "\n--- newest crash report\n{}", text.lines().take(80).collect::<Vec<_>>().join("\n"));
        }
    }
    for (role, lines) in [("service", 150), ("ui", 40), ("media", 30)] {
        let tail = switchboard_log::tail(role, lines);
        if !tail.is_empty() {
            let _ = writeln!(out, "\n--- {role}.log\n{}", tail.join("\n"));
        }
    }
    redact(&out)
}

fn track_setting(on: bool, device: &Option<String>) -> &'static str {
    match (on, device) {
        (false, _) => "off",
        (true, None) => "default",
        (true, Some(_)) => "chosen device",
    }
}

pub fn redact(text: &str) -> String {
    let mut out = text.to_string();
    if let Some(profile) = std::env::var_os("USERPROFILE").map(|p| p.to_string_lossy().to_string()).filter(|p| p.len() > 3) {
        out = replace_segment(&out, &profile, "%USERPROFILE%");
        out = replace_segment(&out, &profile.replace('\\', "/"), "%USERPROFILE%");
    }
    if let Some(user) = std::env::var_os("USERNAME").map(|u| u.to_string_lossy().to_string()).filter(|u| u.len() >= 3) {
        for sep in ['\\', '/'] {
            out = replace_segment(&out, &format!("{sep}{user}"), &format!("{sep}<user>"));
        }
    }
    out
}

fn replace_segment(text: &str, needle: &str, with: &str) -> String {
    let (hay, pat) = (text.as_bytes(), needle.as_bytes());
    if pat.is_empty() {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let (mut last, mut i) = (0, 0);
    while i + pat.len() <= hay.len() {
        let end = i + pat.len();
        let matched = text.is_char_boundary(i) && text.is_char_boundary(end) && hay[i..end].eq_ignore_ascii_case(pat);
        let whole = matched
            && text[end..].chars().next().is_none_or(|c| matches!(c, '\\' | '/' | '"' | '\'' | ',' | '.' | ';' | ':' | ')' | ']') || c.is_whitespace());
        if whole {
            out.push_str(&text[last..i]);
            out.push_str(with);
            last = end;
            i = end;
        } else {
            i += 1;
        }
    }
    out.push_str(&text[last..]);
    out
}

pub fn issue_url(state: Option<&ServiceState>) -> String {
    let gpu = state.and_then(|s| s.info.as_ref()).map(|i| i.adapter.clone()).unwrap_or_default();
    let environment = format!(
        "Switchboard {}\n{}\nGraphics: {}\n\nDiagnostics: paste them below (Settings > Diagnostics > Copy diagnostics) and check they contain nothing you want to keep private.\n\n",
        crate::update::CURRENT,
        windows_version(),
        if gpu.is_empty() { "unknown".to_string() } else { gpu }
    );
    format!("{ISSUES}?template=bug_report.yml&environment={}", encode(&redact(&environment)))
}

fn encode(text: &str) -> String {
    let mut out = String::with_capacity(text.len() * 3);
    for b in text.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => {
                let _ = write!(out, "%{b:02X}");
            }
        }
    }
    out
}
