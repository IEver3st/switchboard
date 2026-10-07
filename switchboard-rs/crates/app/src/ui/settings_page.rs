//! Settings: a centered column of grouped sections. Every control writes
//! through the service; the page shows what the service confirmed.

use std::str::FromStr;

use egui::{Align, Align2, CornerRadius, Frame, Layout, Margin, Rect, RichText, ScrollArea, Sense, Ui, UiBuilder, pos2, vec2};
use switchboard_autocapture::{AutoCaptureSettings, Sensitivity};
use switchboard_capture::{AudioDevice, Quality, TrackKind};

use super::library::{bytes_label, duration_label};
use super::theme::*;
use super::widgets::{Kind, button, combo, fader, icon, icon_button, keycaps, segmented, toggle};
use super::{App, Page, pick_folder, shortcut_text};
use crate::auto::{AutoStatus, ProviderRow};
use crate::protocol::{ReplayState, Request, ServiceState};
use crate::settings::Settings;
use crate::shell;

const COLUMN: f32 = 720.0;
const CONTROL_W: f32 = 340.0;

const LENGTHS: [(u32, &str); 7] = [
    (15, "15 seconds"),
    (30, "30 seconds"),
    (60, "1 minute"),
    (120, "2 minutes"),
    (180, "3 minutes"),
    (300, "5 minutes"),
    (600, "10 minutes"),
];

/// Left offset and width of the centered column.
fn column(ui: &Ui) -> (f32, f32) {
    let avail = ui.available_width();
    let w = (avail - GUTTER * 2.0).min(COLUMN);
    ((avail - w) / 2.0, w)
}

/// A titled group: heading, optional note, then rows on one quiet surface.
fn section(ui: &mut Ui, title: &str, note: &str, rows: impl FnOnce(&mut Ui)) {
    ui.add_space(22.0);
    ui.label(RichText::new(title).font(font_strong(14.0)).color(TEXT));
    if !note.is_empty() {
        ui.add_space(1.0);
        ui.label(RichText::new(note).font(font(12.0)).color(TEXT_MUTED));
    }
    ui.add_space(8.0);
    Frame::new()
        .fill(SURFACE_1)
        .corner_radius(CornerRadius::same(R_OVERLAY))
        .inner_margin(Margin::symmetric(16, 4))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            rows(ui);
        });
}

/// One setting: title and description left, control right-aligned.
fn row(ui: &mut Ui, title: &str, description: &str, warning: Option<&str>, control: impl FnOnce(&mut Ui)) {
    let width = ui.available_width();
    let top = ui.cursor().min + vec2(0.0, 10.0);
    let text_w = width - CONTROL_W - 20.0;
    let text = ui
        .scope_builder(
            UiBuilder::new().max_rect(Rect::from_min_size(top, vec2(text_w, 400.0))).layout(Layout::top_down(Align::Min)),
            |ui| {
                ui.spacing_mut().item_spacing.y = 2.0;
                ui.label(RichText::new(title).font(font(13.0)).color(TEXT));
                if !description.is_empty() {
                    ui.label(RichText::new(description).font(font(12.0)).color(TEXT_DESCRIPTION));
                }
                if let Some(w) = warning {
                    ui.label(RichText::new(w).font(font(12.0)).color(DANGER));
                }
            },
        )
        .response
        .rect;
    let height = text.height().max(32.0);
    let control_rect = Rect::from_min_size(pos2(top.x + width - CONTROL_W, top.y), vec2(CONTROL_W, height));
    ui.scope_builder(UiBuilder::new().max_rect(control_rect).layout(Layout::right_to_left(Align::Center)), control);
    ui.advance_cursor_after_rect(Rect::from_min_size(top, vec2(width, height + 10.0)));
}

/// Seconds menu, e.g. "20 s before".
fn seconds_combo(ui: &mut Ui, id: &str, value: &mut u32, options: &[u32], suffix: &str) {
    combo(id, format!("{} s {suffix}", *value), 112.0).show_ui(ui, |ui| {
        for &v in options {
            ui.selectable_value(value, v, format!("{v} s {suffix}"));
        }
    });
}

