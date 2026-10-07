//! The window: its own process (`switchboard-rs --ui`) that exits on close,
//! so a closed window costs nothing. All product state comes from the
//! background service; this process renders it and sends requests.
//!
//! Layout follows DESIGN.md's capture-only shell: a two-row command header
//! (recorder + library toolbar) over a day-grouped clip library, with
//! Settings as a full page.

mod chrome;
mod editor;
mod grid;
mod header;
pub(crate) mod library;
mod link;
mod review;
mod settings_page;
mod share;
mod shelf;
mod theme;
pub(crate) mod thumbs;
mod widgets;

use std::path::PathBuf;
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

use anyhow::anyhow;
use egui::{Align, Align2, CornerRadius, Frame, Key, Layout, Margin, Modifiers, RichText, Stroke, Ui, Vec2};
use switchboard_capture::process_memory;

use crate::protocol::{Event, Request, ServiceState};
use switchboard_project::{Project, now_ms, store::Store};
use crate::settings::Settings;
use crate::shell;
use library::{Library, duration_label};
use link::{Conn, Link};
use theme::*;
use widgets::{Kind, button, icon, icon_button};

pub use review::review_shot;

pub fn run() -> anyhow::Result<()> {
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("Switchboard")
        .with_app_id("switchboard")
        .with_inner_size([1180.0, 760.0])
        .with_min_inner_size([1080.0, 720.0])
        // The title bar is drawn by the app (see chrome.rs).
        .with_decorations(false)
        .with_icon(Arc::new(load_icon()));
    // Review only: SWITCHBOARD_REVIEW=x,y,w,h opens the window there without
    // focus, so automated checks never cover a running game.
    let review = std::env::var("SWITCHBOARD_REVIEW").ok().and_then(|v| {
        let n: Vec<f32> = v.split(',').filter_map(|p| p.trim().parse().ok()).collect();
        (n.len() == 4).then(|| (n[0], n[1], n[2], n[3]))
    });
    if let Some((x, y, w, h)) = review {
        viewport = viewport.with_position([x, y]).with_inner_size([w, h]).with_active(false);
    }
    let mut config = egui_software_backend::SoftwareBackendAppConfiguration::new().viewport_builder(viewport);
    // The renderer's primitive cache keeps a full-resolution pixel buffer
    // per primitive, which costs 75-160 MB at 4K. Thumbnails and the preview
    // are drawn 1:1 instead, so uncached frames stay fast.
    config.caching = false;
    egui_software_backend::run_app_with_software_backend(config, |ctx| App::new(ctx, None))
        .map_err(|e| anyhow!("{e:?}"))
}

fn load_icon() -> egui::IconData {
    let decoder = png::Decoder::new(std::io::Cursor::new(include_bytes!("../../assets/icon-64.png")));
    let mut reader = decoder.read_info().expect("icon png");
    let mut buf = vec![0; reader.output_buffer_size().unwrap_or(64 * 64 * 4)];
    let info = reader.next_frame(&mut buf).expect("icon frame");
    buf.truncate(info.buffer_size());
    egui::IconData { rgba: buf, width: info.width, height: info.height }
}

#[derive(PartialEq, Clone, Copy)]
pub(crate) enum Page {
    Clips,
    Settings,
    Editor,
}

struct Notice {
    ok: bool,
    text: String,
    path: Option<PathBuf>,
    /// A discarded draft the notice can bring back.
    undo: Option<Box<Project>>,
    at: Instant,
}

pub(crate) struct App {
    link: Arc<Link>,
    page: Page,
    lib: Library,
    /// Current service snapshot for this frame.
    state: Option<Arc<ServiceState>>,
    popover: bool,
    confirm_delete: Option<Vec<PathBuf>>,
    notice: Option<Notice>,
    /// Settings as last confirmed by the service, or as just requested.
    draft: Option<Settings>,
    recording_hotkey: bool,
    hotkey_hint: Option<String>,
    folder_pick: Option<mpsc::Receiver<Option<PathBuf>>>,
    reconnect_at: Option<Instant>,
    ui_memory: (u64, Instant),
    focus_search: bool,
    focused: bool,
    /// Where the recorder control was drawn, for anchoring its popover.
    recorder_rect: egui::Rect,
    /// Edit drafts and kept projects (owned by the window process).
    store: Store,
    /// Select mode was entered from "Create Montage".
    montage_intent: bool,
    /// Clip being renamed and the text being edited.
    rename: Option<(PathBuf, String)>,
    /// Draft whose discard is awaiting confirmation in its menu.
    /// The open export dialog, if any.
    share: Option<share::Share>,
    /// The clip or montage being edited.
    editor: Option<editor::Editor>,
    /// Esc was pressed in the editor.
    close_requested: bool,
    ctx: egui::Context,
    /// Review renders only: a fixed snapshot instead of the live service,
    /// and settings changes are never sent.
    review_state: Option<Arc<ServiceState>>,
    /// Auto Capture clips saved after this time (Unix ms) are new.
    auto_reviewed_ms: u64,
    /// Restarting an older background service: waiting for it to exit,
    /// then start this build's service at this time.
    restarting: bool,
    restart_at: Option<Instant>,
    chrome: chrome::Chrome,
    /// False for headless review renders, which have no window.
    windowed: bool,
    /// "Later" on the update strip hides it for this version until restart.
    update_dismissed: Option<String>,
    /// Review renders can pin the library to a fixed folder.
    pinned_dir: Option<PathBuf>,
}

