//! The service thread owns the engine and settings. Everything else (tray,
//! hotkey, UI connections) talks to it through one channel.

use std::collections::HashMap;
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

use switchboard_capture::{AudioDevices, Engine, SavedClip, foreground_app_name, list_audio_devices, list_displays, process_memory};

use crate::auto::Auto;
use crate::library_index::{CaptureSource, EventMarker, LibraryIndex, clean_title};
use crate::protocol::{Event, ReplayState, Request, ServiceState};
use crate::settings::{Settings, set_autostart};
use crate::tray::MainThread;

pub enum Msg {
    Request { conn: u64, req: Request },
    Connected { conn: u64, out: mpsc::Sender<Event> },
    Disconnected { conn: u64 },
    Hotkey,
    HotkeyResult(Option<String>),
    SaveDone(Result<SavedClip, String>),
    /// Auto Capture has work due (event arrived, window ready).
    AutoWake,
    AutoSaved(Box<switchboard_autocapture::SaveRequest>, Result<SavedClip, String>),
    Update(crate::update::UpdatePhase),
}

/// Retry delay after the engine fails at runtime (display unplugged,
/// driver reset). Only armed while replay is enabled and failing.
const RETRY_AFTER: Duration = Duration::from_secs(5);
/// While a UI is connected, push live status once a second.
const UI_STATUS_INTERVAL: Duration = Duration::from_secs(1);
/// While replay runs with no UI, check engine health every 5 s.
const HEALTH_INTERVAL: Duration = Duration::from_secs(5);

struct Service {
    settings: Settings,
    engine: Option<Arc<Engine>>,
    replay: ReplayState,
    subscribers: HashMap<u64, mpsc::Sender<Event>>,
    hotkey_error: Option<String>,
    displays: Vec<switchboard_capture::DisplayInfo>,
    index: LibraryIndex,
    /// Game name captured when the save started, for the index entry.
    saving_game: Option<String>,
    audio_devices: AudioDevices,
    saving: bool,
    retry_at: Option<Instant>,
    ui_child: Option<std::process::Child>,
    tx: mpsc::Sender<Msg>,
    main: MainThread,
    auto: Option<Auto>,
    updater: crate::update::Updater,
}

