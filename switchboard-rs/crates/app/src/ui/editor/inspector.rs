//! Inspector: Edit (trim, framing, speed and freezes, text and privacy,
//! picture and title), Audio (per-track levels, mute, trims, automation,
//! source details) and, for montages, Music.

use egui::{Align, CornerRadius, Layout, RichText, ScrollArea, Sense, Ui, vec2};
use switchboard_project::{
    AudioAsset, Ducking, FramingBackground, FramingMode, Interpolation, Music, OverlayKind, SpeedTransition, TextSize, Title,
    TitlePosition, TrackTrim, framing_at, now_ms, speed_at, uuid,
};

use super::timeline::{role_color, role_label};
use super::{Editor, Tab};
use crate::ui::App;
use crate::ui::library::{bytes_label, duration_label};
use crate::ui::theme::*;
use crate::ui::widgets::{self, Kind, button, icon, segmented, toggle};

fn heading(ui: &mut Ui, text: &str, right: &str) {
    ui.add_space(14.0);
    ui.horizontal(|ui| {
        ui.label(RichText::new(text).font(font_strong(13.0)).color(TEXT));
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.label(RichText::new(right).font(font(11.5)).color(TEXT_MUTED));
        });
    });
    ui.add_space(4.0);
}

fn seconds(ui: &mut Ui, value: &mut f64, range: std::ops::RangeInclusive<f64>) -> bool {
    let mut s = *value / 1000.0;
    let r = ui.add(egui::DragValue::new(&mut s).range((*range.start() / 1000.0)..=(*range.end() / 1000.0)).speed(0.01).fixed_decimals(3).suffix(" s"));
    if r.changed() {
        *value = s * 1000.0;
    }
    r.changed()
}