impl Drop for App {
    fn drop(&mut self) {
        // Share exports are temporary; clear them when the window closes.
        switchboard_export::cleanup_share_dir();
    }
}

impl egui_software_backend::App for App {
    fn ui(&mut self, ui: &mut egui::Ui, _backend: &mut egui_software_backend::SoftwareBackend) {
        self.draw(ui);
    }
}

impl App {
    fn new(ctx: egui::Context, pinned_dir: Option<PathBuf>) -> App {
        theme::apply(&ctx);
        let link = Link::new();
        link.connect(ctx.clone());
        let dir = pinned_dir.clone().unwrap_or_else(|| Settings::load().clips_dir());
        App {
            lib: Library::new(dir, &ctx),
            link,
            page: Page::Clips,
            state: None,
            popover: false,
            confirm_delete: None,
            notice: None,
            draft: None,
            recording_hotkey: false,
            hotkey_hint: None,
            folder_pick: None,
            reconnect_at: None,
            ui_memory: (process_memory().0, Instant::now()),
            focus_search: false,
            focused: true,
            recorder_rect: egui::Rect::NOTHING,
            store: Store::open(&crate::settings::data_dir().join("projects")),
            montage_intent: false,
            rename: None,
            share: None,
            editor: None,
            close_requested: false,
            ctx: ctx.clone(),
            review_state: None,
            auto_reviewed_ms: load_auto_reviewed(),
            restarting: false,
            restart_at: None,
            chrome: chrome::Chrome::default(),
            windowed: true,
            update_dismissed: None,
            pinned_dir,
        }
    }

    fn draw(&mut self, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        self.chrome.frame(&ctx, self.windowed);
        self.lib.begin_frame();
        self.pump(&ctx);
        self.shortcuts(&ctx);
        Frame::new().fill(BACKGROUND).show(ui, |ui| {
            ui.set_min_size(ui.available_size());
            match self.page {
                Page::Clips => self.clips_page(ui),
                Page::Settings => self.settings_page(ui),
                Page::Editor => self.editor_page(ui),
            }
            self.chrome.buttons(&ctx);
        });
        if self.page == Page::Clips && self.popover {
            self.replay_popover(&ctx);
        }
        self.notice_overlay(&ctx);
        self.delete_dialog(&ctx);
        self.rename_dialog(&ctx);
        self.share_dialog(&ctx);
    }

    fn conn(&self) -> Conn {
        self.link.conn()
    }

