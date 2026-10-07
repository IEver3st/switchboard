//! Edit projects: single-clip edits and montages share one model, ported
//! from the Electron app's montage-v2 schema (`src/shared/montage-v2.ts`,
//! `video-edits.ts`, `montage-audio.ts`). JSON field names match, so Electron
//! drafts can be imported as-is.
//!
//! All times are milliseconds. Edit times stay in source coordinates so trims,
//! splits and speed changes keep titles, overlays and keyframes in place.

pub mod store;
mod timing;

use serde::{Deserialize, Serialize};

pub use timing::*;

pub const SCHEMA_VERSION: u32 = 2;
/// Unkept drafts clear this long after their last save.
pub const DRAFT_RETENTION_MS: i64 = 3 * 60 * 60 * 1000;
pub const MAX_SEGMENTS: usize = 500;
pub const MIN_SEGMENT_MS: i64 = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Canvas {
    #[default]
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "16:9")]
    Landscape,
    #[serde(rename = "9:16")]
    Vertical,
    #[serde(rename = "1:1")]
    Square,
    #[serde(rename = "4:5")]
    Portrait,
}

impl Canvas {
    pub const ALL: [Canvas; 5] = [Canvas::Original, Canvas::Landscape, Canvas::Vertical, Canvas::Square, Canvas::Portrait];

