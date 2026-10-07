//! Switchboard tokens (DESIGN.md) and type, applied to egui.
//!
//! Fonts come from the system at runtime: Segoe UI (what the Electron build
//! actually renders), Cascadia Mono for technical values, and Segoe Fluent
//! Icons (or MDL2 on Windows 10) for icons. Nothing is embedded; egui's
//! bundled fonts remain as fallback.

use std::sync::Arc;

use egui::{Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Margin, Stroke, TextStyle, Visuals};

pub const BACKGROUND: Color32 = hex(0x0e1117);
pub const SURFACE_1: Color32 = hex(0x141821);
pub const SURFACE_2: Color32 = hex(0x191e28);
pub const INTERACTIVE: Color32 = hex(0x1f2531);
pub const HOVER: Color32 = hex(0x28303e);
pub const BORDER: Color32 = hex(0x262d3a);
pub const BORDER_STRONG: Color32 = hex(0x374050);
pub const TEXT: Color32 = hex(0xf4f6fb);
pub const TEXT_SECONDARY: Color32 = hex(0xb7bfcd);
pub const TEXT_DESCRIPTION: Color32 = hex(0x8b95a7);
pub const TEXT_MUTED: Color32 = hex(0x6b7587);
pub const ACCENT: Color32 = hex(0x8f7dff);
pub const ACCENT_HOVER: Color32 = hex(0xa698ff);
pub const GAME: Color32 = hex(0x3fd1bb);
pub const CHAT: Color32 = hex(0x5f9dff);
pub const MIC: Color32 = hex(0xf5b24d);
pub const SUCCESS: Color32 = hex(0x3fd1bb);
pub const WARNING: Color32 = hex(0xf5b24d);
pub const DANGER: Color32 = hex(0xf26d6d);

/// Radii from DESIGN.md: controls 4, bounded instruments 7, overlays 8.
pub const R_CONTROL: u8 = 4;
pub const R_OVERLAY: u8 = 8;

/// Page gutter shared by the header, toolbar, library and Settings.
pub const GUTTER: f32 = 24.0;

const fn hex(v: u32) -> Color32 {
    Color32::from_rgb((v >> 16) as u8, (v >> 8) as u8, v as u8)
}

pub fn strong() -> FontFamily {
    FontFamily::Name("strong".into())
}

pub fn icons() -> FontFamily {
    FontFamily::Name("icons".into())
}

pub fn font(size: f32) -> FontId {
    FontId::new(size, FontFamily::Proportional)
}

pub fn font_strong(size: f32) -> FontId {
    FontId::new(size, strong())
}

pub fn font_mono(size: f32) -> FontId {
    FontId::new(size, FontFamily::Monospace)
}

pub fn font_icon(size: f32) -> FontId {
    FontId::new(size, icons())
}

fn system_font(names: &[&str]) -> Option<Vec<u8>> {
    let dir = std::env::var_os("WINDIR").map(std::path::PathBuf::from).unwrap_or_else(|| "C:\\Windows".into());
    names.iter().find_map(|n| std::fs::read(dir.join("Fonts").join(n)).ok())
}

fn install_fonts(ctx: &egui::Context) {
    let mut defs = FontDefinitions::default();
    let fallback_prop = defs.families.get(&FontFamily::Proportional).cloned().unwrap_or_default();
    let fallback_mono = defs.families.get(&FontFamily::Monospace).cloned().unwrap_or_default();
    let mut add = |key: &str, files: &[&str]| -> bool {
        match system_font(files) {
            Some(bytes) => {
                defs.font_data.insert(key.into(), Arc::new(FontData::from_owned(bytes)));
                true
            }
            None => false,
        }
    };
    let regular = add("segoe", &["segoeui.ttf"]);
    let semibold = add("segoe-sb", &["seguisb.ttf", "segoeuib.ttf"]);
    let mono = add("cascadia", &["CascadiaMono.ttf", "consola.ttf"]);
    let icon = add("icons", &["SegoeIcons.ttf", "segmdl2.ttf"]);

    let mut prop = Vec::new();
    if regular {
        prop.push("segoe".to_string());
    }
    prop.extend(fallback_prop.iter().cloned());
    if icon {
        prop.push("icons".into());
    }
    let mut strong_list = Vec::new();
    if semibold {
        strong_list.push("segoe-sb".to_string());
    }
    strong_list.extend(prop.iter().cloned());
    let mut mono_list = Vec::new();
    if mono {
        mono_list.push("cascadia".to_string());
    }
    mono_list.extend(fallback_mono);
    let icon_list = if icon { vec!["icons".to_string()] } else { prop.clone() };

    defs.families.insert(FontFamily::Proportional, prop);
    defs.families.insert(FontFamily::Monospace, mono_list);
    defs.families.insert(strong(), strong_list);
    defs.families.insert(icons(), icon_list);
    ctx.set_fonts(defs);
}