    /// Applies service events and keeps local copies in step.
    fn pump(&mut self, ctx: &egui::Context) {
        for ev in self.link.take_events() {
            match ev {
                Event::ClipSaved { clip } => {
                    self.lib.refresh();
                    self.notice = Some(Notice {
                        ok: true,
                        text: format!("Clip saved \u{b7} {}", duration_label(clip.seconds as f64)),
                        path: Some(clip.path),
                        undo: None, at: Instant::now(),
                    });
                }
                Event::ClipFailed { message } => {
                    self.notice = Some(Notice { ok: false, text: message, path: None, undo: None, at: Instant::now() })
                }
                Event::Focus => {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
                }
                // Give the old process time to exit and release its single-instance lock.
                Event::Shutdown if self.restarting => self.restart_at = Some(Instant::now() + Duration::from_millis(900)),
                Event::Shutdown => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
                Event::LibraryChanged => self.lib.reload_index(),
                Event::State { .. } => {}
            }
        }
        self.state = self.review_state.clone().or_else(|| self.link.state());
        if let Some(state) = &self.state {
            if self.pinned_dir.is_none() {
                self.lib.set_dir(state.settings.clips_dir());
            }
            if !self.recording_hotkey {
                self.draft = Some(state.settings.clone());
            }
        }
        // Pick up files changed in Explorer when the window comes back.
        let focused = ctx.input(|i| i.viewport().focused.unwrap_or(true));
        if focused && !self.focused {
            self.lib.refresh();
        }
        self.focused = focused;
        self.lib.poll(ctx);

        if let Some(rx) = &self.folder_pick {
            match rx.try_recv() {
                Ok(result) => {
                    self.folder_pick = None;
                    if let (Some(dir), Some(mut s)) = (result, self.draft.clone()) {
                        s.clips_dir = Some(dir);
                        self.apply(s);
                    }
                }
                Err(_) => ctx.request_repaint_after(Duration::from_millis(250)),
            }
        }
        if let Some(at) = self.restart_at {
            if Instant::now() >= at {
                self.restart_at = None;
                self.restarting = false;
                self.start_service();
            } else {
                ctx.request_repaint_after(at - Instant::now());
            }
        }
        if let Some(at) = self.reconnect_at {
            if Instant::now() >= at {
                self.reconnect_at = None;
                self.link.connect(ctx.clone());
            } else {
                ctx.request_repaint_after(at - Instant::now());
            }
        }
        if self.ui_memory.1.elapsed() > Duration::from_secs(2) {
            self.ui_memory = (process_memory().0, Instant::now());
        }
    }

    fn shortcuts(&mut self, ctx: &egui::Context) {
        if self.recording_hotkey || self.confirm_delete.is_some() || self.rename.is_some() || self.share.is_some() {
            return;
        }
        let typing = ctx.egui_wants_keyboard_input();
        let (find, all, delete, escape, settings) = ctx.input_mut(|i| {
            (
                i.consume_key(Modifiers::CTRL, Key::F),
                !typing && i.consume_key(Modifiers::CTRL, Key::A),
                !typing && i.consume_key(Modifiers::NONE, Key::Delete),
                i.consume_key(Modifiers::NONE, Key::Escape),
                i.consume_key(Modifiers::CTRL, Key::Comma),
            )
        });
        if self.page == Page::Editor {
            return;
        }
        if settings {
            self.open_settings();
        }
        if self.page == Page::Settings {
            if escape && !typing {
                self.page = Page::Clips;
            }
            return;
        }
        if find {
            self.focus_search = true;
        }
        if all {
            self.lib.selecting = true;
            self.lib.select_all_visible();
        }
        if delete && self.lib.selection_len() > 0 {
            self.confirm_delete = Some(self.lib.selected_paths());
        }
        if escape {
            if self.popover {
                self.popover = false;
            } else if typing {
                ctx.memory_mut(|m| m.request_focus(egui::Id::NULL));
            } else {
                self.lib.clear_selection();
                self.lib.selecting = false;
                self.montage_intent = false;
            }
        }
    }

