//! Preview playback across a project's segments, driven in the media helper
//! process (media_host.rs). This side keeps the same interface the editor
//! used when decoding ran in the window: it sends the project and commands,
//! shows the requested position at once, adopts the helper's position once
//! the helper has caught up, and copies the newest frame from the shared
//! frame section when the preview paints.
//!
//! Gains: the helper computes per-track gains from the project it was last
//! sent, which is re-sent whenever it changes (fader drags, mutes,
//! automation), so audio follows edits within a frame or two.
//!
//! The helper starts on the first seek or play and exits when this is
//! dropped. If it dies, the preview shows an error and the next seek or play
//! starts a new one.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use switchboard_media::{Frame, MediaInfo};
use switchboard_project::Project;

use crate::media_client::{self, FrameSection, Host};
use crate::media_host::Cmd;

/// Frames a requested preview size must hold before the helper is asked to
/// re-render at it (window resizes produce a new size every frame).
const SIZE_SETTLE_FRAMES: u32 = 2;

pub struct Playback {
    host: Option<Arc<Host>>,
    section: Option<FrameSection>,
    pub playing: bool,
    /// Output time in ms.
    pub out_ms: f64,
    /// Current segment index and source time.
    pub segment: usize,
    pub source_ms: f64,
    pub frozen: bool,
    pub volume: f32,
    pub muted: bool,
    pub error: Option<String>,
    /// Probe failures (the helper's errors are separate and come and go).
    probe_error: Option<String>,
    /// Bumped by every seek, play and pause; the helper's status is adopted
    /// only once it reports this generation.
    generation: u64,
    sent_project: Option<(Project, HashMap<String, PathBuf>)>,
    /// Settled preview size per clip, and the candidate being watched.
    sizes: HashMap<String, (u32, u32)>,
    size_candidate: Option<(String, (u32, u32), u32)>,
    frame: Option<Arc<Frame>>,
    frame_seq: u64,
    repaint: egui::Context,
}

impl Playback {
    pub fn new(ctx: &egui::Context) -> Playback {
        Playback {
            host: None,
            section: None,
            playing: false,
            out_ms: 0.0,
            segment: 0,
            source_ms: 0.0,
            frozen: false,
            volume: 1.0,
            muted: false,
            error: None,
            probe_error: None,
            generation: 0,
            sent_project: None,
            sizes: HashMap::new(),
            size_candidate: None,
            frame: None,
            frame_seq: 0,
            repaint: ctx.clone(),
        }
    }

    /// The live helper, starting one (and bringing it up to date) if there
    /// is none or the last one died.
    fn host(&mut self, project: &Project, paths: &HashMap<String, PathBuf>) -> Option<Arc<Host>> {
        if let Some(h) = self.host.as_ref().filter(|h| h.alive()) {
            return Some(h.clone());
        }
        self.host = None;
        let started = media_client::shared().and_then(|h| {
            if self.section.is_none() {
                self.section = Some(FrameSection::create()?);
            }
            h.share_frames(self.section.as_ref().unwrap())?;
            Ok(h)
        });
        let h = match started {
            Ok(h) => h,
            Err(e) => {
                self.error = Some(format!("Couldn't start the preview: {e:#}"));
                return None;
            }
        };
        h.set_repaint(Some(self.repaint.clone()));
        h.send(&Cmd::Volume { volume: self.volume, muted: self.muted });
        for (clip_id, &(width, height)) in &self.sizes {
            h.send(&Cmd::Size { clip_id: clip_id.clone(), width, height });
        }
        self.sent_project = None;
        // A new helper starts from scratch: its first status replaces the
        // dead one's error.
        self.error = self.probe_error.clone();
        self.host = Some(h.clone());
        self.sync_project(project, paths);
        Some(h)
    }

    /// Sends the project when it changed since the helper last saw it.
    fn sync_project(&mut self, project: &Project, paths: &HashMap<String, PathBuf>) {
        let Some(h) = &self.host else { return };
        if self.sent_project.as_ref().is_some_and(|(p, ps)| p == project && ps == paths) {
            return;
        }
        h.send(&Cmd::Project { project: Box::new(project.clone()), paths: paths.clone() });
        self.sent_project = Some((project.clone(), paths.clone()));
    }

    /// Moves the playhead to output time `t` and shows that frame.
    pub fn seek(&mut self, project: &Project, paths: &HashMap<String, PathBuf>, t: f64, exact: bool) {
        self.out_ms = t.clamp(0.0, project.duration_ms as f64);
        if let Some((i, src, frozen)) = project.locate(self.out_ms) {
            self.segment = i;
            self.source_ms = src;
            self.frozen = frozen;
        }
        self.generation += 1;
        let Some(h) = self.host(project, paths) else {
            self.playing = false;
            return;
        };
        self.sync_project(project, paths);
        h.send(&Cmd::Seek { generation: self.generation, out_ms: self.out_ms, exact, playing: self.playing });
    }