/// What a game's integration is doing, in plain words.
fn provider_text(p: &ProviderRow, active: Option<&str>) -> String {
    let mut text = if p.support == "unavailable" {
        p.reason.clone().unwrap_or_else(|| "No safe way to read events from this game yet.".into())
    } else if p.availability == "setup-required" {
        p.reason.clone().unwrap_or_else(|| "Needs a one-time setup.".into())
    } else if p.availability == "unavailable" {
        p.reason.clone().unwrap_or_else(|| "Not found on this PC.".into())
    } else {
        match p.status.as_str() {
            "listening" if active == Some(p.game_id.as_str()) => "Running. Listening for events.".to_string(),
            "listening" | "starting" => "Listening for events.".to_string(),
            "degraded" | "error" => p.message.clone().unwrap_or_else(|| "Not receiving events.".into()),
            _ => "Starts when the game does.".to_string(),
        }
    };
    if p.support == "experimental" {
        text.push_str(" Experimental: not every event is confirmed in retail builds.");
    }
    text
}

fn quality_label(q: Quality) -> &'static str {
    match q {
        Quality::Standard => "Standard",
        Quality::High => "High",
        Quality::Ultra => "Ultra",
    }
}

fn device_label(devices: &[AudioDevice], id: &Option<String>, none_label: &str) -> String {
    match id {
        None => none_label.to_string(),
        Some(id) => match devices.iter().find(|d| &d.id == id) {
            Some(d) if d.is_default => format!("{} (default)", d.name),
            Some(d) => d.name.clone(),
            None => "Disconnected device".to_string(),
        },
    }
}

/// Device menu: the app-level choice first, then each device.
fn device_combo(ui: &mut Ui, id: &str, value: &mut Option<String>, devices: &[AudioDevice], none_label: &str, enabled: bool) {
    let current = device_label(devices, value, none_label);
    ui.add_enabled_ui(enabled, |ui| {
        combo(id, current, 220.0).show_ui(ui, |ui| {
            ui.set_min_width(260.0);
            ui.selectable_value(value, None, none_label);
            ui.separator();
            if devices.is_empty() {
                ui.label(RichText::new("No other devices found").font(font(12.5)).color(TEXT_MUTED));
            }
            for d in devices {
                let label = if d.is_default { format!("{} (default)", d.name) } else { d.name.clone() };
                ui.selectable_value(value, Some(d.id.clone()), label);
            }
        });
    });
}

impl App {
    pub(super) fn open_settings(&mut self) {
        self.page = Page::Settings;
        self.popover = false;
        self.link.send(Request::RefreshDevices);
    }

    pub(super) fn settings_page(&mut self, ui: &mut Ui) {
        // Fixed header, aligned with the centered column.
        let (x, w) = column(ui);
        let header = ui.allocate_space(vec2(ui.available_width(), 52.0)).1;
        let head = Rect::from_min_size(header.min + vec2(x - 8.0, 7.0), vec2(w + 8.0, 34.0));
        ui.scope_builder(UiBuilder::new().max_rect(head).layout(Layout::left_to_right(Align::Center)), |ui| {
            if icon_button(ui, icon::BACK, "Back to clips (Esc)", false).clicked() {
                self.page = Page::Clips;
                self.recording_hotkey = false;
            }
            ui.label(RichText::new("Settings").font(font_strong(20.0)).color(TEXT));
        });

        let Some(mut s) = self.draft.clone() else {
            ui.add_space(20.0);
            ui.vertical_centered(|ui| {
                ui.label(
                    RichText::new("Settings are available while Switchboard runs in the background.")
                        .font(font(13.0))
                        .color(TEXT_DESCRIPTION),
                );
                ui.add_space(10.0);
                if button(ui, Kind::Primary, None, "Start Switchboard", true).clicked() {
                    self.start_service();
                }
            });
            return;
        };
        let before = s.clone();
        let state = self.state.clone();
        ScrollArea::vertical().id_salt("settings").auto_shrink([false, false]).show(ui, |ui| {
            let (x, w) = column(ui);
            let top = ui.cursor().min + vec2(x, 0.0);
            // scope_builder reserves the content's height in the scroll area.
            ui.scope_builder(
                UiBuilder::new().max_rect(Rect::from_min_size(top, vec2(w, f32::INFINITY))).layout(Layout::top_down(Align::Min)),
                |ui| {
                    ui.set_width(w);
                    self.stale_service_strip(ui);
                    self.settings_sections(ui, &mut s, &before, state.as_deref());
                    ui.add_space(40.0);
                },
            );
        });
        if s != before {
            self.apply(s);
        }
    }

