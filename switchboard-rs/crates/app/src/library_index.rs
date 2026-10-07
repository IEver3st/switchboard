//! Per-clip metadata the files can't carry: favorite, custom title, how it
//! was captured, and game events. Owned and written by the background
//! service; the window reads it and asks the service to change it.
//! Keyed by file name so the clips folder can move.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::settings::data_dir;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureSource {
    #[default]
    Manual,
    Auto,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventMarker {
    /// kill, headshot, multi-kill, assist, death, round-win, match-win, objective, highlight ...
    pub kind: String,
    pub label: String,
    /// Offset from the start of the clip.
    pub offset_ms: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub source: CaptureSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<EventMarker>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LibraryIndex {
    #[serde(default)]
    pub clips: BTreeMap<String, ClipMeta>,
}

pub fn index_path() -> PathBuf {
    data_dir().join("library.json")
}

impl LibraryIndex {
    pub fn load() -> LibraryIndex {
        std::fs::read(index_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    pub fn save(&self) -> std::io::Result<()> {
        let path = index_path();
        std::fs::create_dir_all(path.parent().unwrap())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(self).map_err(std::io::Error::other)?)?;
        std::fs::rename(tmp, path)
    }

    pub fn get(&self, file: &str) -> Option<&ClipMeta> {
        self.clips.get(file)
    }

    pub fn entry(&mut self, file: &str) -> &mut ClipMeta {
        self.clips.entry(file.to_string()).or_default()
    }

    /// Drops entries whose files no longer exist in `dir`.
    pub fn prune(&mut self, dir: &std::path::Path) -> bool {
        let before = self.clips.len();
        self.clips.retain(|name, _| dir.join(name).exists());
        self.clips.len() != before
    }
}

/// Validated title: trimmed, printable, 1..=120 characters.
pub fn clean_title(t: &str) -> Option<String> {
    let t: String = t.trim().chars().filter(|c| !c.is_control()).take(120).collect();
    (!t.is_empty()).then_some(t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_are_trimmed_and_bounded() {
        assert_eq!(clean_title("  Ace  ").as_deref(), Some("Ace"));
        assert_eq!(clean_title("   "), None);
        assert_eq!(clean_title(&"x".repeat(500)).map(|s| s.len()), Some(120));
    }

    #[test]
    fn missing_fields_default() {
        let m: ClipMeta = serde_json::from_str(r#"{"favorite":true}"#).unwrap();
        assert!(m.favorite && m.source == CaptureSource::Manual && m.events.is_empty());
    }
}
