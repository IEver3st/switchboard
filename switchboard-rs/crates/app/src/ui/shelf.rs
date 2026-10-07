//! "Projects & drafts": a horizontal shelf above the library listing edit
//! drafts and kept projects, with Keep, Resume and Discard.

use egui::{Align2, Color32, CornerRadius, Rect, Sense, Stroke, StrokeKind, Ui, Vec2, pos2, vec2};
use switchboard_project::{DRAFT_RETENTION_MS, Project, now_ms};

use super::App;
use super::grid::elided;
use super::library::duration_label;
use super::theme::*;
use super::widgets::icon;

const CARD_W: f32 = 304.0;
const CARD_H: f32 = 76.0;
const TITLE_H: f32 = 34.0;

fn state_line(p: &Project, missing: usize, now: i64) -> (String, Color32) {
    if missing > 0 {
        let n = if missing == 1 { "1 clip missing".to_string() } else { format!("{missing} clips missing") };
        return (n, WARNING);
    }
    if p.is_kept() {
        return ("Kept".into(), TEXT_DESCRIPTION);
    }
    let left = (p.updated_at + DRAFT_RETENTION_MS - now).max(0) / 60_000;
    let text = if left >= 60 { format!("Clears in {}h {}m", left / 60, left % 60) } else { format!("Clears in {}m", left.max(1)) };
    (text, TEXT_DESCRIPTION)
}

