use std::time::{Duration, Instant};

use egui::{RichText, Ui};
use switchboard_capture::{AppChoice, AppWindow, app_windows};

use super::theme::*;
use crate::protocol::ServiceState;
use crate::settings::Settings;

const REFRESH: Duration = Duration::from_secs(2);
const NAME_MAX: usize = 32;

#[derive(Default)]
pub(super) struct Apps {
    at: Option<Instant>,
    list: Vec<AppWindow>,
}

impl Apps {
    fn list(&mut self) -> &[AppWindow] {
        if self.at.is_none_or(|t| t.elapsed() >= REFRESH) {
            self.list = app_windows();
            self.at = Some(Instant::now());
        }
        &self.list
    }
}

pub(super) fn short(name: &str) -> String {
    if name.chars().count() <= NAME_MAX {
        return name.to_string();
    }
    let cut: String = name.chars().take(NAME_MAX - 1).collect();
    format!("{}\u{2026}", cut.trim_end())
}

pub(super) fn label(s: &Settings, st: &ServiceState) -> String {
    match &s.capture_app {
        Some(app) => short(&app.name),
        None => st
            .displays
            .get(s.display_index)
            .or(st.displays.first())
            .map(|d| d.short_label())
            .unwrap_or_else(|| "Display".into()),
    }
}

pub(super) fn menu(ui: &mut Ui, s: &mut Settings, st: &ServiceState, apps: &mut Apps) {
    ui.set_min_width(260.0);
    heading(ui, "Displays");
    for d in &st.displays {
        let selected = s.capture_app.is_none() && s.display_index == d.index;
        if ui.selectable_label(selected, d.label()).clicked() {
            s.display_index = d.index;
            s.capture_app = None;
        }
    }
    ui.add_space(6.0);
    heading(ui, "One app");
    let list = apps.list().to_vec();
    if let Some(saved) = s.capture_app.clone().filter(|a| !list.iter().any(|w| w.key == a.key)) {
        let _ = ui.selectable_label(true, format!("{} (not open)", short(&saved.name)));
    }
    for w in &list {
        let selected = s.capture_app.as_ref().is_some_and(|a| a.key == w.key);
        if ui.selectable_label(selected, short(&w.title)).on_hover_text(format!("{}.exe", w.exe)).clicked() {
            s.capture_app = Some(AppChoice { key: w.key.clone(), name: w.title.clone() });
        }
    }
    if list.is_empty() && s.capture_app.is_none() {
        ui.label(RichText::new("No open apps").font(font(12.5)).color(TEXT_MUTED));
    }
}

fn heading(ui: &mut Ui, text: &str) {
    ui.label(RichText::new(text).font(font_strong(11.5)).color(TEXT_MUTED));
}
