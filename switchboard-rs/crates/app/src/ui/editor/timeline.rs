//! Timeline: ruler, video segments with trim handles, per-track waveform
//! lanes (clip edits) or the music lane (montages), and the playhead.
//!
//! A single-segment clip edit shows the whole source with the trimmed-off
//! parts shaded, as the old app did; everything else is laid out in output
//! time with segments end to end.

use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, StrokeKind, Ui, pos2, vec2};
use switchboard_media::TrackRole;

use super::Editor;
use crate::ui::grid::elided;
use crate::ui::library::duration_label;
use crate::ui::theme::*;

const LABEL_W: f32 = 168.0;
const RULER_H: f32 = 26.0;
const VIDEO_H: f32 = 50.0;
const LANE_H: f32 = 44.0;
/// Visible trim handle width, and how far either side of an edge a press
/// still grabs it.
const HANDLE_W: f32 = 9.0;
const HANDLE_REACH: f32 = 14.0;
/// A dragged edge within this many pixels of the playhead snaps to it.
const SNAP_PX: f32 = 8.0;

#[derive(Clone, Copy, PartialEq)]
pub enum Drag {
    Scrub,
    TrimStart(usize),
    TrimEnd(usize),
}

pub fn role_color(role: Option<TrackRole>, index: usize) -> Color32 {
    match role {
        Some(TrackRole::Game) => GAME,
        Some(TrackRole::Chat) => CHAT,
        Some(TrackRole::Microphone) => MIC,
        Some(TrackRole::Media) => hex_media(),
        None => [GAME, CHAT, MIC, hex_media()][index % 4],
    }
}

fn hex_media() -> Color32 {
    Color32::from_rgb(0xb3, 0x8b, 0xff)
}

pub fn role_label(role: Option<TrackRole>, title: &str, index: usize) -> String {
    match role {
        Some(TrackRole::Game) => "Game".into(),
        Some(TrackRole::Chat) => "Chat".into(),
        Some(TrackRole::Microphone) => "Microphone".into(),
        Some(TrackRole::Media) => "Media".into(),
        None if !title.is_empty() => title.to_string(),
        None => format!("Track {}", index + 1),
    }
}

fn lanes(ed: &Editor) -> usize {
    let p = ed.project();
    if p.is_clip_edit() {
        if ed.show_audio { ed.selected_info().map(|i| i.tracks.len()).unwrap_or(0) } else { 0 }
    } else {
        1
    }
}

pub fn height(ed: &Editor) -> f32 {
    RULER_H + VIDEO_H + lanes(ed) as f32 * (LANE_H + 4.0) + 14.0
}

/// Single segment clip edit: the axis is source time.
fn source_view(ed: &Editor) -> bool {
    ed.project().is_clip_edit() && ed.project().segments.len() == 1
}

impl Editor {
    fn axis_len(&self) -> f64 {
        let p = self.project();
        if source_view(self) { p.segments[0].source_duration_ms as f64 } else { p.duration_ms as f64 }.max(1.0)
    }

    /// Playhead position on the axis.
    fn playhead_axis(&self) -> f64 {
        if source_view(self) { self.playback.source_ms } else { self.playback.out_ms }
    }

