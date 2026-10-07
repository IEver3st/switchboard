//! Supported game identities. String IDs match the Electron app's provider
//! `gameId` values so persisted per-game settings and clip metadata carry over.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum GameId {
    #[serde(rename = "counter-strike-2")]
    CounterStrike2,
    #[serde(rename = "war-thunder")]
    WarThunder,
    #[serde(rename = "battlefield-6")]
    Battlefield6,
    #[serde(rename = "wardogs")]
    Wardogs,
    /// Development-only target of the test provider. Never returned by
    /// process detection.
    #[serde(rename = "switchboard-test")]
    SwitchboardTest,
}

impl GameId {
    /// Real games, in detection priority order.
    pub const SUPPORTED: [GameId; 4] = [
        Self::CounterStrike2,
        Self::WarThunder,
        Self::Battlefield6,
        Self::Wardogs,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::CounterStrike2 => "counter-strike-2",
            Self::WarThunder => "war-thunder",
            Self::Battlefield6 => "battlefield-6",
            Self::Wardogs => "wardogs",
            Self::SwitchboardTest => "switchboard-test",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::SUPPORTED
            .into_iter()
            .chain([Self::SwitchboardTest])
            .find(|g| g.as_str() == id)
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::CounterStrike2 => "Counter-Strike 2",
            Self::WarThunder => "War Thunder",
            Self::Battlefield6 => "Battlefield 6",
            Self::Wardogs => "WARDOGS",
            Self::SwitchboardTest => "Switchboard Test Game",
        }
    }

    /// Steam app IDs (retail first).
    pub fn steam_app_ids(self) -> &'static [&'static str] {
        match self {
            Self::CounterStrike2 => &["730"],
            Self::WarThunder => &["236390"],
            Self::Battlefield6 => &["2807960"],
            Self::Wardogs => &["1867240", "4809930"],
            Self::SwitchboardTest => &[],
        }
    }

    /// Executable stems (lowercase, no `.exe`) from Capture.Host's
    /// `KnownGameExecutables`. Launchers are deliberately absent.
    pub fn executables(self) -> &'static [&'static str] {
        match self {
            Self::CounterStrike2 => &["cs2"],
            Self::WarThunder => &["aces", "aces_be"],
            Self::Battlefield6 => &["bf6"],
            Self::Wardogs => &["wardogsclient", "wardogsclient-win64-shipping"],
            Self::SwitchboardTest => &[],
        }
    }

    /// Match a process image name such as `cs2.exe` or a full path.
    pub fn from_executable(name: &str) -> Option<Self> {
        let file = name.rsplit(['\\', '/']).next().unwrap_or(name);
        let lower = file.to_ascii_lowercase();
        let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
        Self::SUPPORTED
            .into_iter()
            .find(|g| g.executables().contains(&stem))
    }

    /// Normalized library names that identify this game when no app ID is
    /// available (Epic or renamed installs).
    pub(crate) fn library_names(self) -> &'static [&'static str] {
        match self {
            Self::CounterStrike2 => &["counter strike 2"],
            Self::WarThunder => &["war thunder"],
            Self::Battlefield6 => &["battlefield 6"],
            Self::Wardogs => &["wardogs", "wardogs playtest"],
            Self::SwitchboardTest => &[],
        }
    }
}

impl std::fmt::Display for GameId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Lowercase, non-alphanumerics collapsed to single spaces (`normalize`).
pub(crate) fn normalize_name(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut pending_space = false;
    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            if pending_space && !out.is_empty() {
                out.push(' ');
            }
            pending_space = false;
            out.push(ch);
        } else {
            pending_space = true;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_matching() {
        assert_eq!(
            GameId::from_executable("cs2.exe"),
            Some(GameId::CounterStrike2)
        );
        assert_eq!(
            GameId::from_executable("C:\\Games\\WT\\win64\\aces_BE.exe"),
            Some(GameId::WarThunder)
        );
        assert_eq!(
            GameId::from_executable("WardogsClient-Win64-Shipping.exe"),
            Some(GameId::Wardogs)
        );
        assert_eq!(
            GameId::from_executable("bf6.exe"),
            Some(GameId::Battlefield6)
        );
        assert_eq!(GameId::from_executable("launcher.exe"), None);
        assert_eq!(GameId::from_executable("steam.exe"), None);
    }

    #[test]
    fn ids_round_trip() {
        for game in GameId::SUPPORTED {
            assert_eq!(GameId::from_id(game.as_str()), Some(game));
            let json = serde_json::to_string(&game).unwrap();
            assert_eq!(json, format!("\"{}\"", game.as_str()));
        }
        assert_eq!(normalize_name("Counter-Strike 2"), "counter strike 2");
        assert_eq!(normalize_name("  WARDOGS  Playtest "), "wardogs playtest");
    }
}