impl App {
    pub(super) fn inspector_ui(&mut self, ui: &mut Ui, ed: &mut Editor) {
        let montage = !ed.project().is_clip_edit();
        ui.horizontal(|ui| {
            ui.label(RichText::new("Inspector").font(font(11.5)).color(TEXT_MUTED));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                let sel = ed.project().segments.get(ed.state.selected).map(|s| s.duration_ms()).unwrap_or(0);
                ui.label(RichText::new(format!("{} selected", precise(sel as f64))).font(font_mono(11.0)).color(TEXT_MUTED));
            });
        });
        let seg_name = ed
            .project()
            .segments
            .get(ed.state.selected)
            .map(|s| ed.clip_titles.get(&s.clip_id).cloned().unwrap_or_else(|| s.clip_id.clone()))
            .unwrap_or_default();
        ui.add(egui::Label::new(RichText::new(seg_name).font(font_strong(13.5)).color(TEXT)).truncate());
        ui.add_space(8.0);
        let mut tabs = vec![(Tab::Edit, "Edit"), (Tab::Audio, "Audio")];
        if montage {
            tabs.push((Tab::Music, "Music"));
        }
        segmented(ui, &mut ed.tab, &tabs, "Inspector");
        ScrollArea::vertical().id_salt("inspector").auto_shrink([false, false]).show(ui, |ui| {
            ui.set_width(ui.available_width());
            // Compact controls in the narrow inspector.
            ui.spacing_mut().interact_size.y = 22.0;
            ui.spacing_mut().slider_width = 120.0;
            match ed.tab {
                Tab::Edit => edit_tab(ui, ed),
                Tab::Audio => audio_tab(ui, ed),
                Tab::Music => self.music_tab(ui, ed),
            }
            ui.add_space(20.0);
        });
    }

    fn music_tab(&mut self, ui: &mut Ui, ed: &mut Editor) {
        heading(ui, "Music", "");
        let Some(music) = ed.project().music.clone() else {
            ui.label(RichText::new("Add a song or sound under the whole montage.").font(font(12.5)).color(TEXT_DESCRIPTION));
            ui.add_space(8.0);
            if button(ui, Kind::Secondary, Some(icon::MUSIC), "Import music\u{2026}", true).clicked()
                && let Some(m) = self.import_music()
            {
                ed.state.change("music", |p| p.music = Some(m));
                ed.after_edit();
            }
            return;
        };
        ui.add(egui::Label::new(RichText::new(&music.asset.name).font(font(12.5)).color(TEXT)).truncate());
        ui.label(RichText::new(duration_label(music.asset.duration_ms as f64 / 1000.0)).font(font_mono(11.5)).color(TEXT_MUTED));
        let mut m = music.clone();
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            ui.label(RichText::new("Volume").font(font(12.5)).color(TEXT_SECONDARY));
            ui.add(egui::Slider::new(&mut m.volume, 0.0..=1.0).custom_formatter(|v, _| format!("{:.0}%", v * 100.0)));
        });
        ui.horizontal(|ui| {
            toggle(ui, &mut m.muted, "Mute music");
            ui.label(RichText::new("Mute").font(font(12.5)).color(TEXT_SECONDARY));
            ui.add_space(12.0);
            toggle(ui, &mut m.r#loop, "Loop music");
            ui.label(RichText::new("Loop").font(font(12.5)).color(TEXT_SECONDARY));
        });
        ui.horizontal(|ui| {
            ui.label(RichText::new("Fade in").font(font(12.5)).color(TEXT_SECONDARY));
            let mut f = m.fade_in_ms as f64;
            if seconds(ui, &mut f, 0.0..=30_000.0) {
                m.fade_in_ms = f as i64;
            }
            ui.label(RichText::new("Fade out").font(font(12.5)).color(TEXT_SECONDARY));
            let mut f = m.fade_out_ms as f64;
            if seconds(ui, &mut f, 0.0..=30_000.0) {
                m.fade_out_ms = f as i64;
            }
        });
        ui.horizontal(|ui| {
            ui.label(RichText::new("Song in").font(font(12.5)).color(TEXT_SECONDARY));
            let mut a = m.source_start_ms as f64;
            if seconds(ui, &mut a, 0.0..=m.asset.duration_ms as f64) {
                m.source_start_ms = a as i64;
            }
            ui.label(RichText::new("out").font(font(12.5)).color(TEXT_SECONDARY));
            let mut b = m.source_end_ms as f64;
            if seconds(ui, &mut b, 0.0..=m.asset.duration_ms as f64) {
                m.source_end_ms = b as i64;
            }
        });
        if button(ui, Kind::Ghost, None, "Start music at playhead", true).clicked() {
            m.timeline_start_ms = ed.playback.out_ms.round() as i64;
        }
        heading(ui, "Duck under voice", "");
        let has_mic = ed.infos.values().any(|i| i.tracks.iter().any(|t| t.role == Some(switchboard_media::TrackRole::Microphone)));
        if has_mic {
            let mut on = m.ducking.is_some_and(|d| d.enabled);
            ui.horizontal(|ui| {
                toggle(ui, &mut on, "Duck music under voice");
                ui.label(RichText::new("Lower the music while you talk").font(font(12.5)).color(TEXT_SECONDARY));
            });
            if on {
                let mut d = m.ducking.unwrap_or_default();
                d.enabled = true;
                ui.add(egui::Slider::new(&mut d.amount, 0.0..=1.0).text("Amount").custom_formatter(|v, _| format!("{:.0}%", v * 100.0)));
                ui.add(egui::Slider::new(&mut d.attack_ms, 10..=1000).text("Attack").suffix(" ms"));
                ui.add(egui::Slider::new(&mut d.release_ms, 50..=3000).text("Release").suffix(" ms"));
                m.ducking = Some(d);
            } else if m.ducking.is_some() {
                m.ducking = Some(Ducking { enabled: false, ..m.ducking.unwrap() });
            }
        } else {
            ui.label(RichText::new("Needs a clip with a microphone track.").font(font(12.0)).color(TEXT_MUTED));
        }
        ui.add_space(12.0);
        ui.horizontal(|ui| {
            if button(ui, Kind::Ghost, None, "Replace\u{2026}", true).clicked()
                && let Some(new) = self.import_music()
            {
                m = Music { id: m.id.clone(), ..new };
            }
            if button(ui, Kind::Ghost, Some(icon::DELETE), "Remove music", true).clicked() {
                ed.state.change("music", |p| p.music = None);
                return;
            }
        });
        if m != music {
            ed.state.change("music", |p| p.music = Some(m));
        }
    }

    /// Picks an audio file, copies it into the project store, and probes it.
    fn import_music(&mut self) -> Option<Music> {
        let path = pick_audio_file()?;
        let (_, ffprobe) = switchboard_export::locate_ffmpeg()?;
        let (duration_ms, codec) = switchboard_export::probe_audio(&ffprobe, &path).ok()?;
        if duration_ms <= 100 {
            return None;
        }
        let id = uuid();
        let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_else(|| "audio".into());
        let dir = crate::settings::data_dir().join("projects").join("audio");
        std::fs::create_dir_all(&dir).ok()?;
        std::fs::copy(&path, dir.join(format!("{id}.{ext}"))).ok()?;
        let name = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Music".into());
        let asset = AudioAsset {
            id,
            name: name.chars().take(160).collect(),
            original_name: path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
            duration_ms,
            file_size: std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
            codec,
            created_at: now_ms(),
        };
        let _ = self.store.add_asset(asset.clone());
        Some(Music::new(asset))
    }
}

