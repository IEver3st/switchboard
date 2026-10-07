//! Capture-window planning, merging, derived multi-kills, titles and relative
//! markers (port of `capture-window-planner.ts`).

use crate::events::{EventMetadata, GameEvent, GameEventType};
use serde::{Deserialize, Serialize};

/// Maximum events (and markers) retained per window.
pub const MAX_EVENTS_PER_WINDOW: usize = 128;

#[derive(Debug, Clone, PartialEq)]
pub struct PendingWindow {
    pub id: u64,
    pub game_id: String,
    pub provider_id: String,
    pub started_at_ms: u64,
    pub ends_at_ms: u64,
    pub events: Vec<GameEvent>,
}

pub fn plan_window(
    id: u64,
    event: &GameEvent,
    pre_roll_ms: u64,
    post_roll_ms: u64,
) -> PendingWindow {
    PendingWindow {
        id,
        game_id: event.game_id.clone(),
        provider_id: event.provider_id.clone(),
        started_at_ms: event.timestamp_ms.saturating_sub(pre_roll_ms),
        ends_at_ms: event.timestamp_ms.saturating_add(post_roll_ms),
        events: vec![event.clone()],
    }
}

/// Merge `next` into `current` when it belongs to the same game and provider,
/// starts no later than `current.end + threshold`, and the union stays within
/// `maximum_duration_ms`. Returns `None` when a new window is required.
pub fn merge_windows(
    current: &PendingWindow,
    next: &PendingWindow,
    merge_threshold_ms: u64,
    maximum_duration_ms: u64,
) -> Option<PendingWindow> {
    if current.game_id != next.game_id || current.provider_id != next.provider_id {
        return None;
    }
    if next.started_at_ms > current.ends_at_ms.saturating_add(merge_threshold_ms) {
        return None;
    }
    let started_at_ms = current.started_at_ms.min(next.started_at_ms);
    let ends_at_ms = current.ends_at_ms.max(next.ends_at_ms);
    if ends_at_ms - started_at_ms > maximum_duration_ms {
        return None;
    }
    let mut events = current.events.clone();
    events.extend(next.events.iter().cloned());
    events.truncate(MAX_EVENTS_PER_WINDOW);
    Some(PendingWindow {
        started_at_ms,
        ends_at_ms,
        events,
        ..current.clone()
    })
}

/// Append a derived `multi_kill` ("N Kills") when a window holds two or more
/// kills/headshots and no native multi-kill marker.
pub fn add_derived_multi_kill(events: &[GameEvent]) -> Vec<GameEvent> {
    let mut output = events.to_vec();
    if events
        .iter()
        .any(|e| e.event_type == GameEventType::MultiKill)
    {
        return output;
    }
    let kills: Vec<&GameEvent> = events.iter().filter(|e| e.event_type.is_kill()).collect();
    if kills.len() < 2 {
        return output;
    }
    let last = kills[kills.len() - 1];
    output.push(GameEvent {
        id: format!("{}:derived-multi-{}", last.id, kills.len()),
        game_id: last.game_id.clone(),
        provider_id: last.provider_id.clone(),
        event_type: GameEventType::MultiKill,
        timestamp_ms: last.timestamp_ms,
        confidence: last.confidence,
        label: Some(format!("{} Kills", kills.len())),
        metadata: EventMetadata {
            count: Some(kills.len().min(20) as u32),
            derived: Some(true),
            ..Default::default()
        },
        source: last.source,
    });
    output
}

/// A clip timeline marker. `offset_ms` is relative to the clip start.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: GameEventType,
    /// Serialized as `timestampMs`, the old `ClipEventMarker` field name.
    #[serde(rename = "timestampMs")]
    pub offset_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "EventMetadata::is_empty")]
    pub metadata: EventMetadata,
}

/// Markers relative to the actual saved clip start, clamped to the clip,
/// sorted, at most 128 (`markersForClip`). Call again with the real file
/// start if the saved clip begins at a keyframe before the requested start.
pub fn markers_for_clip(
    events: &[GameEvent],
    clip_started_at_ms: u64,
    duration_ms: u64,
) -> Vec<Marker> {
    let mut markers: Vec<Marker> = events
        .iter()
        .map(|e| Marker {
            id: e.id.clone(),
            event_type: e.event_type,
            offset_ms: e
                .timestamp_ms
                .saturating_sub(clip_started_at_ms)
                .min(duration_ms),
            label: e.label.clone(),
            metadata: e.metadata.clone(),
        })
        .collect();
    markers.sort_by_key(|m| m.offset_ms);
    markers.truncate(MAX_EVENTS_PER_WINDOW);
    markers
}