    pub fn play(&mut self, project: &Project, paths: &HashMap<String, PathBuf>) {
        if self.out_ms >= project.duration_ms as f64 - 1.0 {
            self.out_ms = 0.0;
        }
        self.playing = true;
        self.seek(project, paths, self.out_ms, true);
    }

    pub fn pause(&mut self) {
        self.playing = false;
        self.generation += 1;
        if let Some(h) = self.host.as_ref().filter(|h| h.alive()) {
            h.send(&Cmd::Pause { generation: self.generation });
        }
    }

    pub fn set_volume(&mut self, v: f32, muted: bool) {
        self.volume = v;
        self.muted = muted;
        if let Some(h) = self.host.as_ref().filter(|h| h.alive()) {
            h.send(&Cmd::Volume { volume: v, muted });
        }
    }

    /// Follows the helper's clock and keeps it up to date with edits. Call
    /// once per frame while the editor is visible. Never waits on the helper.
    pub fn tick(&mut self, project: &Project, paths: &HashMap<String, PathBuf>) {
        let Some(h) = self.host.clone() else { return };
        if !h.alive() {
            self.host = None;
            self.playing = false;
            self.error = Some("The preview stopped unexpectedly. Seek or press Play to restart it.".into());
            return;
        }
        // Edits (levels, mutes, automation, trims) reach the audio here.
        self.sync_project(project, paths);
        self.error = h.error().or_else(|| self.probe_error.clone());
        if let Some(s) = h.status()
            && s.generation == self.generation
        {
            self.playing = s.playing;
            self.out_ms = s.out_ms;
            self.segment = s.segment;
            self.source_ms = s.source_ms;
            self.frozen = s.frozen;
        }
        // No repaint request here: the helper's status events repaint once
        // per new frame or state change, and nothing at all while paused.
    }

    /// The newest decoded frame. Copies it out of the shared section only
    /// when the helper has published a new one.
    pub fn frame(&mut self) -> Option<Arc<Frame>> {
        let Some(section) = &self.section else { return self.frame.clone() };
        let view = section.view();
        if view.latest() != self.frame_seq {
            // Reuse the previous buffer when nothing else holds it.
            let mut buf = self.frame.take().and_then(|f| Arc::try_unwrap(f).ok()).map(|f| f.rgba).unwrap_or_default();
            match view.read(self.frame_seq, &mut buf) {
                Some(m) => {
                    self.frame_seq = m.seq;
                    self.frame = Some(Arc::new(Frame { source_ms: m.source_ms, width: m.width, height: m.height, rgba: buf }));
                }
                None => {
                    // Mid-write: try again next paint.
                    self.repaint.request_repaint();
                }
            }
        }
        self.frame.clone()
    }

    /// Identifies the frame `frame()` returns (changes with every new frame).
    pub fn frame_seq(&self) -> u64 {
        self.frame_seq
    }

    /// Asks for frames of exactly `w x h` for `clip_id` once the size has
    /// held for a couple of frames.
    pub fn request_size(&mut self, clip_id: &str, w: u32, h: u32) {
        let size = (w.max(2), h.max(2));
        match &mut self.size_candidate {
            Some((c, s, n)) if c == clip_id && *s == size => *n += 1,
            _ => self.size_candidate = Some((clip_id.to_string(), size, 1)),
        }
        let settled = self.size_candidate.as_ref().is_some_and(|(_, _, n)| *n >= SIZE_SETTLE_FRAMES);
        if !settled {
            self.repaint.request_repaint();
            return;
        }
        if self.sizes.get(clip_id) == Some(&size) {
            return;
        }
        self.sizes.insert(clip_id.to_string(), size);
        if let Some(h) = self.host.as_ref().filter(|h| h.alive()) {
            h.send(&Cmd::Size { clip_id: clip_id.to_string(), width: size.0, height: size.1 });
        }
    }

    /// A clip's media facts, read from its index (no decoder involved).
    pub fn ensure_info(&mut self, clip_id: &str, path: &PathBuf) -> Option<MediaInfo> {
        match switchboard_media::probe(path) {
            Ok(info) => {
                self.probe_error = None;
                Some(info)
            }
            Err(e) => {
                self.probe_error = Some(format!("Couldn't open {clip_id}: {e:#}"));
                self.error = self.probe_error.clone();
                None
            }
        }
    }
}

impl Drop for Playback {
    fn drop(&mut self) {
        // Release the players now; the helper exits once no one holds it.
        if let Some(h) = self.host.take()
            && h.alive()
        {
            h.send(&Cmd::Close);
        }
    }
}