fn audio_tab(ui: &mut Ui, ed: &mut Editor) {
    let i = ed.state.selected;
    let Some(seg) = ed.project().segments.get(i).cloned() else { return };
    let tracks = ed.infos.get(&seg.clip_id).map(|x| x.tracks.clone()).unwrap_or_default();
    heading(ui, "Source channels", &format!("{} tracks", tracks.len()));
    for (t, tr) in tracks.iter().enumerate() {
        let color = role_color(tr.role, t);
        let name = role_label(tr.role, &tr.title, t);
        let pct = (seg.level(t) * 100.0).round() as u8;
        let selected = ed.selected_track == t;
        let (row, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 26.0), Sense::click());
        let p = ui.painter();
        if selected {
            p.rect_filled(row, CornerRadius::same(R_CONTROL), INTERACTIVE);
        }
        p.rect_filled(egui::Rect::from_min_size(row.min + vec2(2.0, 5.0), vec2(3.0, 16.0)), CornerRadius::same(1), color);
        p.text(row.left_center() + vec2(12.0, 0.0), egui::Align2::LEFT_CENTER, &name, font(12.5), TEXT);
        p.text(row.right_center() - vec2(30.0, 0.0), egui::Align2::RIGHT_CENTER, format!("{pct}%"), font(11.5), TEXT_DESCRIPTION);
        let mute_r = egui::Rect::from_center_size(row.right_center() - vec2(12.0, 0.0), vec2(22.0, 22.0));
        let mute = ui.interact(mute_r, ui.id().with(("mute", t)), Sense::click());
        ui.painter().text(mute_r.center(), egui::Align2::CENTER_CENTER, if pct == 0 { icon::MUTE } else { icon::VOLUME }, font_icon(12.0), if mute.hovered() { TEXT } else { TEXT_DESCRIPTION });
        if mute.on_hover_text(if pct == 0 { "Unmute" } else { "Mute" }).clicked() {
            ed.state.toggle_track_mute(i, t, tracks.len(), 100);
        } else if resp.clicked() {
            ed.selected_track = t;
        }
        let mut v = pct as f32 / 100.0;
        let w = ui.available_width();
        if widgets::fader(ui, &mut v, color, w, &name).changed() {
            ed.state.set_level(i, t, (v * 100.0).round() as u8, tracks.len());
        }
        ui.add_space(4.0);
    }
    heading(ui, "Overall clip volume", &format!("{:.0}%", seg.volume * 100.0));
    ui.horizontal(|ui| {
        let mut v = seg.volume as f32;
        let w = ui.available_width() - 90.0;
        if widgets::fader(ui, &mut v, ACCENT, w, "Overall clip volume").changed() {
            ed.state.set_volume(i, v as f64);
        }
        let mut muted = seg.muted;
        if toggle(ui, &mut muted, "Mute all audio").changed() {
            ed.state.set_muted(i, muted);
        }
        ui.label(RichText::new("Mute").font(font(12.0)).color(TEXT_SECONDARY));
    });

    // Per-track trim for the selected track.
    if let Some(tr) = tracks.get(ed.selected_track) {
        let t = ed.selected_track;
        let name = role_label(tr.role, &tr.title, t);
        heading(ui, &format!("{name} trim"), "");
        let trim = seg.track_trim(t).unwrap_or(TrackTrim { start_ms: 0, end_ms: seg.source_duration_ms });
        if let Some(w) = ed.waveforms.get(&seg.clip_id).and_then(|w| w.get(t)).cloned() {
            let (r, _) = ui.allocate_exact_size(vec2(ui.available_width(), 34.0), Sense::hover());
            let color = role_color(tr.role, t);
            let p = ui.painter();
            p.rect_filled(r, CornerRadius::same(R_CONTROL), color.linear_multiply(0.08));
            let n = w.len().max(1);
            for x in 0..r.width() as usize {
                let f = x as f64 / r.width() as f64;
                let amp = w[((f * n as f64) as usize).min(n - 1)];
                let src = f * seg.source_duration_ms as f64;
                let inside = src >= trim.start_ms as f64 && src < trim.end_ms as f64;
                let h = (amp * 30.0).max(1.0);
                let px = r.left() + x as f32;
                p.vline(px, r.center().y - h / 2.0..=r.center().y + h / 2.0, egui::Stroke::new(1.0, if inside { color } else { color.linear_multiply(0.25) }));
            }
        }
        let mut a = trim.start_ms as f64;
        let mut b = trim.end_ms as f64;
        let mut changed = false;
        ui.horizontal(|ui| {
            ui.label(RichText::new("Audio in").font(font(12.0)).color(TEXT_SECONDARY));
            changed |= seconds(ui, &mut a, 0.0..=seg.source_duration_ms as f64);
            ui.label(RichText::new("out").font(font(12.0)).color(TEXT_SECONDARY));
            changed |= seconds(ui, &mut b, 0.0..=seg.source_duration_ms as f64);
            if button(ui, Kind::Ghost, None, "Reset", seg.track_trim(t).is_some()).clicked() {
                ed.state.set_track_trim(i, t, None, tracks.len());
            }
        });
        if changed {
            ed.state.set_track_trim(i, t, Some(TrackTrim { start_ms: a as i64, end_ms: b as i64 }), tracks.len());
        }

        heading(ui, "Volume automation", "Optional");
        let auto = seg.edits().and_then(|e| e.automation(t)).cloned();
        let src = ed.playback.source_ms;
        ui.horizontal_wrapped(|ui| {
            if button(ui, Kind::Ghost, Some(icon::ADD), "Point at playhead", true).clicked() {
                let g = switchboard_project::automation_gain_at(auto.as_ref(), src);
                ed.state.add_gain_point(i, t, src, g);
            }
            if button(ui, Kind::Ghost, Some(icon::MUTE), "Mute 1 s here", true).clicked() {
                ed.state.add_mute(i, t, src);
            }
            if auto.is_some() && button(ui, Kind::Ghost, None, "Clear", true).clicked() {
                ed.state.clear_automation(i, t);
            }
        });
        if let Some(a) = auto {
            for p in &a.points {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(precise(p.time_ms as f64)).font(font_mono(11.5)).color(TEXT_SECONDARY));
                    let mut g = p.gain;
                    if ui.add(egui::Slider::new(&mut g, 0.0..=1.0).custom_formatter(|v, _| format!("{:.0}%", v * 100.0))).changed() {
                        ed.state.add_gain_point(i, t, p.time_ms as f64, g);
                    }
                });
            }
            for m in &a.mutes {
                ui.label(RichText::new(format!("Muted {} to {}", precise(m.start_ms as f64), precise(m.end_ms as f64))).font(font(12.0)).color(TEXT_DESCRIPTION));
            }
        }
    }

    heading(ui, "Source details", "");
    if let Some(info) = ed.infos.get(&seg.clip_id) {
        let size = ed.paths.get(&seg.clip_id).and_then(|p| std::fs::metadata(p).ok()).map(|m| m.len()).unwrap_or(0);
        let rows = [
            ("Resolution", format!("{}\u{d7}{}", info.width, info.height)),
            ("Frame rate", format!("{:.0} fps", info.fps)),
            ("Length", duration_label(info.duration_ms as f64 / 1000.0)),
            ("Size", bytes_label(size)),
            ("Video", info.video_codec.clone()),
        ];
        egui::Grid::new("source-details").num_columns(2).spacing([16.0, 4.0]).show(ui, |ui| {
            for (k, v) in rows {
                ui.label(RichText::new(k).font(font(12.0)).color(TEXT_DESCRIPTION));
                ui.label(RichText::new(v).font(font_mono(11.5)).color(TEXT_SECONDARY));
                ui.end_row();
            }
        });
        ui.add(egui::Label::new(RichText::new(&seg.clip_id).font(font_mono(11.0)).color(TEXT_MUTED)).truncate());
    }
}