    /// Shown when the background service is an older build than this window,
    /// which happens after an update until the service restarts.
    pub(super) fn stale_service_strip(&mut self, ui: &mut Ui) {
        let stale = self.state.as_ref().is_some_and(|s| s.build != crate::protocol::BUILD);
        if !(stale || self.restarting) {
            return;
        }
        ui.add_space(10.0);
        Frame::new()
            .fill(SURFACE_1)
            .stroke(Stroke::new(1.0, WARNING))
            .corner_radius(CornerRadius::same(R_OVERLAY))
            .inner_margin(Margin::symmetric(14, 8))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("Switchboard is still running an older version in the background. Restart it to use this one.")
                            .font(font(13.0))
                            .color(TEXT),
                    );
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        let label = if self.restarting { "Restarting\u{2026}" } else { "Restart" };
                        if button(ui, Kind::Secondary, None, label, !self.restarting).clicked() {
                            self.restarting = true;
                            self.link.send(Request::Quit);
                        }
                    });
                });
            });
    }

    /// A downloaded update, offered once on the Clips page.
    pub(super) fn update_ready_strip(&mut self, ui: &mut Ui) {
        let Some(version) = self.state.as_ref().and_then(|s| match &s.update.phase {
            crate::update::UpdatePhase::Ready { version } => Some(version.clone()),
            _ => None,
        }) else {
            return;
        };
        if self.update_dismissed.as_deref() == Some(version.as_str()) {
            return;
        }
        ui.add_space(10.0);
        Frame::new()
            .fill(SURFACE_1)
            .corner_radius(CornerRadius::same(R_OVERLAY))
            .inner_margin(Margin::symmetric(14, 8))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(format!("Switchboard {version} is ready. It installs the next time Switchboard starts."))
                            .font(font(13.0))
                            .color(TEXT),
                    );
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if button(ui, Kind::Ghost, None, "Later", true).clicked() {
                            self.update_dismissed = Some(version.clone());
                        }
                        if button(ui, Kind::Secondary, None, "Restart now", true).clicked() {
                            self.link.send(Request::InstallUpdate);
                        }
                    });
                });
            });
    }

    /// Marks every Auto Capture clip so far as seen.
    pub(super) fn mark_auto_reviewed(&mut self) {
        self.auto_reviewed_ms = now_ms().max(0) as u64;
        let _ = std::fs::write(review_file(), self.auto_reviewed_ms.to_string());
    }

    fn apply(&mut self, s: Settings) {
        self.draft = Some(s.clone());
        if self.review_state.is_some() {
            return;
        }
        self.link.send(Request::ApplySettings { settings: s });
    }

    fn start_service(&mut self) {
        if let Ok(exe) = std::env::current_exe() {
            let _ = std::process::Command::new(exe).arg("--background").spawn();
        }
        self.reconnect_at = Some(Instant::now() + Duration::from_millis(700));
    }

    fn open_clip(path: &std::path::Path) {
        shell::open(path);
    }

    /// Starts a montage draft from clips, oldest first, and shows it on the shelf.
    fn create_montage(&mut self, paths: &[PathBuf]) {
        let mut clips: Vec<&library::Clip> = self.lib.clips.iter().filter(|c| paths.contains(&c.path)).collect();
        clips.sort_by_key(|c| c.modified);
        let parts: Vec<(String, i64, Option<Vec<u8>>)> = clips
            .iter()
            .filter(|c| c.duration_ms() > 100)
            .map(|c| (c.file_name.clone(), c.duration_ms(), self.default_levels(c)))
            .collect();
        if parts.len() < 2 {
            return;
        }
        let name = format!("Montage \u{b7} {} clips", parts.len());
        let project = Project::montage(&name, &parts, now_ms());
        let _ = self.store.save(project.clone(), now_ms());
        self.lib.selecting = false;
        self.montage_intent = false;
        self.lib.clear_selection();
        self.open_project(project);
    }

    fn rename_dialog(&mut self, ctx: &egui::Context) {
        let Some((path, mut text)) = self.rename.clone() else { return };
        let file = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let mut close = false;
        let modal = egui::Modal::new(egui::Id::new("rename-clip"))
            .frame(
                Frame::new()
                    .fill(SURFACE_1)
                    .corner_radius(CornerRadius::same(R_OVERLAY))
                    .inner_margin(Margin::same(20))
                    .shadow(ctx.global_style().visuals.popup_shadow),
            )
            .show(ctx, |ui| {
                ui.set_width(400.0);
                ui.label(RichText::new("Rename clip").font(font_strong(15.0)).color(TEXT));
                ui.add_space(10.0);
                let edit = ui.add(
                    egui::TextEdit::singleline(&mut text).char_limit(120).desired_width(f32::INFINITY).font(font(13.5)),
                );
                if ui.memory(|m| m.focused().is_none()) {
                    edit.request_focus();
                }
                ui.label(RichText::new(&file).font(font_mono(11.0)).color(TEXT_MUTED));
                ui.add_space(14.0);
                let enter = edit.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                ui.horizontal(|ui| {
                    let valid = crate::library_index::clean_title(&text).is_some();
                    if button(ui, Kind::Primary, None, "Save", valid).clicked() || (enter && valid) {
                        self.link.send(Request::UpdateClip { file: file.clone(), favorite: None, title: Some(Some(text.clone())) });
                        close = true;
                    }
                    if button(ui, Kind::Secondary, None, "Cancel", true).clicked() {
                        close = true;
                    }
                    if button(ui, Kind::Ghost, None, "Use default name", true).clicked() {
                        self.link.send(Request::UpdateClip { file: file.clone(), favorite: None, title: Some(None) });
                        close = true;
                    }
                });
            });
        if close || modal.should_close() {
            self.rename = None;
        } else {
            self.rename = Some((path, text));
        }
    }

    // ------------------------------------------------------- overlays

    fn notice_overlay(&mut self, ctx: &egui::Context) {
        let Some(n) = &self.notice else { return };
        const SHOW: Duration = Duration::from_secs(6);
        if n.ok && n.at.elapsed() > SHOW {
            self.notice = None;
            return;
        }
        if n.ok {
            ctx.request_repaint_after(SHOW.saturating_sub(n.at.elapsed()));
        }
        let (ok, text, path, undo) = (n.ok, n.text.clone(), n.path.clone(), n.undo.clone());
        let mut close = false;
        let mut restore = None;
        egui::Area::new(egui::Id::new("notice"))
            .order(egui::Order::Foreground)
            .anchor(Align2::LEFT_BOTTOM, Vec2::new(GUTTER, -GUTTER))
            .interactable(true)
            .show(ctx, |ui| {
                Frame::new()
                    .fill(SURFACE_2)
                    .corner_radius(CornerRadius::same(R_OVERLAY))
                    .inner_margin(Margin { left: 14, right: 6, top: 6, bottom: 6 })
                    .shadow(ctx.global_style().visuals.popup_shadow)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            let (dot, _) = ui.allocate_exact_size(Vec2::new(10.0, 28.0), egui::Sense::hover());
                            widgets::status_dot(ui, dot.center(), if ok { SUCCESS } else { DANGER });
                            ui.add(egui::Label::new(RichText::new(&text).font(font(13.0)).color(TEXT)).truncate())
                                .on_hover_text(&text);
                            ui.add_space(6.0);
                            if let Some(p) = &path {
                                if button(ui, Kind::Ghost, None, "Play", true).clicked() {
                                    App::open_clip(p);
                                }
                                if button(ui, Kind::Ghost, None, "Show in folder", true).clicked() {
                                    shell::reveal(p);
                                }
                            }
                            if let Some(p) = &undo
                                && button(ui, Kind::Ghost, None, "Undo", true).clicked()
                            {
                                restore = Some(p.clone());
                                close = true;
                            }
                            if icon_button(ui, icon::CLOSE, "Dismiss", false).clicked() {
                                close = true;
                            }
                        });
                    });
            });
        if close {
            self.notice = None;
        }
        if let Some(p) = restore {
            let _ = self.store.save(*p, now_ms());
        }
    }

    fn delete_dialog(&mut self, ctx: &egui::Context) {
        let Some(paths) = self.confirm_delete.clone() else { return };
        let mut close = false;
        let n = paths.len();
        let modal = egui::Modal::new(egui::Id::new("confirm-delete"))
            .frame(
                Frame::new()
                    .fill(SURFACE_1)
                    .corner_radius(CornerRadius::same(R_OVERLAY))
                    .inner_margin(Margin::same(20))
                    .shadow(ctx.global_style().visuals.popup_shadow),
            )
            .show(ctx, |ui| {
                ui.set_width(380.0);
                let title = if n == 1 {
                    "Move this clip to the Recycle Bin?".to_string()
                } else {
                    format!("Move {n} clips to the Recycle Bin?")
                };
                ui.label(RichText::new(title).font(font_strong(15.0)).color(TEXT));
                ui.add_space(4.0);
                for p in paths.iter().take(3) {
                    let name = p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                    ui.add(egui::Label::new(RichText::new(name).font(font_mono(11.5)).color(TEXT_DESCRIPTION)).truncate());
                }
                if n > 3 {
                    ui.label(RichText::new(format!("and {} more", n - 3)).font(font(12.0)).color(TEXT_DESCRIPTION));
                }
                ui.add_space(4.0);
                let restore = if n == 1 { "You can restore it from the Recycle Bin." } else { "You can restore them from the Recycle Bin." };
                ui.label(RichText::new(restore).font(font(12.0)).color(TEXT_MUTED));
                ui.add_space(14.0);
                ui.horizontal(|ui| {
                    let confirm = button(ui, Kind::Danger, Some(icon::DELETE), "Move to Recycle Bin", true);
                    if confirm.clicked() {
                        let mut moved = Vec::new();
                        let mut failed = Vec::new();
                        for p in &paths {
                            match shell::recycle(p) {
                                Ok(()) => moved.push(p.clone()),
                                Err(_) => failed
                                    .push(p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()),
                            }
                        }
                        self.lib.remove(&moved);
                        if !failed.is_empty() {
                            let count =
                                if failed.len() == 1 { "1 clip".to_string() } else { format!("{} clips", failed.len()) };
                            self.notice = Some(Notice {
                                ok: false,
                                text: format!(
                                    "Couldn't move {count} to the Recycle Bin. Close any app using it and try again: {}",
                                    failed.join(", ")
                                ),
                                path: None,
                                undo: None, at: Instant::now(),
                            });
                        }
                        close = true;
                    }
                    let cancel = button(ui, Kind::Secondary, None, "Cancel", true);
                    if cancel.clicked() {
                        close = true;
                    }
                    if ui.memory(|m| m.focused().is_none()) {
                        cancel.request_focus();
                    }
                });
            });
        if close || modal.should_close() {
            self.confirm_delete = None;
        }
    }
}

