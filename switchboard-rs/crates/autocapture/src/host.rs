//! The Auto Capture host: provider lifecycle for the active game, the event
//! engine, and reaction clipping (port of `coordinator.ts`, `registry.ts` and
//! the controller wiring). Single-threaded and owned by the tray service.
//!
//! Threads exist only while a provider is running (CS2 listener, War Thunder
//! poller). With Auto Capture disabled, capture inactive, or no supported game
//! active, nothing runs and `next_deadline` is `None`.

use crate::discovery::{DetectedGame, DiscoveryOptions, scan_games};
use crate::engine::{
    Engine, EngineStats, EventOutcome, EventPolicy, FlushReason, LastEvent,
    REACTION_DESKTOP_GAME_ID, REACTION_PROVIDER_ID, SaveRequest,
};
use crate::events::{
    EventMetadata, GameEvent, GameEventSource, GameEventType, system_time, unix_ms,
};
use crate::games::GameId;
use crate::providers::cs2::{self, Cs2Provider};
use crate::providers::unavailable::DetectionOnlyProvider;
use crate::providers::war_thunder::{self, WarThunderProvider};
use crate::providers::{
    Availability, AvailabilityState, EventSink, Provider, ProviderState, ProviderStatus,
    SupportLevel,
};
use crate::reaction::{ReactionDetector, ReactionFrame, ReactionSnapshot};
use crate::settings::AutoCaptureSettings;
use serde::Serialize;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, SystemTime};

pub type Waker = Arc<dyn Fn() + Send + Sync>;
pub type Clock = Arc<dyn Fn() -> SystemTime + Send + Sync>;

#[derive(Clone)]
pub struct HostOptions {
    pub discovery: DiscoveryOptions,
    /// CS2 GSI listener port (0 = ephemeral, for tests).
    pub cs2_port: u16,
    pub war_thunder_endpoint: SocketAddr,
    pub war_thunder_interval: Duration,
    /// Wall clock used for flushes triggered outside `poll` (tests inject one).
    pub clock: Option<Clock>,
}

impl Default for HostOptions {
    fn default() -> Self {
        Self {
            discovery: DiscoveryOptions::default(),
            cs2_port: cs2::DEFAULT_PORT,
            war_thunder_endpoint: war_thunder::DEFAULT_ENDPOINT
                .parse()
                .expect("valid endpoint"),
            war_thunder_interval: war_thunder::POLL_INTERVAL,
            clock: None,
        }
    }
}

/// Provider descriptor + availability + live status (`AutoCaptureProvider`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub id: &'static str,
    pub game_id: GameId,
    pub display_name: &'static str,
    pub support_level: SupportLevel,
    pub source: GameEventSource,
    pub events: Vec<GameEventType>,
    pub native_multi_kill: bool,
    pub availability: Availability,
    pub status: ProviderStatus,
    pub requires_player_name: bool,
    pub supports_anonymous_name: bool,
    pub development_only: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeState {
    Disabled,
    Idle,
    Listening,
    Pending,
    Degraded,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingSummary {
    pub started_at_ms: u64,
    pub ends_at_ms: u64,
    pub event_count: usize,
}

/// Diagnostics (`AutoCaptureRuntime`), minus the old async `saving` state:
/// saves are performed by the caller.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub state: RuntimeState,
    pub active_game_id: Option<GameId>,
    pub active_provider_id: Option<&'static str>,
    pub pending_capture: Option<PendingSummary>,
    pub events_received: u64,
    pub events_deduplicated: u64,
    pub events_ignored: u64,
    pub clips_created: u64,
    pub last_event: Option<LastEvent>,
    pub last_error: Option<String>,
}

pub struct AutoCapture {
    settings: AutoCaptureSettings,
    options: HostOptions,
    engine: Engine,
    providers: Vec<Box<dyn Provider>>,
    availability: Vec<Option<Availability>>,
    active_provider: Option<usize>,
    provider_error: Option<String>,
    games: Option<Vec<DetectedGame>>,
    scan_warnings: Vec<String>,
    active_game: Option<GameId>,
    capture_active: bool,
    tx: Sender<GameEvent>,
    rx: Receiver<GameEvent>,
    waker: Option<Waker>,
    outbox: Vec<SaveRequest>,
    reaction: ReactionDetector,
    clips_created: u64,
    disposed: bool,
}

impl AutoCapture {
    /// `data_dir` holds the CS2 token (`cs2-gsi-token`). Nothing starts until
    /// `set_capture_active(true)` and `on_game_changed(Some(..))`.
    pub fn new(settings: AutoCaptureSettings, data_dir: impl Into<PathBuf>) -> Self {
        Self::with_options(settings, data_dir, HostOptions::default())
    }

