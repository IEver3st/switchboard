//! Drafts and imported music, persisted as one manifest written atomically.
//! Unkept drafts expire `DRAFT_RETENTION_MS` after their last save.

use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::{AudioAsset, DRAFT_RETENTION_MS, Project};

const MAX_DRAFTS: usize = 500;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u32,
    #[serde(default)]
    assets: Vec<AudioAsset>,
    #[serde(default)]
    drafts: Vec<Project>,
}

pub struct Store {
    dir: PathBuf,
    manifest: Manifest,
}

impl Store {
    /// Opens `dir/manifest.json`. A corrupt manifest is set aside, not lost.
    pub fn open(dir: &Path) -> Store {
        let path = dir.join("manifest.json");
        let manifest = match std::fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<Manifest>(&bytes) {
                Ok(mut m) => {
                    m.drafts = m.drafts.into_iter().map(Project::sanitized).collect();
                    m
                }
                Err(_) => {
                    let _ = std::fs::rename(&path, dir.join(format!("manifest.invalid-{}.json", crate::now_ms())));
                    Manifest::default()
                }
            },
            Err(_) => Manifest::default(),
        };
        Store { dir: dir.to_path_buf(), manifest }
    }

    pub fn audio_dir(&self) -> PathBuf {
        self.dir.join("audio")
    }

    /// Drafts newest first, after dropping expired unkept ones.
    pub fn drafts(&mut self, now: i64) -> &[Project] {
        let before = self.manifest.drafts.len();
        self.manifest.drafts.retain(|d| d.is_kept() || now - d.updated_at < DRAFT_RETENTION_MS);
        if self.manifest.drafts.len() != before {
            let _ = self.flush();
        }
        self.manifest.drafts.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        &self.manifest.drafts
    }

    pub fn find_for_clip(&self, clip_id: &str) -> Option<&Project> {
        self.manifest.drafts.iter().find(|d| d.source_clip_id.as_deref() == Some(clip_id))
    }

    pub fn save(&mut self, mut project: Project, now: i64) -> Result<()> {
        project.updated_at = now;
        project.refresh();
        match self.manifest.drafts.iter_mut().find(|d| d.id == project.id) {
            Some(d) => *d = project,
            None => self.manifest.drafts.push(project),
        }
        if self.manifest.drafts.len() > MAX_DRAFTS {
            // Drop the oldest unkept drafts first.
            self.manifest.drafts.sort_by_key(|d| (d.is_kept(), d.updated_at));
            let excess = self.manifest.drafts.len() - MAX_DRAFTS;
            self.manifest.drafts.drain(..excess);
        }
        self.flush()
    }

    pub fn delete(&mut self, id: &str) -> Result<()> {
        self.manifest.drafts.retain(|d| d.id != id);
        self.flush()
    }

    pub fn add_asset(&mut self, asset: AudioAsset) -> Result<()> {
        self.manifest.assets.retain(|a| a.id != asset.id);
        self.manifest.assets.push(asset);
        self.flush()
    }

    fn flush(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let path = self.dir.join("manifest.json");
        let tmp = self.dir.join("manifest.json.tmp");
        let mut m = self.manifest.clone();
        m.schema_version = 1;
        std::fs::write(&tmp, serde_json::to_vec(&m)?)?;
        std::fs::rename(tmp, path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drafts_persist_and_unkept_ones_expire() {
        let dir = std::env::temp_dir().join(format!("sb-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut s = Store::open(&dir);
        let mut kept = Project::for_clip("a", "A", 10_000, None, 0);
        kept.kept = Some(true);
        let loose = Project::for_clip("b", "B", 10_000, None, 0);
        s.save(kept, 1_000).unwrap();
        s.save(loose, 1_000).unwrap();
        let mut s = Store::open(&dir);
        assert_eq!(s.drafts(2_000).len(), 2);
        assert_eq!(s.drafts(1_000 + DRAFT_RETENTION_MS + 1).len(), 1);
        assert!(s.find_for_clip("a").is_some());
        std::fs::write(dir.join("manifest.json"), b"{broken").unwrap();
        let mut s = Store::open(&dir);
        assert!(s.drafts(0).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
