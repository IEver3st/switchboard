//! Persisted Auto Capture settings. Field names and ranges follow
//! `autoCaptureSettingsSchema` in the Electron app so an existing
//! `capture.autoCapture.settings` object deserializes unchanged.

use crate::events::GameEventType;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Pre-roll choices offered in Settings (seconds).
pub const PRE_ROLL_CHOICES: [u32; 9] = [5, 10, 15, 20, 30, 45, 60, 90, 120];
/// Post-roll choices offered in Settings (seconds).
pub const POST_ROLL_CHOICES: [u32; 8] = [0, 5, 10, 15, 20, 30, 45, 60];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoCaptureSettings {
    pub enabled: bool,
    /// 5..=120
    pub pre_roll_seconds: u32,
    /// 0..=60
    pub post_roll_seconds: u32,
    pub merge_nearby_events: bool,
    /// 0..=60
    pub merge_threshold_seconds: u32,
    pub notify_when_saved: bool,
    pub reaction_clipping: ReactionSettings,
    /// Keyed by game ID string (`counter-strike-2`, ...).
    pub games: BTreeMap<String, GameSettings>,
    /// Settings UI bookkeeping carried for compatibility; unused here.
    pub dismissed_availability: BTreeMap<String, bool>,
}

impl Default for AutoCaptureSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            pre_roll_seconds: 20,
            post_roll_seconds: 10,
            merge_nearby_events: true,
            merge_threshold_seconds: 15,
            notify_when_saved: false,
            reaction_clipping: ReactionSettings::default(),
            games: BTreeMap::new(),
            dismissed_availability: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sensitivity {
    Low,
    #[default]
    Balanced,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReactionSettings {
    pub enabled: bool,
    pub sensitivity: Sensitivity,
    /// 5..=60
    pub pre_roll_seconds: u32,
    /// 0..=30
    pub post_roll_seconds: u32,
    /// 5..=120
    pub cooldown_seconds: u32,
}

impl Default for ReactionSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            sensitivity: Sensitivity::Balanced,
            pre_roll_seconds: 20,
            post_roll_seconds: 10,
            cooldown_seconds: 60,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayerNameMode {
    Nickname,
    Anonymous,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GameSettings {
    pub enabled: bool,
    pub use_global_timing: bool,
    /// 5..=120, used when `use_global_timing` is false.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pre_roll_seconds: Option<u32>,
    /// 0..=60, used when `use_global_timing` is false.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_roll_seconds: Option<u32>,
    /// War Thunder nickname (kept local; never logged or put in metadata).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_name_mode: Option<PlayerNameMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_squadron_tag: Option<String>,
    /// Per-event overrides; missing entries use `GameEventType::enabled_by_default`.
    pub events: BTreeMap<GameEventType, bool>,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            use_global_timing: true,
            pre_roll_seconds: None,
            post_roll_seconds: None,
            player_name: None,
            player_name_mode: None,
            player_squadron_tag: None,
            events: BTreeMap::new(),
        }
    }
}

impl GameSettings {
    pub fn event_enabled(&self, event: GameEventType) -> bool {
        self.events
            .get(&event)
            .copied()
            .unwrap_or_else(|| event.enabled_by_default())
    }
}

impl AutoCaptureSettings {
    pub fn game(&self, game_id: &str) -> Option<&GameSettings> {
        self.games.get(game_id)
    }