    pub fn with_options(
        settings: AutoCaptureSettings,
        data_dir: impl Into<PathBuf>,
        options: HostOptions,
    ) -> Self {
        let data_dir: PathBuf = data_dir.into();
        let providers = default_providers(&data_dir, &options);
        Self::with_providers(settings, options, providers)
    }

    /// Explicit provider set (tests, or a host that adds providers).
    pub fn with_providers(
        settings: AutoCaptureSettings,
        options: HostOptions,
        providers: Vec<Box<dyn Provider>>,
    ) -> Self {
        let settings = settings.sanitized();
        let (tx, rx) = mpsc::channel();
        Self {
            reaction: ReactionDetector::new(&settings.reaction_clipping),
            availability: vec![None; providers.len()],
            settings,
            options,
            engine: Engine::new(),
            providers,
            active_provider: None,
            provider_error: None,
            games: None,
            scan_warnings: Vec::new(),
            active_game: None,
            capture_active: false,
            tx,
            rx,
            waker: None,
            outbox: Vec::new(),
            clips_created: 0,
            disposed: false,
        }
    }

    /// Called from provider threads after each delivered event, and from
    /// this thread when a flush queues saves. Typically posts a message to
    /// the tray loop, which then calls `poll`. Set before capture starts.
    pub fn set_waker(&mut self, waker: Waker) {
        self.waker = Some(waker);
    }

    pub fn settings(&self) -> &AutoCaptureSettings {
        &self.settings
    }

    pub fn set_settings(&mut self, settings: AutoCaptureSettings) {
        let settings = settings.sanitized();
        if settings.reaction_clipping != self.settings.reaction_clipping {
            self.reaction.configure(&settings.reaction_clipping);
        }
        self.settings = settings;
        self.reconcile(FlushReason::Reconfigured);
    }

    /// Instant Replay is running (true) or stopping (false). Stopping
    /// flushes pending windows first; call it before the ring is torn down.
    pub fn set_capture_active(&mut self, active: bool) {
        if self.capture_active == active {
            return;
        }
        self.capture_active = active;
        if !active {
            self.flush_into_outbox(FlushReason::CaptureStopped);
            self.reaction.pause();
        }
        self.reconcile(FlushReason::CaptureStopped);
    }

    /// The supported game Auto Capture should follow (see
    /// `discovery::detect_games().active()`), or `None` when it exited.
    pub fn on_game_changed(&mut self, game: Option<GameId>) {
        if self.active_game == game {
            return;
        }
        self.active_game = game;
        let reason = if game.is_some() {
            FlushReason::GameChanged
        } else {
            FlushReason::GameExited
        };
        self.reconcile(reason);
    }

    pub fn active_game(&self) -> Option<GameId> {
        self.active_game
    }

    /// Replay buffer length; windows are capped at `max(15 s, length)`.
    pub fn set_replay_length(&mut self, seconds: u32) {
        self.engine.set_replay_length_ms(u64::from(seconds) * 1_000);
    }

    /// Finalize all pending windows now (e.g. before reconfiguring the
    /// replay ring without stopping capture). Results come from `poll`.
    pub fn flush(&mut self, reason: FlushReason) {
        self.flush_into_outbox(reason);
    }

    /// Creation time of the newest saved reaction clip in the library, so the
    /// reaction cooldown survives restarts. Call once at startup.
    pub fn set_last_reaction_saved_at(&mut self, at: Option<SystemTime>) {
        self.engine
            .set_last_reaction_saved_at_ms(at.map_or(0, unix_ms));
    }

    /// True when reaction clipping needs microphone frames.
    pub fn wants_microphone(&self) -> bool {
        !self.disposed && self.capture_active && self.settings.reaction_clipping.enabled
    }

    /// Level-only microphone input: consecutive 10 ms RMS levels in dBFS
    /// whose last frame ends at `now`.
    pub fn push_microphone_levels(&mut self, levels_dbfs: &[f32], now: SystemTime) {
        if !self.wants_microphone() {
            return;
        }
        if let Some(d) = self.reaction.push(levels_dbfs, unix_ms(now)) {
            self.on_reaction(d.timestamp_ms, d.confidence, unix_ms(now));
        }
    }

    /// Full-feature microphone input (level, zero-crossing rate, crest).
    pub fn push_microphone_frames(&mut self, frames: &[ReactionFrame], now: SystemTime) {
        if !self.wants_microphone() {
            return;
        }
        if let Some(d) = self.reaction.push_frames(frames, unix_ms(now)) {
            self.on_reaction(d.timestamp_ms, d.confidence, unix_ms(now));
        }
    }

