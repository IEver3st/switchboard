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
use crate::ui::widgets::{self, Kind, button, icon, icon_button, segmented, toggle};

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
    let r = ui.add(
        egui::DragValue::new(&mut s)
            .range((*range.start() / 1000.0)..=(*range.end() / 1000.0))
            .speed(0.01)
            .custom_formatter(|v, _| precise(v * 1000.0))
            .custom_parser(parse_time),
    );
    if r.changed() {
        *value = s * 1000.0;
    }
    r.changed()
}

fn parse_time(text: &str) -> Option<f64> {
    let t = text.trim().trim_end_matches('s').trim();
    match t.split_once(':') {
        Some((m, s)) => Some(m.trim().parse::<f64>().ok()? * 60.0 + s.trim().parse::<f64>().ok()?),
        None => t.parse().ok(),
    }
}

fn pct(v: f32) -> String {
    format!("{:.0}%", v * 100.0)
}

fn note(ui: &mut Ui, text: &str) {
    ui.add(egui::Label::new(RichText::new(text).font(font(11.5)).color(TEXT_MUTED)).wrap());
}

impl App {
    pub(super) fn inspector_ui(&mut self, ui: &mut Ui, ed: &mut Editor) {
        let montage = !ed.project().is_clip_edit();
        let (seg_name, file) = ed
            .project()
            .segments
            .get(ed.state.selected)
            .map(|s| (ed.clip_titles.get(&s.clip_id).cloned().unwrap_or_else(|| s.clip_id.clone()), s.clip_id.clone()))
            .unwrap_or_default();
        if montage {
            ui.add(egui::Label::new(RichText::new(seg_name).font(font_strong(13.5)).color(TEXT)).truncate()).on_hover_text(file);
            ui.add_space(10.0);
        }
        let mut tabs = vec![(Tab::Edit, "Edit"), (Tab::Audio, "Audio")];
        if montage {
            tabs.push((Tab::Music, "Music"));
        }
        segmented(ui, &mut ed.tab, &tabs, "Inspector");
        ui.add_space(8.0);
        ui.visuals_mut().clip_rect_margin = 0.0;
        let scrolled = ScrollArea::vertical().id_salt("inspector").auto_shrink([false, false]).show(ui, |ui| {
            ui.set_width(ui.available_width() - 12.0);
            ui.visuals_mut().extreme_bg_color = INTERACTIVE;
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
        if scrolled.state.offset.y > 0.5 {
            let r = scrolled.inner_rect;
            ui.painter().hline(r.left()..=r.right(), r.top() + 0.5, egui::Stroke::new(1.0, BORDER_STRONG));
        }
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
        ui.label(RichText::new(duration_label(music.asset.duration_ms as f64 / 1000.0)).font(font(12.0)).color(TEXT_DESCRIPTION));
        let mut m = music.clone();
        ui.add_space(8.0);
        let mut vol = m.volume as f32;
        if widgets::fader_row(ui, "Volume", &pct(vol), &mut vol, 0.0..=1.0, ACCENT).changed() {
            m.volume = vol as f64;
        }
        widgets::labeled_row(ui, "Mute", |ui| toggle(ui, &mut m.muted, "Mute music"));
        widgets::labeled_row(ui, "Loop", |ui| toggle(ui, &mut m.r#loop, "Loop music"));
        widgets::labeled_row(ui, "Fades", |ui| {
            let mut f = m.fade_in_ms as f64;
            if seconds(ui, &mut f, 0.0..=30_000.0) {
                m.fade_in_ms = f as i64;
            }
            ui.label(RichText::new("in").font(font(12.0)).color(TEXT_DESCRIPTION));
            let mut f = m.fade_out_ms as f64;
            if seconds(ui, &mut f, 0.0..=30_000.0) {
                m.fade_out_ms = f as i64;
            }
            ui.label(RichText::new("out").font(font(12.0)).color(TEXT_DESCRIPTION));
        });
        widgets::labeled_row(ui, "Song part", |ui| {
            let mut a = m.source_start_ms as f64;
            if seconds(ui, &mut a, 0.0..=m.asset.duration_ms as f64) {
                m.source_start_ms = a as i64;
            }
            ui.label(RichText::new("to").font(font(12.0)).color(TEXT_DESCRIPTION));
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
                let mut amount = d.amount as f32;
                if widgets::fader_row(ui, "Amount", &pct(amount), &mut amount, 0.0..=1.0, ACCENT).changed() {
                    d.amount = amount as f64;
                }
                let mut attack = d.attack_ms as f32;
                if widgets::fader_row(ui, "Attack", &format!("{} ms", d.attack_ms), &mut attack, 10.0..=1000.0, ACCENT).changed() {
                    d.attack_ms = ((attack / 10.0).round() * 10.0) as i64;
                }
                let mut release = d.release_ms as f32;
                if widgets::fader_row(ui, "Release", &format!("{} ms", d.release_ms), &mut release, 50.0..=3000.0, ACCENT).changed() {
                    d.release_ms = ((release / 50.0).round() * 50.0) as i64;
                }
                m.ducking = Some(d);
            } else if m.ducking.is_some() {
                m.ducking = Some(Ducking { enabled: false, ..m.ducking.unwrap() });
            }
        } else {
            note(ui, "Needs a clip with a microphone track.");
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
    let faders = !ed.project().is_clip_edit() || !ed.show_audio;
    heading(ui, "Source channels", &if tracks.len() == 1 { "1 track".to_string() } else { format!("{} tracks", tracks.len()) });
    if !faders {
        note(ui, "Set channel levels in the timeline below. Pick one here to trim it.");
        ui.add_space(4.0);
    }
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
        if faders {
            let mut v = pct as f32 / 100.0;
            let w = ui.available_width();
            if widgets::fader(ui, &mut v, color, w, &name).changed() {
                ed.state.set_level(i, t, (v * 100.0).round() as u8, tracks.len());
            }
        }
        ui.add_space(4.0);
    }
    heading(ui, "Whole clip", "");
    let mut v = seg.volume as f32;
    if widgets::fader_row(ui, "Volume", &pct(v), &mut v, 0.0..=1.0, ACCENT).changed() {
        ed.state.set_volume(i, v as f64);
    }
    let mut muted = seg.muted;
    if widgets::labeled_row(ui, "Mute", |ui| toggle(ui, &mut muted, "Mute the whole clip")).changed() {
        ed.state.set_muted(i, muted);
    }

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
        ui.add_space(4.0);
        widgets::labeled_row(ui, "Keep", |ui| {
            changed |= seconds(ui, &mut a, 0.0..=seg.source_duration_ms as f64);
            ui.label(RichText::new("to").font(font(12.0)).color(TEXT_DESCRIPTION));
            changed |= seconds(ui, &mut b, 0.0..=seg.source_duration_ms as f64);
        });
        if changed {
            ed.state.set_track_trim(i, t, Some(TrackTrim { start_ms: a as i64, end_ms: b as i64 }), tracks.len());
        }
        if seg.track_trim(t).is_some() && button(ui, Kind::Ghost, None, "Reset audio trim", true).clicked() {
            ed.state.set_track_trim(i, t, None, tracks.len());
        }

        heading(ui, "Volume automation", "");
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
            let color = role_color(tr.role, t);
            for p in &a.points {
                let mut g = p.gain as f32;
                if widgets::fader_row(ui, &precise(p.time_ms as f64), &pct(g), &mut g, 0.0..=1.0, color).changed() {
                    ed.state.add_gain_point(i, t, p.time_ms as f64, g as f64);
                }
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
        for (k, v) in rows {
            widgets::labeled_row(ui, k, |ui| {
                ui.label(RichText::new(v).font(font(12.5)).color(TEXT));
            });
        }
        widgets::labeled_row(ui, "File", |ui| {
            ui.add(egui::Label::new(RichText::new(&seg.clip_id).font(font(12.5)).color(TEXT_DESCRIPTION)).truncate()).on_hover_text(&seg.clip_id);
        });
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
    let set = |ed: &mut Editor, is_start: bool, v: f64| {
        if is_start {
            ed.state.set_trim_start(i, v);
        } else {
            ed.state.set_trim_end(i, v);
        }
    };
    for (label, is_start) in [("In", true), ("Out", false)] {
        let mut v = if is_start { seg.trim_start_ms } else { seg.trim_end_ms } as f64;
        let changed = widgets::labeled_row(ui, label, |ui| {
            let mut changed = seconds(ui, &mut v, 0.0..=seg.source_duration_ms as f64);
            ui.add_space(4.0);
            if icon_button(ui, icon::CHEVRON_LEFT, "One frame earlier", false).clicked() {
                v -= frame;
                changed = true;
            }
            if icon_button(ui, icon::CHEVRON_RIGHT, "One frame later", false).clicked() {
                v += frame;
                changed = true;
            }
            changed
        });
        if changed {
            set(ed, is_start, v);
            edited = true;
        }
    }
    ui.add_space(2.0);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        if button(ui, Kind::Ghost, None, "In at playhead", true).on_hover_text("I").clicked() {
            set(ed, true, src);
            edited = true;
        }
        if button(ui, Kind::Ghost, None, "Out at playhead", true).on_hover_text("O").clicked() {
            set(ed, false, src);
            edited = true;
        }
    });
    if (seg.trim_start_ms != 0 || seg.trim_end_ms != seg.source_duration_ms) && button(ui, Kind::Ghost, None, "Reset trim", true).clicked() {
        ed.state.reset_trim(i);
        edited = true;
    }

    let edits = seg.edits().cloned().unwrap_or_default();
    heading(ui, "Framing", "");
    let mut framing = edits.framing.clone().unwrap_or_default();
    let before = framing.clone();
    widgets::labeled_row(ui, "Scale", |ui| segmented(ui, &mut framing.mode, &[(FramingMode::Fill, "Fill"), (FramingMode::Fit, "Fit")], "Scale"));
    widgets::labeled_row(ui, "Background", |ui| {
        segmented(ui, &mut framing.background, &[(FramingBackground::Black, "Black"), (FramingBackground::Blur, "Blurred")], "Background")
    });
    let current = framing_at(src, Some(&edits));
    let mut key = current;
    let (mut x, mut y, mut z) = (key.x as f32, key.y as f32, key.zoom as f32);
    if widgets::fader_row_from(ui, "Horizontal", &pct(x), &mut x, 0.0..=1.0, 0.5, ACCENT).changed() {
        key.x = x as f64;
    }
    if widgets::fader_row_from(ui, "Vertical", &pct(y), &mut y, 0.0..=1.0, 0.5, ACCENT).changed() {
        key.y = y as f64;
    }
    let mut zl = z.max(1.0).log2();
    if widgets::fader_row(ui, "Zoom", &pct(z), &mut zl, 0.0..=3.0, ACCENT).changed() {
        z = 2f32.powf(zl);
        key.zoom = ((z * 100.0).round() / 100.0) as f64;
    }
    widgets::labeled_row(ui, "Easing", |ui| combo_transition(ui, &mut key.transition));
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
    ui.add_space(2.0);
    match framing.keyframes.len() {
        0 => note(ui, "Moving a slider adds a keyframe at the playhead."),
        1 => note(ui, "1 keyframe. Moving a slider adds one at the playhead."),
        n => note(ui, &format!("{n} keyframes. Moving a slider adds one at the playhead.")),
    }
    if !framing.keyframes.is_empty() && button(ui, Kind::Ghost, None, "Remove framing", true).clicked() {
        ed.state.edit(i, "framing-clear", |e| e.framing = None);
        edited = true;
    }

    heading(ui, "Speed & freezes", "");
    let speed = speed_at(src, Some(&edits)) as f32;
    let mut sl = speed.clamp(0.25, 4.0).log2();
    let speed_r = widgets::fader_row(ui, "Speed here", &format!("{speed:.2}\u{d7}"), &mut sl, -2.0..=2.0, ACCENT);
    if speed_r.changed() {
        let picked = 2f32.powf(sl);
        let snap = |v: f32| ((v / 0.05).round() * 0.05).clamp(0.25, 4.0);
        let mut next = snap(picked);
        let keyed = !speed_r.dragged() && !speed_r.clicked();
        if keyed && (next - speed).abs() < 0.001 {
            next = snap(speed + 0.05 * (picked - speed).signum());
        }
        if (next - speed).abs() >= 0.001 {
            ed.state.add_speed_point(i, src, next as f64, SpeedTransition::Hold);
            edited = true;
        }
    }
    if !edits.speed_points.is_empty() {
        let mut ramp = edits.speed_points.iter().rev().find(|p| p.time_ms as f64 <= src).map(|p| p.transition == SpeedTransition::Linear).unwrap_or(false);
        let r = widgets::labeled_row(ui, "Ramp", |ui| toggle(ui, &mut ramp, "Ramp to the next speed")).on_hover_text("Ramp to the next speed");
        if r.changed()
            && let Some(p) = edits.speed_points.iter().rev().find(|p| p.time_ms as f64 <= src)
        {
            ed.state.add_speed_point(i, p.time_ms as f64, p.speed, if ramp { SpeedTransition::Linear } else { SpeedTransition::Hold });
            edited = true;
        }
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

    let count = if edits.overlays.is_empty() { String::new() } else { edits.overlays.len().to_string() };
    heading(ui, "Text & privacy", &count);
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
        let span = format!("{}\u{2013}{}", precise(o.start_ms as f64), precise(o.end_ms as f64));
        if widgets::select_row(ui, selected, &label, &span).clicked() {
            ed.selected_overlay = if selected { None } else { Some(o.id.clone()) };
        }
        if selected {
            let mut x = o.clone();
            if x.kind == OverlayKind::Text {
                let mut content = x.content.clone().unwrap_or_default();
                if widgets::text_field(ui, ui.id().with(("overlay-text", &x.id)), &mut content, "Overlay text", 2, 500).changed() {
                    x.content = Some(content);
                }
                let mut size = x.size.unwrap_or_default();
                widgets::labeled_row(ui, "Size", |ui| {
                    segmented(ui, &mut size, &[(TextSize::Small, "Small"), (TextSize::Medium, "Medium"), (TextSize::Large, "Large")], "Text size")
                });
                x.size = Some(size);
            }
            let mut v = x.x as f32;
            if widgets::fader_row(ui, "Left", &pct(v), &mut v, 0.0..=(1.0 - x.width as f32), ACCENT).changed() {
                x.x = v as f64;
            }
            let mut v = x.y as f32;
            if widgets::fader_row(ui, "Top", &pct(v), &mut v, 0.0..=(1.0 - x.height as f32), ACCENT).changed() {
                x.y = v as f64;
            }
            let mut v = x.width as f32;
            if widgets::fader_row(ui, "Width", &pct(v), &mut v, 0.02..=1.0, ACCENT).changed() {
                x.width = v as f64;
            }
            let mut v = x.height as f32;
            if widgets::fader_row(ui, "Height", &pct(v), &mut v, 0.02..=1.0, ACCENT).changed() {
                x.height = v as f64;
            }
            widgets::labeled_row(ui, "Shown", |ui| {
                let mut a = x.start_ms as f64;
                if seconds(ui, &mut a, 0.0..=seg.source_duration_ms as f64) {
                    x.start_ms = a as i64;
                }
                ui.label(RichText::new("to").font(font(12.0)).color(TEXT_DESCRIPTION));
                let mut b = x.end_ms as f64;
                if seconds(ui, &mut b, 0.0..=seg.source_duration_ms as f64) {
                    x.end_ms = b as i64;
                }
            });
            if button(ui, Kind::Ghost, Some(icon::DELETE), "Remove", true).clicked() {
                let id = x.id.clone();
                ed.state.edit(i, "overlay-remove", |e| e.overlays.retain(|o| o.id != id));
                ed.selected_overlay = None;
                edited = true;
            }
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
    let b = edits.brightness.unwrap_or(0.0) * 100.0;
    let c = edits.contrast.unwrap_or(1.0) * 100.0;
    let s = edits.saturation.unwrap_or(1.0) * 100.0;
    let mut flip = edits.flip_horizontal.unwrap_or(false);
    let mut changed = false;
    let (mut bf, mut cf, mut sf) = (b as f32, c as f32, s as f32);
    let signed = if b.round() > 0.0 { format!("+{:.0}", b) } else { format!("{:.0}", b) };
    changed |= widgets::fader_row(ui, "Brightness", &signed, &mut bf, -30.0..=30.0, ACCENT).changed();
    changed |= widgets::fader_row_from(ui, "Contrast", &format!("{c:.0}%"), &mut cf, 50.0..=150.0, 100.0, ACCENT).changed();
    changed |= widgets::fader_row_from(ui, "Saturation", &format!("{s:.0}%"), &mut sf, 0.0..=200.0, 100.0, ACCENT).changed();
    let (b, c, s) = (bf.round() as f64, cf.round() as f64, sf.round() as f64);
    changed |= widgets::labeled_row(ui, "Mirror", |ui| toggle(ui, &mut flip, "Flip horizontally")).on_hover_text("Flip horizontally").changed();
    let touched = edits.brightness.is_some() || edits.contrast.is_some() || edits.saturation.is_some() || edits.flip_horizontal.is_some();
    if touched && button(ui, Kind::Ghost, None, "Reset picture", true).clicked() {
        ed.state.reset_picture(i);
        edited = true;
    }
    if changed {
        ed.state.edit(i, "picture", |e| {
            e.brightness = (b != 0.0).then_some(b / 100.0);
            e.contrast = (c != 100.0).then_some(c / 100.0);
            e.saturation = (s != 100.0).then_some(s / 100.0);
            e.flip_horizontal = flip.then_some(true);
        });
        edited = true;
    }
    ui.add_space(8.0);
    let mut title = edits.text.clone().unwrap_or(Title {
        content: String::new(),
        start_ms: seg.trim_start_ms,
        end_ms: (seg.trim_start_ms + 3000).min(seg.trim_end_ms),
        position: TitlePosition::Bottom,
        size: TextSize::Medium,
    });
    let before_title = title.clone();
    widgets::text_field(ui, ui.id().with("title-text"), &mut title.content, "Add a title", 1, 160);
    if !title.content.is_empty() {
        ui.add_space(4.0);
        widgets::labeled_row(ui, "Position", |ui| {
            segmented(ui, &mut title.position, &[(TitlePosition::Top, "Top"), (TitlePosition::Center, "Center"), (TitlePosition::Bottom, "Bottom")], "Title position")
        });
        widgets::labeled_row(ui, "Size", |ui| {
            segmented(ui, &mut title.size, &[(TextSize::Small, "Small"), (TextSize::Medium, "Medium"), (TextSize::Large, "Large")], "Title size")
        });
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
    segmented(ui, t, &[(Interpolation::Smooth, "Smooth"), (Interpolation::Linear, "Linear"), (Interpolation::Hold, "Cut")], "Easing");
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