    pub fn timeline_ui(&mut self, ui: &mut Ui, rect: Rect) {
        let p = ui.painter_at(rect);
        p.rect_filled(rect, CornerRadius::same(R_OVERLAY), SURFACE_1);
        let lanes_rect = Rect::from_min_max(pos2(rect.left() + LABEL_W, rect.top()), rect.max);
        let total = self.axis_len();
        let visible = total / self.zoom as f64;
        // Keep the playhead in view while playing.
        if self.playback.playing {
            let ph = self.playhead_axis();
            if ph > self.view_start + visible * 0.92 || ph < self.view_start {
                self.view_start = (ph - visible * 0.1).max(0.0);
            }
        }
        self.view_start = self.view_start.clamp(0.0, (total - visible).max(0.0));
        let x_of = |t: f64, start: f64| lanes_rect.left() + 6.0 + ((t - start) / visible) as f32 * (lanes_rect.width() - 12.0);
        let t_of = |x: f32, start: f64| start + ((x - lanes_rect.left() - 6.0) / (lanes_rect.width() - 12.0)) as f64 * visible;
        let start = self.view_start;

        // Ruler.
        let ruler = Rect::from_min_size(lanes_rect.min, vec2(lanes_rect.width(), RULER_H));
        let step = [100.0, 250.0, 500.0, 1000.0, 2000.0, 5000.0, 10_000.0, 15_000.0, 30_000.0, 60_000.0]
            .into_iter()
            .find(|s| (*s / visible) as f32 * lanes_rect.width() >= 70.0)
            .unwrap_or(120_000.0);
        let mut t = (start / step).floor() * step;
        while t <= start + visible {
            let x = x_of(t, start);
            if x >= lanes_rect.left() {
                p.vline(x, ruler.bottom() - 7.0..=ruler.bottom(), Stroke::new(1.0, BORDER_STRONG));
                p.text(pos2(x + 3.0, ruler.top() + 6.0), Align2::LEFT_TOP, ruler_label(t, step), font_mono(10.5), TEXT_MUTED);
                for q in 1..4 {
                    let xq = x_of(t + step * q as f64 / 4.0, start);
                    p.vline(xq, ruler.bottom() - 3.0..=ruler.bottom(), Stroke::new(1.0, BORDER));
                }
            }
            t += step;
        }
        p.text(pos2(rect.left() + 12.0, ruler.center().y), Align2::LEFT_CENTER, "Source", font(11.5), TEXT_MUTED);

        // Wheel: pan, Ctrl+wheel: zoom around the pointer.
        let hover = ui.rect_contains_pointer(lanes_rect);
        if hover {
            let (scroll, ctrl, pointer) = ui.input(|i| (i.smooth_scroll_delta, i.modifiers.command, i.pointer.hover_pos()));
            if ctrl && scroll.y != 0.0 {
                let anchor = pointer.map(|p| t_of(p.x, start)).unwrap_or(start);
                let new_zoom = (self.zoom * if scroll.y > 0.0 { 1.15 } else { 1.0 / 1.15 }).clamp(1.0, 32.0);
                let new_visible = total / new_zoom as f64;
                let frac = (anchor - start) / visible;
                self.zoom = new_zoom;
                self.view_start = (anchor - frac * new_visible).max(0.0);
            } else if scroll.y != 0.0 || scroll.x != 0.0 {
                let d = (scroll.x - scroll.y) as f64 / lanes_rect.width() as f64 * visible;
                self.view_start = (self.view_start - d).max(0.0);
            }
        }

        // Video lane.
        let video = Rect::from_min_size(pos2(lanes_rect.left(), ruler.bottom() + 4.0), vec2(lanes_rect.width(), VIDEO_H));
        let n = self.project().segments.len();
        p.text(pos2(rect.left() + 12.0, video.top() + 14.0), Align2::LEFT_CENTER, "Video", font_strong(12.5), TEXT);
        let hint = if source_view(self) {
            "Drag edges, or I / O".to_string()
        } else {
            format!("{n} {}", if n == 1 { "segment" } else { "segments" })
        };
        p.text(pos2(rect.left() + 12.0, video.top() + 32.0), Align2::LEFT_CENTER, hint, font(11.0), TEXT_MUTED);
        let starts = self.project().segment_starts();
        let segs = self.project().segments.clone();
        // Edge x positions that can be grabbed, with what grabbing them does.
        let mut handle_hits: Vec<(f32, Drag)> = Vec::new();
        let hover_pos = ui.input(|i| i.pointer.hover_pos());
        for (i, s) in segs.iter().enumerate() {
            let (a, b) = if source_view(self) {
                (s.trim_start_ms as f64, s.trim_end_ms as f64)
            } else {
                (starts[i] as f64, (starts[i] + s.duration_ms()) as f64)
            };
            let r = Rect::from_min_max(pos2(x_of(a, start), video.top()), pos2(x_of(b, start), video.bottom()));
            let vis = r.intersect(video);
            if vis.width() <= 0.0 {
                continue;
            }
            let selected = i == self.state.selected;
            p.rect_filled(vis, CornerRadius::same(R_CONTROL), SURFACE_2);
            if let Some(tex) = self.thumbs.get(&s.clip_id) {
                // Repeat the clip's thumbnail as a filmstrip.
                let tw = VIDEO_H * 16.0 / 9.0;
                let mut x = r.left();
                let pc = p.with_clip_rect(vis.shrink(1.0));
                while x < r.right() {
                    let cell = Rect::from_min_size(pos2(x, r.top()), vec2(tw, VIDEO_H));
                    pc.image(*tex, cell, Rect::from_min_max(Pos2::ZERO, pos2(1.0, 1.0)), Color32::from_gray(150));
                    x += tw;
                }
            }
            let label = format!("{}", i + 1);
            let badge = Rect::from_min_size(vis.min + vec2(6.0, 6.0), vec2(18.0, 16.0));
            p.rect_filled(badge, CornerRadius::same(3), Color32::from_black_alpha(170));
            p.text(badge.center(), Align2::CENTER_CENTER, label, font_strong(10.5), TEXT);
            let name = self.clip_titles.get(&s.clip_id).cloned().unwrap_or_else(|| s.clip_id.clone());
            let g = elided(ui, &name, font_strong(11.5), TEXT, (vis.width() - 40.0).max(10.0));
            p.galley(vis.min + vec2(30.0, 6.0), g, TEXT);
            p.text(
                vis.min + vec2(30.0, 24.0),
                Align2::LEFT_TOP,
                duration_label(s.duration_ms() as f64 / 1000.0),
                font_mono(10.5),
                TEXT_SECONDARY,
            );
            let stroke = if selected { Stroke::new(2.0, ACCENT) } else { Stroke::new(1.0, BORDER_STRONG) };
            p.rect_stroke(vis, CornerRadius::same(R_CONTROL), stroke, StrokeKind::Inside);
            // Trim handles: drawn just inside each edge, grabbable well
            // either side of it.
            for (hx, drag, inward) in [(r.left(), Drag::TrimStart(i), true), (r.right(), Drag::TrimEnd(i), false)] {
                if hx < video.left() - 1.0 || hx > video.right() + 1.0 {
                    continue;
                }
                handle_hits.push((hx, drag));
                let hot = self.drag == Some(drag)
                    || (self.drag.is_none()
                        && hover_pos.is_some_and(|q| video.expand2(vec2(0.0, 2.0)).contains(q) && (q.x - hx).abs() <= HANDLE_REACH));
                if !(selected || hot || source_view(self)) {
                    continue;
                }
                let x0 = if inward { hx } else { hx - HANDLE_W };
                let bar = Rect::from_min_size(pos2(x0, video.top()), vec2(HANDLE_W, VIDEO_H));
                p.rect_filled(bar, CornerRadius::same(R_CONTROL), if hot { ACCENT_HOVER } else { ACCENT });
                let c = bar.center();
                p.vline(c.x, c.y - 7.0..=c.y + 7.0, Stroke::new(1.5, Color32::from_black_alpha(140)));
            }
        }
        if source_view(self) {
            // Shade the trimmed-off source on either side.
            let s = &segs[0];
            for (a, b) in [(0.0, s.trim_start_ms as f64), (s.trim_end_ms as f64, s.source_duration_ms as f64)] {
                let r = Rect::from_min_max(pos2(x_of(a, start), video.top()), pos2(x_of(b, start), rect.bottom() - 8.0))
                    .intersect(lanes_rect);
                if r.width() > 0.0 {
                    p.rect_filled(r, CornerRadius::ZERO, Color32::from_black_alpha(120));
                }
            }
        }

        // Audio lanes (clip edits) or the music lane (montages).
        let mut y = video.bottom() + 4.0;
        if self.project().is_clip_edit() && self.show_audio {
            let s = &segs[self.state.selected.min(segs.len() - 1)];
            let tracks = self.infos.get(&s.clip_id).map(|i| i.tracks.clone()).unwrap_or_default();
            let wave = self.waveforms.get(&s.clip_id).cloned();
            for (t, tr) in tracks.iter().enumerate() {
                let lane = Rect::from_min_size(pos2(lanes_rect.left(), y), vec2(lanes_rect.width(), LANE_H));
                let color = role_color(tr.role, t);
                p.rect_filled(lane, CornerRadius::same(R_CONTROL), color.linear_multiply(0.08));
                if let Some(w) = wave.as_ref().and_then(|w| w.get(t)) {
                    let level = s.level(t) as f32;
                    let buckets = w.len().max(1);
                    let src_len = s.source_duration_ms as f64;
                    let x0 = lane.left().max(x_of(0.0, start));
                    let mut x = x0;
                    while x < lane.right() {
                        let tt = t_of(x, start);
                        let src = if source_view(self) { tt } else { s.trim_start_ms as f64 + tt - starts[0] as f64 };
                        if src >= 0.0 && src <= src_len {
                            let bi = ((src / src_len) * buckets as f64) as usize;
                            let amp = w[bi.min(buckets - 1)] * level.max(0.05);
                            let h = (amp * (LANE_H - 8.0)).max(1.0);
                            let trimmed = s.track_trim(t).is_some_and(|tr| src < tr.start_ms as f64 || src >= tr.end_ms as f64);
                            let c = if trimmed { color.linear_multiply(0.25) } else { color };
                            p.vline(x, lane.center().y - h / 2.0..=lane.center().y + h / 2.0, Stroke::new(1.0, c));
                        }
                        x += 1.0;
                    }
                }
                // Label with the level fader.
                let label = Rect::from_min_size(pos2(rect.left() + 12.0, y), vec2(LABEL_W - 24.0, LANE_H));
                let name = role_label(tr.role, &tr.title, t);
                p.text(label.left_top() + vec2(0.0, 10.0), Align2::LEFT_CENTER, &name, font_strong(12.0), TEXT);
                let pct = (s.level(t) * 100.0).round() as u8;
                p.text(label.right_top() + vec2(0.0, 10.0), Align2::RIGHT_CENTER, format!("{pct}%"), font_strong(11.5), color);
                let fader = Rect::from_min_size(label.left_top() + vec2(-6.0, 22.0), vec2(label.width() + 12.0, 18.0));
                let mut v = pct as f32 / 100.0;
                let r = ui
                    .scope_builder(egui::UiBuilder::new().max_rect(fader), |ui| crate::ui::widgets::fader(ui, &mut v, color, fader.width(), &name))
                    .inner;
                if r.changed() {
                    let idx = self.state.selected.min(segs.len() - 1);
                    self.state.set_level(idx, t, (v * 100.0).round() as u8, tracks.len());
                }
                if ui.interact(label, ui.id().with(("lane", t)), Sense::click()).clicked() {
                    self.selected_track = t;
                    self.tab = super::Tab::Audio;
                }
                y += LANE_H + 4.0;
            }
        } else if !self.project().is_clip_edit() {
            let lane = Rect::from_min_size(pos2(lanes_rect.left(), y), vec2(lanes_rect.width(), LANE_H));
            p.rect_filled(lane, CornerRadius::same(R_CONTROL), hex_media().linear_multiply(0.08));
            p.text(pos2(rect.left() + 12.0, y + LANE_H / 2.0), Align2::LEFT_CENTER, "Music", font_strong(12.0), TEXT);
            if let Some(m) = &self.project().music {
                let len = if m.r#loop {
                    self.project().duration_ms as f64 - m.timeline_start_ms as f64
                } else {
                    (m.source_end_ms - m.source_start_ms) as f64
                };
                let a = m.timeline_start_ms as f64;
                let r = Rect::from_min_max(pos2(x_of(a, start), lane.top() + 4.0), pos2(x_of(a + len, start), lane.bottom() - 4.0)).intersect(lane);
                if r.width() > 0.0 {
                    p.rect_filled(r, CornerRadius::same(R_CONTROL), hex_media().linear_multiply(0.35));
                    let g = elided(ui, &m.asset.name, font(11.5), TEXT, r.width() - 12.0);
                    p.galley(r.min + vec2(6.0, 6.0), g, TEXT);
                }
            } else {
                p.text(lane.left_center() + vec2(10.0, 0.0), Align2::LEFT_CENTER, "No music. Add it from the Music tab.", font(12.0), TEXT_MUTED);
            }
        }

