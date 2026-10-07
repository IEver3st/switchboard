//! Shared controls. Every interactive widget reports an accessible name,
//! draws a visible focus ring, and keeps its size stable across states.

use egui::{Align2, Color32, CornerRadius, Rect, Response, Sense, Stroke, StrokeKind, Ui, Vec2, WidgetInfo, WidgetType, pos2, vec2};

use super::theme::*;

/// Segoe Fluent Icons / MDL2 code points.
pub mod icon {
    pub const SETTINGS: &str = "\u{E713}";
    pub const SEARCH: &str = "\u{E721}";
    pub const BACK: &str = "\u{E72B}";
    pub const CHEVRON_DOWN: &str = "\u{E70D}";
    pub const FOLDER: &str = "\u{E838}";
    pub const DELETE: &str = "\u{E74D}";
    pub const PLAY: &str = "\u{E768}";
    pub const CHECK: &str = "\u{E73E}";
    pub const CLOSE: &str = "\u{E711}";
    pub const GRID: &str = "\u{E80A}";
    pub const LIST: &str = "\u{EA37}";
    pub const STAR: &str = "\u{E734}";
    pub const STAR_FILLED: &str = "\u{E735}";
    pub const SHARE: &str = "\u{E72D}";
    pub const MORE: &str = "\u{E712}";
    pub const FILTER: &str = "\u{E71C}";
    pub const SORT: &str = "\u{E8CB}";
    pub const SELECT: &str = "\u{E73A}";
    pub const MONTAGE: &str = "\u{E8A9}";
    pub const DISPLAY: &str = "\u{E7F4}";
    pub const BOOKMARK: &str = "\u{E718}";
    pub const CLIP_EDIT: &str = "\u{E8C6}";
    pub const WARNING: &str = "\u{E7BA}";
    pub const PAUSE: &str = "\u{E769}";
    pub const PREVIOUS: &str = "\u{E892}";
    pub const VOLUME: &str = "\u{E767}";
    pub const MUTE: &str = "\u{E74F}";
    pub const FULLSCREEN: &str = "\u{E740}";
    pub const UNDO: &str = "\u{E7A7}";
    pub const REDO: &str = "\u{E7A6}";
    pub const COPY: &str = "\u{E8C8}";
    pub const ZOOM_IN: &str = "\u{E8A3}";
    pub const ZOOM_OUT: &str = "\u{E71F}";
    pub const MUSIC: &str = "\u{E8D6}";
    pub const INSPECTOR: &str = "\u{E89F}";
    pub const ADD: &str = "\u{E710}";
}

pub fn focus_ring(ui: &Ui, response: &Response, radius: u8) {
    if response.has_focus() {
        ui.painter().rect_stroke(
            response.rect.expand(2.0),
            CornerRadius::same(radius + 2),
            Stroke::new(2.0, ACCENT_HOVER),
            StrokeKind::Outside,
        );
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Primary,
    Secondary,
    Ghost,
    Danger,
}

/// Text button with an optional leading icon.
pub fn button(ui: &mut Ui, kind: Kind, glyph: Option<&str>, text: &str, enabled: bool) -> Response {
    let font = font(13.0);
    let strong_font = font_strong(13.0);
    let text_font = if kind == Kind::Primary { strong_font } else { font };
    let galley = ui.painter().layout_no_wrap(text.to_string(), text_font, TEXT);
    let icon_w = if glyph.is_some() { 22.0 } else { 0.0 };
    let pad = if kind == Kind::Primary { 16.0 } else { 12.0 };
    let size = vec2((galley.size().x + icon_w + pad * 2.0).max(32.0), 30.0);
    let sense = if enabled { Sense::click() } else { Sense::hover() };
    let (rect, response) = ui.allocate_exact_size(size, sense);
    let label = text.to_string();
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Button, enabled, &label));
    if ui.is_rect_visible(rect) {
        let hovered = enabled && response.hovered();
        let pressed = enabled && response.is_pointer_button_down_on();
        let (fill, fg) = match kind {
            Kind::Primary if !enabled => (INTERACTIVE, TEXT_MUTED),
            Kind::Primary => (if hovered || pressed { ACCENT_HOVER } else { ACCENT }, Color32::WHITE),
            Kind::Secondary => (if !enabled { SURFACE_2 } else if hovered { HOVER } else { INTERACTIVE }, if enabled { TEXT } else { TEXT_MUTED }),
            Kind::Ghost => (if hovered { INTERACTIVE } else { Color32::TRANSPARENT }, if enabled { TEXT_SECONDARY } else { TEXT_MUTED }),
            Kind::Danger => (if hovered { hex_mix(DANGER, 0.85) } else { hex_mix(DANGER, 0.7) }, Color32::WHITE),
        };
        let p = ui.painter();
        p.rect_filled(rect, CornerRadius::same(R_CONTROL), fill);
        let mut x = rect.left() + pad;
        if let Some(g) = glyph {
            p.text(pos2(x + 7.0, rect.center().y), Align2::CENTER_CENTER, g, font_icon(14.0), fg);
            x += icon_w;
        }
        p.galley(pos2(x, rect.center().y - galley.size().y / 2.0), galley, fg);
        focus_ring(ui, &response, R_CONTROL);
    }
    response
}