    /// Microphone input was lost or switched; forget learned levels.
    pub fn reset_microphone(&mut self) {
        self.reaction.pause();
    }

    pub fn reaction_status(&self, now: SystemTime) -> ReactionSnapshot {
        self.reaction.snapshot(unix_ms(now))
    }

    /// Ingest provider events and return every save that is due, plus saves
    /// queued by flushes since the last call. Cheap when idle.
    pub fn poll(&mut self, now: SystemTime) -> Vec<SaveRequest> {
        if self.disposed {
            return std::mem::take(&mut self.outbox);
        }
        let now_ms = unix_ms(now);
        self.drain_events(now_ms);
        let due = self.engine.poll(now_ms);
        self.outbox.extend(due);
        std::mem::take(&mut self.outbox)
    }

    /// When `poll` should next be called if no waker fires. `None` = idle.
    pub fn next_deadline(&self) -> Option<SystemTime> {
        if !self.outbox.is_empty() {
            return Some(SystemTime::UNIX_EPOCH);
        }
        self.engine.next_deadline_ms().map(system_time)
    }

    /// Report the outcome of a save the caller performed.
    pub fn record_saved(&mut self, request: &SaveRequest, result: Result<(), String>) {
        match result {
            Ok(()) => {
                self.clips_created += 1;
                self.engine.set_error(None);
                if request.is_reaction() {
                    self.engine
                        .set_last_reaction_saved_at_ms(unix_ms(self.now()).max(request.end_ms));
                }
            }
            Err(e) => self.engine.set_error(Some(e.chars().take(320).collect())),
        }
    }

    /// Rescan Steam/Epic libraries and recheck availability (Settings open,
    /// after installs). Blocking file I/O, typically a few milliseconds.
    pub fn refresh_discovery(&mut self) {
        let result = scan_games(&self.options.discovery);
        self.games = Some(result.games);
        self.scan_warnings = result.warnings;
        self.refresh_availability();
        self.reconcile(FlushReason::Reconfigured);
    }

    pub fn detected_games(&self) -> Option<&[DetectedGame]> {
        self.games.as_deref()
    }

    pub fn scan_warnings(&self) -> &[String] {
        &self.scan_warnings
    }

    /// User-initiated provider setup (CS2: install the GSI config into the
    /// detected CS2 folder and store a fresh token).
    pub fn setup_provider(&mut self, provider_id: &str) -> anyhow::Result<Availability> {
        let index = self
            .providers
            .iter()
            .position(|p| p.id() == provider_id)
            .ok_or_else(|| anyhow::anyhow!("Unknown Auto Capture provider: {provider_id}"))?;
        if self.games.is_none() {
            self.refresh_discovery();
        }
        let games = self.games.clone().unwrap_or_default();
        // A running provider must pick up the new token.
        if self.active_provider == Some(index) {
            self.stop_active(FlushReason::Reconfigured);
        }
        let availability = self.providers[index].setup(&games)?;
        self.availability[index] = Some(availability.clone());
        self.reconcile(FlushReason::Reconfigured);
        Ok(availability)
    }

    pub fn status(&self) -> Vec<ProviderSnapshot> {
        self.providers
            .iter()
            .zip(&self.availability)
            .filter(|(p, _)| cfg!(feature = "test-provider") || !p.descriptor().development_only)
            .map(|(p, availability)| {
                let d = p.descriptor();
                ProviderSnapshot {
                    id: d.id,
                    game_id: d.game,
                    display_name: d.display_name,
                    support_level: d.support_level,
                    source: d.source,
                    events: d.events.to_vec(),
                    native_multi_kill: d.native_multi_kill,
                    availability: availability.clone().unwrap_or_else(|| {
                        Availability::unavailable("Availability has not been checked yet.")
                    }),
                    status: p.status(),
                    requires_player_name: d.requires_player_name,
                    supports_anonymous_name: d.supports_anonymous_name,
                    development_only: d.development_only,
                }
            })
            .collect()
    }

