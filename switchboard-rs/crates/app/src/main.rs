#![windows_subsystem = "windows"]

//! Switchboard: one binary, two processes.
//!
//! - `switchboard` / `switchboard --background`: tray icon, global hotkey and
//!   the capture engine. Single instance; a second launch opens the window.
//! - `switchboard --ui`: the window, started on demand and exited on close.
//! - `switchboard --media-host`: video decoding for the window, started by
//!   it on demand and exited when the window no longer needs it.

mod auto;
mod guide;
mod library_index;
mod media_client;
mod media_host;
mod migrate;
mod pipe;
mod protocol;
mod service;
mod settings;
mod shell;
mod toast;
mod tray;
mod ui;
mod update;

use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
use windows::Win32::System::Threading::CreateMutexW;
use windows::core::w;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // The Electron app's updater runs new versions as `<exe> --updated /S`.
    if args.iter().any(|a| a == "--updated") {
        return migrate::install_from_electron_update();
    }
    if args.first().map(String::as_str) == Some("--uninstall") {
        return migrate::uninstall();
    }
    if args.first().map(String::as_str) == Some("--migrate-from-electron") {
        migrate::migrate_from_electron();
        if migrate::sandboxed() {
            return Ok(());
        }
    }
    if args.iter().any(|a| a == "--ui") {
        return ui::run();
    }
    if args.first().map(String::as_str) == Some("--media-host") {
        return media_host::run();
    }
    if args.first().map(String::as_str) == Some("--review-shot") {
        let num = |i: usize, d: f32| args.get(i).and_then(|v| v.parse().ok()).unwrap_or(d);
        let out = std::path::PathBuf::from(args.get(1).cloned().unwrap_or_else(|| "review.png".into()));
        let page = args.get(5).cloned().unwrap_or_else(|| "clips".into());
        return ui::review_shot(&out, num(2, 1080.0), num(3, 720.0), num(4, 1.0), &page, num(6, 0.0));
    }
    let background = args.iter().any(|a| a == "--background");
    let after_update = args.iter().any(|a| a == "--after-update");

    // Single instance per user session. A second launch asks the running
    // one to show its window. After an update, wait for the old version to
    // finish exiting instead.
    let mut _mutex = unsafe { CreateMutexW(None, false, w!("Local\\SwitchboardNative")) }?;
    let mut waited = 0;
    while after_update && unsafe { GetLastError() } == ERROR_ALREADY_EXISTS && waited < 100 {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(_mutex);
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        waited += 1;
        _mutex = unsafe { CreateMutexW(None, false, w!("Local\\SwitchboardNative")) }?;
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        if !background
            && let Ok(mut conn) = pipe::connect() {
                let _ = pipe::send(&mut conn.writer, &protocol::Request::OpenUi);
            }
        return Ok(());
    }
    update::cleanup_previous();
    // A downloaded update installs when the app starts, before capture does.
    if !update::is_dev_build()
        && let Some((_, staged)) = update::staged()
        && update::install(&staged, !background).is_ok()
    {
        return Ok(());
    }
    tray::run(!background)
}