fn hex_mix(c: Color32, f: f32) -> Color32 {
    Color32::from_rgb((c.r() as f32 * f) as u8, (c.g() as f32 * f) as u8, (c.b() as f32 * f) as u8)
}

/// Square icon-only button. `name` is the accessible name and tooltip.
pub fn icon_button(ui: &mut Ui, glyph: &str, name: &str, active: bool) -> Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(30.0), Sense::click());
    let label = name.to_string();
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Button, true, &label));
    if ui.is_rect_visible(rect) {
        let fill = if active {
            HOVER
        } else if response.hovered() {
            INTERACTIVE
        } else {
            Color32::TRANSPARENT
        };
        ui.painter().rect_filled(rect, CornerRadius::same(R_CONTROL), fill);
        let fg = if active || response.hovered() { TEXT } else { TEXT_SECONDARY };
        ui.painter().text(rect.center(), Align2::CENTER_CENTER, glyph, font_icon(15.0), fg);
        focus_ring(ui, &response, R_CONTROL);
    }
    response.on_hover_text(name)
}

/// On/off switch, reported as a checkbox.
pub fn toggle(ui: &mut Ui, on: &mut bool, name: &str) -> Response {
    let (rect, mut response) = ui.allocate_exact_size(vec2(36.0, 20.0), Sense::click());
    if response.clicked() {
        *on = !*on;
        response.mark_changed();
    }
    let value = *on;
    let label = name.to_string();
    response.widget_info(|| WidgetInfo::selected(WidgetType::Checkbox, true, value, &label));
    if ui.is_rect_visible(rect) {
        let t = ui.ctx().animate_bool_responsive(response.id, *on);
        let off_fill = if response.hovered() { HOVER } else { INTERACTIVE };
        let fill = lerp_color(off_fill, ACCENT, t);
        let p = ui.painter();
        p.rect_filled(rect, CornerRadius::same(10), fill);
        let x = egui::lerp(rect.left() + 10.0..=rect.right() - 10.0, t);
        p.circle_filled(pos2(x, rect.center().y), 7.0, if *on { Color32::WHITE } else { TEXT_SECONDARY });
        if response.has_focus() {
            p.rect_stroke(rect.expand(2.0), CornerRadius::same(12), Stroke::new(2.0, ACCENT_HOVER), StrokeKind::Outside);
        }
    }
    response
}

fn lerp_color(a: Color32, b: Color32, t: f32) -> Color32 {
    let l = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t).round() as u8;
    Color32::from_rgb(l(a.r(), b.r()), l(a.g(), b.g()), l(a.b(), b.b()))
}

/// A few mutually exclusive options shown at once.
pub fn segmented<T: PartialEq + Copy>(ui: &mut Ui, value: &mut T, options: &[(T, &str)], name: &str) -> bool {
    let font = font(12.5);
    let widths: Vec<f32> =
        options.iter().map(|(_, l)| ui.painter().layout_no_wrap(l.to_string(), font.clone(), TEXT).size().x + 22.0).collect();
    let total = widths.iter().sum::<f32>() + 4.0;
    let (outer, _) = ui.allocate_exact_size(vec2(total, 30.0), Sense::hover());
    ui.painter().rect_filled(outer, CornerRadius::same(R_CONTROL + 1), SURFACE_2);
    let mut changed = false;
    let mut x = outer.left() + 2.0;
    for ((v, label), w) in options.iter().zip(widths) {
        let rect = Rect::from_min_size(pos2(x, outer.top() + 2.0), vec2(w, outer.height() - 4.0));
        x += w;
        let id = ui.id().with((name, label));
        let response = ui.interact(rect, id, Sense::click());
        let selected = *value == *v;
        let text = format!("{name}: {label}");
        response.widget_info(|| WidgetInfo::selected(WidgetType::RadioButton, true, selected, &text));
        if response.clicked() && !selected {
            *value = *v;
            changed = true;
        }
        let fill = if selected {
            HOVER
        } else if response.hovered() {
            INTERACTIVE
        } else {
            Color32::TRANSPARENT
        };
        ui.painter().rect_filled(rect, CornerRadius::same(R_CONTROL), fill);
        let fg = if selected { TEXT } else { TEXT_DESCRIPTION };
        ui.painter().text(rect.center(), Align2::CENTER_CENTER, *label, font.clone(), fg);
        focus_ring(ui, &response, R_CONTROL);
    }
    changed
}

