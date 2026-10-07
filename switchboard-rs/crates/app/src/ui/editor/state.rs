//! Editor model: the project being edited, undo/redo, autosave timing, and
//! every edit command. Ported from the old app's MontageComposer behavior.
//! Pure logic: no UI, no media, fully unit-tested.

use std::time::{Duration, Instant};

use switchboard_project::{
    AudioAutomation, Canvas, Freeze, FramingKeyframe, GainPoint, MIN_SEGMENT_MS, MuteRange, Overlay,
    OverlayKind, Project, Segment, SpeedPoint, SpeedTransition, TextSize, TrackTrim, VideoEdits, uuid,
};

const HISTORY: usize = 80;
/// Changes with the same key inside this window merge into one undo step.
const MERGE_WINDOW: Duration = Duration::from_millis(900);
/// Autosave runs this long after the last change.
pub const AUTOSAVE_DELAY: Duration = Duration::from_millis(450);

pub struct EditState {
    pub project: Project,
    undo: Vec<Project>,
    redo: Vec<Project>,
    last_key: Option<(&'static str, Instant)>,
    /// Set on every change; cleared when the draft is written.
    pub dirty_since: Option<Instant>,
    /// Selected segment (index into project.segments).
    pub selected: usize,
}

impl EditState {
    pub fn new(project: Project) -> EditState {
        EditState { project, undo: Vec::new(), redo: Vec::new(), last_key: None, dirty_since: None, selected: 0 }
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    /// Applies a change as one undo step. `key` lets rapid repeats of the
    /// same kind of change (dragging a slider) merge into a single step.
    pub fn change(&mut self, key: &'static str, f: impl FnOnce(&mut Project)) {
        let before = self.project.clone();
        f(&mut self.project);
        self.project.refresh();
        if self.project == before {
            return;
        }
        let now = Instant::now();
        let merge = matches!(self.last_key, Some((k, at)) if k == key && now.duration_since(at) < MERGE_WINDOW);
        if !merge {
            self.undo.push(before);
            if self.undo.len() > HISTORY {
                self.undo.remove(0);
            }
        }
        self.redo.clear();
        self.last_key = Some((key, now));
        self.dirty_since = Some(now);
        self.selected = self.selected.min(self.project.segments.len() - 1);
    }

    pub fn undo(&mut self) {
        if let Some(p) = self.undo.pop() {
            self.redo.push(std::mem::replace(&mut self.project, p));
            self.after_history();
        }
    }

    pub fn redo(&mut self) {
        if let Some(p) = self.redo.pop() {
            self.undo.push(std::mem::replace(&mut self.project, p));
            self.after_history();
        }
    }

    fn after_history(&mut self) {
        self.last_key = None;
        self.dirty_since = Some(Instant::now());
        self.selected = self.selected.min(self.project.segments.len() - 1);
    }

    /// True once the autosave delay has passed since the last change.
    pub fn should_save(&self) -> bool {
        self.dirty_since.is_some_and(|t| t.elapsed() >= AUTOSAVE_DELAY)
    }

    // ------------------------------------------------------- segments

    /// Splits segment `i` at source time `at`; both halves keep the edits.
    pub fn split(&mut self, i: usize, at: f64) -> bool {
        let Some(s) = self.project.segments.get(i) else { return false };
        let at = at.round() as i64;
        if at - s.trim_start_ms < MIN_SEGMENT_MS || s.trim_end_ms - at < MIN_SEGMENT_MS {
            return false;
        }
        self.change("split", |p| {
            let mut right = p.segments[i].clone();
            right.id = uuid();
            right.trim_start_ms = at;
            p.segments[i].trim_end_ms = at;
            p.segments.insert(i + 1, right);
        });
        self.selected = i + 1;
        true
    }

    pub fn duplicate(&mut self, i: usize) {
        if i >= self.project.segments.len() || self.project.segments.len() >= switchboard_project::MAX_SEGMENTS {
            return;
        }
        self.change("duplicate", |p| {
            let mut copy = p.segments[i].clone();
            copy.id = uuid();
            p.segments.insert(i + 1, copy);
        });
        self.selected = i + 1;
    }

    /// Removes a segment; a project always keeps at least one.
    pub fn remove(&mut self, i: usize) {
        if self.project.segments.len() <= 1 || i >= self.project.segments.len() {
            return;
        }
        self.change("remove", |p| {
            p.segments.remove(i);
        });
    }

    pub fn move_segment(&mut self, i: usize, delta: isize) {
        let j = i as isize + delta;
        if j < 0 || j as usize >= self.project.segments.len() {
            return;
        }
        self.change("move", |p| p.segments.swap(i, j as usize));
        self.selected = j as usize;
    }

    /// Inserts after `after` and selects the first inserted segment.
    pub fn insert_segments(&mut self, after: usize, segments: Vec<Segment>) {
        let room = switchboard_project::MAX_SEGMENTS.saturating_sub(self.project.segments.len());
        if room == 0 || segments.is_empty() {
            return;
        }
        let at = (after + 1).min(self.project.segments.len());
        self.change("insert", |p| {
            for (k, s) in segments.into_iter().take(room).enumerate() {
                p.segments.insert(at + k, s);
            }
        });
        self.selected = at;
    }

    pub fn set_trim_start(&mut self, i: usize, ms: f64) {
        self.change("trim-start", |p| {
            let s = &mut p.segments[i];
            s.trim_start_ms = (ms.round() as i64).clamp(0, s.trim_end_ms - MIN_SEGMENT_MS);
        });
    }

    pub fn set_trim_end(&mut self, i: usize, ms: f64) {
        self.change("trim-end", |p| {
            let s = &mut p.segments[i];
            s.trim_end_ms = (ms.round() as i64).clamp(s.trim_start_ms + MIN_SEGMENT_MS, s.source_duration_ms);
        });
    }

    pub fn reset_trim(&mut self, i: usize) {
        self.change("trim-reset", |p| {
            let s = &mut p.segments[i];
            s.trim_start_ms = 0;
            s.trim_end_ms = s.source_duration_ms;
        });
    }

    // ---------------------------------------------------------- audio

    pub fn set_level(&mut self, i: usize, track: usize, level: u8, tracks: usize) {
        self.change("level", |p| p.segments[i].set_level(track, level, tracks));
    }

    /// Mutes a track by setting it to 0, restoring the last audible level.
    pub fn toggle_track_mute(&mut self, i: usize, track: usize, tracks: usize, restore: u8) {
        let current = (self.project.segments[i].level(track) * 100.0).round() as u8;
        let next = if current == 0 { restore.max(1) } else { 0 };
        self.change("track-mute", |p| p.segments[i].set_level(track, next, tracks));
    }

    pub fn set_volume(&mut self, i: usize, v: f64) {
        self.change("volume", |p| p.segments[i].volume = v.clamp(0.0, 1.0));
    }

    pub fn set_muted(&mut self, i: usize, muted: bool) {
        self.change("muted", |p| p.segments[i].muted = muted);
    }

    pub fn set_track_trim(&mut self, i: usize, track: usize, trim: Option<TrackTrim>, tracks: usize) {
        self.change("track-trim", |p| {
            let s = &mut p.segments[i];
            let trims = s.audio_track_trims.get_or_insert_with(|| vec![None; tracks]);
            if trims.len() < tracks {
                trims.resize(tracks, None);
            }
            if track < trims.len() {
                trims[track] = trim.map(|t| TrackTrim {
                    start_ms: t.start_ms.clamp(0, s.source_duration_ms - MIN_SEGMENT_MS),
                    end_ms: t.end_ms.clamp(t.start_ms + MIN_SEGMENT_MS, s.source_duration_ms),
                });
            }
            if trims.iter().all(Option::is_none) {
                s.audio_track_trims = None;
            }
        });
    }

    fn automation_mut(p: &mut Project, i: usize, track: usize) -> &mut AudioAutomation {
        let edits = p.segments[i].video_edits.get_or_insert_with(VideoEdits::default);
        if let Some(k) = edits.audio_automation.iter().position(|a| a.track_index == track) {
            return &mut edits.audio_automation[k];
        }
        edits.audio_automation.push(AudioAutomation { track_index: track, points: Vec::new(), mutes: Vec::new() });
        edits.audio_automation.last_mut().unwrap()
    }

    /// Adds or replaces a volume point at source time `at`.
    pub fn add_gain_point(&mut self, i: usize, track: usize, at: f64, gain: f64) {
        self.change("gain-point", |p| {
            let a = Self::automation_mut(p, i, track);
            let t = at.round() as i64;
            a.points.retain(|x| x.time_ms != t);
            if a.points.len() < 128 {
                a.points.push(GainPoint { time_ms: t, gain: gain.clamp(0.0, 1.0) });
                a.points.sort_by_key(|x| x.time_ms);
            }
        });
    }

    /// Mutes one second of a track starting at `at`.
    pub fn add_mute(&mut self, i: usize, track: usize, at: f64) {
        self.change("mute-range", |p| {
            let end = p.segments[i].source_duration_ms;
            let a = Self::automation_mut(p, i, track);
            let start = at.round() as i64;
            if a.mutes.len() < 64 && start < end {
                a.mutes.push(MuteRange { start_ms: start, end_ms: (start + 1000).min(end) });
                a.mutes.sort_by_key(|m| m.start_ms);
            }
        });
    }

    pub fn clear_automation(&mut self, i: usize, track: usize) {
        self.change("automation-clear", |p| {
            if let Some(e) = &mut p.segments[i].video_edits {
                e.audio_automation.retain(|a| a.track_index != track);
                if e.is_empty() {
                    p.segments[i].video_edits = None;
                }
            }
        });
    }

    // ---------------------------------------------------------- video

    pub fn set_canvas(&mut self, c: Canvas) {
        self.change("canvas", |p| p.canvas_size = c);
    }

    pub fn set_name(&mut self, name: &str) {
        let name: String = name.trim().chars().filter(|c| !c.is_control()).take(120).collect();
        if !name.is_empty() {
            self.change("name", |p| p.name = name);
        }
    }

    pub fn edit(&mut self, i: usize, key: &'static str, f: impl FnOnce(&mut VideoEdits)) {
        self.change(key, |p| {
            let e = p.segments[i].video_edits.get_or_insert_with(VideoEdits::default);
            f(e);
            if e.is_empty() {
                p.segments[i].video_edits = None;
            }
        });
    }

    pub fn add_keyframe(&mut self, i: usize, at: f64, key: FramingKeyframe) {
        self.edit(i, "keyframe", |e| {
            let f = e.framing.get_or_insert_with(Default::default);
            let t = at.round() as i64;
            f.keyframes.retain(|k| k.time_ms != t);
            if f.keyframes.len() < 128 {
                f.keyframes.push(FramingKeyframe { time_ms: t, ..key });
                f.keyframes.sort_by_key(|k| k.time_ms);
            }
        });
    }

    pub fn add_speed_point(&mut self, i: usize, at: f64, speed: f64, transition: SpeedTransition) {
        self.edit(i, "speed-point", |e| {
            let t = at.round() as i64;
            e.speed_points.retain(|p| p.time_ms != t);
            if e.speed_points.len() < 64 {
                e.speed_points.push(SpeedPoint { time_ms: t, speed: speed.clamp(0.25, 4.0), transition });
                e.speed_points.sort_by_key(|p| p.time_ms);
            }
        });
    }

    pub fn add_freeze(&mut self, i: usize, at: f64, duration_ms: i64) {
        self.edit(i, "freeze", |e| {
            let t = at.round() as i64;
            e.freezes.retain(|f| f.time_ms != t);
            if e.freezes.len() < 32 {
                e.freezes.push(Freeze { time_ms: t, duration_ms: duration_ms.clamp(100, 30_000) });
                e.freezes.sort_by_key(|f| f.time_ms);
            }
        });
    }

    /// Adds a text, blur or pixelate overlay lasting 3 s from `at`.
    pub fn add_overlay(&mut self, i: usize, kind: OverlayKind, at: f64) -> Option<String> {
        let end = self.project.segments.get(i)?.trim_end_ms;
        let start = at.round() as i64;
        let id = uuid();
        let o = Overlay {
            id: id.clone(),
            kind,
            start_ms: start,
            end_ms: (start + 3000).min(end).max(start + 100),
            x: 0.3,
            y: if kind == OverlayKind::Text { 0.78 } else { 0.35 },
            width: 0.4,
            height: if kind == OverlayKind::Text { 0.1 } else { 0.3 },
            content: (kind == OverlayKind::Text).then(|| "Text".to_string()),
            size: (kind == OverlayKind::Text).then_some(TextSize::Medium),
        };
        let mut added = false;
        self.edit(i, "overlay-add", |e| {
            if e.overlays.len() < 32 {
                e.overlays.push(o);
                added = true;
            }
        });
        added.then_some(id)
    }

    pub fn reset_picture(&mut self, i: usize) {
        self.edit(i, "picture-reset", |e| {
            e.brightness = None;
            e.contrast = None;
            e.saturation = None;
            e.flip_horizontal = None;
        });
    }
}

/// Snaps a source time to the nearest frame boundary.
pub fn snap_to_frame(ms: f64, fps: f64) -> f64 {
    if fps <= 0.0 {
        return ms;
    }
    let frame = 1000.0 / fps;
    (ms / frame).round() * frame
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> EditState {
        EditState::new(Project::for_clip("clip.mp4", "Clip", 30_000, None, 0))
    }

    #[test]
    fn split_keeps_total_duration_and_undo_restores() {
        let mut s = state();
        assert!(s.split(0, 10_000.0));
        assert_eq!(s.project.segments.len(), 2);
        assert_eq!(s.project.duration_ms, 30_000);
        assert_eq!((s.project.segments[0].trim_end_ms, s.project.segments[1].trim_start_ms), (10_000, 10_000));
        assert_ne!(s.project.segments[0].id, s.project.segments[1].id);
        s.undo();
        assert_eq!(s.project.segments.len(), 1);
        s.redo();
        assert_eq!(s.project.segments.len(), 2);
    }

    #[test]
    fn split_refuses_slivers() {
        let mut s = state();
        assert!(!s.split(0, 50.0));
        assert!(!s.split(0, 29_950.0));
    }

    #[test]
    fn last_segment_cannot_be_removed() {
        let mut s = state();
        s.remove(0);
        assert_eq!(s.project.segments.len(), 1);
        s.duplicate(0);
        s.remove(0);
        assert_eq!(s.project.segments.len(), 1);
    }

    #[test]
    fn trims_clamp_and_keep_minimum_length() {
        let mut s = state();
        s.set_trim_start(0, 29_990.0);
        assert_eq!(s.project.segments[0].trim_start_ms, 30_000 - MIN_SEGMENT_MS);
        s.set_trim_end(0, 0.0);
        assert_eq!(s.project.segments[0].trim_end_ms, 30_000);
        s.reset_trim(0);
        assert_eq!(s.project.duration_ms, 30_000);
    }

    #[test]
    fn rapid_slider_changes_merge_into_one_step() {
        let mut s = state();
        for v in [90, 80, 70, 60] {
            s.set_level(0, 2, v, 3);
        }
        assert_eq!(s.project.segments[0].level(2), 0.6);
        s.undo();
        assert_eq!(s.project.segments[0].level(2), 1.0);
        assert!(!s.can_undo());
    }

    #[test]
    fn mute_toggle_restores_the_level() {
        let mut s = state();
        s.toggle_track_mute(0, 1, 3, 100);
        assert_eq!(s.project.segments[0].level(1), 0.0);
        s.toggle_track_mute(0, 1, 3, 40);
        assert_eq!(s.project.segments[0].level(1), 0.4);
    }

    #[test]
    fn freezes_and_speed_change_duration() {
        let mut s = state();
        s.add_freeze(0, 1_000.0, 2_000);
        assert_eq!(s.project.duration_ms, 32_000);
        s.edit(0, "speed", |e| e.speed = Some(2.0));
        assert_eq!(s.project.duration_ms, 17_000);
    }

    #[test]
    fn automation_points_stay_sorted_and_unique() {
        let mut s = state();
        s.add_gain_point(0, 0, 5_000.0, 0.5);
        s.add_gain_point(0, 0, 1_000.0, 1.0);
        s.add_gain_point(0, 0, 5_000.0, 0.2);
        let a = s.project.segments[0].edits().unwrap().automation(0).unwrap();
        assert_eq!(a.points.iter().map(|p| p.time_ms).collect::<Vec<_>>(), [1_000, 5_000]);
        assert_eq!(a.points[1].gain, 0.2);
        s.clear_automation(0, 0);
        assert!(s.project.segments[0].video_edits.is_none());
    }

    #[test]
    fn frames_snap() {
        assert!((snap_to_frame(1_010.0, 60.0) - 1_016.666).abs() < 0.01);
    }
}
