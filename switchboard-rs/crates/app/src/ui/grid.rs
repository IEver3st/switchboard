//! The clip library: a virtualized card grid (up to five columns) or list.
//! Only rows that intersect the viewport are laid out and painted.

use std::path::PathBuf;
use std::sync::Arc;

use egui::text::{LayoutJob, TextWrapping};
use egui::{Align2, Color32, CornerRadius, FontId, Galley, Rect, Response, RichText, Sense, Stroke, StrokeKind, Ui, Vec2, pos2, vec2};

use super::App;
use super::library::{Clip, Thumb, View, bytes_label, clock_time, duration_label, short_when};
use super::theme::*;
use super::widgets::{Kind, button, check_circle, icon, keycaps, menu_divider, menu_item};
use crate::library_index::CaptureSource;
use crate::protocol::{ReplayState, Request};
use crate::shell;

const GAP: f32 = 16.0;
const MIN_CARD: f32 = 286.0;
const MAX_COLUMNS: usize = 5;
const HEADER_H: f32 = 42.0;
const CARD_BODY_H: f32 = 62.0;
const LIST_ROW_H: f32 = 60.0;

enum Row {
    Header { label: String, count: usize },
    Cards { from: usize, to: usize },
    ListItem(usize),
}

pub(super) fn elided(ui: &Ui, text: &str, font: FontId, color: Color32, width: f32) -> Arc<Galley> {
    let mut job = LayoutJob::simple_singleline(text.to_string(), font, color);
    job.wrap = TextWrapping { max_width: width.max(1.0), max_rows: 1, break_anywhere: true, overflow_character: Some('\u{2026}') };
    ui.painter().layout_job(job)
}

pub(super) fn meta_line(c: &Clip, today: i32, grouped: bool) -> String {
    let how = match (c.source, c.events.first()) {
        (CaptureSource::Auto, Some(e)) => format!("{} \u{b7} Auto capture", sentence_case(&e.replace('-', " "))),
        (CaptureSource::Auto, None) => "Auto capture".into(),
        (CaptureSource::Manual, _) => "Manual capture".into(),
    };
    if c.title.contains(&c.game) {
        return how;
    }
    let when = if grouped { clock_time(c.local) } else { short_when(c, today) };
    format!("{} \u{b7} {when} \u{b7} {how}", c.game)
}

fn sentence_case(s: &str) -> String {
    let mut chars = s.chars();
    chars.next().map(|f| f.to_uppercase().chain(chars).collect()).unwrap_or_default()
}

