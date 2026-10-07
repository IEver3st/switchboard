//! Time and geometry math, ported from `src/shared/video-edits.ts` so preview
//! and export agree with the Electron app.

use crate::{AudioAutomation, Canvas, FramingKeyframe, FramingMode, GainPoint, Interpolation, Overlay, OverlayKind, Title, TitlePosition, VideoEdits};

/// Playback speed at source time `t`.
pub fn speed_at(t: f64, edits: Option<&VideoEdits>) -> f64 {
    let base = edits.and_then(|e| e.speed).unwrap_or(1.0);
    let points = edits.map(|e| e.speed_points.as_slice()).unwrap_or(&[]);
    let mut prev = (0.0, base, crate::SpeedTransition::Hold);
    for p in points {
        let pt = p.time_ms as f64;
        if pt > t {
            if prev.2 == crate::SpeedTransition::Hold || pt == prev.0 {
                return prev.1;
            }
            return prev.1 + (p.speed - prev.1) * ((t - prev.0) / (pt - prev.0)).max(0.0);
        }
        prev = (pt, p.speed, p.transition);
    }
    prev.1
}

/// Output time spent moving through source [a, b]: the integral of 1/speed.
/// A linear ramp gives a logarithmic duration.
pub fn moving_duration_ms(start: f64, end: f64, edits: Option<&VideoEdits>) -> f64 {
    if end <= start {
        return 0.0;
    }
    let mut bounds = vec![start];
    if let Some(e) = edits {
        bounds.extend(e.speed_points.iter().map(|p| p.time_ms as f64).filter(|&t| t > start && t < end));
    }
    bounds.push(end);
    let mut d = 0.0;
    for w in bounds.windows(2) {
        let (a, b) = (w[0], w[1]);
        let first = speed_at(a, edits);
        let last = speed_at(b - 0.000_001, edits);
        d += if (last - first).abs() < 0.000_001 { (b - a) / first } else { (b - a) * (last / first).ln() / (last - first) };
    }
    d
}

fn freezes_before(start: f64, source: f64, edits: Option<&VideoEdits>) -> f64 {
    edits
        .map(|e| {
            e.freezes
                .iter()
                .filter(|h| h.time_ms as f64 >= start && (h.time_ms as f64) < source)
                .map(|h| h.duration_ms as f64)
                .sum()
        })
        .unwrap_or(0.0)
}

pub fn edited_duration_ms(start: i64, end: i64, edits: Option<&VideoEdits>) -> i64 {
    (moving_duration_ms(start as f64, end as f64, edits) + freezes_before(start as f64, end as f64, edits)).round() as i64
}

/// Output time of source time `source`, measured from the segment start.
pub fn source_to_edited_ms(start: f64, source: f64, edits: Option<&VideoEdits>) -> f64 {
    moving_duration_ms(start, source, edits) + freezes_before(start, source, edits)
}

/// Source time at output offset `out` into a segment, and whether a freeze holds it.
pub fn edited_time_at(start: i64, end: i64, out: f64, edits: Option<&VideoEdits>) -> (f64, bool) {
    let (start, end) = (start as f64, end as f64);
    let target = out.max(0.0);
    let simple = edits.is_none_or(|e| e.speed_points.is_empty() && e.freezes.is_empty());
    if simple {
        let speed = edits.and_then(|e| e.speed).unwrap_or(1.0);
        return ((start + target * speed).min(end), false);
    }
    let e = edits.unwrap();
    for h in &e.freezes {
        let ht = h.time_ms as f64;
        if ht < start || ht >= end {
            continue;
        }
        let begins = source_to_edited_ms(start, ht, edits);
        if target >= begins && target < begins + h.duration_ms as f64 {
            return (ht, true);
        }
    }
    let (mut low, mut high) = (start, end);
    for _ in 0..36 {
        let mid = (low + high) / 2.0;
        if source_to_edited_ms(start, mid, edits) <= target {
            low = mid;
        } else {
            high = mid;
        }
    }
    (((low + high) / 2.0).clamp(start, end), false)
}

