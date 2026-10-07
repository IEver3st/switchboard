//! Clips page command header, matching the old app: identity, recorder
//! state and replay length, source, and the save shortcut on the first row;
//! search, filter, sort, view, select and montage on the second.

use egui::{Align, Align2, Color32, CornerRadius, Frame, Layout, Margin, Rect, RichText, Sense, Stroke, StrokeKind, Ui, Vec2, pos2, vec2};
use switchboard_capture::TrackKind;

use super::App;
use super::library::{DateFilter, Filters, SourceFilter, Sort, View, duration_label};
use super::link::Conn;
use super::theme::*;
use super::widgets::{self, Kind, button, combo, icon, icon_button, keycaps, level_bar, toggle};
use crate::library_index::CaptureSource;
use crate::protocol::{ReplayState, Request};

#[derive(Clone, Copy, PartialEq)]
enum Recorder {
    Connecting,
    Offline,
    Off,
    Starting,
    Running,
    Failed,
}

const LENGTHS: [(u32, &str); 7] =
    [(15, "15 sec"), (30, "30 sec"), (60, "1 min"), (120, "2 min"), (180, "3 min"), (300, "5 min"), (600, "10 min")];

impl App {
    fn recorder(&self) -> Recorder {
        match (self.conn(), self.state.as_ref().map(|s| &s.replay)) {
            (Conn::Offline, _) => Recorder::Offline,
            (_, None) => Recorder::Connecting,
            (_, Some(ReplayState::Off)) => Recorder::Off,
            (_, Some(ReplayState::Starting)) => Recorder::Starting,
            (_, Some(ReplayState::Running)) => Recorder::Running,
            (_, Some(ReplayState::Failed { .. })) => Recorder::Failed,
        }
    }

    pub(super) fn clips_page(&mut self, ui: &mut Ui) {
        // The first row sits in the title band (centered at BAR_H / 2).
        Frame::new().inner_margin(Margin { left: GUTTER as i8, right: GUTTER as i8, top: 6, bottom: 0 }).show(ui, |ui| {
            self.command_row(ui);
            ui.add_space(12.0);
            if self.lib.selecting {
                self.selection_row(ui);
            } else {
                self.toolbar_row(ui);
                self.stale_service_strip(ui);
                self.update_ready_strip(ui);
                self.new_auto_clips(ui);
            }
        });
        ui.add_space(6.0);
        self.library_view(ui);
    }