pub fn apply(ctx: &egui::Context) {
    install_fonts(ctx);
    ctx.send_viewport_cmd(egui::ViewportCommand::SetTheme(egui::SystemTheme::Dark));

    let mut v = Visuals::dark();
    v.panel_fill = BACKGROUND;
    v.window_fill = SURFACE_1;
    v.extreme_bg_color = SURFACE_1;
    v.faint_bg_color = SURFACE_1;
    v.code_bg_color = SURFACE_2;
    v.override_text_color = Some(TEXT_SECONDARY);
    v.hyperlink_color = ACCENT_HOVER;
    v.selection.bg_fill = ACCENT.linear_multiply(0.35);
    v.selection.stroke = Stroke::new(1.0, ACCENT_HOVER);
    v.window_stroke = Stroke::new(1.0, BORDER);
    v.window_corner_radius = CornerRadius::same(R_OVERLAY);
    v.menu_corner_radius = CornerRadius::same(R_OVERLAY);
    v.window_shadow = egui::Shadow { offset: [0, 6], blur: 18, spread: 0, color: Color32::from_black_alpha(110) };
    v.popup_shadow = v.window_shadow;
    v.text_cursor.stroke = Stroke::new(1.5, TEXT);
    let r = CornerRadius::same(R_CONTROL);
    v.widgets.noninteractive.bg_fill = SURFACE_1;
    v.widgets.noninteractive.weak_bg_fill = SURFACE_1;
    v.widgets.noninteractive.bg_stroke = Stroke::new(1.0, BORDER);
    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, TEXT_SECONDARY);
    v.widgets.noninteractive.corner_radius = r;
    v.widgets.inactive.bg_fill = INTERACTIVE;
    v.widgets.inactive.weak_bg_fill = INTERACTIVE;
    v.widgets.inactive.bg_stroke = Stroke::NONE;
    v.widgets.inactive.fg_stroke = Stroke::new(1.0, TEXT);
    v.widgets.inactive.corner_radius = r;
    v.widgets.hovered.bg_fill = HOVER;
    v.widgets.hovered.weak_bg_fill = HOVER;
    v.widgets.hovered.bg_stroke = Stroke::NONE;
    v.widgets.hovered.fg_stroke = Stroke::new(1.0, TEXT);
    v.widgets.hovered.corner_radius = r;
    v.widgets.hovered.expansion = 0.0;
    v.widgets.active.bg_fill = HOVER;
    v.widgets.active.weak_bg_fill = HOVER;
    v.widgets.active.bg_stroke = Stroke::NONE;
    v.widgets.active.fg_stroke = Stroke::new(1.0, TEXT);
    v.widgets.active.corner_radius = r;
    v.widgets.active.expansion = 0.0;
    v.widgets.open = v.widgets.active;
    ctx.set_visuals(v);

    ctx.all_styles_mut(|style| {
        style.text_styles = [
            (TextStyle::Heading, FontId::new(20.0, strong())),
            (TextStyle::Body, font(13.0)),
            (TextStyle::Button, font(13.0)),
            (TextStyle::Small, font(11.5)),
            (TextStyle::Monospace, font_mono(12.0)),
        ]
        .into();
        style.spacing.item_spacing = egui::vec2(8.0, 6.0);
        style.spacing.button_padding = egui::vec2(10.0, 5.0);
        style.spacing.interact_size.y = 30.0;
        style.spacing.menu_margin = Margin::same(6);
        style.spacing.window_margin = Margin::same(16);
        style.spacing.combo_width = 160.0;
        style.spacing.scroll.bar_width = 6.0;
        style.spacing.scroll.floating = true;
        style.interaction.selectable_labels = false;
        style.visuals.handle_shape = egui::style::HandleShape::Circle;
        style.visuals.slider_trailing_fill = true;
        style.animation_time = 0.12;
    });
}
