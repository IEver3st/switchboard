//! Normalized, privacy-safe game events. Mirrors `gameEventSchema` and
//! `gameEventMetadataSchema` in the Electron app's `src/shared/contracts.ts`.
//! Serialized names match the old persisted clip metadata (snake_case event
//! types, camelCase fields).

use serde::{Deserialize, Serialize};
use std::fmt::Write as _;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameEventType {
    Kill,
    Headshot,
    MultiKill,
    Assist,
    Knockdown,
    Death,
    RoundWin,
    RoundLoss,
    MatchWin,
    MatchLoss,
    Objective,
    Achievement,
    Highlight,
    Custom,
}

impl GameEventType {
    pub const ALL: [GameEventType; 14] = [
        Self::Kill,
        Self::Headshot,
        Self::MultiKill,
        Self::Assist,
        Self::Knockdown,
        Self::Death,
        Self::RoundWin,
        Self::RoundLoss,
        Self::MatchWin,
        Self::MatchLoss,
        Self::Objective,
        Self::Achievement,
        Self::Highlight,
        Self::Custom,
    ];

    /// Default selection: positive highlights on; knockdown, death, losses
    /// and custom off (`defaultAutoCaptureEventPreferences`).
    pub fn enabled_by_default(self) -> bool {
        !matches!(
            self,
            Self::Knockdown | Self::Death | Self::RoundLoss | Self::MatchLoss | Self::Custom
        )
    }

    /// Singular marker label (`eventTypeLabel` in the capture-window planner).
    pub fn label(self) -> &'static str {
        match self {
            Self::Kill => "Kill",
            Self::Headshot => "Headshot",
            Self::MultiKill => "Multi-kill",
            Self::Assist => "Assist",
            Self::Knockdown => "Knockdown",
            Self::Death => "Death",
            Self::RoundWin => "Round Win",
            Self::RoundLoss => "Round Loss",
            Self::MatchWin => "Match Win",
            Self::MatchLoss => "Match Loss",
            Self::Objective => "Objective",
            Self::Achievement => "Achievement",
            Self::Highlight | Self::Custom => "Highlight",
        }
    }

    /// Plural settings label (`gameEventTypeLabel`).
    pub fn settings_label(self) -> &'static str {
        match self {
            Self::Kill => "Kills",
            Self::Headshot => "Headshots",
            Self::MultiKill => "Multi-kills",
            Self::Assist => "Assists",
            Self::Knockdown => "Knockdowns",
            Self::Death => "Deaths",
            Self::RoundWin => "Round wins",
            Self::RoundLoss => "Round losses",
            Self::MatchWin => "Match wins",
            Self::MatchLoss => "Match losses",
            Self::Objective => "Objective events",
            Self::Achievement => "Achievements",
            Self::Highlight => "Highlights",
            Self::Custom => "Custom events",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Kill => "kill",
            Self::Headshot => "headshot",
            Self::MultiKill => "multi_kill",
            Self::Assist => "assist",
            Self::Knockdown => "knockdown",
            Self::Death => "death",
            Self::RoundWin => "round_win",
            Self::RoundLoss => "round_loss",
            Self::MatchWin => "match_win",
            Self::MatchLoss => "match_loss",
            Self::Objective => "objective",
            Self::Achievement => "achievement",
            Self::Highlight => "highlight",
            Self::Custom => "custom",
        }
    }

    pub fn is_kill(self) -> bool {
        matches!(self, Self::Kill | Self::Headshot)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameEventSource {
    Telemetry,
    Api,
    Websocket,
    Log,
    Vision,
    Ocr,
    Manual,
    Microphone,
    Test,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Team {
    #[serde(rename = "CT")]
    Ct,
    #[serde(rename = "T")]
    T,
    #[serde(rename = "ally")]
    Ally,
    #[serde(rename = "enemy")]
    Enemy,
}

impl Team {
    fn as_str(self) -> &'static str {
        match self {
            Self::Ct => "CT",
            Self::T => "T",
            Self::Ally => "ally",
            Self::Enemy => "enemy",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectiveKind {
    Planted,
    Defused,
    Exploded,
    Captured,
    Completed,
    Custom,
}

impl ObjectiveKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Planted => "planted",
            Self::Defused => "defused",
            Self::Exploded => "exploded",
            Self::Captured => "captured",
            Self::Completed => "completed",
            Self::Custom => "custom",
        }
    }
}

/// Bounded typed metadata. Never carries player names, account IDs or raw
/// telemetry; add a typed field instead of an escape hatch.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EventMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headshot: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team: Option<Team>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_for: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_against: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective: Option<ObjectiveKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<u64>,
}

