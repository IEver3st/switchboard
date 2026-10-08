//! Vertical guide quick panel: turns the on-screen 9:16 framing guide on and
//! off and adjusts it. The guide itself is drawn by the tray process
//! (guide.rs); this edits the setting and shows the confirmed state.

use egui::{Align, Align2, Color32, CornerRadius, Frame, Layout, Margin, Rect, RichText, Sense, Stroke, StrokeKind, Ui, pos2, vec2};

use super::App;
use super::theme::*;
use super::widgets::{self, Kind, button, combo, icon_button, segmented, toggle};
use crate::settings::{GuideColor, VerticalGuide};

/// Segoe Fluent "CellPhone".
pub const PHONE: &str = "\u{E8EA}";

impl App {
    /// Command-row button that opens the guide panel.
    pub(super) fn guide_button(&mut self, ui: &mut Ui) {
        let on = self.state.as_ref().is_some_and(|s| s.settings.vertical_guide.enabled);
        let name = if on { "Vertical guide (on)" } else { "Vertical guide (9:16)" };
        let r = icon_button(ui, PHONE, name, self.guide_panel || on);
        if on {
            ui.painter().circle_filled(r.rect.right_top() + vec2(-6.0, 6.0), 3.5, ACCENT);
        }
        if r.clicked() {
            self.guide_panel = !self.guide_panel;
            self.popover = false;
        }
        self.guide_rect = r.rect;
    }

    pub(super) fn guide_panel(&mut self, ctx: &egui::Context) {
        let anchor = self.guide_rect;
        let width = 320.0;
        let pos = pos2((anchor.right() - width).max(8.0), anchor.bottom() + 6.0);
        let state = self.state.clone();
        let area = egui::Area::new(egui::Id::new("guide-panel")).order(egui::Order::Foreground).fixed_pos(pos).show(ctx, |ui| {
            Frame::new()
                .fill(SURFACE_1)
                .corner_radius(CornerRadius::same(R_OVERLAY))
                .stroke(Stroke::new(1.0, BORDER))
                .shadow(ctx.global_style().visuals.popup_shadow)
                .inner_margin(Margin::same(16))
                .show(ui, |ui| {
                    ui.set_width(width - 32.0);
                    let (Some(state), Some(mut s)) = (state.clone(), self.draft.clone()) else {
                        ui.label(RichText::new("Vertical guide").font(font_strong(14.0)).color(TEXT));
                        ui.add_space(4.0);
                        ui.label(
                            RichText::new("The guide is available while Switchboard runs in the background.")
                                .font(font(12.5))
                                .color(TEXT_DESCRIPTION),
                        );
                        return;
                    };
                    let g = &mut s.vertical_guide;
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("Vertical guide").font(font_strong(14.0)).color(TEXT));
                        let pill = ui.painter().layout_no_wrap("9:16".into(), font_strong(11.0), ACCENT_HOVER);
                        let (r, _) = ui.allocate_exact_size(vec2(pill.size().x + 12.0, 18.0), Sense::hover());
                        ui.painter().rect_filled(r, CornerRadius::same(R_CONTROL), ACCENT.linear_multiply(0.18));
                        ui.painter().galley(r.center() - pill.size() / 2.0, pill, ACCENT_HOVER);
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            toggle(ui, &mut g.enabled, "Vertical guide");
                        });
                    });
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new("Outlines a phone-shaped area on screen so you can frame Shorts while you play. Clicks pass through, and it never shows up in clips.")
                            .font(font(12.5))
                            .color(TEXT_DESCRIPTION),
                    );
                    if let Some(err) = &state.guide_error {
                        ui.add_space(6.0);
                        ui.label(RichText::new(err).font(font(12.0)).color(WARNING));
                    }
                    ui.add_space(12.0);

                    // Where the frame sits on the chosen display.
                    let index = g.display_index.unwrap_or(s.display_index);
                    let (dw, dh) = state.displays.get(index).map(|d| (d.width, d.height)).unwrap_or((1920, 1080));
                    preview(ui, g, dw.max(1), dh.max(1));
                    ui.add_space(12.0);

                    row(ui, "Size", &format!("{}%", g.size), |ui, w| {
                        let mut v = (g.size as f32 - 25.0) / 75.0;
                        if widgets::fader(ui, &mut v, ACCENT, w, "Frame size").changed() {
                            g.size = (25.0 + v * 75.0).round() as u8;
                        }
                    });
                    row(ui, "Left to right", &position(g.horizontal), |ui, w| {
                        let mut v = g.horizontal as f32 / 100.0;
                        if widgets::fader(ui, &mut v, ACCENT, w, "Horizontal position").changed() {
                            g.horizontal = (v * 100.0).round() as u8;
                        }
                    });
                    row(ui, "Top to bottom", &position(g.vertical), |ui, w| {
                        let mut v = g.vertical as f32 / 100.0;
                        if widgets::fader(ui, &mut v, ACCENT, w, "Vertical position").changed() {
                            g.vertical = (v * 100.0).round() as u8;
                        }
                    });
                    let dim = if g.dim == 0 { "Off".to_string() } else { format!("{}%", g.dim) };
                    row(ui, "Darken outside", &dim, |ui, w| {
                        let mut v = g.dim as f32 / 80.0;
                        if widgets::fader(ui, &mut v, ACCENT, w, "Darken outside the frame").changed() {
                            g.dim = (v * 80.0).round() as u8;
                        }
                    });
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        name_label(ui, "Outline", 30.0);
                        segmented(
                            ui,
                            &mut g.color,
                            &[(GuideColor::White, "White"), (GuideColor::Violet, "Violet"), (GuideColor::Lime, "Lime")],
                            "Outline color",
                        );
                    });
                    if state.displays.len() > 1 {
                        ui.add_space(6.0);
                        ui.horizontal(|ui| {
                            name_label(ui, "Display", 24.0);
                            let label = match g.display_index {
                                None => "Same as recording".to_string(),
                                Some(i) => state.displays.get(i).map(|d| format!("Display {}", d.index + 1)).unwrap_or_else(|| "Display".into()),
                            };
                            combo("guide-display", label, 150.0).show_ui(ui, |ui| {
                                ui.set_min_width(240.0);
                                ui.selectable_value(&mut g.display_index, None, "Same as recording");
                                for d in &state.displays {
                                    ui.selectable_value(&mut g.display_index, Some(d.index), d.label());
                                }
                            });
                        });
                    }
                    ui.add_space(12.0);
                    let defaults = VerticalGuide { enabled: g.enabled, ..Default::default() };
                    if button(ui, Kind::Secondary, None, "Reset frame", *g != defaults).clicked() {
                        *g = defaults;
                    }
                    if Some(&s) != self.draft.as_ref() {
                        self.apply(s.clone());
                    }
                });
        });
        let clicked_outside = ctx.input(|i| {
            i.pointer.any_pressed() && i.pointer.interact_pos().is_some_and(|p| !area.response.rect.contains(p) && !anchor.contains(p))
        });
        if clicked_outside {
            self.guide_panel = false;
        }
    }
}