impl App {
    pub(super) fn library_view(&mut self, ui: &mut Ui) {
        let visible: Vec<usize> = self.lib.visible().to_vec();
        let full_w = ui.available_width();
        let content_w = full_w - GUTTER * 2.0;
        egui::ScrollArea::vertical().id_salt("library").auto_shrink([false, false]).show_viewport(ui, |ui, viewport| {
            let origin = ui.max_rect().min + vec2(GUTTER, 0.0);
            // Projects & drafts scroll away with the clips.
            let shelf_h = self.drafts_shelf(ui, origin, content_w, viewport);
            if visible.is_empty() {
                let h = (viewport.height() - shelf_h - GUTTER).max(300.0);
                ui.set_min_size(vec2(full_w, shelf_h + h));
                let r = Rect::from_min_size(origin + vec2(0.0, shelf_h), vec2(content_w, h));
                ui.scope_builder(egui::UiBuilder::new().max_rect(r), |ui| self.library_empty(ui));
                return;
            }
            let view = self.lib.view;
            let grouped = self.lib.sort().groups_by_day();
            let cols = (((content_w + GAP) / (MIN_CARD + GAP)).floor() as usize).clamp(1, MAX_COLUMNS);
            let card_w = (content_w - GAP * (cols as f32 - 1.0)) / cols as f32;
            let thumb_h = (card_w * 9.0 / 16.0).round();
            let card_h = thumb_h + CARD_BODY_H;

            let mut rows: Vec<(f32, f32, Row)> = Vec::new();
            let mut y = shelf_h;
            let mut i = 0;
            while i < visible.len() {
                let mut end = visible.len();
                if grouped {
                    let day = self.lib.clips[visible[i]].day;
                    end = i + visible[i..].iter().take_while(|&&k| self.lib.clips[k].day == day).count();
                    rows.push((y, HEADER_H, Row::Header { label: self.lib.day_heading(day), count: end - i }));
                    y += HEADER_H;
                }
                match view {
                    View::Grid => {
                        let mut s = i;
                        while s < end {
                            let e = (s + cols).min(end);
                            rows.push((y, card_h, Row::Cards { from: s, to: e }));
                            y += card_h + GAP;
                            s = e;
                        }
                    }
                    View::List => {
                        for k in i..end {
                            rows.push((y, LIST_ROW_H, Row::ListItem(k)));
                            y += LIST_ROW_H + 4.0;
                        }
                        y += 8.0;
                    }
                }
                i = end;
            }
            ui.set_min_size(vec2(full_w, y + GUTTER));
            let view_rect = viewport.expand2(vec2(0.0, 240.0));
            for (top, h, row) in &rows {
                if *top + *h < view_rect.top() || *top > view_rect.bottom() {
                    continue;
                }
                let rect = Rect::from_min_size(origin + vec2(0.0, *top), vec2(content_w, *h));
                match row {
                    Row::Header { label, count } => {
                        let p = ui.painter();
                        let base = rect.bottom() - 12.0;
                        let g = p.layout_no_wrap(label.clone(), font_strong(13.0), TEXT);
                        let w = g.size().x;
                        p.galley(pos2(rect.left(), base - g.size().y), g, TEXT);
                        let n = if *count == 1 { "1 clip".to_string() } else { format!("{count} clips") };
                        p.text(pos2(rect.left() + w + 10.0, base), Align2::LEFT_BOTTOM, n, font(12.0), TEXT_MUTED);
                    }
                    Row::Cards { from, to } => {
                        for (c, k) in (*from..*to).enumerate() {
                            let card = Rect::from_min_size(rect.min + vec2(c as f32 * (card_w + GAP), 0.0), vec2(card_w, card_h));
                            self.card(ui, visible[k], card, thumb_h, grouped);
                        }
                    }
                    Row::ListItem(k) => self.list_row(ui, visible[*k], rect, grouped),
                }
            }
        });
    }