    /// A quiet strip when Auto Capture saved clips since the last look.
    fn new_auto_clips(&mut self, ui: &mut Ui) {
        let since = std::time::UNIX_EPOCH + std::time::Duration::from_millis(self.auto_reviewed_ms);
        let n = self.lib.clips.iter().filter(|c| c.source == CaptureSource::Auto && c.modified > since).count();
        if n == 0 {
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
                    let text = if n == 1 { "Auto Capture saved a new clip.".to_string() } else { format!("Auto Capture saved {n} new clips.") };
                    ui.label(RichText::new(text).font(font(13.0)).color(TEXT));
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if button(ui, Kind::Ghost, None, "Dismiss", true).clicked() {
                            self.mark_auto_reviewed();
                        }
                        if button(ui, Kind::Secondary, None, if n == 1 { "Show it" } else { "Show them" }, true).clicked() {
                            let mut f = self.lib.filters().clone();
                            f.source = SourceFilter::Auto;
                            self.lib.set_filters(f);
                            self.mark_auto_reviewed();
                        }
                    });
                });
            });
    }

    // ------------------------------------------------------ first row

    fn command_row(&mut self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            ui.set_height(36.0);
            ui.label(RichText::new("Clips").font(font_strong(21.0)).color(TEXT));
            if self.lib.scanned {
                let n = self.lib.clips.len().to_string();
                let g = ui.painter().layout_no_wrap(n, font(11.5), TEXT_SECONDARY);
                let (r, _) = ui.allocate_exact_size(vec2(g.size().x + 12.0, 20.0), Sense::hover());
                ui.painter().rect_filled(r, CornerRadius::same(R_CONTROL), INTERACTIVE);
                ui.painter().galley(r.center() - g.size() / 2.0, g, TEXT_SECONDARY);
            }
            ui.add_space(14.0);
            let rec = self.recorder();
            self.recorder_button(ui, rec);
            if let Some(state) = self.state.clone() {
                // Replay length, inline.
                let mut s = state.settings.clone();
                let current = LENGTHS
                    .iter()
                    .find(|l| l.0 == s.replay_seconds)
                    .map(|l| l.1.to_string())
                    .unwrap_or_else(|| duration_label(s.replay_seconds as f64));
                combo("replay-length", current, 76.0).show_ui(ui, |ui| {
                    for (v, label) in LENGTHS {
                        ui.selectable_value(&mut s.replay_seconds, v, label);
                    }
                });
                // Source display.
                if !state.displays.is_empty() {
                    let label = state
                        .displays
                        .get(s.display_index)
                        .map(|d| format!("Display {}", d.index + 1))
                        .unwrap_or_else(|| "Display".into());
                    combo("display-source", format!("{}  {label}", icon::DISPLAY), 110.0).show_ui(ui, |ui| {
                        ui.set_min_width(240.0);
                        for d in &state.displays {
                            ui.selectable_value(&mut s.display_index, d.index, d.label());
                        }
                    });
                }
                if s != state.settings {
                    self.apply(s);
                }
                ui.add_space(8.0);
                let caps = keycaps(ui, &state.settings.hotkey, false);
                if let Some(err) = &state.hotkey_error {
                    ui.painter().circle_filled(caps.rect.right_top() + vec2(2.0, -1.0), 4.0, WARNING);
                    caps.on_hover_text(format!("Shortcut unavailable: {err}"));
                }
                ui.label(RichText::new("saves the replay").font(font(12.5)).color(TEXT_DESCRIPTION));
            }
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.add_space(super::chrome::BUTTONS_W - GUTTER + 8.0);
                if icon_button(ui, icon::SETTINGS, "Settings (Ctrl+,)", false).clicked() {
                    self.open_settings();
                }
                ui.add_space(4.0);
                let saving = self.state.as_ref().is_some_and(|s| s.saving);
                let can_save = rec == Recorder::Running && !saving;
                let label = if saving { "Saving\u{2026}" } else { "Save clip" };
                let hint = match (rec, &self.state) {
                    (Recorder::Running, Some(s)) => format!("Save the last {}", duration_label(s.settings.replay_seconds as f64)),
                    _ => "Turn on Instant Replay to save clips".into(),
                };
                if button(ui, Kind::Primary, None, label, can_save).on_hover_text(hint).clicked() {
                    self.link.send(Request::SaveClip);
                }
            });
        });
    }

    /// "● Ready" with live track levels; opens the replay panel.
    fn recorder_button(&mut self, ui: &mut Ui, rec: Recorder) {
        let state = self.state.clone();
        let (dot, label) = match rec {
            Recorder::Connecting => (TEXT_MUTED, "Connecting\u{2026}"),
            Recorder::Offline => (TEXT_MUTED, "Not running"),
            Recorder::Off => (TEXT_MUTED, "Replay off"),
            Recorder::Starting => (WARNING, "Starting\u{2026}"),
            Recorder::Failed => (DANGER, "Replay stopped"),
            Recorder::Running => (SUCCESS, "Ready"),
        };
        let tracks: Vec<(Color32, f32, bool)> = match (&state, rec) {
            (Some(s), Recorder::Running) => s
                .status
                .as_ref()
                .map(|st| st.tracks.iter().map(|t| (track_color(t.kind), t.level, t.error.is_some())).collect())
                .unwrap_or_default(),
            _ => Vec::new(),
        };
        let label_color = if rec == Recorder::Running { SUCCESS } else { TEXT };
        let galley = ui.painter().layout_no_wrap(label.to_string(), font_strong(13.0), label_color);
        let meters_w = if tracks.is_empty() { 0.0 } else { tracks.len() as f32 * 5.0 + 8.0 };
        let size = vec2(12.0 + 14.0 + galley.size().x + meters_w + 12.0, 32.0);
        let (rect, response) = ui.allocate_exact_size(size, Sense::click());
        let a11y = format!("Instant Replay: {label}");
        response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, &a11y));
        let p = ui.painter();
        let fill = if self.popover {
            HOVER
        } else if response.hovered() {
            INTERACTIVE
        } else {
            SURFACE_1
        };
        p.rect_filled(rect, CornerRadius::same(R_CONTROL), fill);
        let mut x = rect.left() + 12.0;
        widgets::status_dot(ui, pos2(x + 3.0, rect.center().y), dot);
        x += 14.0;
        p.galley(pos2(x, rect.center().y - galley.size().y / 2.0), galley.clone(), label_color);
        x += galley.size().x + 8.0;
        for (color, level, failed) in &tracks {
            let h = 14.0;
            let col = Rect::from_min_size(pos2(x, rect.center().y - h / 2.0), vec2(3.0, h));
            p.rect_filled(col, CornerRadius::same(1), INTERACTIVE);
            if *failed {
                p.rect_filled(col, CornerRadius::same(1), DANGER.gamma_multiply(0.6));
            } else {
                let shown = level.clamp(0.0, 1.0).sqrt();
                let lit = Rect::from_min_max(pos2(col.left(), col.bottom() - (h * shown).max(2.0)), col.max);
                p.rect_filled(lit, CornerRadius::same(1), *color);
            }
            x += 5.0;
        }
        if let (Recorder::Running, Some(s)) = (rec, &state)
            && let Some(st) = &s.status
        {
            let ratio = (st.buffered_seconds / s.settings.replay_seconds as f32).clamp(0.0, 1.0);
            if ratio < 0.99 {
                let line = Rect::from_min_size(pos2(rect.left() + 6.0, rect.bottom() - 2.0), vec2((rect.width() - 12.0) * ratio, 2.0));
                p.rect_filled(line, CornerRadius::same(1), ACCENT);
            }
        }
        widgets::focus_ring(ui, &response, R_CONTROL);
        if response.clicked() {
            self.popover = !self.popover;
        }
        self.recorder_rect = rect;
    }

    // ----------------------------------------------------- second row

    fn toolbar_row(&mut self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            ui.set_height(34.0);
            let search_w = (ui.available_width() * 0.32).clamp(260.0, 460.0);
            self.search_field(ui, search_w);
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if button(ui, Kind::Secondary, Some(icon::MONTAGE), "Create Montage", true)
                    .on_hover_text("Choose two or more clips to combine")
                    .clicked()
                {
                    self.lib.selecting = true;
                    self.montage_intent = true;
                }
                if button(ui, Kind::Ghost, Some(icon::SELECT), "Select", true).clicked() {
                    self.lib.selecting = true;
                    self.montage_intent = false;
                }
                let (sep, _) = ui.allocate_exact_size(vec2(9.0, 22.0), Sense::hover());
                ui.painter().vline(sep.center().x, sep.y_range(), Stroke::new(1.0, BORDER));
                if icon_button(ui, icon::LIST, "List view", self.lib.view == View::List).clicked() {
                    self.lib.view = View::List;
                }
                if icon_button(ui, icon::GRID, "Grid view", self.lib.view == View::Grid).clicked() {
                    self.lib.view = View::Grid;
                }
                ui.add_space(6.0);
                let mut sort = self.lib.sort();
                combo("sort", format!("{}  {}", icon::SORT, sort.label()), 112.0).show_ui(ui, |ui| {
                    for s in Sort::ALL {
                        ui.selectable_value(&mut sort, s, s.label());
                    }
                });
                self.lib.set_sort(sort);
                self.filter_button(ui);
            });
        });
    }

    fn filter_button(&mut self, ui: &mut Ui) {
        let active = self.lib.filters().active_count();
        let label = if active > 0 { format!("Filter \u{b7} {active}") } else { "Filter".into() };
        let r = button(ui, if active > 0 { Kind::Secondary } else { Kind::Ghost }, Some(icon::FILTER), &label, true);
        let mut f = self.lib.filters().clone();
        let games = self.lib.games();
        let kinds = self.lib.event_kinds();
        egui::Popup::from_toggle_button_response(&r)
            .close_behavior(egui::PopupCloseBehavior::CloseOnClickOutside)
            .show(|ui| {
                ui.set_min_width(240.0);
                ui.checkbox(&mut f.favorites, "Favorites only");
                ui.add_space(6.0);
                ui.label(RichText::new("Game").font(font(11.5)).color(TEXT_MUTED));
                combo("filter-game", f.game.clone().unwrap_or_else(|| "All games".into()), 220.0).show_ui(ui, |ui| {
                    ui.selectable_value(&mut f.game, None, "All games");
                    for (g, n) in &games {
                        ui.selectable_value(&mut f.game, Some(g.clone()), format!("{g}  ({n})"));
                    }
                });
                ui.add_space(6.0);
                ui.label(RichText::new("Source").font(font(11.5)).color(TEXT_MUTED));
                widgets::segmented(
                    ui,
                    &mut f.source,
                    &[(SourceFilter::All, "All"), (SourceFilter::Manual, "Manual"), (SourceFilter::Auto, "Auto Captured")],
                    "Source",
                );
                if !kinds.is_empty() {
                    ui.add_space(6.0);
                    ui.label(RichText::new("Event").font(font(11.5)).color(TEXT_MUTED));
                    combo("filter-event", f.event.clone().unwrap_or_else(|| "Any event".into()), 220.0).show_ui(ui, |ui| {
                        ui.selectable_value(&mut f.event, None, "Any event");
                        for k in &kinds {
                            ui.selectable_value(&mut f.event, Some(k.clone()), k.replace('-', " "));
                        }
                    });
                }
                ui.add_space(6.0);
                ui.label(RichText::new("Date").font(font(11.5)).color(TEXT_MUTED));
                combo("filter-date", f.date.label(), 220.0).show_ui(ui, |ui| {
                    for d in DateFilter::ALL {
                        ui.selectable_value(&mut f.date, d, d.label());
                    }
                });
                if f.active_count() > 0 {
                    ui.add_space(8.0);
                    if ui.button("Clear filters").clicked() {
                        f = Filters::default();
                    }
                }
            });
        self.lib.set_filters(f);
    }

    fn search_field(&mut self, ui: &mut Ui, width: f32) {
        let (rect, _) = ui.allocate_exact_size(vec2(width, 34.0), Sense::hover());
        let mut query = self.lib.query().to_string();
        let id = egui::Id::new("library-search");
        let focused = ui.memory(|m| m.has_focus(id));
        ui.painter().rect_filled(rect, CornerRadius::same(R_CONTROL), if focused { INTERACTIVE } else { SURFACE_1 });
        if focused {
            ui.painter().rect_stroke(rect, CornerRadius::same(R_CONTROL), Stroke::new(1.0, ACCENT), StrokeKind::Inside);
        }
        ui.painter().text(pos2(rect.left() + 16.0, rect.center().y), Align2::CENTER_CENTER, icon::SEARCH, font_icon(12.0), TEXT_DESCRIPTION);
        let clear_w = if query.is_empty() { 0.0 } else { 26.0 };
        let row_h = ui.fonts_mut(|f| f.row_height(&font(13.0)));
        let field = Rect::from_min_max(
            pos2(rect.left() + 32.0, rect.center().y - row_h / 2.0),
            pos2(rect.right() - 6.0 - clear_w, rect.center().y + row_h / 2.0),
        );
        let edit = egui::TextEdit::singleline(&mut query)
            .id(id)
            .hint_text(RichText::new("Search clips").font(font(13.0)).color(TEXT_MUTED))
            .font(font(13.0))
            .text_color(TEXT)
            .frame(Frame::NONE)
            .margin(Margin::ZERO)
            .desired_width(field.width());
        // A child Ui keeps the field from moving the toolbar's layout cursor.
        let r = ui.new_child(egui::UiBuilder::new().max_rect(field)).add(edit);
        if self.focus_search {
            r.request_focus();
            self.focus_search = false;
        }
        if clear_w > 0.0 {
            let c = Rect::from_center_size(pos2(rect.right() - 17.0, rect.center().y), Vec2::splat(22.0));
            let cr = ui.interact(c, id.with("clear"), Sense::click());
            cr.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, "Clear search"));
            ui.painter().text(c.center(), Align2::CENTER_CENTER, icon::CLOSE, font_icon(10.0), if cr.hovered() { TEXT } else { TEXT_DESCRIPTION });
            if cr.clicked() {
                query.clear();
            }
        }
        self.lib.set_query(query);
    }

    fn selection_row(&mut self, ui: &mut Ui) {
        let n = self.lib.selection_len();
        let paths = self.lib.selected_paths();
        ui.horizontal(|ui| {
            ui.set_height(34.0);
            let (r, _) = ui.allocate_exact_size(vec2(4.0, 34.0), Sense::hover());
            ui.painter().rect_filled(Rect::from_min_size(r.min + vec2(0.0, 7.0), vec2(3.0, 20.0)), CornerRadius::same(1), ACCENT);
            let text = if self.montage_intent && n < 2 {
                "Choose two or more clips for the montage".to_string()
            } else {
                format!("{n} selected")
            };
            ui.label(RichText::new(text).font(font_strong(13.0)).color(TEXT));
            ui.add_space(8.0);
            if button(ui, Kind::Ghost, None, "Select all shown", true).on_hover_text("Ctrl+A").clicked() {
                self.lib.select_all_visible();
            }
            if n > 0 {
                let files: Vec<String> =
                    self.lib.clips.iter().filter(|c| self.lib.is_selected(&c.path)).map(|c| c.file_name.clone()).collect();
                if button(ui, Kind::Ghost, Some(icon::STAR_FILLED), "Favorite", true).clicked() {
                    for f in &files {
                        self.link.send(Request::UpdateClip { file: f.clone(), favorite: Some(true), title: None });
                    }
                }
                if button(ui, Kind::Ghost, Some(icon::STAR), "Unfavorite", true).clicked() {
                    for f in &files {
                        self.link.send(Request::UpdateClip { file: f.clone(), favorite: Some(false), title: None });
                    }
                }
                if button(ui, Kind::Ghost, Some(icon::DELETE), "Move to Recycle Bin\u{2026}", true).clicked() {
                    self.confirm_delete = Some(paths.clone());
                }
            }
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if button(ui, Kind::Secondary, None, "Done", true).on_hover_text("Esc").clicked() {
                    self.lib.selecting = false;
                    self.montage_intent = false;
                    self.lib.clear_selection();
                }
                let label = if n >= 2 { format!("Create montage ({n})") } else { "Create montage".into() };
                if button(ui, Kind::Primary, Some(icon::MONTAGE), &label, n >= 2).clicked() {
                    self.create_montage(&paths);
                }
            });
        });
    }

    // -------------------------------------------------------- popover

    pub(super) fn replay_popover(&mut self, ctx: &egui::Context) {
        let anchor = self.recorder_rect;
        let width = 340.0;
        let pos = pos2(anchor.left(), anchor.bottom() + 6.0);
        let rec = self.recorder();
        let state = self.state.clone();
        let area = egui::Area::new(egui::Id::new("replay-popover")).order(egui::Order::Foreground).fixed_pos(pos).show(ctx, |ui| {
            Frame::new()
                .fill(SURFACE_1)
                .corner_radius(CornerRadius::same(R_OVERLAY))
                .stroke(Stroke::new(1.0, BORDER))
                .shadow(ctx.global_style().visuals.popup_shadow)
                .inner_margin(Margin::same(16))
                .show(ui, |ui| {
                    ui.set_width(width - 32.0);
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("Instant Replay").font(font_strong(14.0)).color(TEXT));
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if matches!(rec, Recorder::Offline | Recorder::Connecting) {
                                return;
                            }
                            let mut on = matches!(rec, Recorder::Running | Recorder::Starting);
                            if toggle(ui, &mut on, "Instant Replay").changed() {
                                self.link.send(Request::SetReplay { enabled: on });
                            }
                        });
                    });
                    ui.add_space(4.0);
                    let desc = match (rec, &state) {
                        (Recorder::Running, Some(s)) => match &s.info {
                            Some(i) => format!(
                                "Keeping the last {} at {}\u{d7}{}, {} fps.",
                                duration_label(s.settings.replay_seconds as f64),
                                i.width,
                                i.height,
                                i.fps
                            ),
                            None => String::new(),
                        },
                        (Recorder::Starting, _) => "Starting capture and the video encoder\u{2026}".into(),
                        (Recorder::Off, _) => "Turn it on to keep recent gameplay ready to save.".into(),
                        (Recorder::Failed, Some(s)) => match &s.replay {
                            ReplayState::Failed { message } => format!("{message}. Trying again automatically."),
                            _ => String::new(),
                        },
                        (Recorder::Offline, _) => "Switchboard isn't running in the background, so clips can't be saved.".into(),
                        _ => "Connecting to Switchboard\u{2026}".into(),
                    };
                    ui.label(RichText::new(desc).font(font(12.5)).color(if rec == Recorder::Failed { DANGER } else { TEXT_DESCRIPTION }));
                    if rec == Recorder::Offline {
                        ui.add_space(10.0);
                        if button(ui, Kind::Primary, None, "Start Switchboard", true).clicked() {
                            self.start_service();
                        }
                        return;
                    }
                    if let (Recorder::Running, Some(s)) = (rec, &state)
                        && let Some(st) = &s.status
                    {
                        ui.add_space(12.0);
                        let target = s.settings.replay_seconds as f32;
                        popover_meter(
                            ui,
                            "Buffer",
                            ACCENT,
                            (st.buffered_seconds / target).clamp(0.0, 1.0).powi(2),
                            &format!("{} / {}", duration_label(st.buffered_seconds.min(target) as f64), duration_label(target as f64)),
                        );
                        for t in &st.tracks {
                            let name = match t.kind {
                                TrackKind::Chat => s.info.as_ref().and_then(|i| i.chat_app.clone()).unwrap_or_else(|| "Chat".into()),
                                k => k.label().to_string(),
                            };
                            let right = if t.error.is_some() { "unavailable" } else { "" };
                            let r = popover_meter(ui, &name, track_color(t.kind), t.level, right);
                            if let Some(e) = &t.error {
                                r.on_hover_text(e);
                            }
                        }
                    }
                    if let Some(err) = state.as_ref().and_then(|s| s.hotkey_error.clone()) {
                        ui.add_space(8.0);
                        ui.label(RichText::new(format!("Shortcut unavailable: {err}")).font(font(12.0)).color(WARNING));
                    }
                    ui.add_space(12.0);
                    if button(ui, Kind::Secondary, Some(icon::SETTINGS), "Replay settings", true).clicked() {
                        self.open_settings();
                    }
                });
        });
        let clicked_outside = ctx.input(|i| {
            i.pointer.any_pressed() && i.pointer.interact_pos().is_some_and(|p| !area.response.rect.contains(p) && !anchor.contains(p))
        });
        if clicked_outside {
            self.popover = false;
        }
    }
}

fn popover_meter(ui: &mut Ui, name: &str, color: Color32, level: f32, right: &str) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(vec2(ui.available_width(), 24.0), Sense::hover());
    let p = ui.painter();
    p.text(pos2(rect.left(), rect.center().y), Align2::LEFT_CENTER, name, font(12.5), TEXT_SECONDARY);
    let reserve = if right.is_empty() { 0.0 } else { 84.0 };
    let bar = Rect::from_min_size(pos2(rect.left() + 96.0, rect.center().y - 2.5), vec2(rect.width() - 96.0 - reserve, 5.0));
    level_bar(ui, bar, level, color);
    if !right.is_empty() {
        let c = if right == "unavailable" { DANGER } else { TEXT_DESCRIPTION };
        ui.painter().text(pos2(rect.right(), rect.center().y), Align2::RIGHT_CENTER, right, font(12.0), c);
    }
    response
}

pub(super) fn track_color(kind: TrackKind) -> Color32 {
    match kind {
        TrackKind::Game => GAME,
        TrackKind::Chat => CHAT,
        TrackKind::Microphone => MIC,
    }
}