impl EventMetadata {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// Stable `key:value` list sorted by key, as `stableMetadata` in the old
    /// deduplicator. Field order below is alphabetical by serialized name.
    pub fn fingerprint(&self) -> String {
        let mut out = String::new();
        let mut push = |key: &str, value: &dyn std::fmt::Display| {
            if !out.is_empty() {
                out.push(',');
            }
            let _ = write!(out, "{key}:{value}");
        };
        if let Some(v) = &self.code {
            push("code", v);
        }
        if let Some(v) = self.count {
            push("count", &v);
        }
        if let Some(v) = self.derived {
            push("derived", &v);
        }
        if let Some(v) = self.headshot {
            push("headshot", &v);
        }
        if let Some(v) = self.objective {
            push("objective", &v.as_str());
        }
        if let Some(v) = self.round_number {
            push("roundNumber", &v);
        }
        if let Some(v) = self.score_against {
            push("scoreAgainst", &v);
        }
        if let Some(v) = self.score_for {
            push("scoreFor", &v);
        }
        if let Some(v) = self.sequence {
            push("sequence", &v);
        }
        if let Some(v) = self.team {
            push("team", &v.as_str());
        }
        if let Some(v) = &self.weapon {
            push("weapon", v);
        }
        out
    }
}

/// One normalized event. `timestamp_ms` is Unix wall-clock milliseconds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameEvent {
    pub id: String,
    pub game_id: String,
    pub provider_id: String,
    #[serde(rename = "type")]
    pub event_type: GameEventType,
    #[serde(rename = "timestamp")]
    pub timestamp_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "EventMetadata::is_empty")]
    pub metadata: EventMetadata,
    pub source: GameEventSource,
}

impl GameEvent {
    pub fn fingerprint(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            self.provider_id,
            self.game_id,
            self.event_type.as_str(),
            self.metadata.fingerprint()
        )
    }

    pub fn display_label(&self) -> &str {
        self.label.as_deref().unwrap_or(self.event_type.label())
    }
}

/// Unix milliseconds for a `SystemTime` (0 before the epoch).
pub fn unix_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

pub fn system_time(unix_ms: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_millis(unix_ms)
}

pub fn now_ms() -> u64 {
    unix_ms(SystemTime::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_selection_matches_old_preferences() {
        let enabled: Vec<_> = GameEventType::ALL
            .iter()
            .copied()
            .filter(|t| t.enabled_by_default())
            .collect();
        assert_eq!(
            enabled,
            vec![
                GameEventType::Kill,
                GameEventType::Headshot,
                GameEventType::MultiKill,
                GameEventType::Assist,
                GameEventType::RoundWin,
                GameEventType::MatchWin,
                GameEventType::Objective,
                GameEventType::Achievement,
                GameEventType::Highlight,
            ]
        );
    }

    #[test]
    fn event_serializes_like_old_contract() {
        let event = GameEvent {
            id: "a".into(),
            game_id: "counter-strike-2".into(),
            provider_id: "cs2-gsi".into(),
            event_type: GameEventType::MultiKill,
            timestamp_ms: 5,
            confidence: None,
            label: Some("2 Kills".into()),
            metadata: EventMetadata {
                count: Some(2),
                derived: Some(true),
                round_number: Some(3),
                ..Default::default()
            },
            source: GameEventSource::Telemetry,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert_eq!(
            json,
            r#"{"id":"a","gameId":"counter-strike-2","providerId":"cs2-gsi","type":"multi_kill","timestamp":5,"label":"2 Kills","metadata":{"count":2,"derived":true,"roundNumber":3},"source":"telemetry"}"#
        );
        let back: GameEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back, event);
    }

    #[test]
    fn metadata_fingerprint_is_key_sorted() {
        let m = EventMetadata {
            sequence: Some(4),
            headshot: Some(true),
            round_number: Some(2),
            ..Default::default()
        };
        assert_eq!(m.fingerprint(), "headshot:true,roundNumber:2,sequence:4");
    }
}