        // Interaction: trim handles first, then scrubbing.
        let id = ui.id().with("timeline");
        let area = Rect::from_min_max(ruler.min, pos2(lanes_rect.right(), video.bottom()));
        let resp = ui.interact(area, id, Sense::click_and_drag());
        let pointer = resp.interact_pointer_pos().or_else(|| ui.input(|i| i.pointer.hover_pos()));
        // The edge nearest to `pos` within reach, if `pos` is on the video lane.
        let grab = |pos: Pos2| -> Option<(f32, Drag)> {
            if !video.expand2(vec2(0.0, 2.0)).contains(pos) {
                return None;
            }
            // Where two edges meet, the side the pointer is on wins.
            let score = |(hx, d): &(f32, Drag)| {
                let inside = matches!(d, Drag::TrimStart(_) if pos.x >= *hx) || matches!(d, Drag::TrimEnd(_) if pos.x <= *hx);
                (pos.x - hx).abs() + if inside { 0.0 } else { 0.5 }
            };
            handle_hits
                .iter()
                .filter(|(hx, _)| (pos.x - hx).abs() <= HANDLE_REACH)
                .min_by(|a, b| score(a).total_cmp(&score(b)))
                .copied()
        };
        if resp.drag_started() {
            // Hit-test where the press began: by the time egui reports a
            // drag, the pointer has already moved past its threshold.
            let origin = ui.input(|i| i.pointer.press_origin()).or(pointer);
            // Trimming moves the playhead to the edge, so snap to where it
            // was before the drag.
            self.snap_at = self.playhead_axis();
            match origin.and_then(grab) {
                Some((hx, d)) => {
                    self.drag = Some(d);
                    self.grab_dx = hx - origin.map_or(hx, |o| o.x);
                    if let Drag::TrimStart(i) | Drag::TrimEnd(i) = d {
                        self.state.selected = i;
                    }
                }
                None => {
                    self.drag = Some(Drag::Scrub);
                    self.grab_dx = 0.0;
                }
            }
        }
        let on_handle = matches!(self.drag, Some(Drag::TrimStart(_) | Drag::TrimEnd(_)))
            || (self.drag.is_none() && pointer.and_then(grab).is_some());
        if on_handle {
            ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal);
        }
        let fps = self.selected_info().map(|i| i.fps).filter(|f| *f > 0.0).unwrap_or(60.0);
        let fine = ui.input(|i| i.modifiers.shift);
        let playhead = self.snap_at;
        if (resp.dragged() || resp.clicked())
            && let Some(pos) = pointer
        {
            let trimming = matches!(self.drag, Some(Drag::TrimStart(_) | Drag::TrimEnd(_)));
            // The edge keeps the offset from where it was grabbed.
            let x = if trimming { pos.x + self.grab_dx } else { pos.x };
            let mut t = t_of(x, start).clamp(0.0, total);
            if trimming && !fine && (x - x_of(playhead, start)).abs() <= SNAP_PX {
                t = playhead;
            }
            match self.drag.unwrap_or(Drag::Scrub) {
                Drag::Scrub => {
                    if source_view(self) {
                        // In source view the playhead stays inside the trim.
                        let s = &segs[0];
                        let src = t.clamp(s.trim_start_ms as f64, s.trim_end_ms as f64);
                        let out = switchboard_project::source_to_edited_ms(s.trim_start_ms as f64, src, s.edits());
                        self.seek(out, !resp.dragged());
                    } else {
                        if let Some((i, _, _)) = self.project().locate(t) {
                            self.state.selected = i;
                        }
                        self.seek(t, !resp.dragged());
                    }
                }
                Drag::TrimStart(i) => {
                    let s = &segs[i];
                    let src = if source_view(self) { t } else { s.trim_start_ms as f64 + (t - starts[i] as f64) };
                    let src = if fine { src } else { super::state::snap_to_frame(src, fps) };
                    self.state.set_trim_start(i, src);
                    // Preview the frame the segment now starts on.
                    let at = self.project().segment_starts()[i] as f64;
                    self.seek(at, false);
                }
                Drag::TrimEnd(i) => {
                    let s = &segs[i];
                    let src = if source_view(self) { t } else { s.trim_start_ms as f64 + (t - starts[i] as f64) };
                    let src = if fine { src } else { super::state::snap_to_frame(src, fps) };
                    self.state.set_trim_end(i, src);
                    // Preview the last frame kept.
                    let p = self.project();
                    let end = (p.segment_starts()[i] + p.segments[i].duration_ms()) as f64;
                    self.seek((end - 1000.0 / fps).max(0.0), false);
                }
            }
        }
        if resp.drag_stopped() {
            if matches!(self.drag, Some(Drag::TrimStart(_) | Drag::TrimEnd(_))) {
                self.after_edit();
            } else {
                let t = self.playback.out_ms;
                self.seek(t, true);
            }
            self.drag = None;
        }

        // Playhead.
        let ph = x_of(self.playhead_axis(), start);
        if ph >= lanes_rect.left() && ph <= lanes_rect.right() {
            p.vline(ph, ruler.top()..=rect.bottom() - 8.0, Stroke::new(1.5, ACCENT));
            p.rect_filled(Rect::from_center_size(pos2(ph, ruler.top() + 5.0), vec2(9.0, 9.0)), CornerRadius::same(2), ACCENT);
        }
    }
}

fn ruler_label(t: f64, step: f64) -> String {
    let s = t / 1000.0;
    if step < 1000.0 {
        format!("{}:{:04.1}", (s / 60.0) as u64, s % 60.0)
    } else {
        format!("{}:{:02}", (s / 60.0) as u64, (s % 60.0) as u64)
    }
}