/// egui key + modifiers -> "Ctrl+Shift+F10". Plain letters need a modifier.
fn shortcut_text(key: egui::Key, m: egui::Modifiers) -> Option<String> {
    use egui::Key;
    let name = key.name();
    let is_fn = matches!(
        key,
        Key::F1
            | Key::F2
            | Key::F3
            | Key::F4
            | Key::F5
            | Key::F6
            | Key::F7
            | Key::F8
            | Key::F9
            | Key::F10
            | Key::F11
            | Key::F12
            | Key::F13
            | Key::F14
            | Key::F15
            | Key::F16
            | Key::F17
            | Key::F18
            | Key::F19
            | Key::F20
            | Key::F21
            | Key::F22
            | Key::F23
            | Key::F24
    );
    let key_name = match key {
        Key::Num0
        | Key::Num1
        | Key::Num2
        | Key::Num3
        | Key::Num4
        | Key::Num5
        | Key::Num6
        | Key::Num7
        | Key::Num8
        | Key::Num9 => name.trim_start_matches("Num").to_string(),
        Key::Home | Key::End | Key::Insert | Key::PageUp | Key::PageDown | Key::Space => name.replace(' ', ""),
        _ if name.len() == 1 && name.chars().all(|c| c.is_ascii_alphanumeric()) => name.to_string(),
        _ if is_fn => name.to_string(),
        _ => return None,
    };
    if !(m.ctrl || m.alt || m.shift) && !is_fn {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    if m.ctrl {
        parts.push("Ctrl");
    }
    if m.alt {
        parts.push("Alt");
    }
    if m.shift {
        parts.push("Shift");
    }
    parts.push(&key_name);
    Some(parts.join("+"))
}

/// Windows folder picker on its own STA thread so the window keeps painting.
fn pick_folder() -> mpsc::Receiver<Option<PathBuf>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        use windows::Win32::System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree,
        };
        use windows::Win32::UI::Shell::{
            FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH,
        };
        let result = unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            (|| -> windows::core::Result<PathBuf> {
                let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
                dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM)?;
                dialog.SetTitle(windows::core::w!("Choose where clips are saved"))?;
                dialog.Show(None)?;
                let item = dialog.GetResult()?;
                let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
                let path = PathBuf::from(name.to_string().unwrap_or_default());
                CoTaskMemFree(Some(name.0 as *const _));
                Ok(path)
            })()
            .ok()
        };
        let _ = tx.send(result);
    });
    rx
}