/// Interpolated framing at source time `t`.
pub fn framing_at(t: f64, edits: Option<&VideoEdits>) -> FramingKeyframe {
    let keys = edits.and_then(|e| e.framing.as_ref()).map(|f| f.keyframes.as_slice()).unwrap_or(&[]);
    let Some(first) = keys.first() else {
        return FramingKeyframe { time_ms: t as i64, x: 0.5, y: 0.5, zoom: 1.0, transition: Interpolation::Smooth };
    };
    if t <= first.time_ms as f64 {
        return *first;
    }
    let mut prev = *first;
    for next in &keys[1..] {
        if next.time_ms as f64 > t {
            let mut k = if prev.transition == Interpolation::Hold {
                0.0
            } else {
                (t - prev.time_ms as f64) / (next.time_ms - prev.time_ms) as f64
            };
            if prev.transition == Interpolation::Smooth {
                k = k * k * (3.0 - 2.0 * k);
            }
            return FramingKeyframe {
                time_ms: t as i64,
                x: prev.x + (next.x - prev.x) * k,
                y: prev.y + (next.y - prev.y) * k,
                zoom: prev.zoom + (next.zoom - prev.zoom) * k,
                transition: prev.transition,
            };
        }
        prev = *next;
    }
    prev
}

/// Linear gain between points; 1 with no points.
pub fn gain_at(points: &[GainPoint], t: f64) -> f64 {
    let Some(first) = points.first() else { return 1.0 };
    let mut prev = first;
    for next in &points[1..] {
        if next.time_ms as f64 > t {
            let k = ((t - prev.time_ms as f64) / (next.time_ms - prev.time_ms) as f64).max(0.0);
            return prev.gain + (next.gain - prev.gain) * k;
        }
        prev = next;
    }
    prev.gain
}

pub fn automation_gain_at(a: Option<&AudioAutomation>, t: f64) -> f64 {
    match a {
        None => 1.0,
        Some(a) if a.mutes.iter().any(|m| t >= m.start_ms as f64 && t < m.end_ms as f64) => 0.0,
        Some(a) => gain_at(&a.points, t),
    }
}

/// Output frame size for a canvas: keeps the source height, even dimensions.
pub fn canvas_dimensions(width: u32, height: u32, canvas: Canvas) -> (u32, u32) {
    let w = match canvas.ratio() {
        Some(r) => height as f64 * r,
        None => width as f64,
    };
    let even = |v: f64| ((v / 2.0).floor() as u32 * 2).max(2);
    (even(w), even(height as f64))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Geometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub zoom: f64,
    pub crop_x: f64,
    pub crop_y: f64,
}

/// Where the source lands in an output-shaped canvas after fit/fill, pan and
/// zoom. Preview and export use the same geometry.
pub fn framing_geometry(sw: f64, sh: f64, w: f64, h: f64, key: &FramingKeyframe, mode: FramingMode) -> Geometry {
    let fit = (w / sw).min(h / sh);
    let (iw, ih) = (sw * fit, sh * fit);
    let base = if mode == FramingMode::Fill { (w / iw).max(h / ih) } else { 1.0 };
    let zoom = base * key.zoom;
    let (pad_x, pad_y) = ((w - iw) / 2.0, (h - ih) / 2.0);
    let crop_x = (pad_x + (iw - w / zoom) * key.x).clamp(0.0, (w - w / zoom).max(0.0));
    let crop_y = (pad_y + (ih - h / zoom) * key.y).clamp(0.0, (h - h / zoom).max(0.0));
    Geometry { x: (pad_x - crop_x) * zoom, y: (pad_y - crop_y) * zoom, width: iw * zoom, height: ih * zoom, zoom, crop_x, crop_y }
}

/// Montage size targets (MB) for ~2, 5 and 10 Mbps.
pub fn montage_size_choices(duration_ms: i64) -> [u64; 3] {
    [2.0, 5.0, 10.0].map(|mbps: f64| {
        let mb = duration_ms as f64 / 1000.0 * (mbps + 0.192) / 8.0 * 1_000_000.0 / 1_048_576.0;
        ((mb / 5.0).ceil() as u64 * 5).max(10)
    })
}

