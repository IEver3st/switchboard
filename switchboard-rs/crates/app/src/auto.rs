//! Auto Capture hosting for the service thread: game tracking, microphone
//! levels for reaction clipping, and turning save requests into clips.
//!
//! Background work only exists while Auto Capture or reaction clipping is
//! on: the active game is checked every 2 s, and microphone levels are fed
//! every 100 ms while reaction clipping wants them. The host's own timers
//! wake the service through its waker; nothing runs when it is off.

use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use switchboard_autocapture::{AutoCapture, AutoCaptureSettings, GameEventType, ProviderSnapshot, RuntimeSnapshot, SaveRequest, active_game};
use switchboard_capture::Engine;

use crate::service::Msg;
use crate::settings::data_dir;

const GAME_CHECK: Duration = Duration::from_secs(2);
const MIC_PUMP: Duration = Duration::from_millis(100);

/// Provider row for the window (the host's snapshots are serialize-only).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProviderRow {
    pub id: String,
    pub game_id: String,
    pub name: String,
    pub support: String,
    pub availability: String,
    pub reason: Option<String>,
    pub status: String,
    pub message: Option<String>,
    /// Events this game can report, for the per-game choices.
    pub events: Vec<GameEventType>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AutoStatus {
    pub state: String,
    pub active_game: Option<String>,
    pub last_error: Option<String>,
    pub clips_created: u64,
    pub providers: Vec<ProviderRow>,
}

fn text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        other => other.to_string().trim_matches('"').to_string(),
    }
}

fn row(p: &ProviderSnapshot) -> ProviderRow {
    let v = serde_json::to_value(p).unwrap_or_default();
    ProviderRow {
        id: p.id.to_string(),
        game_id: text(&v["gameId"]),
        name: p.display_name.to_string(),
        support: text(&v["supportLevel"]),
        availability: text(&v["availability"]["state"]),
        reason: v["availability"]["reason"].as_str().map(str::to_string),
        status: text(&v["status"]["state"]),
        message: v["status"]["message"].as_str().map(str::to_string),
        events: p.events.clone(),
    }
}

fn runtime_status(r: &RuntimeSnapshot, providers: &[ProviderSnapshot]) -> AutoStatus {
    let v = serde_json::to_value(r).unwrap_or_default();
    AutoStatus {
        state: text(&v["state"]),
        active_game: v["activeGameId"].as_str().map(str::to_string),
        last_error: r.last_error.clone(),
        clips_created: r.clips_created,
        providers: providers.iter().map(row).collect(),
    }
}

pub struct Auto {
    host: AutoCapture,
    next_game_check: Instant,
    next_mic: Instant,
}

impl Auto {
    pub fn new(settings: AutoCaptureSettings, tx: mpsc::Sender<Msg>) -> Auto {
        let mut host = AutoCapture::new(settings, data_dir().join("autocapture"));
        host.set_waker(Arc::new(move || {
            let _ = tx.send(Msg::AutoWake);
        }));
        host.refresh_discovery();
        Auto { host, next_game_check: Instant::now(), next_mic: Instant::now() }
    }

    pub fn set_settings(&mut self, s: AutoCaptureSettings) {
        if *self.host.settings() != s {
            self.host.set_settings(s);
        }
    }

    pub fn set_reaction_saved_at(&mut self, at: Option<SystemTime>) {
        self.host.set_last_reaction_saved_at(at);
    }

    pub fn capture_started(&mut self, replay_seconds: u32) {
        self.host.set_replay_length(replay_seconds);
        self.host.set_capture_active(true);
    }

    /// Flushes pending windows; returns saves that must run before the
    /// engine's ring is torn down.
    pub fn capture_stopping(&mut self) -> Vec<SaveRequest> {
        self.host.set_capture_active(false);
        self.host.poll(SystemTime::now())
    }

    pub fn setup(&mut self, provider: &str) -> Result<(), String> {
        self.host.setup_provider(provider).map(|_| ()).map_err(|e| format!("{e:#}"))
    }

    pub fn refresh(&mut self) {
        self.host.refresh_discovery();
    }

    pub fn status(&self) -> AutoStatus {
        runtime_status(&self.host.runtime(), &self.host.status())
    }

    pub fn record(&mut self, req: &SaveRequest, result: Result<(), String>) {
        self.host.record_saved(req, result);
    }

    /// Next instant the service loop must wake for Auto Capture.
    pub fn deadline(&self) -> Instant {
        let mut at = self.next_game_check;
        if self.host.wants_microphone() {
            at = at.min(self.next_mic);
        }
        if let Some(d) = self.host.next_deadline() {
            let wait = d.duration_since(SystemTime::now()).unwrap_or_default();
            at = at.min(Instant::now() + wait);
        }
        at
    }

    /// Runs whatever is due and returns windows ready to save.
    pub fn step(&mut self, engine: Option<&Engine>) -> Vec<SaveRequest> {
        let now = Instant::now();
        if now >= self.next_game_check {
            self.host.on_game_changed(active_game());
            self.next_game_check = now + GAME_CHECK;
        }
        if self.host.wants_microphone() && now >= self.next_mic {
            if let Some(e) = engine {
                let levels = e.drain_mic_levels();
                if !levels.is_empty() {
                    self.host.push_microphone_levels(&levels, SystemTime::now());
                }
            }
            self.next_mic = now + MIC_PUMP;
        }
        self.host.poll(SystemTime::now())
    }

    pub fn shutdown(&mut self) -> Vec<SaveRequest> {
        self.host.shutdown()
    }
}
