//! Main thread of the background process: tray icon, global hotkey, toast,
//! and the Win32 message loop they all need. Purely event driven.

use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};

use anyhow::Result;
use global_hotkey::hotkey::HotKey;
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use tray_icon::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, MSG, PostQuitMessage, PostThreadMessageW, TranslateMessage, WM_APP,
};

use crate::guide::{Guide, WM_GUIDE_LAYOUT};
use crate::pipe;
use crate::protocol::Request;
use crate::service::{self, Msg};
use crate::settings::{Settings, VerticalGuide};
use crate::toast::Toast;

const WM_TRAY_UPDATE: u32 = WM_APP + 1;
const WM_SET_HOTKEY: u32 = WM_APP + 2;
const WM_TOAST: u32 = WM_APP + 3;
const WM_QUIT_APP: u32 = WM_APP + 4;
const WM_GUIDE: u32 = WM_APP + 5;

#[derive(Default)]
struct Pending {
    tray: Option<(bool, String, String)>,
    hotkey: Option<String>,
    toast: Option<(bool, String, String)>,
    guide: Option<(VerticalGuide, Option<String>)>,
}

/// Handle for other threads to ask the main thread to do UI work.
#[derive(Clone)]
pub struct MainThread {
    tid: u32,
    pending: Arc<Mutex<Pending>>,
}

impl MainThread {
    fn post(&self, msg: u32) {
        unsafe {
            let _ = PostThreadMessageW(self.tid, msg, WPARAM(0), LPARAM(0));
        }
    }
    pub fn update_tray(&self, replay_on: bool, tooltip: String, hotkey: String) {
        self.pending.lock().unwrap().tray = Some((replay_on, tooltip, hotkey));
        self.post(WM_TRAY_UPDATE);
    }
    pub fn set_hotkey(&self, hotkey: String) {
        self.pending.lock().unwrap().hotkey = Some(hotkey);
        self.post(WM_SET_HOTKEY);
    }
    pub fn toast(&self, ok: bool, title: String, detail: String) {
        self.pending.lock().unwrap().toast = Some((ok, title, detail));
        self.post(WM_TOAST);
    }
    /// Shows, moves or hides the framing guide on the named display.
    pub fn set_guide(&self, guide: VerticalGuide, device: Option<String>) {
        self.pending.lock().unwrap().guide = Some((guide, device));
        self.post(WM_GUIDE);
    }
    pub fn quit(&self) {
        self.post(WM_QUIT_APP);
    }
}