    fn settings_sections(&mut self, ui: &mut Ui, s: &mut Settings, before: &Settings, state: Option<&ServiceState>) {
        let track_error = |kind: TrackKind| -> Option<String> {
            state?.status.as_ref()?.tracks.iter().find(|t| t.kind == kind)?.error.clone()
        };

        section(ui, "Instant Replay", "", |ui| {
            row(ui, "Instant Replay", "Keeps recent gameplay ready to save, using your graphics card's video encoder.", None, |ui| {
                toggle(ui, &mut s.replay_enabled, "Instant Replay");
            });
            row(ui, "Clip length", "How much is saved when you press the shortcut.", None, |ui| {
                let current = LENGTHS
                    .iter()
                    .find(|l| l.0 == s.replay_seconds)
                    .map(|l| l.1.to_string())
                    .unwrap_or_else(|| duration_label(s.replay_seconds as f64));
                combo("length", current, 150.0).show_ui(ui, |ui| {
                    for (v, label) in LENGTHS {
                        ui.selectable_value(&mut s.replay_seconds, v, label);
                    }
                });
            });
            let hotkey_error = state.and_then(|st| st.hotkey_error.clone()).map(|e| format!("Unavailable: {e}"));
            let warn = self.hotkey_hint.clone().or(hotkey_error);
            row(ui, "Save shortcut", "Works while games are focused.", warn.as_deref(), |ui| self.hotkey_recorder(ui, s));
            row(ui, "Saved-clip notice", "A small notice in the corner that never takes focus from your game.", None, |ui| {
                toggle(ui, &mut s.show_toast, "Saved-clip notice");
            });
        });

        section(ui, "Video", "Changing these restarts Instant Replay and clears what it has kept so far.", |ui| {
            if let Some(st) = state.filter(|st| !st.displays.is_empty()) {
                row(ui, "Display", "The screen that's recorded.", None, |ui| {
                    let current =
                        st.displays.get(s.display_index).map(|d| d.label()).unwrap_or_else(|| "Primary display".into());
                    combo("display", current, 240.0).show_ui(ui, |ui| {
                        for d in &st.displays {
                            ui.selectable_value(&mut s.display_index, d.index, d.label());
                        }
                    });
                });
            }
            row(ui, "Resolution", "Never upscaled past your display.", None, |ui| {
                segmented(ui, &mut s.resolution, &[(720, "720p"), (1080, "1080p"), (1440, "1440p"), (2160, "4K")], "Resolution");
            });
            row(ui, "Frame rate", "", None, |ui| {
                segmented(ui, &mut s.fps, &[(30, "30"), (60, "60"), (120, "120"), (144, "144")], "Frame rate");
            });
            let per_min = state.and_then(|st| st.info.as_ref()).map(|i| i.bitrate as f64 / 8.0 * 60.0);
            let quality_desc = match per_min {
                Some(b) if before.quality == s.quality => {
                    format!("About {} per minute at the current settings.", bytes_label(b as u64))
                }
                _ => "Higher quality makes larger files.".into(),
            };
            row(ui, "Quality", &quality_desc, None, |ui| {
                segmented(
                    ui,
                    &mut s.quality,
                    &[
                        (Quality::Standard, quality_label(Quality::Standard)),
                        (Quality::High, quality_label(Quality::High)),
                        (Quality::Ultra, quality_label(Quality::Ultra)),
                    ],
                    "Quality",
                );
            });
            row(ui, "Show cursor", "", None, |ui| {
                toggle(ui, &mut s.cursor, "Show cursor");
            });
        });

        let empty = Default::default();
        let devices = state.map(|st| &st.audio_devices).unwrap_or(&empty);
        section(
            ui,
            "Audio tracks",
            "Each source is saved on its own track. Choose a device to record only what plays there.",
            |ui| {
                let game_desc = match (&s.game_device, s.chat_audio && s.chat_device.is_none()) {
                    (None, true) => "Every app except Discord.",
                    (None, false) => "Every app.",
                    (Some(_), _) => "Everything that plays on this device.",
                };
                let err = track_error(TrackKind::Game);
                row(ui, "Game", game_desc, err.as_deref(), |ui| {
                    toggle(ui, &mut s.game_audio, "Game audio");
                    ui.add_space(10.0);
                    device_combo(ui, "game-device", &mut s.game_device, &devices.outputs, "All apps", s.game_audio);
                });
                let chat_desc = match (&s.chat_device, state.and_then(|st| st.info.as_ref())) {
                    (Some(_), _) => "Everything that plays on this device.".to_string(),
                    (None, Some(i)) if s.chat_audio => match &i.chat_app {
                        Some(app) => format!("{app} is on its own track."),
                        None => "Discord wasn't running when replay started. Turn replay off and on to add it.".into(),
                    },
                    _ => "The Discord app, on its own track.".into(),
                };
                let err = track_error(TrackKind::Chat);
                row(ui, "Chat", &chat_desc, err.as_deref(), |ui| {
                    toggle(ui, &mut s.chat_audio, "Chat audio");
                    ui.add_space(10.0);
                    device_combo(ui, "chat-device", &mut s.chat_device, &devices.outputs, "Discord app", s.chat_audio);
                });
                let mic_desc =
                    if s.mic_device.is_none() { "Follows the Windows default microphone." } else { "Always this microphone." };
                let err = track_error(TrackKind::Microphone);
                row(ui, "Microphone", mic_desc, err.as_deref(), |ui| {
                    toggle(ui, &mut s.microphone, "Microphone");
                    ui.add_space(10.0);
                    device_combo(ui, "mic-device", &mut s.mic_device, &devices.inputs, "Windows default", s.microphone);
                });
            },
        );

        section(ui, "Editing", "", |ui| {
            row(ui, "Starting levels", "Track volumes a new edit or montage starts with.", None, |ui| {
                for (i, name, color) in [(2, "Microphone", MIC), (1, "Chat", CHAT), (0, "Game", GAME)] {
                    ui.allocate_ui_with_layout(vec2(104.0, 36.0), Layout::top_down(Align::Min), |ui| {
                        ui.spacing_mut().item_spacing.y = 2.0;
                        let level = s.default_levels[i];
                        ui.label(RichText::new(format!("{name} {level}%")).font(font(11.5)).color(TEXT_DESCRIPTION));
                        let mut v = level as f32 / 100.0;
                        if fader(ui, &mut v, color, 100.0, name).changed() {
                            s.default_levels[i] = (v * 100.0).round() as u8;
                        }
                    });
                }
            });
        });

        let auto = state.and_then(|st| st.auto.as_ref());
        let (mic_on, replay_on) = (s.microphone, s.replay_enabled);
        self.auto_capture_section(ui, &mut s.auto_capture, auto, mic_on, replay_on);

        let dir = s.clips_dir();
        let count = self.lib.clips.len();
        section(ui, "Storage", "", |ui| {
            let desc = format!(
                "{}\n{} {} \u{b7} {}",
                dir.display(),
                count,
                if count == 1 { "clip" } else { "clips" },
                bytes_label(self.lib.total_bytes)
            );
            row(ui, "Clips folder", &desc, None, |ui| {
                let picking = self.folder_pick.is_some();
                let label = if picking { "Choosing\u{2026}" } else { "Change\u{2026}" };
                if button(ui, Kind::Secondary, None, label, !picking).clicked() {
                    self.folder_pick = Some(pick_folder());
                }
                if button(ui, Kind::Ghost, Some(icon::FOLDER), "Open", true).clicked() {
                    shell::open_folder(&dir);
                }
            });
        });

        let update = state.map(|st| st.update.clone()).unwrap_or_default();
        section(ui, "Updates", "", |ui| {
            use crate::update::UpdatePhase as P;
            let current = if update.current.is_empty() { crate::update::CURRENT.to_string() } else { update.current.clone() };
            let (desc, warn) = match &update.phase {
                P::Checking => ("Checking for updates\u{2026}".to_string(), None),
                P::Downloading { version, fraction } => (format!("Downloading {version}\u{2026} {:.0}%", fraction * 100.0), None),
                P::Ready { version } => (format!("Version {version} is downloaded. It installs when Switchboard restarts."), None),
                P::UpToDate => ("You have the latest version.".to_string(), None),
                P::Failed { message } => (String::new(), Some(format!("Couldn't update: {message}"))),
                P::Idle if s.auto_update => ("Checks for new versions in the background.".to_string(), None),
                P::Idle => ("Automatic updates are off.".to_string(), None),
            };
            row(ui, &format!("Version {current}"), &desc, warn.as_deref(), |ui| match &update.phase {
                P::Ready { .. } => {
                    if button(ui, Kind::Primary, None, "Restart to update", true).clicked() {
                        self.link.send(Request::InstallUpdate);
                    }
                }
                P::Checking | P::Downloading { .. } => {
                    button(ui, Kind::Secondary, None, "Check now", false);
                }
                _ => {
                    if button(ui, Kind::Secondary, None, "Check now", true).clicked() {
                        self.link.send(Request::CheckForUpdates);
                    }
                }
            });
            row(
                ui,
                "Automatic updates",
                "Downloads new versions in the background. They install the next time Switchboard starts.",
                None,
                |ui| {
                    toggle(ui, &mut s.auto_update, "Automatic updates");
                },
            );
        });

        section(ui, "General", "", |ui| {
            row(ui, "Start with Windows", "Starts in the tray when you sign in.", None, |ui| {
                toggle(ui, &mut s.start_with_windows, "Start with Windows");
            });
            row(ui, "Quit Switchboard", "Stops Instant Replay and removes the tray icon.", None, |ui| {
                if button(ui, Kind::Secondary, None, "Quit", true).clicked() {
                    self.link.send(Request::Quit);
                }
            });
        });

        self.diagnostics(ui);
    }