/// A labelled row: name on the left, control in the middle, value on the right.
fn row(ui: &mut Ui, name: &str, value: &str, control: impl FnOnce(&mut Ui, f32)) {
    ui.horizontal(|ui| {
        ui.set_height(26.0);
        name_label(ui, name, 26.0);
        let w = (ui.available_width() - 48.0).max(60.0);
        control(ui, w);
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.label(RichText::new(value).font(font_mono(11.5)).color(TEXT_DESCRIPTION));
        });
    });
}

/// Left-aligned row name in a fixed column.
fn name_label(ui: &mut Ui, name: &str, height: f32) {
    let (r, _) = ui.allocate_exact_size(vec2(96.0, height), Sense::hover());
    ui.painter().text(r.left_center(), Align2::LEFT_CENTER, name, font(12.5), TEXT_SECONDARY);
}

fn position(v: u8) -> String {
    if v == 50 { "Center".into() } else { format!("{v}%") }
}

/// The display in miniature with the frame on it.
fn preview(ui: &mut Ui, g: &VerticalGuide, dw: i32, dh: i32) {
    // The miniature on the left, the frame size beside it.
    let max = vec2(ui.available_width() - 110.0, 96.0);
    let scale = (max.x / dw as f32).min(max.y / dh as f32);
    let size = vec2(dw as f32 * scale, dh as f32 * scale);
    let (outer, _) = ui.allocate_exact_size(vec2(ui.available_width(), size.y), Sense::hover());
    let screen = Rect::from_min_size(outer.min, size);
    let p = ui.painter();
    p.rect_filled(screen, CornerRadius::same(R_CONTROL), HOVER);
    let (fx, fy, fw, fh) = g.frame(dw, dh);
    let frame = Rect::from_min_size(
        screen.min + vec2(fx as f32 * scale, fy as f32 * scale),
        vec2(fw as f32 * scale, fh as f32 * scale),
    );
    if g.dim > 0 {
        let shade = Color32::from_black_alpha((g.dim as u32 * 255 / 100) as u8);
        for r in [
            Rect::from_min_max(screen.min, pos2(screen.right(), frame.top())),
            Rect::from_min_max(pos2(screen.left(), frame.bottom()), screen.max),
            Rect::from_min_max(pos2(screen.left(), frame.top()), pos2(frame.left(), frame.bottom())),
            Rect::from_min_max(pos2(frame.right(), frame.top()), pos2(screen.right(), frame.bottom())),
        ] {
            if r.width() > 0.0 && r.height() > 0.0 {
                p.rect_filled(r, CornerRadius::ZERO, shade);
            }
        }
    }
    let hex = g.color.rgb();
    let color = Color32::from_rgb((hex >> 16) as u8, (hex >> 8) as u8, hex as u8);
    let alpha = if g.enabled { 1.0 } else { 0.45 };
    p.rect_stroke(frame, CornerRadius::ZERO, Stroke::new(1.5, color.gamma_multiply(alpha)), StrokeKind::Outside);
    let x = screen.right() + 14.0;
    p.text(pos2(x, screen.center().y - 9.0), Align2::LEFT_CENTER, format!("{fw} \u{d7} {fh}"), font_mono(12.0), TEXT);
    p.text(pos2(x, screen.center().y + 9.0), Align2::LEFT_CENTER, "screen pixels", font(11.5), TEXT_DESCRIPTION);
}