/// The legacy single title as a positioned text overlay.
pub fn title_overlay(t: &Title, width: f64, height: f64) -> Overlay {
    let lines: Vec<&str> = t.content.split('\n').collect();
    let longest = lines.iter().map(|l| l.chars().count()).max().unwrap_or(1).max(1) as f64;
    let size = (height * t.size.fraction())
        .min(width * 0.88 / (longest * 0.65))
        .min(height * 0.7 / (lines.len().max(1) as f64 * 1.2));
    let box_h = (lines.len() as f64 * size * 1.2 / height).max(0.02);
    let y = match t.position {
        TitlePosition::Top => 0.08,
        TitlePosition::Center => 0.5 - box_h / 2.0,
        TitlePosition::Bottom => 0.92 - box_h,
    };
    Overlay {
        id: "legacy".into(),
        kind: OverlayKind::Text,
        content: Some(t.content.clone()),
        start_ms: t.start_ms,
        end_ms: t.end_ms,
        size: Some(t.size),
        x: 0.06,
        y,
        width: 0.88,
        height: box_h,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Freeze, SpeedPoint, SpeedTransition};

    fn edits() -> VideoEdits {
        VideoEdits::default()
    }

    #[test]
    fn constant_speed_scales_duration() {
        let e = VideoEdits { speed: Some(2.0), ..edits() };
        assert_eq!(edited_duration_ms(0, 10_000, Some(&e)), 5_000);
        assert_eq!(edited_time_at(0, 10_000, 1_000.0, Some(&e)).0, 2_000.0);
    }

    #[test]
    fn freezes_add_time_and_hold_the_frame() {
        let e = VideoEdits { freezes: vec![Freeze { time_ms: 2_000, duration_ms: 1_000 }], ..edits() };
        assert_eq!(edited_duration_ms(0, 10_000, Some(&e)), 11_000);
        assert_eq!(edited_time_at(0, 10_000, 2_500.0, Some(&e)), (2_000.0, true));
        let (src, frozen) = edited_time_at(0, 10_000, 4_000.0, Some(&e));
        assert!(!frozen && (src - 3_000.0).abs() < 1.0);
    }

    #[test]
    fn linear_ramp_has_logarithmic_duration() {
        let e = VideoEdits {
            speed_points: vec![
                SpeedPoint { time_ms: 0, speed: 1.0, transition: SpeedTransition::Linear },
                SpeedPoint { time_ms: 1_000, speed: 2.0, transition: SpeedTransition::Hold },
            ],
            ..edits()
        };
        // integral of 1/(1+t) over [0,1] s = ln 2
        let d = moving_duration_ms(0.0, 1_000.0, Some(&e));
        assert!((d - 1_000.0 * 2f64.ln()).abs() < 1.0, "{d}");
        // 0..5 s edits to ln2 s + 2 s; an in-range output time maps back exactly.
        let round = source_to_edited_ms(0.0, edited_time_at(0, 5_000, 2_000.0, Some(&e)).0, Some(&e));
        assert!((round - 2_000.0).abs() < 1.0, "{round}");
    }

    #[test]
    fn canvas_keeps_height_with_even_width() {
        assert_eq!(canvas_dimensions(2560, 1440, Canvas::Vertical), (810, 1440));
        assert_eq!(canvas_dimensions(2560, 1440, Canvas::Original), (2560, 1440));
        assert_eq!(canvas_dimensions(1920, 1080, Canvas::Square), (1080, 1080));
    }

    #[test]
    fn fill_framing_covers_the_canvas() {
        let k = FramingKeyframe { time_ms: 0, x: 0.5, y: 0.5, zoom: 1.0, transition: Interpolation::Smooth };
        let g = framing_geometry(2560.0, 1440.0, 810.0, 1440.0, &k, FramingMode::Fill);
        assert!(g.x <= 0.0 && g.y <= 0.0 && g.x + g.width >= 810.0 && g.height >= 1440.0 - 0.01);
        let g = framing_geometry(2560.0, 1440.0, 810.0, 1440.0, &k, FramingMode::Fit);
        assert!((g.width - 810.0).abs() < 0.01);
    }

    #[test]
    fn size_choices_round_up_to_five() {
        let c = montage_size_choices(60_000);
        assert!(c.iter().all(|v| v % 5 == 0 && *v >= 10));
        assert!(c[0] < c[1] && c[1] < c[2]);
    }
}