    fn card(&mut self, ui: &mut Ui, idx: usize, rect: Rect, thumb_h: f32, grouped: bool) {
        let path = self.lib.clips[idx].path.clone();
        let id = egui::Id::new(("clip", &path));
        let response = ui.interact(rect, id, Sense::click());
        let selected = self.lib.is_selected(&path);
        let selecting = self.lib.selecting;
        let hovered = response.hovered();
        let p = ui.painter();
        let radius = CornerRadius::same(R_OVERLAY);
        p.rect_filled(rect, radius, if hovered { SURFACE_2 } else { SURFACE_1 });
        let thumb_rect = Rect::from_min_size(rect.min, vec2(rect.width(), thumb_h));
        let top_radius = CornerRadius { nw: R_OVERLAY, ne: R_OVERLAY, sw: 0, se: 0 };
        self.paint_thumb(ui, &path, thumb_rect, top_radius, BACKGROUND);

        let clip = &self.lib.clips[idx];
        let p = ui.painter();
        // Duration, top right.
        if let Some(s) = clip.seconds() {
            let g = p.layout_no_wrap(duration_label(s), font_strong(12.0), TEXT);
            let pad = vec2(7.0, 3.0);
            let b = Rect::from_min_size(
                pos2(thumb_rect.right() - g.size().x - pad.x * 2.0 - 10.0, thumb_rect.top() + 10.0),
                g.size() + pad * 2.0,
            );
            p.rect_filled(b, CornerRadius::same(4), Color32::from_rgba_unmultiplied(9, 11, 15, 200));
            p.galley(b.min + pad, g, TEXT);
        }
        // Favorite star, top left (or the selection check while selecting).
        if selecting || selected {
            check_circle(ui, thumb_rect.min + vec2(21.0, 21.0), 11.0, selected);
        } else if clip.favorite {
            let c = thumb_rect.min + vec2(21.0, 21.0);
            p.circle_filled(c, 12.0, Color32::from_rgba_unmultiplied(9, 11, 15, 190));
            p.text(c, Align2::CENTER_CENTER, icon::STAR_FILLED, font_icon(12.0), WARNING);
        }

        // Body: title, meta, and the share / more buttons.
        let body = Rect::from_min_max(pos2(rect.left() + 12.0, thumb_rect.bottom()), pos2(rect.right() - 8.0, rect.bottom()));
        let text_w = body.width() - 64.0;
        let title = elided(ui, &clip.title, font_strong(13.0), TEXT, text_w);
        let meta = elided(ui, &meta_line(clip, self.lib.today, grouped), font(12.0), TEXT_DESCRIPTION, text_w);
        let a11y = format!("{}, {}", clip.title, meta.text());
        let p = ui.painter();
        p.galley(pos2(body.left(), body.top() + 12.0), title, TEXT);
        p.galley(pos2(body.left(), body.top() + 32.0), meta, TEXT_DESCRIPTION);
        if selected {
            p.rect_stroke(rect, radius, Stroke::new(2.0, ACCENT), StrokeKind::Inside);
        }
        if response.has_focus() {
            p.rect_stroke(rect.expand(2.0), CornerRadius::same(R_OVERLAY + 2), Stroke::new(2.0, ACCENT_HOVER), StrokeKind::Outside);
        }
        response.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::Button, true, selected, &a11y));

        // Card buttons are separate targets on top of the card.
        let more = Rect::from_center_size(pos2(body.right() - 16.0, body.center().y), Vec2::splat(30.0));
        let share = Rect::from_center_size(pos2(body.right() - 50.0, body.center().y), Vec2::splat(30.0));
        let share_r = card_icon(ui, share, id.with("share"), icon::SHARE, "Share");
        let more_r = card_icon(ui, more, id.with("more"), icon::MORE, "More actions");
        if share_r.clicked() {
            self.open_share(&path);
        }
        egui::Popup::menu(&more_r).show(|ui| self.clip_menu(ui, &path));
        if !share_r.hovered() && !more_r.hovered() {
            self.item_interaction(ui, &response, &path);
        }
    }

    fn list_row(&mut self, ui: &mut Ui, idx: usize, rect: Rect, grouped: bool) {
        let path = self.lib.clips[idx].path.clone();
        let id = egui::Id::new(("clip", &path));
        let response = ui.interact(rect, id, Sense::click());
        let selected = self.lib.is_selected(&path);
        let bg = if selected {
            ACCENT.linear_multiply(0.14)
        } else if response.hovered() {
            SURFACE_2
        } else {
            SURFACE_1
        };
        ui.painter().rect_filled(rect, CornerRadius::same(R_OVERLAY), bg);
        let thumb = Rect::from_min_size(pos2(rect.left() + 8.0, rect.center().y - 22.0), vec2(78.0, 44.0));
        self.paint_thumb(ui, &path, thumb, CornerRadius::same(R_CONTROL), bg);

        let clip = &self.lib.clips[idx];
        if self.lib.selecting || selected {
            check_circle(ui, thumb.min + vec2(12.0, 12.0), 8.0, selected);
        } else if clip.favorite {
            let c = thumb.min + vec2(12.0, 12.0);
            ui.painter().circle_filled(c, 9.0, Color32::from_rgba_unmultiplied(9, 11, 15, 190));
            ui.painter().text(c, Align2::CENTER_CENTER, icon::STAR_FILLED, font_icon(10.0), WARNING);
        }
        let right = rect.right() - 16.0;
        let cols = [right - 260.0, right - 70.0];
        let text_w = cols[0] - thumb.right() - 40.0;
        let title = elided(ui, &clip.title, font_strong(13.0), TEXT, text_w);
        let meta = elided(ui, &meta_line(clip, self.lib.today, grouped), font(12.0), TEXT_DESCRIPTION, text_w);
        let p = ui.painter();
        p.galley(pos2(thumb.right() + 14.0, rect.center().y - 18.0), title, TEXT);
        p.galley(pos2(thumb.right() + 14.0, rect.center().y + 2.0), meta, TEXT_DESCRIPTION);
        let quality = clip
            .info
            .filter(|i| i.height > 0)
            .map(|i| format!("{}p \u{b7} {:.0} fps", i.height, i.fps))
            .unwrap_or_else(|| "\u{2013}".into());
        p.text(pos2(cols[0], rect.center().y), Align2::LEFT_CENTER, quality, font(12.5), TEXT_DESCRIPTION);
        let dur = clip.seconds().map(duration_label).unwrap_or_else(|| "\u{2013}".into());
        p.text(pos2(cols[1] - 10.0, rect.center().y), Align2::RIGHT_CENTER, dur, font(12.5), TEXT_SECONDARY);
        p.text(pos2(right, rect.center().y), Align2::RIGHT_CENTER, bytes_label(clip.bytes), font(12.5), TEXT_DESCRIPTION);
        if response.has_focus() {
            p.rect_stroke(rect, CornerRadius::same(R_OVERLAY), Stroke::new(2.0, ACCENT_HOVER), StrokeKind::Inside);
        }
        let a11y = format!("{}, {}", clip.title, clip.file_name);
        response.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::SelectableLabel, true, selected, &a11y));
        self.item_interaction(ui, &response, &path);
    }

    /// Draws a thumbnail. `behind` is the colour around the rounded corners.
    pub(super) fn paint_thumb(&mut self, ui: &Ui, path: &PathBuf, rect: Rect, radius: CornerRadius, behind: Color32) {
        if !ui.is_rect_visible(rect) {
            return;
        }
        // Pixel-aligned and sized to the screen, so the CPU renderer can copy
        // the texture row by row instead of filtering it; rounded corners are
        // then painted over as small solid masks.
        let ppp = ui.ctx().pixels_per_point();
        let min = (rect.min.to_vec2() * ppp).round() / ppp;
        let px = [(rect.width() * ppp).round() as usize, (rect.height() * ppp).round() as usize];
        let snapped = Rect::from_min_size(min.to_pos2(), vec2(px[0] as f32, px[1] as f32) / ppp);
        // One spare row and column: the renderer only copies directly when
        // the drawn area ends inside the texture, not on its edge.
        let wanted = [px[0] + 1, px[1] + 1];
        match self.lib.thumb_sized(path, Some(wanted)) {
            Thumb::Ready(tex) => {
                let [tw, th] = tex.size();
                let uv = if [tw, th] == wanted {
                    Rect::from_min_max(pos2(0.0, 0.0), pos2(px[0] as f32 / tw as f32, px[1] as f32 / th as f32))
                } else {
                    Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0))
                };
                // A lone quad is never treated as a rectangle by the renderer
                // (it looks for a following triangle), so add an empty one.
                let mut mesh = egui::Mesh::with_texture(tex.id());
                mesh.add_rect_with_uv(snapped, uv, Color32::WHITE);
                let v = mesh.vertices.len() as u32;
                mesh.colored_vertex(snapped.min, Color32::TRANSPARENT);
                mesh.add_triangle(v, v, v);
                ui.painter().add(egui::Shape::mesh(mesh));
                corner_masks(ui.painter(), snapped, radius, behind);
            }
            Thumb::Missing => {
                ui.painter().rect_filled(rect, radius, SURFACE_2);
                if rect.width() > 120.0 {
                    ui.painter().text(rect.center(), Align2::CENTER_CENTER, "No preview", font(12.0), TEXT_MUTED);
                }
            }
            Thumb::Loading => {
                ui.painter().rect_filled(rect, radius, SURFACE_2);
            }
        }
    }

    /// One command model for clicks, keys and the context menu.
    fn item_interaction(&mut self, ui: &mut Ui, response: &Response, path: &PathBuf) {
        let mods = ui.input(|i| i.modifiers);
        if response.clicked() {
            if self.lib.selecting || mods.command {
                self.lib.selecting = true;
                if mods.shift {
                    self.lib.select_range(path);
                } else {
                    self.lib.toggle(path);
                }
            } else if mods.shift {
                self.lib.selecting = true;
                self.lib.select_range(path);
            } else {
                self.open_editor(path);
            }
        }
        if response.has_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
            self.open_editor(path);
        }
        response.context_menu(|ui| self.clip_menu(ui, path));
    }

    /// Actions for one clip, shared by the ⋯ button and right-click.
    pub(super) fn clip_menu(&mut self, ui: &mut Ui, path: &PathBuf) {
        let Some(clip) = self.lib.clips.iter().find(|c| &c.path == path) else { return };
        let favorite = clip.favorite;
        let file = clip.file_name.clone();
        let title = clip.title.clone();
        ui.set_width(232.0);
        ui.spacing_mut().item_spacing.y = 0.0;
        let star = if favorite { icon::STAR_FILLED } else { icon::STAR };
        let fav_label = if favorite { "Remove from favorites" } else { "Add to favorites" };
        if menu_item(ui, Some(icon::CLIP_EDIT), "Open editor", TEXT_SECONDARY).clicked() {
            self.open_editor(path);
            ui.close();
        }
        if menu_item(ui, Some(icon::PLAY), "Play in default player", TEXT_SECONDARY).clicked() {
            App::open_clip(path);
            ui.close();
        }
        if menu_item(ui, Some(icon::SHARE), "Share\u{2026}", TEXT_SECONDARY).clicked() {
            self.open_share(path);
            ui.close();
        }
        menu_divider(ui);
        if menu_item(ui, Some(star), fav_label, TEXT_SECONDARY).clicked() {
            self.link.send(Request::UpdateClip { file: file.clone(), favorite: Some(!favorite), title: None });
            ui.close();
        }
        if menu_item(ui, Some(icon::RENAME), "Rename\u{2026}", TEXT_SECONDARY).clicked() {
            self.rename = Some((path.clone(), title));
            ui.close();
        }
        if menu_item(ui, Some(icon::FOLDER), "Show in folder", TEXT_SECONDARY).clicked() {
            shell::reveal(path);
            ui.close();
        }
        menu_divider(ui);
        let selection = self.lib.selected_paths();
        let targets = if selection.contains(path) && selection.len() > 1 { selection } else { vec![path.clone()] };
        let label = if targets.len() == 1 {
            "Move to Recycle Bin\u{2026}".to_string()
        } else {
            format!("Move {} clips to Recycle Bin\u{2026}", targets.len())
        };
        if menu_item(ui, Some(icon::DELETE), &label, DANGER).clicked() {
            self.confirm_delete = Some(targets);
            ui.close();
        }
    }

    fn library_empty(&mut self, ui: &mut Ui) {
        let filtered = self.lib.is_filtered();
        let state = self.state.clone();
        ui.add_space(((ui.available_height() - 160.0) * 0.45).max(40.0));
        ui.vertical_centered(|ui| {
            if !self.lib.scanned {
                return;
            }
            if filtered {
                let searching = !self.lib.query().is_empty();
                let filtering = self.lib.filters().active_count() > 0;
                let what = if searching {
                    format!("No clips match \u{201c}{}\u{201d}", self.lib.query())
                } else {
                    "No clips match these filters".to_string()
                };
                ui.label(RichText::new(what).font(font_strong(15.0)).color(TEXT));
                ui.add_space(10.0);
                let label = match (searching, filtering) {
                    (true, true) => "Clear search and filters",
                    (true, false) => "Clear search",
                    _ => "Clear filters",
                };
                if button(ui, Kind::Secondary, None, label, true).clicked() {
                    self.lib.set_query(String::new());
                    self.lib.set_filters(Default::default());
                }
                return;
            }
            ui.label(RichText::new("No clips yet").font(font_strong(15.0)).color(TEXT));
            ui.add_space(6.0);
            match state.as_ref() {
                Some(s) if s.replay == ReplayState::Running => {
                    ui.horizontal(|ui| {
                        let caps_w = s.settings.hotkey.split('+').count() as f32 * 30.0;
                        let lead = "Press";
                        let tail = format!("while you play to save the last {}.", duration_label(s.settings.replay_seconds as f64));
                        let w = ui.painter().layout_no_wrap(format!("{lead} {tail}"), font(13.0), TEXT).size().x + caps_w + 16.0;
                        ui.add_space(((ui.available_width() - w) / 2.0).max(0.0));
                        ui.label(RichText::new(lead).font(font(13.0)).color(TEXT_DESCRIPTION));
                        keycaps(ui, &s.settings.hotkey, false);
                        ui.label(RichText::new(tail).font(font(13.0)).color(TEXT_DESCRIPTION));
                    });
                }
                Some(_) => {
                    ui.label(
                        RichText::new("Instant Replay is off, so nothing is being recorded.").font(font(13.0)).color(TEXT_DESCRIPTION),
                    );
                    ui.add_space(10.0);
                    if button(ui, Kind::Primary, None, "Turn on Instant Replay", true).clicked() {
                        self.link.send(Request::SetReplay { enabled: true });
                    }
                }
                None => {}
            }
            ui.add_space(14.0);
            let dir = self.lib.dir.display().to_string();
            if button(ui, Kind::Ghost, Some(icon::FOLDER), "Open clips folder", true).on_hover_text(dir).clicked() {
                shell::open_folder(&self.lib.dir);
            }
        });
    }
}