    pub fn runtime(&self) -> RuntimeSnapshot {
        let stats: &EngineStats = self.engine.stats();
        let latest = self.engine.pending().last();
        let active_status = self.active_provider.map(|i| self.providers[i].status());
        let provider_problem = self.provider_error.clone().or_else(|| {
            active_status
                .as_ref()
                .filter(|s| matches!(s.state, ProviderState::Degraded | ProviderState::Error))
                .map(|s| {
                    s.message
                        .clone()
                        .unwrap_or_else(|| "The game integration needs attention.".into())
                })
        });
        let automation = self.settings.enabled || self.settings.reaction_clipping.enabled;
        let state = if !automation || self.disposed {
            RuntimeState::Disabled
        } else if latest.is_some() {
            RuntimeState::Pending
        } else if provider_problem.is_some() {
            RuntimeState::Degraded
        } else if active_status.is_some_and(|s| s.state == ProviderState::Listening) {
            RuntimeState::Listening
        } else {
            RuntimeState::Idle
        };
        RuntimeSnapshot {
            state,
            active_game_id: self.active_game,
            active_provider_id: self.active_provider.map(|i| self.providers[i].id()),
            pending_capture: latest.map(|w| PendingSummary {
                started_at_ms: w.started_at_ms,
                ends_at_ms: w.ends_at_ms,
                event_count: w.events.len(),
            }),
            events_received: stats.events_received,
            events_deduplicated: stats.events_deduplicated,
            events_ignored: stats.events_ignored,
            clips_created: self.clips_created,
            last_event: stats.last_event.clone(),
            last_error: stats.last_error.clone().or(provider_problem),
        }
    }

    /// Development-only: emit a synthetic event through the real path.
    #[cfg(feature = "test-provider")]
    pub fn emit_test_event(&mut self, event_type: GameEventType) -> anyhow::Result<()> {
        use crate::providers::test_provider::{PROVIDER_ID, TEST_EVENTS};
        if !TEST_EVENTS.contains(&event_type) {
            anyhow::bail!("The test provider cannot emit {}.", event_type.as_str());
        }
        if !self.settings.enabled {
            anyhow::bail!("Enable Auto Capture before emitting a test event.");
        }
        if !self.capture_active {
            anyhow::bail!("Enable Instant Replay before emitting a test event.");
        }
        let index = self
            .providers
            .iter()
            .position(|p| p.id() == PROVIDER_ID)
            .ok_or_else(|| anyhow::anyhow!("The test provider is not registered."))?;
        if self.active_provider != Some(index) {
            self.stop_active(FlushReason::GameChanged);
            let sink = self.sink();
            self.providers[index].start(sink)?;
            self.active_provider = Some(index);
        }
        let now = unix_ms(self.now());
        // Same shape as `TestProvider::emit`; sent through the host sink
        // because the registered provider is behind a trait object.
        let label = if event_type == GameEventType::MultiKill {
            "Double Kill".to_owned()
        } else {
            event_type.label().to_owned()
        };
        let event = GameEvent {
            id: format!("test-{now}-{}", event_type.as_str()),
            game_id: GameId::SwitchboardTest.as_str().into(),
            provider_id: PROVIDER_ID.into(),
            event_type,
            timestamp_ms: now,
            confidence: Some(1.0),
            label: Some(label),
            metadata: EventMetadata {
                count: (event_type == GameEventType::MultiKill).then_some(2),
                ..Default::default()
            },
            source: GameEventSource::Test,
        };
        self.sink().send(event);
        Ok(())
    }

    /// Stop every provider (threads joined, sockets closed), flush pending
    /// windows and return the final saves. Idempotent.
    pub fn shutdown(&mut self) -> Vec<SaveRequest> {
        if !self.disposed {
            let now = unix_ms(self.now());
            self.drain_events(now);
            for provider in &mut self.providers {
                provider.stop();
            }
            self.active_provider = None;
            let flushed = self.engine.dispose(now);
            self.outbox.extend(flushed);
            self.reaction.pause();
            self.disposed = true;
        }
        std::mem::take(&mut self.outbox)
    }

    // ------------------------------------------------------------ private --

    fn now(&self) -> SystemTime {
        self.options
            .clock
            .as_ref()
            .map_or_else(SystemTime::now, |c| c())
    }

    fn sink(&self) -> EventSink {
        EventSink::new(self.tx.clone(), self.waker.clone())
    }

    fn wake(&self) {
        if let Some(w) = &self.waker {
            w();
        }
    }

    fn drain_events(&mut self, now_ms: u64) {
        let active_id = self.active_provider.map(|i| self.providers[i].id());
        while let Ok(event) = self.rx.try_recv() {
            // Late events from a provider that was already stopped are dropped.
            if Some(event.provider_id.as_str()) != active_id {
                continue;
            }
            let _: EventOutcome = self
                .engine
                .handle_event(&event, &self.settings, None, now_ms);
        }
    }

    fn flush_into_outbox(&mut self, reason: FlushReason) {
        let now = unix_ms(self.now());
        self.drain_events(now);
        let flushed = self.engine.flush(now, reason);
        if !flushed.is_empty() {
            self.outbox.extend(flushed);
            self.wake();
        }
    }

