//! Event policy, deduplication, pending windows and finalization (port of
//! `auto-capture-engine.ts`). Deterministic and timer-free: the caller passes
//! `now` and asks for due windows; `next_deadline_ms` tells it when to ask.

use crate::dedupe::EventDeduplicator;
use crate::events::{GameEvent, GameEventType, system_time};
use crate::games::GameId;
use crate::planner::{
    Marker, PendingWindow, add_derived_multi_kill, clip_title, markers_for_clip, merge_windows,
    plan_window,
};
use crate::settings::AutoCaptureSettings;
use serde::Serialize;
use std::time::SystemTime;

/// Allowance for the replay ring to complete its last one-second segment.
pub const FINALIZE_SLACK_MS: u64 = 1_250;
pub const MAX_PENDING_WINDOWS: usize = 8;
pub const MAX_EVENT_AGE_MS: u64 = 60_000;
pub const MAX_FUTURE_SKEW_MS: u64 = 5_000;
/// Windows are never capped below this, even with a shorter replay buffer.
pub const MIN_WINDOW_MS: u64 = 15_000;
pub const REACTION_PROVIDER_ID: &str = "microphone-reaction";
/// Game ID for reactions while no supported game is active (display capture).
pub const REACTION_DESKTOP_GAME_ID: &str = "reaction-desktop";

/// Explicit policy that bypasses global/per-game settings (reaction clipping).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventPolicy {
    pub enabled: bool,
    pub pre_roll_seconds: u32,
    pub post_roll_seconds: u32,
    pub merge_nearby_events: bool,
    pub merge_threshold_seconds: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IgnoreReason {
    Disabled,
    GameDisabled,
    EventDisabled,
    Stale,
    Future,
    ReactionCooldown,
    PendingLimit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventOutcome {
    Created { window_id: u64 },
    Extended { window_id: u64 },
    Duplicate,
    Ignored(IgnoreReason),
}

impl EventOutcome {
    pub fn accepted(self) -> bool {
        matches!(self, Self::Created { .. } | Self::Extended { .. })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FlushReason {
    /// Normal finalization at `end + FINALIZE_SLACK_MS`.
    Stable,
    GameChanged,
    GameExited,
    CaptureStopped,
    /// Replay buffer reconfigured (length, source, encoder).
    Reconfigured,
    Shutdown,
}

impl FlushReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::GameChanged => "game-changed",
            Self::GameExited => "game-exited",
            Self::CaptureStopped => "capture-stopped",
            Self::Reconfigured => "reconfigured",
            Self::Shutdown => "shutdown",
        }
    }
}

/// Ask the capture engine to save the replay footage covering
/// `[start_ms, end_ms]` (Unix wall-clock ms). Markers are relative to
/// `start_ms`; recompute them with [`SaveRequest::markers_for`] if the saved
/// file starts at an earlier keyframe.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub window_id: u64,
    pub game_id: String,
    pub game_name: String,
    pub provider_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub title: String,
    pub events: Vec<GameEvent>,
    pub markers: Vec<Marker>,
    pub reason: FlushReason,
}

impl SaveRequest {
    pub fn start_time(&self) -> SystemTime {
        system_time(self.start_ms)
    }

    pub fn end_time(&self) -> SystemTime {
        system_time(self.end_ms)
    }

    pub fn duration_ms(&self) -> u64 {
        self.end_ms - self.start_ms
    }

    pub fn is_reaction(&self) -> bool {
        self.provider_id == REACTION_PROVIDER_ID
    }