/// "Ctrl+Shift+F10" drawn as keycaps.
pub fn keycaps(ui: &mut Ui, shortcut: &str, dim: bool) -> Response {
    let font = font(11.5);
    let parts: Vec<&str> = shortcut.split('+').filter(|p| !p.is_empty()).collect();
    let galleys: Vec<_> = parts
        .iter()
        .map(|p| ui.painter().layout_no_wrap(p.to_string(), font.clone(), if dim { TEXT_DESCRIPTION } else { TEXT_SECONDARY }))
        .collect();
    let gap = 3.0;
    let widths: Vec<f32> = galleys.iter().map(|g| (g.size().x + 10.0).max(20.0)).collect();
    let total = widths.iter().sum::<f32>() + gap * (widths.len().saturating_sub(1)) as f32;
    let (rect, response) = ui.allocate_exact_size(vec2(total, 22.0), Sense::hover());
    let label = shortcut.to_string();
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Label, true, &label));
    let mut x = rect.left();
    for (g, w) in galleys.into_iter().zip(widths) {
        let cap = Rect::from_min_size(pos2(x, rect.top() + 1.0), vec2(w, 20.0));
        let p = ui.painter();
        p.rect_filled(cap, CornerRadius::same(R_CONTROL), SURFACE_2);
        // A slightly darker bottom edge reads as a key without a heavy outline.
        p.hline(cap.x_range().shrink(2.0), cap.bottom() - 0.5, Stroke::new(1.0, BORDER_STRONG));
        p.galley(cap.center() - g.size() / 2.0 - vec2(0.0, 0.5), g, TEXT_SECONDARY);
        x += w + gap;
    }
    response
}

/// Thin horizontal level meter (0..=1), perceptual scale.
pub fn level_bar(ui: &Ui, rect: Rect, level: f32, color: Color32) {
    let p = ui.painter();
    p.rect_filled(rect, CornerRadius::same(2), INTERACTIVE);
    let shown = level.clamp(0.0, 1.0).sqrt();
    if shown > 0.01 {
        let mut fill = rect;
        fill.set_width((rect.width() * shown).max(2.0));
        p.rect_filled(fill, CornerRadius::same(2), color);
    }
}

pub fn status_dot(ui: &Ui, center: egui::Pos2, color: Color32) {
    ui.painter().circle_filled(center, 4.0, color);
}

/// Select menu with the Fluent chevron instead of egui's triangle.
pub fn combo(id: &str, text: impl Into<egui::WidgetText>, width: f32) -> egui::ComboBox {
    egui::ComboBox::from_id_salt(id).selected_text(text).width(width).icon(|ui, rect, _visuals, open| {
        let c = if open { TEXT } else { TEXT_DESCRIPTION };
        ui.painter().text(rect.center(), Align2::CENTER_CENTER, icon::CHEVRON_DOWN, font_icon(10.0), c);
    })
}

/// A thin fader: rail, fill in `color`, round knob. `value` is 0..=1.
/// Drag or click to set; arrow keys step 1%, Shift steps 10%.
pub fn fader(ui: &mut Ui, value: &mut f32, color: Color32, width: f32, name: &str) -> Response {
    let (rect, mut response) = ui.allocate_exact_size(vec2(width, 18.0), Sense::click_and_drag());
    let rail = Rect::from_center_size(rect.center(), vec2(rect.width() - 14.0, 4.0));
    if let Some(p) = response.interact_pointer_pos()
        && (response.dragged() || response.clicked())
    {
        let v = ((p.x - rail.left()) / rail.width()).clamp(0.0, 1.0);
        if (v - *value).abs() > f32::EPSILON {
            *value = v;
            response.mark_changed();
        }
    }
    if response.has_focus() {
        let (l, r, shift) = ui.input(|i| (i.key_pressed(egui::Key::ArrowLeft), i.key_pressed(egui::Key::ArrowRight), i.modifiers.shift));
        let step = if shift { 0.1 } else { 0.01 };
        if l || r {
            *value = (*value + if r { step } else { -step }).clamp(0.0, 1.0);
            response.mark_changed();
        }
    }
    let v = *value;
    let label = format!("{name}: {:.0}%", v * 100.0);
    response.widget_info(|| WidgetInfo::slider(true, v as f64, &label));
    if ui.is_rect_visible(rect) {
        let p = ui.painter();
        p.rect_filled(rail, CornerRadius::same(2), INTERACTIVE);
        let mut fill = rail;
        fill.set_width(rail.width() * v);
        p.rect_filled(fill, CornerRadius::same(2), color);
        let knob = pos2(rail.left() + rail.width() * v, rail.center().y);
        let r = if response.hovered() || response.dragged() { 7.5 } else { 6.5 };
        p.circle_filled(knob, r, Color32::WHITE);
        p.circle_stroke(knob, r, Stroke::new(1.0, color));
        if response.has_focus() {
            p.circle_stroke(knob, r + 3.0, Stroke::new(2.0, ACCENT_HOVER));
        }
    }
    response
}