    fn stop_active(&mut self, reason: FlushReason) {
        if let Some(index) = self.active_provider {
            self.flush_into_outbox(reason);
            self.providers[index].stop();
            self.active_provider = None;
        }
    }

    fn on_reaction(&mut self, timestamp_ms: u64, confidence: f32, now_ms: u64) {
        let game_id = self.active_game.map_or_else(
            || REACTION_DESKTOP_GAME_ID.to_owned(),
            |g| g.as_str().to_owned(),
        );
        let event = GameEvent {
            id: format!("{REACTION_PROVIDER_ID}-{timestamp_ms}"),
            game_id,
            provider_id: REACTION_PROVIDER_ID.into(),
            event_type: GameEventType::Highlight,
            timestamp_ms,
            confidence: Some(confidence),
            label: Some("Reaction".into()),
            metadata: EventMetadata {
                code: Some("voice-reaction".into()),
                ..Default::default()
            },
            source: GameEventSource::Microphone,
        };
        let r = &self.settings.reaction_clipping;
        let policy = EventPolicy {
            enabled: true,
            pre_roll_seconds: r.pre_roll_seconds,
            post_roll_seconds: r.post_roll_seconds,
            merge_nearby_events: true,
            merge_threshold_seconds: 0,
        };
        self.engine
            .handle_event(&event, &self.settings, Some(&policy), now_ms);
    }

    fn refresh_availability(&mut self) {
        let games = self.games.clone().unwrap_or_default();
        for (provider, slot) in self.providers.iter().zip(self.availability.iter_mut()) {
            *slot = Some(provider.availability(&games));
        }
    }

    fn provider_for(&self, game: GameId) -> Option<usize> {
        self.providers
            .iter()
            .position(|p| p.game() == game && !p.descriptor().development_only)
    }

    fn reconcile(&mut self, reason: FlushReason) {
        if self.disposed {
            return;
        }
        let detected = if self.capture_active {
            self.active_game.and_then(|g| self.provider_for(g))
        } else {
            None
        };
        let next = detected.filter(|&i| {
            self.settings.enabled
                && self
                    .settings
                    .game(self.providers[i].game().as_str())
                    .is_none_or(|g| g.enabled)
        });

        if let Some(current) = self.active_provider
            && Some(current) != next
        {
            self.stop_active(reason);
        }
        if next.is_none() {
            self.provider_error = None;
        }
        let Some(index) = next else { return };
        let game_settings = self
            .settings
            .game(self.providers[index].game().as_str())
            .cloned()
            .unwrap_or_default();
        if self.active_provider == Some(index) {
            self.providers[index].configure(&game_settings);
            return;
        }

        if self.games.is_none() {
            let result = scan_games(&self.options.discovery);
            self.games = Some(result.games);
            self.scan_warnings = result.warnings;
        }
        let availability =
            self.providers[index].availability(self.games.as_deref().unwrap_or_default());
        self.availability[index] = Some(availability.clone());
        if availability.state != AvailabilityState::Available {
            let name = self.providers[index].descriptor().display_name;
            self.provider_error = Some(
                availability
                    .reason
                    .unwrap_or_else(|| format!("{name} is unavailable.")),
            );
            return;
        }
        self.providers[index].configure(&game_settings);
        let sink = self.sink();
        match self.providers[index].start(sink) {
            Ok(()) => {
                self.active_provider = Some(index);
                self.provider_error = None;
            }
            Err(e) => {
                self.providers[index].stop();
                self.provider_error = Some(e.to_string());
            }
        }
    }
}

impl Drop for AutoCapture {
    fn drop(&mut self) {
        for provider in &mut self.providers {
            provider.stop();
        }
    }
}