    /// Markers relative to the real saved file start and duration.
    pub fn markers_for(&self, clip_started_at_ms: u64, duration_ms: u64) -> Vec<Marker> {
        markers_for_clip(&self.events, clip_started_at_ms, duration_ms)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastEvent {
    #[serde(rename = "type")]
    pub event_type: Option<GameEventType>,
    pub at_ms: u64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStats {
    pub events_received: u64,
    pub events_deduplicated: u64,
    pub events_ignored: u64,
    pub windows_flushed: u64,
    pub last_event: Option<LastEvent>,
    pub last_error: Option<String>,
}

#[derive(Debug, Default)]
pub struct Engine {
    dedupe: EventDeduplicator,
    pending: Vec<PendingWindow>,
    next_window_id: u64,
    replay_length_ms: u64,
    last_reaction: Option<(u64, u64)>,
    last_reaction_saved_at_ms: u64,
    stats: EngineStats,
}

impl Engine {
    pub fn new() -> Self {
        Self {
            next_window_id: 1,
            ..Self::default()
        }
    }

    /// Current replay-buffer capacity. Windows are capped at
    /// `max(MIN_WINDOW_MS, replay_length_ms)`.
    pub fn set_replay_length_ms(&mut self, replay_length_ms: u64) {
        self.replay_length_ms = replay_length_ms;
    }

    pub fn maximum_window_ms(&self) -> u64 {
        self.replay_length_ms.max(MIN_WINDOW_MS)
    }

    /// Creation time of the newest saved reaction clip (from the clip
    /// library), a conservative cooldown and overlap bound that survives
    /// restarts. 0 when there is none.
    pub fn set_last_reaction_saved_at_ms(&mut self, at_ms: u64) {
        self.last_reaction_saved_at_ms = at_ms;
    }

    pub fn stats(&self) -> &EngineStats {
        &self.stats
    }

    pub(crate) fn set_error(&mut self, error: Option<String>) {
        self.stats.last_error = error;
    }

    pub fn pending(&self) -> &[PendingWindow] {
        &self.pending
    }

    /// When the next pending window becomes due, if any. No pending windows
    /// means no deadline, so an idle host needs no timer.
    pub fn next_deadline_ms(&self) -> Option<u64> {
        self.pending
            .iter()
            .map(|w| w.ends_at_ms + FINALIZE_SLACK_MS)
            .min()
    }

    pub fn handle_event(
        &mut self,
        event: &GameEvent,
        settings: &AutoCaptureSettings,
        policy: Option<&EventPolicy>,
        now_ms: u64,
    ) -> EventOutcome {
        self.stats.events_received += 1;
        self.stats.last_event = Some(LastEvent {
            event_type: Some(event.event_type),
            at_ms: event.timestamp_ms,
            label: event.label.clone(),
        });
        let game = settings.game(&event.game_id);
        let ignore = if !policy.map_or(settings.enabled, |p| p.enabled) {
            Some(IgnoreReason::Disabled)
        } else if policy.is_none() && game.is_some_and(|g| !g.enabled) {
            Some(IgnoreReason::GameDisabled)
        } else if policy.is_none()
            && !game.map_or(event.event_type.enabled_by_default(), |g| {
                g.event_enabled(event.event_type)
            })
        {
            Some(IgnoreReason::EventDisabled)
        } else if event.timestamp_ms.saturating_add(MAX_EVENT_AGE_MS) < now_ms {
            Some(IgnoreReason::Stale)
        } else if event.timestamp_ms > now_ms.saturating_add(MAX_FUTURE_SKEW_MS) {
            Some(IgnoreReason::Future)
        } else {
            None
        };
        if let Some(reason) = ignore {
            self.stats.events_ignored += 1;
            return EventOutcome::Ignored(reason);
        }

        if self.dedupe.is_duplicate(event) {
            self.stats.events_deduplicated += 1;
            return EventOutcome::Duplicate;
        }

        let maximum_window_ms = self.maximum_window_ms();
        let per_game_timing = game.filter(|g| !g.use_global_timing);
        let requested_pre_s = policy.map(|p| p.pre_roll_seconds).unwrap_or_else(|| {
            per_game_timing
                .and_then(|g| g.pre_roll_seconds)
                .unwrap_or(settings.pre_roll_seconds)
        });
        let requested_post_s = policy.map(|p| p.post_roll_seconds).unwrap_or_else(|| {
            per_game_timing
                .and_then(|g| g.post_roll_seconds)
                .unwrap_or(settings.post_roll_seconds)
        });
        // Post-roll is kept first; pre-roll gets whatever the cap leaves.
        let post_roll_ms = (u64::from(requested_post_s) * 1_000).min(maximum_window_ms);
        let pre_roll_ms =
            (u64::from(requested_pre_s) * 1_000).min(maximum_window_ms - post_roll_ms);
        let next = plan_window(self.next_window_id, event, pre_roll_ms, post_roll_ms);

        let is_reaction = event.provider_id == REACTION_PROVIDER_ID;
        if is_reaction {
            let saved = self.last_reaction_saved_at_ms;
            let last_at = self.last_reaction.map_or(0, |r| r.0).max(saved);
            let last_end = self.last_reaction.map_or(0, |r| r.1).max(saved);
            let cooldown_ms = u64::from(settings.reaction_clipping.cooldown_seconds) * 1_000;
            if last_at > 0
                && (event.timestamp_ms.saturating_sub(last_at) < cooldown_ms
                    || next.started_at_ms < last_end)
            {
                self.stats.events_ignored += 1;
                return EventOutcome::Ignored(IgnoreReason::ReactionCooldown);
            }
        }

        let merge_nearby = policy.map_or(settings.merge_nearby_events, |p| p.merge_nearby_events);
        let threshold_ms = if merge_nearby {
            u64::from(policy.map_or(settings.merge_threshold_seconds, |p| {
                p.merge_threshold_seconds
            })) * 1_000
        } else {
            0
        };
        let merged = match self.pending.last() {
            Some(latest) if merge_nearby => {
                merge_windows(latest, &next, threshold_ms, maximum_window_ms)
            }
            _ => None,
        };
        let outcome = if let Some(merged) = merged {
            let window_id = merged.id;
            *self
                .pending
                .last_mut()
                .expect("merged implies a latest window") = merged;
            EventOutcome::Extended { window_id }
        } else {
            if self.pending.len() >= MAX_PENDING_WINDOWS {
                self.stats.events_ignored += 1;
                self.stats.last_error = Some(
                    "Auto Capture reached its bounded pending-window limit; the newest event was ignored.".into(),
                );
                return EventOutcome::Ignored(IgnoreReason::PendingLimit);
            }
            let window_id = next.id;
            self.next_window_id += 1;
            self.pending.push(next.clone());
            EventOutcome::Created { window_id }
        };
        if is_reaction {
            self.last_reaction = Some((event.timestamp_ms, next.ends_at_ms));
        }
        outcome
    }

    /// Finalize windows whose `end + FINALIZE_SLACK_MS` has passed.
    pub fn poll(&mut self, now_ms: u64) -> Vec<SaveRequest> {
        let mut due = Vec::new();
        let mut index = 0;
        while index < self.pending.len() {
            if self.pending[index].ends_at_ms + FINALIZE_SLACK_MS <= now_ms {
                let window = self.pending.remove(index);
                let end = window.ends_at_ms;
                due.push(self.finalize(window, end, FlushReason::Stable));
            } else {
                index += 1;
            }
        }
        due
    }

    /// Finalize every pending window now, using footage available so far
    /// (game exit, capture stop or reconfiguration, shutdown).
    pub fn flush(&mut self, now_ms: u64, reason: FlushReason) -> Vec<SaveRequest> {
        let windows = std::mem::take(&mut self.pending);
        windows
            .into_iter()
            .map(|w| {
                let end = w.ends_at_ms.min(now_ms);
                self.finalize(w, end, reason)
            })
            .collect()
    }

    /// Shutdown: flush and forget dedupe history.
    pub fn dispose(&mut self, now_ms: u64) -> Vec<SaveRequest> {
        let out = self.flush(now_ms, FlushReason::Shutdown);
        self.dedupe.clear();
        out
    }

    fn finalize(
        &mut self,
        window: PendingWindow,
        ends_at_ms: u64,
        reason: FlushReason,
    ) -> SaveRequest {
        self.stats.windows_flushed += 1;
        let end_ms = ends_at_ms.max(window.started_at_ms + 1);
        let events = add_derived_multi_kill(&window.events);
        let game_name = game_display_name(&window.game_id);
        let title = clip_title(&game_name, &events);
        let markers =
            markers_for_clip(&events, window.started_at_ms, end_ms - window.started_at_ms);
        SaveRequest {
            window_id: window.id,
            game_id: window.game_id,
            game_name,
            provider_id: window.provider_id,
            start_ms: window.started_at_ms,
            end_ms,
            title,
            events,
            markers,
            reason,
        }
    }
}

pub fn game_display_name(game_id: &str) -> String {
    if let Some(game) = GameId::from_id(game_id) {
        return game.display_name().to_owned();
    }
    if game_id == REACTION_DESKTOP_GAME_ID {
        return "Desktop".to_owned();
    }
    game_id.to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{EventMetadata, GameEventSource};
    use crate::planner::tests::event;
    use crate::settings::GameSettings;

    const NOW: u64 = 1_800_000_000_000;

    fn enabled() -> AutoCaptureSettings {
        AutoCaptureSettings {
            enabled: true,
            ..Default::default()
        }
    }

    fn engine(replay_s: u64) -> Engine {
        let mut e = Engine::new();
        e.set_replay_length_ms(replay_s * 1_000);
        e
    }

    fn kill(seq: u64, ts: u64) -> GameEvent {
        let mut e = event(&format!("k{seq}"), GameEventType::Kill, ts);
        e.metadata = EventMetadata {
            sequence: Some(seq),
            ..Default::default()
        };
        e
    }

    fn reaction(ts: u64) -> GameEvent {
        GameEvent {
            id: format!("microphone-reaction-{ts}"),
            game_id: REACTION_DESKTOP_GAME_ID.into(),
            provider_id: REACTION_PROVIDER_ID.into(),
            event_type: GameEventType::Highlight,
            timestamp_ms: ts,
            confidence: Some(0.7),
            label: Some("Reaction".into()),
            metadata: EventMetadata {
                code: Some("voice-reaction".into()),
                ..Default::default()
            },
            source: GameEventSource::Microphone,
        }
    }

    fn reaction_policy() -> EventPolicy {
        EventPolicy {
            enabled: true,
            pre_roll_seconds: 20,
            post_roll_seconds: 10,
            merge_nearby_events: true,
            merge_threshold_seconds: 0,
        }
    }

    #[test]
    fn disabled_and_policy_filters() {
        let mut e = engine(120);
        let s = AutoCaptureSettings::default();
        assert_eq!(
            e.handle_event(&kill(1, NOW), &s, None, NOW),
            EventOutcome::Ignored(IgnoreReason::Disabled)
        );

        let mut s = enabled();
        // Death is off by default.
        let death = event("d", GameEventType::Death, NOW);
        assert_eq!(
            e.handle_event(&death, &s, None, NOW),
            EventOutcome::Ignored(IgnoreReason::EventDisabled)
        );
        // Per-game opt-in turns it on; per-game disable blocks everything.
        let mut g = GameSettings::default();
        g.events.insert(GameEventType::Death, true);
        s.games.insert("counter-strike-2".into(), g);
        assert!(e.handle_event(&death, &s, None, NOW).accepted());
        s.games.get_mut("counter-strike-2").unwrap().enabled = false;
        assert_eq!(
            e.handle_event(&kill(2, NOW), &s, None, NOW),
            EventOutcome::Ignored(IgnoreReason::GameDisabled)
        );
        assert_eq!(e.stats().events_ignored, 3);
        assert_eq!(e.stats().events_received, 4);
    }

    #[test]
    fn staleness_bounds() {
        let mut e = engine(120);
        let s = enabled();
        assert_eq!(
            e.handle_event(&kill(1, NOW - 60_001), &s, None, NOW),
            EventOutcome::Ignored(IgnoreReason::Stale)
        );
        assert!(
            e.handle_event(&kill(2, NOW - 60_000), &s, None, NOW)
                .accepted()
        );
        assert_eq!(
            e.handle_event(&kill(3, NOW + 5_001), &s, None, NOW),
            EventOutcome::Ignored(IgnoreReason::Future)
        );
        assert!(
            e.handle_event(&kill(4, NOW + 5_000), &s, None, NOW)
                .accepted()
        );
    }

    #[test]
    fn duplicates_within_500ms() {
        let mut e = engine(120);
        let s = enabled();
        assert!(e.handle_event(&kill(1, NOW), &s, None, NOW).accepted());
        assert_eq!(
            e.handle_event(&kill(1, NOW + 300), &s, None, NOW),
            EventOutcome::Duplicate
        );
        assert!(
            e.handle_event(&kill(1, NOW + 1_000), &s, None, NOW)
                .accepted()
        );
        assert_eq!(e.stats().events_deduplicated, 1);
    }

    #[test]
    fn window_timing_and_finalize_slack() {
        let mut e = engine(120);
        let s = enabled();
        assert_eq!(
            e.handle_event(&kill(1, NOW), &s, None, NOW),
            EventOutcome::Created { window_id: 1 }
        );
        let w = &e.pending()[0];
        assert_eq!(
            (w.started_at_ms, w.ends_at_ms),
            (NOW - 20_000, NOW + 10_000)
        );
        assert_eq!(e.next_deadline_ms(), Some(NOW + 11_250));
        assert!(e.poll(NOW + 11_249).is_empty());
        let saved = e.poll(NOW + 11_250);
        assert_eq!(saved.len(), 1);
        let r = &saved[0];
        assert_eq!(
            (r.start_ms, r.end_ms, r.reason),
            (NOW - 20_000, NOW + 10_000, FlushReason::Stable)
        );
        assert_eq!(r.title, "SB Counter-Strike 2 - Kill");
        assert_eq!(r.markers.len(), 1);
        assert_eq!(r.markers[0].offset_ms, 20_000);
        assert!(e.pending().is_empty());
        assert_eq!(e.next_deadline_ms(), None);
    }

    #[test]
    fn per_game_timing_override() {
        let mut e = engine(120);
        let mut s = enabled();
        s.games.insert(
            "counter-strike-2".into(),
            GameSettings {
                use_global_timing: false,
                pre_roll_seconds: Some(45),
                post_roll_seconds: None,
                ..Default::default()
            },
        );
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        let w = &e.pending()[0];
        assert_eq!(
            (w.started_at_ms, w.ends_at_ms),
            (NOW - 45_000, NOW + 10_000)
        );
    }

    #[test]
    fn cap_keeps_post_roll_first() {
        // Replay 20 s: post 10 kept, pre trimmed to 10.
        let mut e = engine(20);
        let s = enabled();
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        let w = &e.pending()[0];
        assert_eq!(
            (w.started_at_ms, w.ends_at_ms),
            (NOW - 10_000, NOW + 10_000)
        );

        // Replay below 15 s still allows 15 s windows.
        let mut e = engine(5);
        let mut s = enabled();
        s.post_roll_seconds = 60;
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        let w = &e.pending()[0];
        assert_eq!((w.started_at_ms, w.ends_at_ms), (NOW, NOW + 15_000));
    }

    #[test]
    fn nearby_events_merge_and_derive_multi_kill() {
        let mut e = engine(120);
        let s = enabled();
        assert_eq!(
            e.handle_event(&kill(1, NOW), &s, None, NOW),
            EventOutcome::Created { window_id: 1 }
        );
        // Second kill 20 s later: its window starts at NOW, inside the first.
        assert_eq!(
            e.handle_event(&kill(2, NOW + 20_000), &s, None, NOW + 20_000),
            EventOutcome::Extended { window_id: 1 }
        );
        let mut hs = event("h", GameEventType::Headshot, NOW + 22_000);
        hs.metadata.sequence = Some(3);
        assert!(e.handle_event(&hs, &s, None, NOW + 22_000).accepted());
        assert_eq!(e.pending().len(), 1);
        let saved = e.poll(NOW + 40_000);
        let r = &saved[0];
        assert_eq!((r.start_ms, r.end_ms), (NOW - 20_000, NOW + 32_000));
        assert_eq!(r.events.len(), 4);
        assert_eq!(r.title, "SB Counter-Strike 2 - 3 Kills");
        let multi = r
            .markers
            .iter()
            .find(|m| m.event_type == GameEventType::MultiKill)
            .unwrap();
        assert_eq!(multi.label.as_deref(), Some("3 Kills"));
        assert_eq!(multi.offset_ms, 42_000);
    }

    #[test]
    fn merge_respects_threshold_toggle_and_cap() {
        let s_off = AutoCaptureSettings {
            merge_nearby_events: false,
            ..enabled()
        };
        let mut e = engine(120);
        e.handle_event(&kill(1, NOW), &s_off, None, NOW);
        e.handle_event(&kill(2, NOW + 1_000), &s_off, None, NOW);
        assert_eq!(e.pending().len(), 2);

        // Gap: first ends NOW+10 s, second starts NOW+46 s-20 s = NOW+26 s (> 15 s threshold).
        let mut e = engine(120);
        let s = enabled();
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        e.handle_event(&kill(2, NOW + 46_000), &s, None, NOW + 46_000);
        assert_eq!(e.pending().len(), 2);

        // Cap: replay 40 s, union would be 50 s, so a new window starts.
        let mut e = engine(40);
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        e.handle_event(&kill(2, NOW + 20_000), &s, None, NOW + 20_000);
        assert_eq!(e.pending().len(), 2);
    }

    #[test]
    fn pending_limit_is_eight() {
        let s = AutoCaptureSettings {
            merge_nearby_events: false,
            ..enabled()
        };
        let mut e = engine(120);
        for i in 0..8 {
            assert!(
                e.handle_event(&kill(i, NOW + i * 1_000), &s, None, NOW + 7_000)
                    .accepted()
            );
        }
        assert_eq!(
            e.handle_event(&kill(99, NOW), &s, None, NOW + 7_000),
            EventOutcome::Ignored(IgnoreReason::PendingLimit)
        );
        assert!(e.stats().last_error.is_some());
        assert_eq!(e.pending().len(), 8);
    }

    #[test]
    fn flush_uses_footage_so_far() {
        let mut e = engine(120);
        let s = enabled();
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        let out = e.flush(NOW + 2_000, FlushReason::GameExited);
        assert_eq!(out.len(), 1);
        assert_eq!(
            (out[0].start_ms, out[0].end_ms, out[0].reason),
            (NOW - 20_000, NOW + 2_000, FlushReason::GameExited)
        );
        assert!(e.pending().is_empty());
        assert!(e.flush(NOW + 3_000, FlushReason::Shutdown).is_empty());

        // Flushing before the window start still yields a positive duration.
        let mut e = engine(120);
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        let out = e.flush(NOW - 30_000, FlushReason::CaptureStopped);
        assert_eq!(out[0].end_ms, out[0].start_ms + 1);
    }

    #[test]
    fn reaction_cooldown_and_overlap() {
        let s = AutoCaptureSettings::default(); // global disabled; policy bypasses it
        let mut e = engine(120);
        let p = reaction_policy();
        assert!(e.handle_event(&reaction(NOW), &s, Some(&p), NOW).accepted());
        // Within the 60 s cooldown.
        assert_eq!(
            e.handle_event(&reaction(NOW + 30_000), &s, Some(&p), NOW + 30_000),
            EventOutcome::Ignored(IgnoreReason::ReactionCooldown)
        );
        // After cooldown, not overlapping the previous window end (NOW+10 s).
        assert!(
            e.handle_event(&reaction(NOW + 61_000), &s, Some(&p), NOW + 61_000)
                .accepted()
        );
        let saved = e.poll(NOW + 120_000);
        assert_eq!(saved.len(), 2);
        assert_eq!(saved[0].title, "SB Desktop - Reaction");
        assert!(saved[0].is_reaction());

        // Persisted bound from the clip library.
        let mut e = engine(120);
        e.set_last_reaction_saved_at_ms(NOW - 10_000);
        assert_eq!(
            e.handle_event(&reaction(NOW), &s, Some(&p), NOW),
            EventOutcome::Ignored(IgnoreReason::ReactionCooldown)
        );
        // Long cooldown passed but the 20 s pre-roll overlaps the saved bound.
        let mut e = engine(120);
        let mut s2 = s.clone();
        s2.reaction_clipping.cooldown_seconds = 5;
        e.set_last_reaction_saved_at_ms(NOW - 10_000);
        assert_eq!(
            e.handle_event(&reaction(NOW), &s2, Some(&p), NOW),
            EventOutcome::Ignored(IgnoreReason::ReactionCooldown)
        );
        assert!(
            e.handle_event(&reaction(NOW + 15_000), &s2, Some(&p), NOW + 15_000)
                .accepted()
        );
    }

    #[test]
    fn reaction_never_merges_with_game_windows() {
        let mut e = engine(120);
        let s = enabled();
        e.handle_event(&kill(1, NOW), &s, None, NOW);
        e.handle_event(
            &reaction(NOW + 1_000),
            &s,
            Some(&reaction_policy()),
            NOW + 1_000,
        );
        assert_eq!(e.pending().len(), 2);
    }
}