pub fn run(open_ui: bool) -> Result<()> {
    // Crisp tray menu and saved-clip notice on scaled displays.
    unsafe {
        let _ = windows::Win32::UI::HiDpi::SetProcessDpiAwarenessContext(
            windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        );
    }
    switchboard_capture::clock::now_hns();
    let settings = Settings::load();
    let main = MainThread { tid: unsafe { GetCurrentThreadId() }, pending: Arc::new(Mutex::new(Pending::default())) };
    let (tx, rx) = mpsc::channel::<Msg>();

    // UI connections.
    let next_conn = Arc::new(AtomicU64::new(1));
    let pipe_tx = tx.clone();
    pipe::serve(move |conn| {
        let id = next_conn.fetch_add(1, Ordering::Relaxed);
        let (etx, erx) = mpsc::channel();
        let _ = pipe_tx.send(Msg::Connected { conn: id, out: etx });
        let mut writer = conn.writer;
        std::thread::spawn(move || {
            for event in erx {
                if pipe::send(&mut writer, &event).is_err() {
                    break;
                }
            }
        });
        let reader = conn.reader;
        let tx = pipe_tx.clone();
        std::thread::spawn(move || {
            pipe::read_loop::<Request>(reader, |req| {
                let _ = tx.send(Msg::Request { conn: id, req });
            });
            let _ = tx.send(Msg::Disconnected { conn: id });
        });
    });

    // Tray icon and menu.
    let open_item = MenuItem::with_id("open", "Open Switchboard", true, None);
    let save_item = MenuItem::with_id("save", format!("Save clip\t{}", settings.hotkey), true, None);
    let replay_item = CheckMenuItem::with_id("replay", "Instant Replay", true, settings.replay_enabled, None);
    let guide_item = CheckMenuItem::with_id("guide", "Vertical guide (9:16)", true, settings.vertical_guide.enabled, None);
    let quit_item = MenuItem::with_id("quit", "Quit Switchboard", true, None);
    let menu = Menu::new();
    menu.append_items(&[&open_item, &save_item, &replay_item, &guide_item, &PredefinedMenuItem::separator(), &quit_item])?;
    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_menu_on_left_click(false)
        .with_tooltip("Switchboard")
        .with_icon(Icon::from_resource(1, Some((32, 32)))?)
        .build()?;

    let t = tx.clone();
    TrayIconEvent::set_event_handler(Some(move |e: TrayIconEvent| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
            let _ = t.send(Msg::Request { conn: 0, req: Request::OpenUi });
        }
    }));
    let t = tx.clone();
    let replay_check = Arc::new(Mutex::new(settings.replay_enabled));
    let rc = replay_check.clone();
    let guide_check = Arc::new(Mutex::new(settings.vertical_guide.enabled));
    let gc = guide_check.clone();
    MenuEvent::set_event_handler(Some(move |e: MenuEvent| {
        let req = match e.id.as_ref() {
            "open" => Request::OpenUi,
            "save" => Request::SaveClip,
            "replay" => {
                let mut on = rc.lock().unwrap();
                *on = !*on;
                Request::SetReplay { enabled: *on }
            }
            "guide" => {
                let mut on = gc.lock().unwrap();
                *on = !*on;
                Request::SetGuide { enabled: *on }
            }
            "quit" => Request::Quit,
            _ => return,
        };
        let _ = t.send(Msg::Request { conn: 0, req });
    }));

    // Global hotkey.
    let hotkeys = GlobalHotKeyManager::new()?;
    let mut current: Option<HotKey> = None;
    let register = |hk: &str, current: &mut Option<HotKey>| -> Option<String> {
        if let Some(old) = current.take() {
            let _ = hotkeys.unregister(old);
        }
        match HotKey::from_str(hk) {
            Ok(k) => match hotkeys.register(k) {
                Ok(()) => {
                    *current = Some(k);
                    None
                }
                Err(e) => Some(format!("{hk} is in use by another app ({e})")),
            },
            Err(e) => Some(format!("{hk} is not a valid shortcut ({e})")),
        }
    };
    let err = register(&settings.hotkey, &mut current);
    let _ = tx.send(Msg::HotkeyResult(err));
    let t = tx.clone();
    GlobalHotKeyEvent::set_event_handler(Some(move |e: GlobalHotKeyEvent| {
        if e.state == HotKeyState::Pressed {
            let _ = t.send(Msg::Hotkey);
        }
    }));

    let service_main = main.clone();
    let service_tx = tx.clone();
    std::thread::Builder::new()
        .name("sb-service".into())
        .spawn(move || service::run(settings, rx, service_tx, service_main, open_ui))?;

    let mut toast = Toast::default();
    let mut guide = Guide::default();
    let mut msg = MSG::default();
    while unsafe { GetMessageW(&mut msg, None, 0, 0) }.as_bool() {
        if msg.hwnd.is_invalid() {
            match msg.message {
                WM_TRAY_UPDATE => {
                    if let Some((on, tooltip, hk)) = main.pending.lock().unwrap().tray.take() {
                        replay_item.set_checked(on);
                        *replay_check.lock().unwrap() = on;
                        save_item.set_text(format!("Save clip\t{hk}"));
                        let _ = tray.set_tooltip(Some(tooltip));
                    }
                }
                WM_SET_HOTKEY => {
                    if let Some(hk) = main.pending.lock().unwrap().hotkey.take() {
                        let err = register(&hk, &mut current);
                        let _ = tx.send(Msg::HotkeyResult(err));
                    }
                }
                WM_TOAST => {
                    if let Some((ok, title, detail)) = main.pending.lock().unwrap().toast.take() {
                        toast.show(ok, &title, &detail);
                    }
                }
                WM_GUIDE => {
                    if let Some((g, device)) = main.pending.lock().unwrap().guide.take() {
                        let on = g.enabled;
                        let err = guide.apply(g, device);
                        guide_item.set_checked(on && err.is_none());
                        *guide_check.lock().unwrap() = on && err.is_none();
                        let _ = tx.send(Msg::GuideResult(err));
                    }
                }
                WM_GUIDE_LAYOUT => {
                    if let Some(err) = guide.layout() {
                        let _ = tx.send(Msg::GuideResult(Some(err)));
                    }
                }
                WM_QUIT_APP => unsafe { PostQuitMessage(0) },
                _ => {}
            }
        }
        unsafe {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    drop(guide);
    drop(tray);
    Ok(())
}