/// `SB <Game> - <label>` (`autoCaptureTitle`).
pub fn clip_title(game: &str, events: &[GameEvent]) -> String {
    let multi = events
        .iter()
        .rev()
        .find(|e| e.event_type == GameEventType::MultiKill);
    if let Some(label) = multi.and_then(|e| e.label.as_deref()) {
        return format!("SB {game} - {label}");
    }
    let kills = events.iter().filter(|e| e.event_type.is_kill()).count();
    if kills > 1 {
        return format!("SB {game} - {kills} Kills");
    }
    const PRIORITY: [GameEventType; 8] = [
        GameEventType::MatchWin,
        GameEventType::RoundWin,
        GameEventType::Headshot,
        GameEventType::Kill,
        GameEventType::Objective,
        GameEventType::Assist,
        GameEventType::Knockdown,
        GameEventType::Death,
    ];
    let highlight = PRIORITY
        .iter()
        .find_map(|t| events.iter().find(|e| e.event_type == *t))
        .or_else(|| events.first());
    let label = highlight.map_or(GameEventType::Highlight.label(), |e| e.display_label());
    format!("SB {game} - {label}")
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::events::GameEventSource;

    pub fn event(id: &str, t: GameEventType, ts: u64) -> GameEvent {
        GameEvent {
            id: id.into(),
            game_id: "counter-strike-2".into(),
            provider_id: "cs2-gsi".into(),
            event_type: t,
            timestamp_ms: ts,
            confidence: Some(1.0),
            label: Some(t.label().into()),
            metadata: EventMetadata {
                sequence: Some(ts),
                ..Default::default()
            },
            source: GameEventSource::Telemetry,
        }
    }

    #[test]
    fn plan_and_merge() {
        let a = plan_window(1, &event("a", GameEventType::Kill, 100_000), 20_000, 10_000);
        assert_eq!((a.started_at_ms, a.ends_at_ms), (80_000, 110_000));
        // Starts 20 s after a ends: outside 15 s threshold.
        let far = plan_window(2, &event("b", GameEventType::Kill, 150_000), 20_000, 10_000);
        assert!(merge_windows(&a, &far, 15_000, 120_000).is_none());
        // Within threshold: merged, both events kept.
        let near = plan_window(3, &event("c", GameEventType::Kill, 140_000), 20_000, 10_000);
        let merged = merge_windows(&a, &near, 15_000, 120_000).unwrap();
        assert_eq!(
            (merged.id, merged.started_at_ms, merged.ends_at_ms),
            (1, 80_000, 150_000)
        );
        assert_eq!(merged.events.len(), 2);
        // Exceeds cap: refused.
        assert!(merge_windows(&a, &near, 15_000, 60_000).is_none());
        // Other provider never merges.
        let mut other = near.clone();
        other.provider_id = "x".into();
        assert!(merge_windows(&a, &other, 15_000, 120_000).is_none());
    }

    #[test]
    fn merge_caps_events() {
        let mut a = plan_window(1, &event("a", GameEventType::Kill, 100_000), 20_000, 10_000);
        a.events = (0..128)
            .map(|i| event(&i.to_string(), GameEventType::Kill, 100_000))
            .collect();
        let b = plan_window(2, &event("b", GameEventType::Kill, 101_000), 20_000, 10_000);
        assert_eq!(merge_windows(&a, &b, 0, 120_000).unwrap().events.len(), 128);
    }

    #[test]
    fn derived_multi_kill_and_title() {
        let events = vec![
            event("a", GameEventType::Kill, 1_000),
            event("b", GameEventType::Headshot, 2_000),
            event("c", GameEventType::Kill, 3_000),
        ];
        let out = add_derived_multi_kill(&events);
        assert_eq!(out.len(), 4);
        let multi = &out[3];
        assert_eq!(multi.event_type, GameEventType::MultiKill);
        assert_eq!(multi.label.as_deref(), Some("3 Kills"));
        assert_eq!(multi.id, "c:derived-multi-3");
        assert_eq!(multi.timestamp_ms, 3_000);
        assert_eq!(multi.metadata.count, Some(3));
        assert_eq!(multi.metadata.derived, Some(true));
        assert_eq!(
            clip_title("Counter-Strike 2", &out),
            "SB Counter-Strike 2 - 3 Kills"
        );

        // Native multi-kill suppresses derivation.
        let mut native = events.clone();
        let mut m = event("m", GameEventType::MultiKill, 3_500);
        m.label = Some("Triple Kill".into());
        native.push(m);
        assert_eq!(add_derived_multi_kill(&native).len(), 4);
        assert_eq!(clip_title("G", &native), "SB G - Triple Kill");

        // One kill: no derivation; priority title.
        let single = vec![
            event("d", GameEventType::Death, 1),
            event("k", GameEventType::Kill, 2),
        ];
        assert_eq!(add_derived_multi_kill(&single).len(), 2);
        assert_eq!(clip_title("G", &single), "SB G - Kill");
        let win = vec![
            event("r", GameEventType::RoundWin, 1),
            event("h", GameEventType::Headshot, 2),
        ];
        assert_eq!(clip_title("G", &win), "SB G - Round Win");
    }

    #[test]
    fn markers_are_relative_sorted_and_clamped() {
        let events = vec![
            event("b", GameEventType::Kill, 15_000),
            event("a", GameEventType::Kill, 12_000),
            event("late", GameEventType::Kill, 99_000),
            event("early", GameEventType::Kill, 1_000),
        ];
        let markers = markers_for_clip(&events, 10_000, 30_000);
        let offsets: Vec<_> = markers
            .iter()
            .map(|m| (m.id.as_str(), m.offset_ms))
            .collect();
        assert_eq!(
            offsets,
            vec![("early", 0), ("a", 2_000), ("b", 5_000), ("late", 30_000)]
        );
    }
}