    /// Clamp every numeric field into its schema range and trim/limit text.
    /// The old app rejected out-of-range values at the IPC boundary; the Rust
    /// host clamps instead so a hand-edited file cannot disable the feature.
    pub fn sanitized(mut self) -> Self {
        self.pre_roll_seconds = self.pre_roll_seconds.clamp(5, 120);
        self.post_roll_seconds = self.post_roll_seconds.min(60);
        self.merge_threshold_seconds = self.merge_threshold_seconds.min(60);
        let r = &mut self.reaction_clipping;
        r.pre_roll_seconds = r.pre_roll_seconds.clamp(5, 60);
        r.post_roll_seconds = r.post_roll_seconds.min(30);
        r.cooldown_seconds = r.cooldown_seconds.clamp(5, 120);
        self.games
            .retain(|key, _| !key.is_empty() && key.len() <= 96);
        for game in self.games.values_mut() {
            game.pre_roll_seconds = game.pre_roll_seconds.map(|v| v.clamp(5, 120));
            game.post_roll_seconds = game.post_roll_seconds.map(|v| v.min(60));
            for field in [&mut game.player_name, &mut game.player_squadron_tag] {
                *field = field
                    .take()
                    .map(|s| s.trim().chars().take(64).collect::<String>())
                    .filter(|s| !s.is_empty());
            }
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_old_app() {
        let s = AutoCaptureSettings::default();
        assert!(!s.enabled);
        assert_eq!((s.pre_roll_seconds, s.post_roll_seconds), (20, 10));
        assert!(s.merge_nearby_events);
        assert_eq!(s.merge_threshold_seconds, 15);
        assert!(!s.notify_when_saved);
        let r = &s.reaction_clipping;
        assert!(!r.enabled);
        assert_eq!(r.sensitivity, Sensitivity::Balanced);
        assert_eq!(
            (r.pre_roll_seconds, r.post_roll_seconds, r.cooldown_seconds),
            (20, 10, 60)
        );
    }

    #[test]
    fn reads_old_persisted_shape() {
        let json = r#"{
          "enabled": true, "preRollSeconds": 30, "postRollSeconds": 5,
          "mergeNearbyEvents": false, "mergeThresholdSeconds": 10, "notifyWhenSaved": true,
          "reactionClipping": {"enabled": true, "sensitivity": "high", "preRollSeconds": 15, "postRollSeconds": 5, "cooldownSeconds": 30},
          "games": {"war-thunder": {"enabled": true, "useGlobalTiming": false, "preRollSeconds": 45,
                     "playerName": "Pilot", "playerNameMode": "nickname", "events": {"death": true, "kill": false}}},
          "dismissedAvailability": {"cs2-gsi": true}
        }"#;
        let s: AutoCaptureSettings = serde_json::from_str(json).unwrap();
        assert!(s.enabled);
        assert_eq!(s.reaction_clipping.sensitivity, Sensitivity::High);
        let wt = s.game("war-thunder").unwrap();
        assert!(!wt.use_global_timing);
        assert_eq!(wt.pre_roll_seconds, Some(45));
        assert!(wt.event_enabled(GameEventType::Death));
        assert!(!wt.event_enabled(GameEventType::Kill));
        assert!(wt.event_enabled(GameEventType::Objective));
        let round_trip: AutoCaptureSettings =
            serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(round_trip, s);
        // Missing fields fall back to defaults.
        let partial: AutoCaptureSettings = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert_eq!(partial.pre_roll_seconds, 20);
    }

    #[test]
    fn sanitize_clamps_ranges() {
        let mut s = AutoCaptureSettings {
            pre_roll_seconds: 1,
            post_roll_seconds: 500,
            merge_threshold_seconds: 99,
            ..Default::default()
        };
        s.reaction_clipping.cooldown_seconds = 1;
        s.reaction_clipping.post_roll_seconds = 99;
        s.games.insert(
            "war-thunder".into(),
            GameSettings {
                player_name: Some("   ".into()),
                pre_roll_seconds: Some(500),
                ..Default::default()
            },
        );
        let s = s.sanitized();
        assert_eq!(
            (
                s.pre_roll_seconds,
                s.post_roll_seconds,
                s.merge_threshold_seconds
            ),
            (5, 60, 60)
        );
        assert_eq!(s.reaction_clipping.cooldown_seconds, 5);
        assert_eq!(s.reaction_clipping.post_roll_seconds, 30);
        let wt = s.game("war-thunder").unwrap();
        assert_eq!(wt.player_name, None);
        assert_eq!(wt.pre_roll_seconds, Some(120));
    }
}