    fn auto_capture_section(&mut self, ui: &mut Ui, a: &mut AutoCaptureSettings, status: Option<&AutoStatus>, mic_on: bool, replay_on: bool) {
        let note = if replay_on {
            "Saves clips from Instant Replay without the shortcut."
        } else {
            "Saves clips from Instant Replay without the shortcut. Turn on Instant Replay to use it."
        };
        section(ui, "Auto Capture", note, |ui| {
            row(ui, "Game events", "Saves a clip when a supported game reports a kill, a round win or another highlight.", None, |ui| {
                toggle(ui, &mut a.enabled, "Game events");
            });
            if a.enabled {
                row(ui, "Clip timing", "Kept before and after each event.", None, |ui| {
                    seconds_combo(ui, "auto-post", &mut a.post_roll_seconds, &[0, 5, 10, 15, 20, 30, 45, 60], "after");
                    ui.add_space(8.0);
                    seconds_combo(ui, "auto-pre", &mut a.pre_roll_seconds, &[5, 10, 15, 20, 30, 45, 60, 90, 120], "before");
                });
                let merge_desc = format!("Events less than {} s apart are saved as one clip.", a.merge_threshold_seconds);
                row(ui, "Combine nearby events", &merge_desc, None, |ui| {
                    toggle(ui, &mut a.merge_nearby_events, "Combine nearby events");
                    if a.merge_nearby_events {
                        ui.add_space(8.0);
                        seconds_combo(ui, "auto-merge", &mut a.merge_threshold_seconds, &[5, 10, 15, 20, 30, 45, 60], "apart");
                    }
                });
                row(ui, "Notify when saved", "Shows the saved-clip notice for Auto Capture clips.", None, |ui| {
                    toggle(ui, &mut a.notify_when_saved, "Notify when saved");
                });
                match status {
                    None if !replay_on => row(ui, "Games", "Supported games show here while Instant Replay is on.", None, |_| {}),
                    None => row(ui, "Games", "Checking for supported games\u{2026}", None, |_| {}),
                    Some(st) => {
                        for p in &st.providers {
                            self.game_row(ui, a, p, st.active_game.as_deref());
                        }
                    }
                }
            }

            let r = &mut a.reaction_clipping;
            let warn = (r.enabled && !mic_on).then_some("Turn on the Microphone track to use this.");
            row(ui, "Reactions", "Saves a clip when you shout or laugh into your microphone.", warn, |ui| {
                toggle(ui, &mut r.enabled, "Reactions");
            });
            if r.enabled {
                row(ui, "Sensitivity", "Higher catches quieter reactions, and more false ones.", None, |ui| {
                    segmented(
                        ui,
                        &mut r.sensitivity,
                        &[(Sensitivity::Low, "Low"), (Sensitivity::Balanced, "Balanced"), (Sensitivity::High, "High")],
                        "Sensitivity",
                    );
                });
                row(ui, "Reaction timing", "Kept before and after each reaction.", None, |ui| {
                    seconds_combo(ui, "react-post", &mut r.post_roll_seconds, &[0, 5, 10, 15, 20, 30], "after");
                    ui.add_space(8.0);
                    seconds_combo(ui, "react-pre", &mut r.pre_roll_seconds, &[5, 10, 15, 20, 30, 45, 60], "before");
                });
                row(ui, "Cooldown", "Waits this long before saving another reaction.", None, |ui| {
                    seconds_combo(ui, "react-cooldown", &mut r.cooldown_seconds, &[5, 10, 15, 30, 45, 60, 90, 120], "wait");
                });
            }
        });
    }