pub fn run(settings: Settings, rx: mpsc::Receiver<Msg>, tx: mpsc::Sender<Msg>, main: MainThread, open_ui: bool) {
    let mut s = Service {
        settings,
        engine: None,
        replay: ReplayState::Off,
        subscribers: HashMap::new(),
        hotkey_error: None,
        displays: list_displays().unwrap_or_default(),
        index: LibraryIndex::load(),
        saving_game: None,
        audio_devices: AudioDevices::default(),
        saving: false,
        retry_at: None,
        ui_child: None,
        updater: crate::update::Updater::new(tx.clone()),
        tx,
        main,
        auto: None,
    };
    s.updater.set_automatic(s.settings.auto_update);
    s.sync_auto();
    if s.settings.replay_enabled {
        s.start_engine();
    }
    if open_ui {
        s.open_ui();
    }
    s.sync_tray();
    let mut next_tick = Instant::now();
    loop {
        let interval = if !s.subscribers.is_empty() {
            Some(UI_STATUS_INTERVAL)
        } else if s.engine.is_some() || s.retry_at.is_some() || s.auto.is_some() {
            Some(HEALTH_INTERVAL)
        } else {
            None
        };
        let msg = match interval {
            Some(_) => {
                let mut wait = next_tick.saturating_duration_since(Instant::now());
                if let Some(a) = &s.auto {
                    wait = wait.min(a.deadline().saturating_duration_since(Instant::now()));
                }
                match rx.recv_timeout(wait) {
                    Ok(m) => Some(m),
                    // Either the tick or an Auto Capture deadline is due;
                    // the tick advances only when it actually runs below.
                    Err(mpsc::RecvTimeoutError::Timeout) => None,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            None => match rx.recv() {
                Ok(m) => Some(m),
                Err(_) => return,
            },
        };
        match msg {
            Some(m) => {
                if !s.handle(m) {
                    return;
                }
            }
            None => {}
        }
        // Run the periodic tick whenever it's due, including when messages
        // keep arriving before the timeout would fire.
        if let Some(d) = interval
            && Instant::now() >= next_tick
        {
            s.tick();
            next_tick = Instant::now() + d;
        }
        s.auto_step();
    }
}

impl Service {
    fn handle(&mut self, msg: Msg) -> bool {
        match msg {
            Msg::Connected { conn, out } => {
                self.subscribers.insert(conn, out);
            }
            Msg::Disconnected { conn } => {
                self.subscribers.remove(&conn);
            }
            Msg::Hotkey => self.save_clip(),
            Msg::HotkeyResult(err) => {
                self.hotkey_error = err;
                self.broadcast_state();
            }
            Msg::SaveDone(result) => {
                self.saving = false;
                match result {
                    Ok(clip) => {
                        if let Some(file) = clip.path.file_name().map(|n| n.to_string_lossy().to_string()) {
                            let entry = self.index.entry(&file);
                            entry.source = CaptureSource::Manual;
                            entry.game = self.saving_game.take();
                            let _ = self.index.save();
                            self.broadcast(Event::LibraryChanged);
                        }
                        if self.settings.show_toast {
                            let name = clip.path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                            self.main.toast(true, format!("Clip saved \u{b7} {}", seconds_label(clip.seconds)), name);
                        }
                        self.broadcast(Event::ClipSaved { clip });
                    }
                    Err(message) => {
                        self.main.toast(false, "Couldn't save the clip".into(), message.clone());
                        self.broadcast(Event::ClipFailed { message });
                    }
                }
                self.broadcast_state();
            }
            Msg::AutoWake => {}
            Msg::AutoSaved(req, result) => self.auto_saved(*req, result),
            Msg::Update(phase) => {
                if !matches!(phase, crate::update::UpdatePhase::Checking | crate::update::UpdatePhase::Downloading { .. }) {
                    self.updater.status.checked_at_ms = Some(crate::update::now_unix_ms());
                }
                self.updater.status.phase = phase;
                self.broadcast_state();
            }
            Msg::Request { conn, req } => match req {
                Request::Subscribe => {
                    self.displays = list_displays().unwrap_or_default();
                    self.send_state_to(conn)
                }
                Request::SaveClip => self.save_clip(),
                Request::SetReplay { enabled } => {
                    self.settings.replay_enabled = enabled;
                    let _ = self.settings.save();
                    if enabled {
                        self.sync_auto();
                        self.start_engine();
                    } else {
                        self.stop_engine();
                        self.replay = ReplayState::Off;
                        self.sync_auto();
                    }
                    self.sync_tray();
                    self.broadcast_state();
                }
                Request::ApplySettings { settings } => self.apply_settings(settings),
                Request::UpdateClip { file, favorite, title } => {
                    // Only plain file names inside the clips folder.
                    let safe = !file.is_empty() && !file.contains(['/', '\\', ':']) && file.ends_with(".mp4");
                    if safe && self.settings.clips_dir().join(&file).exists() {
                        let entry = self.index.entry(&file);
                        if let Some(f) = favorite {
                            entry.favorite = f;
                        }
                        if let Some(t) = title {
                            entry.title = t.as_deref().and_then(clean_title);
                        }
                        let _ = self.index.save();
                        self.broadcast(Event::LibraryChanged);
                    }
                }
                Request::PruneLibrary => {
                    if self.index.prune(&self.settings.clips_dir()) {
                        let _ = self.index.save();
                        self.broadcast(Event::LibraryChanged);
                    }
                }
                Request::RefreshDevices => {
                    self.displays = list_displays().unwrap_or_default();
                    self.audio_devices = list_audio_devices();
                    if let Some(a) = &mut self.auto {
                        a.refresh();
                    }
                    self.broadcast_state();
                }
                Request::SetupProvider { id } => {
                    if let Some(a) = &mut self.auto {
                        match a.setup(&id) {
                            Ok(()) => self.main.toast(true, "Auto Capture is set up".into(), "Restart the game to start sending events.".into()),
                            Err(e) => self.main.toast(false, "Couldn't set up Auto Capture".into(), e),
                        }
                    }
                    self.broadcast_state();
                }
                Request::CheckForUpdates => {
                    self.updater.check_now();
                }
                Request::InstallUpdate => {
                    if let Some((_, staged)) = crate::update::staged() {
                        self.stop_engine();
                        if let Some(mut a) = self.auto.take() {
                            drop(a.shutdown());
                        }
                        match crate::update::install(&staged, !self.subscribers.is_empty()) {
                            Ok(()) => {
                                self.broadcast(Event::Shutdown);
                                std::thread::sleep(Duration::from_millis(100));
                                self.main.quit();
                                return false;
                            }
                            Err(e) => {
                                self.updater.status.phase = crate::update::UpdatePhase::Failed { message: format!("{e:#}") };
                                // Put capture back as it was.
                                self.sync_auto();
                                if self.settings.replay_enabled {
                                    self.start_engine();
                                }
                                self.broadcast_state();
                            }
                        }
                    }
                }
                Request::OpenUi => self.open_ui(),
                Request::Quit => {
                    self.stop_engine();
                    if let Some(mut a) = self.auto.take() {
                        drop(a.shutdown());
                    }
                    self.broadcast(Event::Shutdown);
                    // Give UI writers a moment to deliver the shutdown event.
                    std::thread::sleep(Duration::from_millis(100));
                    self.main.quit();
                    return false;
                }
            },
        }
        true
    }

    fn tick(&mut self) {
        if let Some(engine) = &self.engine {
            if let Some(err) = engine.status().video_error {
                self.stop_engine();
                self.replay = ReplayState::Failed { message: err };
                self.retry_at = Some(Instant::now() + RETRY_AFTER);
                self.sync_tray();
            }
        } else if let Some(at) = self.retry_at
            && Instant::now() >= at && self.settings.replay_enabled {
                self.start_engine();
            }
        if !self.subscribers.is_empty() {
            self.broadcast_state();
        }
    }

    fn start_engine(&mut self) {
        self.stop_engine();
        self.replay = ReplayState::Starting;
        self.displays = list_displays().unwrap_or_default();
        self.broadcast_state();
        match Engine::start(&self.settings.engine_config()) {
            Ok(engine) => {
                self.engine = Some(Arc::new(engine));
                self.replay = ReplayState::Running;
                self.retry_at = None;
                if let Some(a) = &mut self.auto {
                    a.capture_started(self.settings.replay_seconds);
                }
            }
            Err(e) => {
                self.replay = ReplayState::Failed { message: format!("{e:#}") };
                self.retry_at = Some(Instant::now() + RETRY_AFTER);
            }
        }
        self.sync_tray();
        self.broadcast_state();
    }

    fn stop_engine(&mut self) {
        // Pending Auto Capture windows are saved before the ring goes away.
        if let (Some(a), Some(engine)) = (&mut self.auto, self.engine.clone()) {
            for req in a.capture_stopping() {
                let result = self.save_auto_window(&engine, &req);
                self.auto_saved(req, result);
            }
        }
        // A save in progress holds its own Arc; the engine stops when it ends.
        self.engine = None;
        self.retry_at = None;
    }

    fn save_clip(&mut self) {
        let Some(engine) = self.engine.clone() else {
            let message = "Instant Replay is off. Turn it on to save clips.".to_string();
            self.main.toast(false, "Nothing to save".into(), message.clone());
            self.broadcast(Event::ClipFailed { message });
            return;
        };
        if self.saving {
            return;
        }
        self.saving = true;
        self.broadcast_state();
        let seconds = self.settings.replay_seconds;
        let dir = self.settings.clips_dir();
        // Name the clip after whatever was in front when the hotkey fired.
        let name = foreground_app_name();
        self.saving_game = Some(name.clone());
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let result = engine.save(seconds, &dir, &name).map_err(|e| format!("{e:#}"));
            if let Ok(clip) = &result {
                save_thumbnail(&engine, &clip.path);
            }
            let _ = tx.send(Msg::SaveDone(result));
        });
    }

    fn apply_settings(&mut self, new: Settings) {
        let new = new.sanitized();
        let restart = new.engine_key() != self.settings.engine_key();
        let hotkey_changed = new.hotkey != self.settings.hotkey;
        let autostart_changed = new.start_with_windows != self.settings.start_with_windows;
        let replay_changed = new.replay_enabled != self.settings.replay_enabled;
        self.settings = new;
        let _ = self.settings.save();
        self.updater.set_automatic(self.settings.auto_update);
        self.sync_auto();
        if autostart_changed
            && let Err(e) = set_autostart(self.settings.start_with_windows) {
                eprintln!("autostart: {e:#}");
            }
        if hotkey_changed {
            self.main.set_hotkey(self.settings.hotkey.clone());
        }
        if self.settings.replay_enabled && (restart || replay_changed || self.engine.is_none()) {
            self.start_engine();
        } else if !self.settings.replay_enabled {
            self.stop_engine();
            self.replay = ReplayState::Off;
        }
        self.sync_tray();
        self.broadcast_state();
    }

    fn open_ui(&mut self) {
        let alive = self.ui_child.as_mut().is_some_and(|c| matches!(c.try_wait(), Ok(None)));
        if alive {
            self.broadcast(Event::Focus);
            return;
        }
        match std::env::current_exe().and_then(|exe| std::process::Command::new(exe).arg("--ui").spawn()) {
            Ok(child) => self.ui_child = Some(child),
            Err(e) => eprintln!("could not open the window: {e}"),
        }
    }

    fn state(&self) -> ServiceState {
        ServiceState {
            settings: self.settings.clone(),
            replay: self.replay.clone(),
            info: self.engine.as_ref().map(|e| e.info.clone()),
            status: self.engine.as_ref().map(|e| e.status()),
            displays: self.displays.clone(),
            audio_devices: self.audio_devices.clone(),
            auto: self.auto.as_ref().map(Auto::status),
            hotkey_error: self.hotkey_error.clone(),
            saving: self.saving,
            service_memory: process_memory().0,
            build: crate::protocol::BUILD.to_string(),
            update: self.updater.status.clone(),
        }
    }

    fn send_state_to(&mut self, conn: u64) {
        let state = Event::State { state: Box::new(self.state()) };
        if let Some(tx) = self.subscribers.get(&conn) {
            let _ = tx.send(state);
        }
    }

    fn broadcast_state(&mut self) {
        if self.subscribers.is_empty() {
            return;
        }
        self.broadcast(Event::State { state: Box::new(self.state()) });
    }

    fn broadcast(&mut self, event: Event) {
        self.subscribers.retain(|_, tx| tx.send(event.clone()).is_ok());
    }

    /// Creates or drops the Auto Capture host to match settings.
    fn sync_auto(&mut self) {
        let a = &self.settings.auto_capture;
        // Auto Capture saves from the replay ring, so with replay off it has
        // nothing to do: no game checks, no mic levels.
        let wanted = self.settings.replay_enabled && (a.enabled || a.reaction_clipping.enabled);
        match (&mut self.auto, wanted) {
            (Some(host), true) => host.set_settings(a.clone()),
            (None, true) => {
                let mut host = Auto::new(a.clone(), self.tx.clone());
                host.set_reaction_saved_at(self.newest_reaction());
                if self.engine.is_some() {
                    host.capture_started(self.settings.replay_seconds);
                }
                self.auto = Some(host);
            }
            (Some(_), false) => {
                if let Some(mut host) = self.auto.take() {
                    let pending = host.shutdown();
                    if let Some(engine) = self.engine.clone() {
                        for req in pending {
                            let _ = self.save_auto_window(&engine, &req);
                        }
                    }
                }
            }
            (None, false) => {}
        }
    }

    /// Restores the reaction cooldown from the newest saved reaction clip.
    fn newest_reaction(&self) -> Option<std::time::SystemTime> {
        let dir = self.settings.clips_dir();
        self.index
            .clips
            .iter()
            .filter(|(_, m)| m.source == CaptureSource::Auto && m.events.iter().any(|e| e.label == "Reaction"))
            .filter_map(|(f, _)| std::fs::metadata(dir.join(f)).and_then(|m| m.modified()).ok())
            .max()
    }

    fn auto_step(&mut self) {
        let Some(a) = &mut self.auto else { return };
        let engine = self.engine.clone();
        let requests = a.step(engine.as_deref());
        for req in requests {
            match engine.clone() {
                Some(engine) => {
                    let tx = self.tx.clone();
                    let svc_dir = self.settings.clips_dir();
                    std::thread::spawn(move || {
                        let result = save_window(&engine, &req, &svc_dir);
                        let _ = tx.send(Msg::AutoSaved(Box::new(req), result));
                    });
                }
                None => {
                    if let Some(a) = &mut self.auto {
                        a.record(&req, Err("Instant Replay is off".into()));
                    }
                }
            }
        }
    }

    fn save_auto_window(&self, engine: &Engine, req: &switchboard_autocapture::SaveRequest) -> Result<SavedClip, String> {
        save_window(engine, req, &self.settings.clips_dir())
    }

    fn auto_saved(&mut self, req: switchboard_autocapture::SaveRequest, result: Result<SavedClip, String>) {
        match &result {
            Ok(clip) => {
                if let Some(file) = clip.path.file_name().map(|n| n.to_string_lossy().to_string()) {
                    let markers = req.markers_for(clip.started_unix_ms, (clip.seconds * 1000.0) as u64);
                    let entry = self.index.entry(&file);
                    entry.source = CaptureSource::Auto;
                    entry.game = Some(req.game_name.clone());
                    entry.title = clean_title(&req.title);
                    entry.events = markers
                        .iter()
                        .map(|m| EventMarker {
                            kind: m.event_type.as_str().to_string(),
                            label: m.label.clone().unwrap_or_else(|| m.event_type.label().to_string()),
                            offset_ms: m.offset_ms as i64,
                        })
                        .collect();
                    let _ = self.index.save();
                    self.broadcast(Event::LibraryChanged);
                }
                if self.settings.auto_capture.notify_when_saved {
                    self.main.toast(true, format!("Auto Capture saved \u{b7} {}", seconds_label(clip.seconds)), req.title.clone());
                }
                self.broadcast(Event::ClipSaved { clip: clip.clone() });
            }
            Err(e) => eprintln!("auto capture save failed: {e}"),
        }
        if let Some(a) = &mut self.auto {
            a.record(&req, result.map(|_| ()));
        }
        self.broadcast_state();
    }

    fn sync_tray(&self) {
        let replay_on = matches!(self.replay, ReplayState::Running | ReplayState::Starting);
        let tooltip = match &self.replay {
            ReplayState::Running => format!("Switchboard \u{b7} Instant Replay on ({})", self.settings.hotkey),
            ReplayState::Starting => "Switchboard \u{b7} starting Instant Replay".into(),
            ReplayState::Off => "Switchboard \u{b7} Instant Replay off".into(),
            ReplayState::Failed { .. } => "Switchboard \u{b7} Instant Replay failed".into(),
        };
        self.main.update_tray(replay_on, tooltip, self.settings.hotkey.clone());
    }
}

pub fn seconds_label(s: f32) -> String {
    let s = s.round() as u32;
    format!("{}:{:02}", s / 60, s % 60)
}

/// Saves an Auto Capture window: wall-clock times map onto the capture clock.
fn save_window(engine: &Engine, req: &switchboard_autocapture::SaveRequest, dir: &std::path::Path) -> Result<SavedClip, String> {
    use switchboard_capture::clock::system_to_hns;
    let clip = engine
        .save_range(system_to_hns(req.start_time()), system_to_hns(req.end_time()), dir, &req.game_name)
        .map_err(|e| format!("{e:#}"))?;
    save_thumbnail(engine, &clip.path);
    Ok(clip)
}

/// The clip's thumbnail from the frame on screen as the save finishes,
/// scaled on the GPU (~5 ms), so the library never decodes a new clip.
/// A failure only means the window decodes it later.
fn save_thumbnail(engine: &Engine, clip: &std::path::Path) {
    use crate::ui::library::{THUMB_H, THUMB_W};
    if let Ok(rgba) = engine.snapshot_rgba(THUMB_W as u32, THUMB_H as u32) {
        let _ = crate::ui::thumbs::store(clip, &rgba);
    }
}