fn default_providers(data_dir: &Path, options: &HostOptions) -> Vec<Box<dyn Provider>> {
    #[allow(unused_mut)]
    let mut providers: Vec<Box<dyn Provider>> = vec![
        Box::new(Cs2Provider::new(data_dir, options.cs2_port)),
        Box::new(WarThunderProvider::with_endpoint(
            options.war_thunder_endpoint,
            options.war_thunder_interval,
        )),
        Box::new(DetectionOnlyProvider::battlefield_6()),
        Box::new(DetectionOnlyProvider::wardogs()),
    ];
    #[cfg(feature = "test-provider")]
    providers.push(Box::new(
        crate::providers::test_provider::TestProvider::new(),
    ));
    providers
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::write_fake_steam_game;
    use crate::providers::{ProviderDescriptor, StatusCell};
    use crate::settings::GameSettings;
    use crate::test_support::TempDir;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    const T0: u64 = 1_800_000_000_000;

    #[derive(Default)]
    struct Probe {
        starts: AtomicUsize,
        stops: AtomicUsize,
        sink: Mutex<Option<EventSink>>,
    }

    struct FakeProvider {
        descriptor: ProviderDescriptor,
        probe: Arc<Probe>,
        status: StatusCell,
        running: bool,
    }

    impl Provider for FakeProvider {
        fn descriptor(&self) -> &ProviderDescriptor {
            &self.descriptor
        }
        fn availability(&self, _: &[DetectedGame]) -> Availability {
            Availability::available()
        }
        fn start(&mut self, sink: EventSink) -> anyhow::Result<()> {
            self.running = true;
            self.probe.starts.fetch_add(1, Ordering::SeqCst);
            *self.probe.sink.lock().unwrap() = Some(sink);
            self.status.set(ProviderState::Listening, None);
            Ok(())
        }
        fn stop(&mut self) {
            if self.running {
                self.probe.stops.fetch_add(1, Ordering::SeqCst);
            }
            self.running = false;
            self.probe.sink.lock().unwrap().take();
            self.status.reset();
        }
        fn status(&self) -> ProviderStatus {
            self.status.get()
        }
    }

    fn fake(game: GameId, id: &'static str) -> (Box<dyn Provider>, Arc<Probe>) {
        let probe = Arc::new(Probe::default());
        let provider = FakeProvider {
            descriptor: ProviderDescriptor {
                id,
                game,
                display_name: game.display_name(),
                support_level: SupportLevel::Supported,
                source: GameEventSource::Telemetry,
                events: &[GameEventType::Kill],
                native_multi_kill: false,
                requires_player_name: false,
                supports_anonymous_name: false,
                development_only: false,
            },
            probe: probe.clone(),
            status: StatusCell::new(),
            running: false,
        };
        (Box::new(provider), probe)
    }

    fn clock() -> (Clock, Arc<AtomicU64>) {
        let now = Arc::new(AtomicU64::new(T0));
        let c = now.clone();
        (Arc::new(move || system_time(c.load(Ordering::SeqCst))), now)
    }

    fn kill(provider: &str, game: GameId, seq: u64, ts: u64) -> GameEvent {
        GameEvent {
            id: format!("{provider}-{seq}"),
            game_id: game.as_str().into(),
            provider_id: provider.into(),
            event_type: GameEventType::Kill,
            timestamp_ms: ts,
            confidence: Some(1.0),
            label: Some("Kill".into()),
            metadata: EventMetadata {
                sequence: Some(seq),
                ..Default::default()
            },
            source: GameEventSource::Telemetry,
        }
    }

    fn host(enabled: bool) -> (AutoCapture, Arc<Probe>, Arc<Probe>, Arc<AtomicU64>) {
        let (cs, cs_probe) = fake(GameId::CounterStrike2, "cs2-gsi");
        let (wt, wt_probe) = fake(GameId::WarThunder, "war-thunder-8111");
        let (c, now) = clock();
        let options = HostOptions {
            discovery: DiscoveryOptions::isolated(vec![], vec![]),
            clock: Some(c),
            ..Default::default()
        };
        let settings = AutoCaptureSettings {
            enabled,
            ..Default::default()
        };
        let mut h = AutoCapture::with_providers(settings, options, vec![cs, wt]);
        h.set_replay_length(120);
        (h, cs_probe, wt_probe, now)
    }

    fn send(probe: &Probe, event: GameEvent) {
        probe
            .sink
            .lock()
            .unwrap()
            .as_ref()
            .expect("provider running")
            .send(event);
    }

    #[test]
    fn disabled_host_starts_nothing() {
        let (mut h, cs, _, _) = host(false);
        h.set_capture_active(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        assert_eq!(cs.starts.load(Ordering::SeqCst), 0);
        assert_eq!(h.next_deadline(), None);
        assert_eq!(h.runtime().state, RuntimeState::Disabled);
        assert!(!h.wants_microphone());
    }

    #[test]
    fn provider_follows_game_capture_and_settings() {
        let (mut h, cs, wt, _) = host(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        assert_eq!(cs.starts.load(Ordering::SeqCst), 0, "needs capture active");
        h.set_capture_active(true);
        assert_eq!(cs.starts.load(Ordering::SeqCst), 1);
        assert_eq!(h.runtime().state, RuntimeState::Listening);
        assert_eq!(h.runtime().active_provider_id, Some("cs2-gsi"));
        // Re-applying settings keeps it running (configure only).
        h.set_settings(h.settings().clone());
        assert_eq!(cs.starts.load(Ordering::SeqCst), 1);
        // Game switch stops CS2 and starts War Thunder.
        h.on_game_changed(Some(GameId::WarThunder));
        assert_eq!(
            (
                cs.stops.load(Ordering::SeqCst),
                wt.starts.load(Ordering::SeqCst)
            ),
            (1, 1)
        );
        // Per-game disable stops it.
        let mut s = h.settings().clone();
        s.games.insert(
            "war-thunder".into(),
            GameSettings {
                enabled: false,
                ..Default::default()
            },
        );
        h.set_settings(s);
        assert_eq!(wt.stops.load(Ordering::SeqCst), 1);
        assert_eq!(h.runtime().state, RuntimeState::Idle);
        // Game without a provider entry: nothing.
        h.on_game_changed(Some(GameId::Wardogs));
        h.on_game_changed(None);
        assert_eq!(h.runtime().active_provider_id, None);
    }

    #[test]
    fn events_become_saves_and_flush_on_game_exit() {
        let (mut h, cs, _, now) = host(true);
        let woke = Arc::new(AtomicUsize::new(0));
        let w = woke.clone();
        h.set_waker(Arc::new(move || {
            w.fetch_add(1, Ordering::SeqCst);
        }));
        h.set_capture_active(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        send(&cs, kill("cs2-gsi", GameId::CounterStrike2, 1, T0));
        send(&cs, kill("cs2-gsi", GameId::CounterStrike2, 2, T0 + 3_000));
        assert_eq!(woke.load(Ordering::SeqCst), 2);
        assert!(h.poll(system_time(T0 + 3_000)).is_empty());
        assert_eq!(h.runtime().state, RuntimeState::Pending);
        assert_eq!(h.next_deadline(), Some(system_time(T0 + 13_000 + 1_250)));
        // Game exits 5 s later: flushed with footage so far.
        now.store(T0 + 5_000, Ordering::SeqCst);
        h.on_game_changed(None);
        assert_eq!(cs.stops.load(Ordering::SeqCst), 1);
        let saves = h.poll(system_time(T0 + 5_000));
        assert_eq!(saves.len(), 1);
        let s = &saves[0];
        assert_eq!(
            (s.start_ms, s.end_ms, s.reason),
            (T0 - 20_000, T0 + 5_000, FlushReason::GameExited)
        );
        assert_eq!(s.title, "SB Counter-Strike 2 - 2 Kills");
        assert_eq!(s.markers.len(), 3);
        h.record_saved(s, Ok(()));
        assert_eq!(h.runtime().clips_created, 1);
        assert_eq!(h.next_deadline(), None);
    }

    #[test]
    fn stable_finalization_and_capture_stop() {
        let (mut h, cs, _, now) = host(true);
        h.set_capture_active(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        send(&cs, kill("cs2-gsi", GameId::CounterStrike2, 1, T0));
        assert!(h.poll(system_time(T0)).is_empty());
        let saves = h.poll(system_time(T0 + 11_250));
        assert_eq!((saves.len(), saves[0].reason), (1, FlushReason::Stable));

        send(&cs, kill("cs2-gsi", GameId::CounterStrike2, 2, T0 + 20_000));
        now.store(T0 + 21_000, Ordering::SeqCst);
        // Event still in the channel: capture stop drains it before flushing.
        h.set_capture_active(false);
        let saves = h.poll(system_time(T0 + 21_000));
        assert_eq!(
            (saves.len(), saves[0].reason, saves[0].end_ms),
            (1, FlushReason::CaptureStopped, T0 + 21_000)
        );
        assert_eq!(cs.stops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn late_events_from_stopped_provider_are_dropped() {
        let (mut h, cs, _, _) = host(true);
        h.set_capture_active(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        let sink = cs.sink.lock().unwrap().clone().unwrap();
        h.on_game_changed(None);
        sink.send(kill("cs2-gsi", GameId::CounterStrike2, 1, T0));
        assert!(h.poll(system_time(T0 + 60_000)).is_empty());
        assert_eq!(h.runtime().events_received, 0);
    }

    #[test]
    fn reaction_clipping_through_host() {
        let (mut h, _, _, _) = host(false);
        let mut s = h.settings().clone();
        s.reaction_clipping.enabled = true;
        s.reaction_clipping.sensitivity = crate::settings::Sensitivity::High;
        h.set_settings(s);
        // Ignored while capture is inactive.
        h.push_microphone_levels(&[-30.0; 700], system_time(T0));
        assert_eq!(h.reaction_status(system_time(T0)).analyzed_frames, 0);
        h.set_capture_active(true);
        assert!(h.wants_microphone());
        h.push_microphone_levels(&[-30.0; 600], system_time(T0 + 6_000));
        h.push_microphone_levels(&[-6.0; 50], system_time(T0 + 6_500));
        assert_eq!(h.runtime().state, RuntimeState::Pending);
        let saves = h.poll(system_time(T0 + 30_000));
        assert_eq!(saves.len(), 1);
        let r = &saves[0];
        assert!(r.is_reaction());
        assert_eq!(r.title, "SB Desktop - Reaction");
        assert_eq!(r.game_id, REACTION_DESKTOP_GAME_ID);
        assert_eq!(r.end_ms - r.start_ms, 30_000);
        assert_eq!(r.markers[0].label.as_deref(), Some("Reaction"));
    }

    #[test]
    fn shutdown_flushes_and_joins() {
        let (mut h, cs, _, _) = host(true);
        h.set_capture_active(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        send(&cs, kill("cs2-gsi", GameId::CounterStrike2, 1, T0));
        let saves = h.shutdown();
        assert_eq!((saves.len(), saves[0].reason), (1, FlushReason::Shutdown));
        assert_eq!(cs.stops.load(Ordering::SeqCst), 1);
        assert!(h.shutdown().is_empty());
        assert_eq!(h.runtime().state, RuntimeState::Disabled);
    }

    #[cfg(feature = "test-provider")]
    #[test]
    fn test_provider_drives_the_real_path() {
        let temp = TempDir::new("host-test-provider");
        let (c, now) = clock();
        let options = HostOptions {
            discovery: DiscoveryOptions::isolated(vec![], vec![]),
            cs2_port: 0,
            clock: Some(c),
            ..Default::default()
        };
        let mut h = AutoCapture::with_options(AutoCaptureSettings::default(), temp.path(), options);
        h.set_replay_length(120);
        assert!(h.emit_test_event(GameEventType::Kill).is_err(), "disabled");
        h.set_settings(AutoCaptureSettings {
            enabled: true,
            ..Default::default()
        });
        assert!(
            h.emit_test_event(GameEventType::Kill).is_err(),
            "capture inactive"
        );
        h.set_capture_active(true);
        assert!(
            h.emit_test_event(GameEventType::Assist).is_err(),
            "unsupported type"
        );
        h.emit_test_event(GameEventType::Kill).unwrap();
        now.store(T0 + 1_000, Ordering::SeqCst);
        h.emit_test_event(GameEventType::Headshot).unwrap();
        assert!(h.poll(system_time(T0 + 1_000)).is_empty());
        let saves = h.poll(system_time(T0 + 12_250));
        assert_eq!(saves.len(), 1);
        assert_eq!(saves[0].title, "SB Switchboard Test Game - 2 Kills");
        h.shutdown();
    }

    #[test]
    fn real_providers_with_isolated_library() {
        let temp = TempDir::new("host-real");
        let steam = temp.path().join("Steam");
        write_fake_steam_game(
            &steam,
            "730",
            "Counter-Strike 2",
            "Counter-Strike Global Offensive",
        )
        .unwrap();
        let options = HostOptions {
            discovery: DiscoveryOptions::isolated(vec![steam], vec![]),
            cs2_port: 0,
            ..Default::default()
        };
        let settings = AutoCaptureSettings {
            enabled: true,
            ..Default::default()
        };
        let mut h = AutoCapture::with_options(settings, temp.path().join("data"), options);
        h.set_capture_active(true);
        h.on_game_changed(Some(GameId::CounterStrike2));
        // Not set up yet: degraded with the setup reason, nothing listening.
        let rt = h.runtime();
        assert_eq!(rt.state, RuntimeState::Degraded);
        assert!(rt.last_error.unwrap().contains("Game State Integration"));
        assert_eq!(
            h.setup_provider("cs2-gsi").unwrap().state,
            AvailabilityState::Available
        );
        assert_eq!(h.runtime().state, RuntimeState::Listening);
        let status = h.status();
        assert_eq!(
            status.len(),
            if cfg!(feature = "test-provider") {
                5
            } else {
                4
            }
        );
        assert_eq!(status[0].status.state, ProviderState::Listening);
        assert_eq!(status[2].availability.state, AvailabilityState::Unavailable);
        // WARDOGS: detection only, explains the gap.
        h.on_game_changed(Some(GameId::Wardogs));
        assert_eq!(h.runtime().state, RuntimeState::Degraded);
        assert_eq!(h.status()[0].status.state, ProviderState::Stopped);
        h.shutdown();
    }
}
