use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicI64, AtomicIsize, AtomicU32, Ordering};

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GW_OWNER, GWL_EXSTYLE, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, WS_EX_TOOLWINDOW,
};
use windows::core::{BOOL, PWSTR};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AppWindow {
    pub key: String,
    pub exe: String,
    pub title: String,
    #[serde(skip)]
    path: String,
    #[serde(skip)]
    pub(crate) hwnd: isize,
    #[serde(skip)]
    pub(crate) pid: u32,
    #[serde(skip)]
    area: i64,
    #[serde(skip)]
    minimized: bool,
}

const SKIPPED: [&str; 8] =
    ["explorer", "searchhost", "shellexperiencehost", "startmenuexperiencehost", "textinputhost", "applicationframehost", "lockapp", "systemsettings"];

pub fn app_key(exe_stem: &str) -> String {
    let lower = exe_stem.to_ascii_lowercase();
    let kept: Vec<&str> = lower.split('_').filter(|t| !t.is_empty() && !t.chars().any(|c| c.is_ascii_digit())).collect();
    if kept.is_empty() || !lower.contains('_') { lower } else { kept.join("_") }
}

pub fn app_windows() -> Vec<AppWindow> {
    let mut found: Vec<AppWindow> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut found as *mut Vec<AppWindow> as isize));
    }
    found.sort_by(|a, b| (a.minimized, -a.area).cmp(&(b.minimized, -b.area)));
    let mut apps: Vec<AppWindow> = Vec::new();
    for mut w in found {
        if !apps.iter().any(|a| a.key == w.key) {
            w.title = app_name(&w.title, &w.exe, &w.path);
            apps.push(w);
        }
    }
    apps.sort_by_key(|a| a.title.to_lowercase());
    apps
}

pub(crate) fn find_app(key: &str) -> Option<AppWindow> {
    let mut found: Vec<AppWindow> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut found as *mut Vec<AppWindow> as isize));
    }
    found.into_iter().filter(|w| w.key == key).min_by_key(|w| (w.minimized, -w.area))
}

pub(crate) fn window_alive(hwnd: isize) -> bool {
    let h = HWND(hwnd as *mut core::ffi::c_void);
    unsafe { IsWindow(Some(h)).as_bool() && IsWindowVisible(h).as_bool() }
}

pub(crate) fn window_bounds(hwnd: isize) -> Option<RECT> {
    let mut r = RECT::default();
    let h = HWND(hwnd as *mut core::ffi::c_void);
    unsafe { DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, &mut r as *mut RECT as *mut _, size_of::<RECT>() as u32) }.ok()?;
    (r.right > r.left && r.bottom > r.top).then_some(r)
}

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let found = unsafe { &mut *(lparam.0 as *mut Vec<AppWindow>) };
    if let Some(w) = unsafe { describe(hwnd) } {
        found.push(w);
    }
    true.into()
}

unsafe fn describe(hwnd: HWND) -> Option<AppWindow> {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() || GetWindow(hwnd, GW_OWNER).is_ok_and(|o| !o.0.is_null()) {
            return None;
        }
        if GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0 != 0 {
            return None;
        }
        let mut cloaked = 0u32;
        let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
        if cloaked != 0 {
            return None;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]).trim().to_string();
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if title.is_empty() || pid == 0 || pid == std::process::id() {
            return None;
        }
        let path = exe_path(pid)?;
        let exe = Path::new(&path).file_stem()?.to_string_lossy().to_string();
        let lower = exe.to_ascii_lowercase();
        if SKIPPED.contains(&lower.as_str()) || lower.starts_with("switchboard") {
            return None;
        }
        let r = window_bounds(hwnd.0 as isize).unwrap_or_default();
        let area = (r.right - r.left) as i64 * (r.bottom - r.top) as i64;
        let minimized = IsIconic(hwnd).as_bool();
        if area < 64 * 64 && !minimized {
            return None;
        }
        Some(AppWindow { key: app_key(&exe), exe, title, path, hwnd: hwnd.0 as isize, pid, area, minimized })
    }
}

fn app_name(title: &str, exe: &str, path: &str) -> String {
    let mut names = product_names(path);
    names.push(exe.to_string());
    for sep in [" - ", " \u{2014} ", " \u{2013} ", " | "] {
        let Some((_, tail)) = title.rsplit_once(sep) else { continue };
        let lower = tail.to_lowercase();
        if names.iter().any(|n| n.len() >= 3 && lower.contains(&n.to_lowercase())) {
            return tail.trim().to_string();
        }
    }
    title.to_string()
}

fn product_names(path: &str) -> Vec<String> {
    use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
    use windows::core::HSTRING;
    let file = HSTRING::from(path);
    let mut out = Vec::new();
    unsafe {
        let size = GetFileVersionInfoSizeW(&file, None);
        if size == 0 {
            return out;
        }
        let mut data = vec![0u8; size as usize];
        if GetFileVersionInfoW(&file, None, size, data.as_mut_ptr() as *mut _).is_err() {
            return out;
        }
        let mut ptr = std::ptr::null_mut();
        let mut len = 0u32;
        if !VerQueryValueW(data.as_ptr() as *const _, &HSTRING::from("\\VarFileInfo\\Translation"), &mut ptr, &mut len).as_bool() || len < 4 {
            return out;
        }
        let [lang, page] = *(ptr as *const [u16; 2]);
        for field in ["ProductName", "FileDescription"] {
            let query = HSTRING::from(format!("\\StringFileInfo\\{lang:04x}{page:04x}\\{field}"));
            if VerQueryValueW(data.as_ptr() as *const _, &query, &mut ptr, &mut len).as_bool() && len > 1 {
                let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr as *const u16, len as usize - 1));
                let text = text.trim_end_matches('\0').trim();
                if !text.is_empty() {
                    out.push(text.to_string());
                }
            }
        }
    }
    out
}

fn exe_path(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(h);
        if !ok {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AppChoice {
    pub key: String,
    pub name: String,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AppStatus {
    pub name: String,
    pub recording: bool,
    pub problem: Option<String>,
    #[serde(default)]
    pub recent: bool,
}

pub(crate) struct AppFollow {
    pub key: String,
    pub hwnd: AtomicIsize,
    pub pid: AtomicU32,
    pub since: AtomicI64,
    pub status: Mutex<AppStatus>,
}

impl AppFollow {
    pub fn new(key: &str, name: &str) -> AppFollow {
        AppFollow {
            key: key.to_string(),
            hwnd: AtomicIsize::new(0),
            pid: AtomicU32::new(0),
            since: AtomicI64::new(0),
            status: Mutex::new(AppStatus { name: name.to_string(), recording: false, problem: None, recent: false }),
        }
    }

    pub fn status(&self) -> AppStatus {
        self.status.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn last_session(&self) -> Option<i64> {
        Some(self.since.load(Ordering::Relaxed)).filter(|&since| since != 0)
    }

    pub fn recording_since(&self) -> Option<i64> {
        (self.hwnd.load(Ordering::Relaxed) != 0).then(|| self.since.load(Ordering::Relaxed))
    }
}