fn edit_tab(ui: &mut Ui, ed: &mut Editor) {
    let i = ed.state.selected;
    let Some(seg) = ed.project().segments.get(i).cloned() else { return };
    let fps = ed.selected_info().map(|x| x.fps).filter(|f| *f > 0.0).unwrap_or(60.0);
    let frame = 1000.0 / fps;
    let src = ed.playback.source_ms;
    let mut edited = false;

    heading(ui, "Trim", &precise(seg.duration_ms() as f64));
    for (label, is_start) in [("In", true), ("Out", false)] {
        ui.horizontal(|ui| {
            ui.add_sized([28.0, 20.0], egui::Label::new(RichText::new(label).font(font(12.0)).color(TEXT_SECONDARY)));
            let mut v = if is_start { seg.trim_start_ms } else { seg.trim_end_ms } as f64;
            let mut changed = seconds(ui, &mut v, 0.0..=seg.source_duration_ms as f64);
            if ui.small_button("\u{2212}1f").on_hover_text("One frame earlier").clicked() {
                v -= frame;
                changed = true;
            }
            if ui.small_button("+1f").on_hover_text("One frame later").clicked() {
                v += frame;
                changed = true;
            }
            if ui.small_button("Playhead").on_hover_text(if is_start { "Set in at playhead" } else { "Set out at playhead" }).clicked() {
                v = src;
                changed = true;
            }
            if changed {
                if is_start {
                    ed.state.set_trim_start(i, v);
                } else {
                    ed.state.set_trim_end(i, v);
                }
                edited = true;
            }
        });
    }
    if button(ui, Kind::Ghost, None, "Reset trim", seg.trim_start_ms != 0 || seg.trim_end_ms != seg.source_duration_ms).clicked() {
        ed.state.reset_trim(i);
        edited = true;
    }

    // Framing: fit/fill, background, pan and zoom keyframes.
    let edits = seg.edits().cloned().unwrap_or_default();
    heading(ui, "Framing", "");
    let mut framing = edits.framing.clone().unwrap_or_default();
    let before = framing.clone();
    segmented(ui, &mut framing.mode, &[(FramingMode::Fill, "Fill"), (FramingMode::Fit, "Fit")], "Scale");
    segmented(ui, &mut framing.background, &[(FramingBackground::Black, "Black"), (FramingBackground::Blur, "Blurred video")], "Background");
    let current = framing_at(src, Some(&edits));
    let mut key = current;
    ui.add(egui::Slider::new(&mut key.x, 0.0..=1.0).text("Horizontal").custom_formatter(|v, _| format!("{:.0}%", v * 100.0)));
    ui.add(egui::Slider::new(&mut key.y, 0.0..=1.0).text("Vertical").custom_formatter(|v, _| format!("{:.0}%", v * 100.0)));
    ui.add(egui::Slider::new(&mut key.zoom, 1.0..=8.0).text("Zoom").custom_formatter(|v, _| format!("{:.0}%", v * 100.0)));
    combo_transition(ui, &mut key.transition);
    if framing != before {
        ed.state.edit(i, "framing", |e| {
            let f = e.framing.get_or_insert_with(Default::default);
            f.mode = framing.mode;
            f.background = framing.background;
        });
        edited = true;
    }
    if key != current {
        ed.state.add_keyframe(i, src, key);
        edited = true;
    }
    ui.label(RichText::new(format!("{} keyframes. Moving a slider adds one at the playhead.", framing.keyframes.len())).font(font(11.5)).color(TEXT_MUTED));
    if !framing.keyframes.is_empty() && button(ui, Kind::Ghost, None, "Remove framing", true).clicked() {
        ed.state.edit(i, "framing-clear", |e| e.framing = None);
        edited = true;
    }

    heading(ui, "Speed & freezes", "");
    let mut speed = speed_at(src, Some(&edits));
    let r = ui.add(egui::Slider::new(&mut speed, 0.25..=4.0).step_by(0.05).text("Speed here").suffix("\u{d7}"));
    if r.changed() {
        ed.state.add_speed_point(i, src, speed, SpeedTransition::Hold);
        edited = true;
    }
    if !edits.speed_points.is_empty() {
        let mut ramp = edits.speed_points.iter().rev().find(|p| p.time_ms as f64 <= src).map(|p| p.transition == SpeedTransition::Linear).unwrap_or(false);
        ui.horizontal(|ui| {
            if toggle(ui, &mut ramp, "Ramp to the next speed").changed()
                && let Some(p) = edits.speed_points.iter().rev().find(|p| p.time_ms as f64 <= src)
            {
                ed.state.add_speed_point(i, p.time_ms as f64, p.speed, if ramp { SpeedTransition::Linear } else { SpeedTransition::Hold });
                edited = true;
            }
            ui.label(RichText::new("Ramp to the next speed").font(font(12.0)).color(TEXT_SECONDARY));
        });
    }
    ui.horizontal(|ui| {
        if button(ui, Kind::Ghost, Some(icon::ADD), "Freeze 1 s here", true).clicked() {
            ed.state.add_freeze(i, src, 1000);
            edited = true;
        }
        if (!edits.speed_points.is_empty() || !edits.freezes.is_empty()) && button(ui, Kind::Ghost, None, "Clear", true).clicked() {
            ed.state.edit(i, "speed-clear", |e| {
                e.speed_points.clear();
                e.freezes.clear();
            });
            edited = true;
        }
    });

    heading(ui, "Text & privacy", &format!("{}", edits.overlays.len()));
    ui.horizontal_wrapped(|ui| {
        for (kind, label) in [(OverlayKind::Text, "Text"), (OverlayKind::Blur, "Blur"), (OverlayKind::Pixelate, "Pixelate")] {
            if button(ui, Kind::Ghost, Some(icon::ADD), label, true).clicked() {
                ed.selected_overlay = ed.state.add_overlay(i, kind, src);
                edited = true;
            }
        }
    });
    for o in &edits.overlays {
        let selected = ed.selected_overlay.as_deref() == Some(o.id.as_str());
        let label = match o.kind {
            OverlayKind::Text => format!("Text \u{b7} {}", o.content.clone().unwrap_or_default()),
            OverlayKind::Blur => "Blur".into(),
            OverlayKind::Pixelate => "Pixelate".into(),
        };
        if ui.selectable_label(selected, format!("{label}  {}\u{2013}{}", precise(o.start_ms as f64), precise(o.end_ms as f64))).clicked() {
            ed.selected_overlay = if selected { None } else { Some(o.id.clone()) };
        }
        if selected {
            let mut x = o.clone();
            if x.kind == OverlayKind::Text {
                let mut content = x.content.clone().unwrap_or_default();
                if ui.add(egui::TextEdit::multiline(&mut content).desired_rows(2).char_limit(500)).changed() {
                    x.content = Some(content);
                }
                let mut size = x.size.unwrap_or_default();
                segmented(ui, &mut size, &[(TextSize::Small, "Small"), (TextSize::Medium, "Medium"), (TextSize::Large, "Large")], "Text size");
                x.size = Some(size);
            }
            ui.add(egui::Slider::new(&mut x.x, 0.0..=(1.0 - x.width)).text("Left"));
            ui.add(egui::Slider::new(&mut x.y, 0.0..=(1.0 - x.height)).text("Top"));
            ui.add(egui::Slider::new(&mut x.width, 0.02..=1.0).text("Width"));
            ui.add(egui::Slider::new(&mut x.height, 0.02..=1.0).text("Height"));
            ui.horizontal(|ui| {
                let mut a = x.start_ms as f64;
                if seconds(ui, &mut a, 0.0..=seg.source_duration_ms as f64) {
                    x.start_ms = a as i64;
                }
                let mut b = x.end_ms as f64;
                if seconds(ui, &mut b, 0.0..=seg.source_duration_ms as f64) {
                    x.end_ms = b as i64;
                }
                if ui.button("Delete").clicked() {
                    let id = x.id.clone();
                    ed.state.edit(i, "overlay-remove", |e| e.overlays.retain(|o| o.id != id));
                    ed.selected_overlay = None;
                    edited = true;
                }
            });
            if &x != o && ed.selected_overlay.is_some() {
                let id = x.id.clone();
                ed.state.edit(i, "overlay", |e| {
                    if let Some(slot) = e.overlays.iter_mut().find(|o| o.id == id) {
                        *slot = x;
                    }
                });
                edited = true;
            }
        }
    }

    heading(ui, "Picture & title", "");
    let mut b = edits.brightness.unwrap_or(0.0) * 100.0;
    let mut c = edits.contrast.unwrap_or(1.0) * 100.0;
    let mut s = edits.saturation.unwrap_or(1.0) * 100.0;
    let mut flip = edits.flip_horizontal.unwrap_or(false);
    let mut changed = false;
    changed |= ui.add(egui::Slider::new(&mut b, -30.0..=30.0).text("Brightness").step_by(1.0)).changed();
    changed |= ui.add(egui::Slider::new(&mut c, 50.0..=150.0).text("Contrast").suffix("%").step_by(1.0)).changed();
    changed |= ui.add(egui::Slider::new(&mut s, 0.0..=200.0).text("Saturation").suffix("%").step_by(1.0)).changed();
    ui.horizontal(|ui| {
        changed |= toggle(ui, &mut flip, "Flip horizontally").changed();
        ui.label(RichText::new("Flip horizontally").font(font(12.0)).color(TEXT_SECONDARY));
        if button(ui, Kind::Ghost, None, "Reset", true).clicked() {
            ed.state.reset_picture(i);
            edited = true;
        }
    });
    if changed {
        ed.state.edit(i, "picture", |e| {
            e.brightness = (b != 0.0).then_some(b / 100.0);
            e.contrast = (c != 100.0).then_some(c / 100.0);
            e.saturation = (s != 100.0).then_some(s / 100.0);
            e.flip_horizontal = flip.then_some(true);
        });
        edited = true;
    }
    let mut title = edits.text.clone().unwrap_or(Title {
        content: String::new(),
        start_ms: seg.trim_start_ms,
        end_ms: (seg.trim_start_ms + 3000).min(seg.trim_end_ms),
        position: TitlePosition::Bottom,
        size: TextSize::Medium,
    });
    let before_title = title.clone();
    ui.add(egui::TextEdit::singleline(&mut title.content).hint_text("Title (optional)").char_limit(160).desired_width(f32::INFINITY));
    if !title.content.is_empty() {
        segmented(ui, &mut title.position, &[(TitlePosition::Top, "Top"), (TitlePosition::Center, "Center"), (TitlePosition::Bottom, "Bottom")], "Title position");
        segmented(ui, &mut title.size, &[(TextSize::Small, "S"), (TextSize::Medium, "M"), (TextSize::Large, "L")], "Title size");
    }
    if title != before_title {
        ed.state.edit(i, "title", |e| e.text = (!title.content.is_empty()).then_some(title));
        edited = true;
    }
    if edited {
        ed.after_edit();
    }
    let _ = widgets::focus_ring;
}