    pub fn label(self) -> &'static str {
        match self {
            Canvas::Original => "Original",
            Canvas::Landscape => "16:9 landscape",
            Canvas::Vertical => "9:16 vertical",
            Canvas::Square => "1:1 square",
            Canvas::Portrait => "4:5 portrait",
        }
    }

    pub fn ratio(self) -> Option<f64> {
        match self {
            Canvas::Original => None,
            Canvas::Landscape => Some(16.0 / 9.0),
            Canvas::Vertical => Some(9.0 / 16.0),
            Canvas::Square => Some(1.0),
            Canvas::Portrait => Some(4.0 / 5.0),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Interpolation {
    Linear,
    #[default]
    Smooth,
    Hold,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FramingKeyframe {
    pub time_ms: i64,
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
    pub transition: Interpolation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum FramingMode {
    #[default]
    Fill,
    Fit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum FramingBackground {
    #[default]
    Black,
    Blur,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct Framing {
    pub mode: FramingMode,
    pub background: FramingBackground,
    pub keyframes: Vec<FramingKeyframe>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GainPoint {
    pub time_ms: i64,
    pub gain: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MuteRange {
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioAutomation {
    pub track_index: usize,
    #[serde(default)]
    pub points: Vec<GainPoint>,
    #[serde(default)]
    pub mutes: Vec<MuteRange>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverlayKind {
    Text,
    Blur,
    Pixelate,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TextSize {
    Small,
    #[default]
    Medium,
    Large,
}

impl TextSize {
    /// Text height as a fraction of the frame height.
    pub fn fraction(self) -> f64 {
        match self {
            TextSize::Small => 0.035,
            TextSize::Medium => 0.055,
            TextSize::Large => 0.08,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Overlay {
    pub id: String,
    pub kind: OverlayKind,
    pub start_ms: i64,
    pub end_ms: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<TextSize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TitlePosition {
    Top,
    Center,
    #[default]
    Bottom,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Title {
    pub content: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub position: TitlePosition,
    pub size: TextSize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SpeedTransition {
    Linear,
    #[default]
    Hold,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedPoint {
    pub time_ms: i64,
    pub speed: f64,
    pub transition: SpeedTransition,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Freeze {
    pub time_ms: i64,
    pub duration_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VideoEdits {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brightness: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contrast: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub saturation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_horizontal: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<Title>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub framing: Option<Framing>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overlays: Vec<Overlay>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub speed_points: Vec<SpeedPoint>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub freezes: Vec<Freeze>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub audio_automation: Vec<AudioAutomation>,
}

impl VideoEdits {
    pub fn is_empty(&self) -> bool {
        self.speed.unwrap_or(1.0) == 1.0
            && self.brightness.unwrap_or(0.0) == 0.0
            && self.contrast.unwrap_or(1.0) == 1.0
            && self.saturation.unwrap_or(1.0) == 1.0
            && !self.flip_horizontal.unwrap_or(false)
            && self.text.as_ref().is_none_or(|t| t.content.is_empty())
            && self.framing.is_none()
            && self.overlays.is_empty()
            && self.speed_points.is_empty()
            && self.freezes.is_empty()
            && self.audio_automation.is_empty()
    }

    pub fn automation(&self, track: usize) -> Option<&AudioAutomation> {
        self.audio_automation.iter().find(|a| a.track_index == track)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTrim {
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub clip_id: String,
    pub source_duration_ms: i64,
    pub trim_start_ms: i64,
    pub trim_end_ms: i64,
    #[serde(default = "one")]
    pub volume: f64,
    #[serde(default)]
    pub muted: bool,
    /// Per-track level 0..=100, by audio stream order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_track_levels: Option<Vec<u8>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_track_trims: Option<Vec<Option<TrackTrim>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_edits: Option<VideoEdits>,
}

fn one() -> f64 {
    1.0
}

impl Segment {
    pub fn new(clip_id: &str, source_duration_ms: i64, levels: Option<Vec<u8>>) -> Segment {
        Segment {
            id: uuid(),
            clip_id: clip_id.to_string(),
            source_duration_ms,
            trim_start_ms: 0,
            trim_end_ms: source_duration_ms,
            volume: 1.0,
            muted: false,
            audio_track_levels: levels,
            audio_track_trims: None,
            video_edits: None,
        }
    }

    pub fn edits(&self) -> Option<&VideoEdits> {
        self.video_edits.as_ref()
    }

    /// Output duration after speed changes and freezes.
    pub fn duration_ms(&self) -> i64 {
        edited_duration_ms(self.trim_start_ms, self.trim_end_ms, self.edits())
    }

    pub fn level(&self, track: usize) -> f64 {
        self.audio_track_levels.as_ref().and_then(|l| l.get(track)).map(|&v| v as f64 / 100.0).unwrap_or(1.0)
    }

    pub fn set_level(&mut self, track: usize, level: u8, tracks: usize) {
        let levels = self.audio_track_levels.get_or_insert_with(|| vec![100; tracks]);
        if levels.len() < tracks {
            levels.resize(tracks, 100);
        }
        if track < levels.len() {
            levels[track] = level.min(100);
        }
    }

    pub fn track_trim(&self, track: usize) -> Option<TrackTrim> {
        self.audio_track_trims.as_ref().and_then(|t| t.get(track).copied().flatten())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ducking {
    pub enabled: bool,
    pub amount: f64,
    pub attack_ms: i64,
    pub release_ms: i64,
}

impl Default for Ducking {
    fn default() -> Self {
        Ducking { enabled: true, amount: 0.75, attack_ms: 80, release_ms: 500 }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAsset {
    pub id: String,
    pub name: String,
    pub original_name: String,
    pub duration_ms: i64,
    pub file_size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct MusicAutomation {
    #[serde(default)]
    pub points: Vec<GainPoint>,
    #[serde(default)]
    pub mutes: Vec<MuteRange>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Music {
    pub id: String,
    pub asset: AudioAsset,
    pub timeline_start_ms: i64,
    pub source_start_ms: i64,
    pub source_end_ms: i64,
    #[serde(default = "music_volume")]
    pub volume: f64,
    #[serde(default)]
    pub muted: bool,
    #[serde(default = "fade_in")]
    pub fade_in_ms: i64,
    #[serde(default = "fade_out")]
    pub fade_out_ms: i64,
    #[serde(default = "yes")]
    pub r#loop: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub automation: Option<MusicAutomation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ducking: Option<Ducking>,
}

fn music_volume() -> f64 {
    0.18
}
fn fade_in() -> i64 {
    1000
}
fn fade_out() -> i64 {
    1500
}
fn yes() -> bool {
    true
}

impl Music {
    pub fn new(asset: AudioAsset) -> Music {
        let end = asset.duration_ms;
        Music {
            id: uuid(),
            asset,
            timeline_start_ms: 0,
            source_start_ms: 0,
            source_end_ms: end,
            volume: music_volume(),
            muted: false,
            fade_in_ms: fade_in(),
            fade_out_ms: fade_out(),
            r#loop: true,
            automation: None,
            ducking: None,
        }
    }

    /// Clamps trims, start and fades against the asset and project length.
    pub fn normalized(&self, project_ms: i64) -> Music {
        let mut m = self.clone();
        m.source_start_ms = self.source_start_ms.clamp(0, (self.asset.duration_ms - 100).max(0));
        m.source_end_ms = self.source_end_ms.min(self.asset.duration_ms).max(m.source_start_ms + 100);
        m.timeline_start_ms = self.timeline_start_ms.clamp(0, (project_ms - 1).max(0));
        let active = if self.r#loop {
            (project_ms - m.timeline_start_ms).max(0)
        } else {
            (m.source_end_ms - m.source_start_ms).min((project_ms - m.timeline_start_ms).max(0))
        };
        let max_fade = active / 2;
        m.volume = self.volume.clamp(0.0, 1.0);
        m.fade_in_ms = self.fade_in_ms.clamp(0, max_fade);
        m.fade_out_ms = self.fade_out_ms.clamp(0, max_fade);
        m
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub schema_version: u32,
    /// Always "montage"; kept for schema compatibility.
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kept: Option<bool>,
    /// Set for a single-clip edit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_clip_id: Option<String>,
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub duration_ms: i64,
    pub canvas_size: Canvas,
    pub segments: Vec<Segment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music: Option<Music>,
}

impl Project {
    /// A single-clip edit project.
    pub fn for_clip(clip_id: &str, name: &str, source_duration_ms: i64, levels: Option<Vec<u8>>, now: i64) -> Project {
        let mut p = Project {
            schema_version: SCHEMA_VERSION,
            kind: "montage".into(),
            kept: None,
            source_clip_id: Some(clip_id.to_string()),
            id: uuid(),
            name: truncate_name(name),
            created_at: now,
            updated_at: now,
            duration_ms: 0,
            canvas_size: Canvas::Original,
            segments: vec![Segment::new(clip_id, source_duration_ms, levels)],
            music: None,
        };
        p.refresh();
        p
    }

    /// A montage of several clips, in order.
    pub fn montage(name: &str, clips: &[(String, i64, Option<Vec<u8>>)], now: i64) -> Project {
        let mut p = Project {
            schema_version: SCHEMA_VERSION,
            kind: "montage".into(),
            kept: None,
            source_clip_id: None,
            id: uuid(),
            name: truncate_name(name),
            created_at: now,
            updated_at: now,
            duration_ms: 0,
            canvas_size: Canvas::Original,
            segments: clips.iter().map(|(id, dur, levels)| Segment::new(id, *dur, levels.clone())).collect(),
            music: None,
        };
        p.refresh();
        p
    }

    pub fn is_clip_edit(&self) -> bool {
        self.source_clip_id.is_some()
    }

    pub fn is_kept(&self) -> bool {
        self.kept.unwrap_or(false)
    }

    /// Recomputes the duration and keeps music inside the project.
    pub fn refresh(&mut self) {
        self.duration_ms = self.segments.iter().map(Segment::duration_ms).sum::<i64>().max(1);
        if let Some(m) = &self.music {
            self.music = Some(m.normalized(self.duration_ms));
        }
    }

    /// Output start of each segment.
    pub fn segment_starts(&self) -> Vec<i64> {
        let mut t = 0;
        self.segments
            .iter()
            .map(|s| {
                let start = t;
                t += s.duration_ms();
                start
            })
            .collect()
    }

    /// Which segment plays at output time `t`, and the source time there.
    pub fn locate(&self, t_ms: f64) -> Option<(usize, f64, bool)> {
        let mut start = 0.0;
        for (i, s) in self.segments.iter().enumerate() {
            let d = s.duration_ms() as f64;
            if t_ms < start + d || i + 1 == self.segments.len() {
                let (src, frozen) = edited_time_at(s.trim_start_ms, s.trim_end_ms, (t_ms - start).max(0.0), s.edits());
                return Some((i, src, frozen));
            }
            start += d;
        }
        None
    }

    /// Clamps every value into its valid range. Use after loading untrusted JSON.
    pub fn sanitized(mut self) -> Project {
        self.name = truncate_name(&self.name);
        self.segments.truncate(MAX_SEGMENTS);
        for s in &mut self.segments {
            s.source_duration_ms = s.source_duration_ms.max(MIN_SEGMENT_MS);
            s.trim_start_ms = s.trim_start_ms.clamp(0, s.source_duration_ms - MIN_SEGMENT_MS);
            s.trim_end_ms = s.trim_end_ms.clamp(s.trim_start_ms + MIN_SEGMENT_MS, s.source_duration_ms);
            s.volume = s.volume.clamp(0.0, 1.0);
            if let Some(l) = &mut s.audio_track_levels {
                l.truncate(8);
                for v in l.iter_mut() {
                    *v = (*v).min(100);
                }
            }
            if let Some(e) = &mut s.video_edits {
                sanitize_edits(e);
            }
        }
        self.refresh();
        self
    }
}

fn sanitize_edits(e: &mut VideoEdits) {
    e.speed = e.speed.map(|v| v.clamp(0.25, 4.0));
    e.brightness = e.brightness.map(|v| v.clamp(-0.3, 0.3));
    e.contrast = e.contrast.map(|v| v.clamp(0.5, 1.5));
    e.saturation = e.saturation.map(|v| v.clamp(0.0, 2.0));
    if let Some(f) = &mut e.framing {
        f.keyframes.truncate(128);
        for k in &mut f.keyframes {
            k.x = k.x.clamp(0.0, 1.0);
            k.y = k.y.clamp(0.0, 1.0);
            k.zoom = k.zoom.clamp(1.0, 8.0);
        }
        f.keyframes.sort_by_key(|k| k.time_ms);
        f.keyframes.dedup_by_key(|k| k.time_ms);
    }
    e.overlays.truncate(32);
    for o in &mut e.overlays {
        o.width = o.width.clamp(0.02, 1.0);
        o.height = o.height.clamp(0.02, 1.0);
        o.x = o.x.clamp(0.0, 1.0 - o.width);
        o.y = o.y.clamp(0.0, 1.0 - o.height);
        if o.end_ms <= o.start_ms {
            o.end_ms = o.start_ms + 100;
        }
        if let Some(c) = &mut o.content {
            c.retain(|ch| ch == '\n' || !ch.is_control());
            c.truncate(500);
        }
    }
    e.speed_points.truncate(64);
    for p in &mut e.speed_points {
        p.speed = p.speed.clamp(0.25, 4.0);
    }
    e.speed_points.sort_by_key(|p| p.time_ms);
    e.speed_points.dedup_by_key(|p| p.time_ms);
    e.freezes.truncate(32);
    for f in &mut e.freezes {
        f.duration_ms = f.duration_ms.clamp(100, 30_000);
    }
    e.freezes.sort_by_key(|f| f.time_ms);
    e.freezes.dedup_by_key(|f| f.time_ms);
    e.audio_automation.truncate(8);
    for a in &mut e.audio_automation {
        a.points.truncate(128);
        a.mutes.truncate(64);
        for p in &mut a.points {
            p.gain = p.gain.clamp(0.0, 1.0);
        }
        a.points.sort_by_key(|p| p.time_ms);
        a.points.dedup_by_key(|p| p.time_ms);
    }
}

fn truncate_name(name: &str) -> String {
    let t: String = name.trim().chars().filter(|c| !c.is_control()).take(120).collect();
    if t.is_empty() { "Untitled".into() } else { t }
}

/// Random v4 UUID from the system RNG.
pub fn uuid() -> String {
    use windows::Win32::Security::Cryptography::{BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom};
    let mut b = [0u8; 16];
    unsafe {
        let _ = BCryptGenRandom(None, &mut b, BCRYPT_USE_SYSTEM_PREFERRED_RNG);
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: Vec<String> = b.iter().map(|x| format!("{x:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        h[0..4].concat(),
        h[4..6].concat(),
        h[6..8].concat(),
        h[8..10].concat(),
        h[10..16].concat()
    )
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn electron_draft_json_round_trips() {
        let json = r#"{"schemaVersion":2,"type":"montage","kept":true,"sourceClipId":"c1","id":"0f8f6c1e-1111-4222-8333-444455556666",
            "name":"SB FiveM","createdAt":1,"updatedAt":2,"durationMs":29999,"canvasSize":"9:16",
            "segments":[{"id":"0f8f6c1e-1111-4222-8333-444455556667","clipId":"c1","sourceDurationMs":29999,"trimStartMs":0,
            "trimEndMs":29999,"volume":1,"muted":false,"audioTrackLevels":[100,100,20],
            "videoEdits":{"framing":{"mode":"fill","background":"blur","keyframes":[{"timeMs":0,"x":0.5,"y":0.5,"zoom":1,"transition":"smooth"}]}}}]}"#;
        let p: Project = serde_json::from_str(json).unwrap();
        assert_eq!(p.canvas_size, Canvas::Vertical);
        assert_eq!(p.segments[0].level(2), 0.2);
        assert!(p.is_kept() && p.is_clip_edit());
        let back = serde_json::to_string(&p).unwrap();
        assert!(back.contains("\"canvasSize\":\"9:16\"") && back.contains("\"trimEndMs\":29999"));
    }

    #[test]
    fn uuids_are_v4() {
        let u = uuid();
        assert_eq!(u.len(), 36);
        assert_eq!(&u[14..15], "4");
        assert_ne!(u, uuid());
    }

    #[test]
    fn locate_maps_output_time_across_segments() {
        let p = Project::montage("m", &[("a".into(), 10_000, None), ("b".into(), 5_000, None)], 0);
        assert_eq!(p.duration_ms, 15_000);
        assert_eq!(p.locate(2_000.0).map(|l| (l.0, l.1.round() as i64)), Some((0, 2_000)));
        assert_eq!(p.locate(12_000.0).map(|l| (l.0, l.1.round() as i64)), Some((1, 2_000)));
    }

    #[test]
    fn sanitize_clamps_untrusted_values() {
        let mut p = Project::for_clip("c", "  ", 10_000, None, 0);
        p.segments[0].trim_start_ms = -5;
        p.segments[0].trim_end_ms = 99_999;
        p.segments[0].volume = 7.0;
        let p = p.sanitized();
        assert_eq!(p.name, "Untitled");
        assert_eq!((p.segments[0].trim_start_ms, p.segments[0].trim_end_ms), (0, 10_000));
        assert_eq!(p.segments[0].volume, 1.0);
    }
}