fn card_icon(ui: &Ui, rect: Rect, id: egui::Id, glyph: &str, name: &str) -> Response {
    let r = ui.interact(rect, id, Sense::click());
    let label = name.to_string();
    r.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, &label));
    let p = ui.painter();
    if r.hovered() {
        p.rect_filled(rect, CornerRadius::same(R_CONTROL), INTERACTIVE);
    }
    p.text(rect.center(), Align2::CENTER_CENTER, glyph, font_icon(14.0), if r.hovered() { TEXT } else { TEXT_SECONDARY });
    super::widgets::focus_ring(ui, &r, R_CONTROL);
    r.on_hover_text(name)
}

/// Covers the outside of each rounded corner with `color`: a fan from the
/// corner point to its quarter arc.
fn corner_masks(painter: &egui::Painter, rect: Rect, radius: CornerRadius, color: Color32) {
    let mut mesh = egui::Mesh::default();
    let corners = [
        (radius.nw, rect.left_top(), vec2(1.0, 1.0), std::f32::consts::PI),
        (radius.ne, rect.right_top(), vec2(-1.0, 1.0), 1.5 * std::f32::consts::PI),
        (radius.se, rect.right_bottom(), vec2(-1.0, -1.0), 0.0),
        (radius.sw, rect.left_bottom(), vec2(1.0, -1.0), 0.5 * std::f32::consts::PI),
    ];
    for (r, corner, inward, start) in corners {
        if r == 0 {
            continue;
        }
        let r = r as f32;
        let center = corner + inward * r;
        let base = mesh.vertices.len() as u32;
        mesh.colored_vertex(corner, color);
        const STEPS: u32 = 8;
        for i in 0..=STEPS {
            let a = start + std::f32::consts::FRAC_PI_2 * i as f32 / STEPS as f32;
            mesh.colored_vertex(center + r * vec2(a.cos(), a.sin()), color);
        }
        for i in 0..STEPS {
            mesh.add_triangle(base, base + 1 + i, base + 2 + i);
        }
    }
    if !mesh.is_empty() {
        painter.add(egui::Shape::mesh(mesh));
    }
}