impl App {
    /// Draws the shelf at the top of the library scroll area; returns its height.
    pub(super) fn drafts_shelf(&mut self, ui: &mut Ui, origin: egui::Pos2, width: f32, viewport: Rect) -> f32 {
        let now = now_ms();
        let drafts: Vec<Project> = self.store.drafts(now).to_vec();
        if drafts.is_empty() {
            return 0.0;
        }
        let height = TITLE_H + CARD_H + 26.0;
        if viewport.top() > height {
            return height;
        }
        let p = ui.painter();
        let g = p.layout_no_wrap("Projects & drafts".into(), font_strong(14.0), TEXT);
        let gw = g.size().x;
        p.galley(origin + vec2(0.0, 6.0), g, TEXT);
        p.text(origin + vec2(gw + 10.0, 16.0), Align2::LEFT_CENTER, drafts.len().to_string(), font(12.0), TEXT_MUTED);
        p.text(
            origin + vec2(gw + 32.0, 16.0),
            Align2::LEFT_CENTER,
            "Drafts clear 3 hours after their last save",
            font(12.0),
            TEXT_MUTED,
        );

        let strip = Rect::from_min_size(origin + vec2(0.0, TITLE_H), vec2(width, CARD_H + 6.0));
        let mut child = ui.new_child(egui::UiBuilder::new().max_rect(strip));
        egui::ScrollArea::horizontal().id_salt("drafts-shelf").show(&mut child, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 12.0;
                for d in &drafts {
                    self.draft_card(ui, d, now);
                }
            });
        });
        height
    }

    fn draft_card(&mut self, ui: &mut Ui, d: &Project, now: i64) {
        let (rect, response) = ui.allocate_exact_size(vec2(CARD_W, CARD_H), Sense::click());
        let missing = d.segments.iter().filter(|s| self.lib.find(&s.clip_id).is_none()).count();
        let p = ui.painter();
        let bg = if response.hovered() { SURFACE_2 } else { SURFACE_1 };
        p.rect_filled(rect, CornerRadius::same(R_OVERLAY), bg);

        // Thumbnail of the first available clip, or a missing-media mark.
        let thumb = Rect::from_min_size(rect.min + vec2(8.0, 8.0), vec2(106.0, CARD_H - 16.0));
        let first = d.segments.iter().find_map(|s| self.lib.find(&s.clip_id).map(|c| c.path.clone()));
        match first {
            Some(path) => self.paint_thumb(ui, &path, thumb, CornerRadius::same(R_CONTROL), bg),
            None => {
                ui.painter().rect_filled(thumb, CornerRadius::same(R_CONTROL), SURFACE_2);
                ui.painter().text(thumb.center(), Align2::CENTER_CENTER, icon::WARNING, font_icon(16.0), WARNING);
            }
        }

        let x = thumb.right() + 12.0;
        let text_w = rect.right() - x - 44.0;
        let title = elided(ui, &d.name, font_strong(13.0), TEXT, text_w);
        let (kind_icon, kind) = if d.is_clip_edit() {
            (icon::CLIP_EDIT, "Clip edit".to_string())
        } else {
            (icon::MONTAGE, format!("Montage \u{b7} {} clips", d.segments.len()))
        };
        let (state, state_color) = state_line(d, missing, now);
        let p = ui.painter();
        p.galley(pos2(x, rect.top() + 9.0), title, TEXT);
        p.text(pos2(x, rect.top() + 38.0), Align2::LEFT_CENTER, kind_icon, font_icon(11.0), TEXT_DESCRIPTION);
        p.text(pos2(x + 17.0, rect.top() + 38.0), Align2::LEFT_CENTER, kind, font(12.0), TEXT_DESCRIPTION);
        let dur = duration_label(d.duration_ms as f64 / 1000.0);
        let dg = p.layout_no_wrap(dur, font(12.0), TEXT_SECONDARY);
        let dw = dg.size().x;
        p.galley(pos2(x, rect.top() + 50.0), dg, TEXT_SECONDARY);
        if missing > 0 {
            p.text(pos2(x + dw + 10.0, rect.top() + 57.0), Align2::LEFT_CENTER, icon::WARNING, font_icon(11.0), WARNING);
            p.text(pos2(x + dw + 26.0, rect.top() + 57.0), Align2::LEFT_CENTER, state, font(12.0), state_color);
        } else {
            p.text(pos2(x + dw + 10.0, rect.top() + 57.0), Align2::LEFT_CENTER, state, font(12.0), state_color);
        }
        if response.has_focus() {
            p.rect_stroke(rect, CornerRadius::same(R_OVERLAY), Stroke::new(2.0, ACCENT_HOVER), StrokeKind::Outside);
        }
        let a11y = format!("{}, {}", d.name, if d.is_kept() { "kept project" } else { "draft" });
        response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, &a11y));

        // Keep toggle and the item menu.
        let keep_rect = Rect::from_center_size(pos2(rect.right() - 20.0, rect.top() + 20.0), Vec2::splat(28.0));
        let keep = ui.interact(keep_rect, response.id.with("keep"), Sense::click());
        let kept = d.is_kept();
        keep.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::Checkbox, true, kept, "Keep project"));
        let glyph_color = if kept { ACCENT_HOVER } else if keep.hovered() { TEXT } else { TEXT_DESCRIPTION };
        if keep.hovered() {
            ui.painter().rect_filled(keep_rect, CornerRadius::same(R_CONTROL), INTERACTIVE);
        }
        ui.painter().text(keep_rect.center(), Align2::CENTER_CENTER, icon::BOOKMARK, font_icon(13.0), glyph_color);
        let keep = keep.on_hover_text(if kept { "Kept until you discard it" } else { "Keep this project" });
        if keep.clicked() {
            let mut p = d.clone();
            p.kept = Some(!kept);
            let _ = self.store.save(p, now_ms());
        }
        // One click discards; the notice offers Undo instead of a confirmation.
        let more_rect = Rect::from_center_size(pos2(rect.right() - 20.0, rect.bottom() - 20.0), Vec2::splat(28.0));
        let more = ui.interact(more_rect, response.id.with("discard"), Sense::click());
        let what = if kept { "project" } else { "draft" };
        more.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, format!("Discard {what}")));
        if more.hovered() {
            ui.painter().rect_filled(more_rect, CornerRadius::same(R_CONTROL), INTERACTIVE);
        }
        let x_color = if more.hovered() { DANGER } else { TEXT_DESCRIPTION };
        ui.painter().text(more_rect.center(), Align2::CENTER_CENTER, icon::CLOSE, font_icon(11.0), x_color);
        let more = more.on_hover_text(format!("Discard {what}"));
        if more.clicked() {
            let _ = self.store.delete(&d.id);
            self.notice = Some(super::Notice {
                ok: true,
                text: format!("Discarded {}", d.name),
                path: None,
                undo: Some(Box::new(d.clone())),
                at: std::time::Instant::now(),
            });
        } else if response.clicked() && !keep.hovered() {
            self.open_project(d.clone());
        }
    }
}