    /// One supported game: status, on/off, setup, and which events save clips.
    fn game_row(&mut self, ui: &mut Ui, a: &mut AutoCaptureSettings, p: &ProviderRow, active: Option<&str>) {
        let usable = p.support != "unavailable";
        let mut on = a.game(&p.game_id).map(|g| g.enabled).unwrap_or(true);
        let before = on;
        row(ui, &p.name, &provider_text(p, active), None, |ui| {
            if !usable {
                return;
            }
            toggle(ui, &mut on, &p.name);
            if p.availability == "setup-required" {
                ui.add_space(8.0);
                if button(ui, Kind::Secondary, None, "Set up", true).clicked() {
                    self.link.send(Request::SetupProvider { id: p.id.clone() });
                }
            }
        });
        if on != before {
            a.games.entry(p.game_id.clone()).or_default().enabled = on;
        }
        if !(usable && on) || p.events.is_empty() {
            return;
        }
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing = vec2(6.0, 6.0);
            for &e in &p.events {
                let enabled = a.game(&p.game_id).map(|g| g.event_enabled(e)).unwrap_or(e.enabled_by_default());
                let chip = ui.add(
                    egui::Button::selectable(enabled, RichText::new(e.settings_label()).font(font(12.0)))
                        .frame_when_inactive(true)
                        .stroke(if enabled { egui::Stroke::NONE } else { egui::Stroke::new(1.0, BORDER_STRONG) }),
                );
                if chip.clicked() {
                    a.games.entry(p.game_id.clone()).or_default().events.insert(e, !enabled);
                }
            }
        });
        ui.add_space(10.0);
    }

    fn diagnostics(&mut self, ui: &mut Ui) {
        ui.add_space(22.0);
        let id = ui.make_persistent_id("diagnostics-open");
        let open = ui.data(|d| d.get_temp::<bool>(id).unwrap_or(false));
        let (rect, r) = ui.allocate_exact_size(vec2(ui.available_width(), 26.0), Sense::click());
        r.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::CollapsingHeader, true, open, "Diagnostics"));
        let p = ui.painter();
        let chevron = if open { icon::CHEVRON_DOWN } else { "\u{E76C}" };
        p.text(pos2(rect.left() + 6.0, rect.center().y), Align2::CENTER_CENTER, chevron, font_icon(10.0), TEXT_DESCRIPTION);
        p.text(
            pos2(rect.left() + 20.0, rect.center().y),
            Align2::LEFT_CENTER,
            "Diagnostics",
            font_strong(14.0),
            if r.hovered() { TEXT } else { TEXT_SECONDARY },
        );
        super::widgets::focus_ring(ui, &r, R_CONTROL);
        if r.clicked() {
            ui.data_mut(|d| d.insert_temp(id, !open));
        }
        if !open {
            return;
        }
        let Some(st) = self.state.clone() else { return };
        let mut rows: Vec<(&str, String)> = Vec::new();
        rows.push((
            "Replay",
            match &st.replay {
                ReplayState::Off => "off".into(),
                ReplayState::Starting => "starting".into(),
                ReplayState::Running => "running".into(),
                ReplayState::Failed { message } => format!("failed: {message}"),
            },
        ));
        if let Some(i) = &st.info {
            rows.push(("Encoder", format!("{} on {}", i.encoder, i.adapter)));
            rows.push((
                "Output",
                format!("{}\u{d7}{} \u{b7} {} fps \u{b7} {:.1} Mbps", i.width, i.height, i.fps, i.bitrate as f64 / 1e6),
            ));
            rows.push(("Display", i.display.clone()));
        }
        if let Some(s) = &st.status {
            rows.push(("Frames", format!("{} encoded \u{b7} {} skipped", s.frames_encoded, s.frames_skipped)));
            rows.push(("Replay cache", bytes_label(s.cache_bytes)));
            for t in &s.tracks {
                let v = match &t.error {
                    Some(e) => format!("error: {e}"),
                    None => format!("level {:.2}", t.level),
                };
                rows.push((t.kind.label(), v));
            }
        }
        rows.push(("Background memory", format!("{:.0} MB private", st.service_memory as f64 / 1e6)));
        rows.push(("Window memory", format!("{:.0} MB private", self.ui_memory.0 as f64 / 1e6)));
        ui.add_space(6.0);
        Frame::new().fill(SURFACE_1).corner_radius(CornerRadius::same(R_OVERLAY)).inner_margin(Margin::same(16)).show(ui, |ui| {
            ui.set_width(ui.available_width());
            egui::Grid::new("diagnostics").num_columns(2).spacing([28.0, 0.0]).min_row_height(24.0).show(ui, |ui| {
                for (k, v) in rows {
                    ui.label(RichText::new(k).font(font(12.5)).color(TEXT_DESCRIPTION));
                    ui.label(RichText::new(v).font(font_mono(12.0)).color(TEXT_SECONDARY));
                    ui.end_row();
                }
            });
        });
    }

    fn hotkey_recorder(&mut self, ui: &mut Ui, s: &mut Settings) {
        if self.recording_hotkey {
            let captured = ui.input(|i| {
                i.events.iter().find_map(|e| match e {
                    egui::Event::Key { key, pressed: true, modifiers, .. } => Some((*key, *modifiers)),
                    _ => None,
                })
            });
            let r = button(ui, Kind::Secondary, None, "Press a shortcut\u{2026}", true);
            ui.painter().rect_stroke(
                r.rect,
                CornerRadius::same(R_CONTROL),
                egui::Stroke::new(1.0, ACCENT),
                egui::StrokeKind::Inside,
            );
            if let Some((key, m)) = captured {
                if key == egui::Key::Escape {
                    self.recording_hotkey = false;
                    self.hotkey_hint = None;
                } else if let Some(text) = shortcut_text(key, m) {
                    if global_hotkey::hotkey::HotKey::from_str(&text).is_ok() {
                        s.hotkey = text;
                        self.recording_hotkey = false;
                        self.hotkey_hint = None;
                    } else {
                        self.hotkey_hint = Some(format!("{text} can't be used as a global shortcut."));
                    }
                } else if !matches!(key, egui::Key::Tab) {
                    self.hotkey_hint = Some("Use a function key, or a key with Ctrl, Alt or Shift.".into());
                }
            }
            if r.clicked_elsewhere() {
                self.recording_hotkey = false;
                self.hotkey_hint = None;
            }
        } else {
            if button(ui, Kind::Ghost, None, "Change", true).clicked() {
                self.recording_hotkey = true;
            }
            keycaps(ui, &s.hotkey, false);
        }
    }
}