fn combo_transition(ui: &mut Ui, t: &mut Interpolation) {
    segmented(ui, t, &[(Interpolation::Smooth, "Smooth"), (Interpolation::Linear, "Linear"), (Interpolation::Hold, "Hold, then cut")], "Transition");
}

fn precise(ms: f64) -> String {
    let ms = ms.max(0.0).round() as u64;
    format!("{}:{:02}.{:03}", ms / 60_000, ms / 1000 % 60, ms % 1000)
}

/// Audio file picker on its own STA thread.
fn pick_audio_file() -> Option<std::path::PathBuf> {
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FOS_FILEMUSTEXIST, FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH};
    use windows::core::w;
    std::thread::spawn(|| unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        (|| -> windows::core::Result<std::path::PathBuf> {
            let d: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
            d.SetOptions(FOS_FILEMUSTEXIST)?;
            let filters = [COMDLG_FILTERSPEC { pszName: w!("Audio"), pszSpec: w!("*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.opus") }];
            d.SetFileTypes(&filters)?;
            d.SetTitle(w!("Choose music"))?;
            d.Show(None)?;
            let item = d.GetResult()?;
            let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
            let path = std::path::PathBuf::from(name.to_string().unwrap_or_default());
            CoTaskMemFree(Some(name.0 as *const _));
            Ok(path)
        })()
        .ok()
    })
    .join()
    .ok()
    .flatten()
}