#[cfg(test)]
mod tests {
    use super::shortcut_text;
    use egui::{Key, Modifiers};

    #[test]
    fn shortcuts_need_a_modifier_unless_function_key() {
        let ctrl_shift = Modifiers { ctrl: true, shift: true, ..Default::default() };
        assert_eq!(shortcut_text(Key::F10, ctrl_shift).as_deref(), Some("Ctrl+Shift+F10"));
        assert_eq!(shortcut_text(Key::F9, Modifiers::NONE).as_deref(), Some("F9"));
        assert_eq!(shortcut_text(Key::A, Modifiers::NONE), None);
        assert_eq!(shortcut_text(Key::Num5, Modifiers { alt: true, ..Default::default() }).as_deref(), Some("Alt+5"));
        for text in ["Ctrl+Shift+F10", "F9", "Alt+5", "Ctrl+Alt+K"] {
            assert!(text.parse::<global_hotkey::hotkey::HotKey>().is_ok(), "{text}");
        }
    }
}

fn review_file() -> PathBuf {
    crate::settings::data_dir().join("auto-reviewed.txt")
}

/// When Auto Capture clips were last reviewed. The first run starts now, so
/// clips from before Auto Capture existed are not reported as new.
fn load_auto_reviewed() -> u64 {
    if let Some(ms) = std::fs::read_to_string(review_file()).ok().and_then(|t| t.trim().parse().ok()) {
        return ms;
    }
    let now = now_ms().max(0) as u64;
    let _ = std::fs::write(review_file(), now.to_string());
    now
}
