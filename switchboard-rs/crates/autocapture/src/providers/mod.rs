//! Provider boundary (port of `provider.ts`). A provider turns one safe,
//! documented local integration into normalized [`GameEvent`]s. Providers
//! never inject, read process memory, hook, or intercept packets.

pub mod cs2;
pub(crate) mod http;
#[cfg(any(test, feature = "test-provider"))]
pub mod test_provider;
pub mod unavailable;
pub mod war_thunder;

use crate::discovery::DetectedGame;
use crate::events::{GameEvent, GameEventSource, GameEventType};
use crate::games::GameId;
use crate::settings::GameSettings;
use serde::Serialize;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SupportLevel {
    /// Documented, safe source; reliable after setup.
    Supported,
    /// Safe source exists; coverage or format needs retail validation.
    Experimental,
    /// No acceptable source. No runtime is ever started.
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AvailabilityState {
    Available,
    SetupRequired,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Availability {
    pub state: AvailabilityState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl Availability {
    pub fn available() -> Self {
        Self {
            state: AvailabilityState::Available,
            reason: None,
        }
    }

    pub fn setup_required(reason: impl Into<String>) -> Self {
        Self {
            state: AvailabilityState::SetupRequired,
            reason: Some(reason.into()),
        }
    }

    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            state: AvailabilityState::Unavailable,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderState {
    Stopped,
    Starting,
    Listening,
    Degraded,
    Error,
}

/// Runtime health (`providerStatusSchema`). Messages are privacy-safe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub state: ProviderState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event_at_ms: Option<u64>,
}

impl ProviderStatus {
    pub fn stopped() -> Self {
        Self::new(ProviderState::Stopped, None)
    }

    pub fn new(state: ProviderState, message: Option<String>) -> Self {
        Self {
            state,
            message,
            last_event_at_ms: None,
        }
    }
}

/// Static description of a provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderDescriptor {
    pub id: &'static str,
    pub game: GameId,
    pub display_name: &'static str,
    pub support_level: SupportLevel,
    pub source: GameEventSource,
    pub events: &'static [GameEventType],
    pub native_multi_kill: bool,
    pub requires_player_name: bool,
    pub supports_anonymous_name: bool,
    pub development_only: bool,
}

/// Where providers deliver events. Sending also invokes the host's waker so
/// the tray loop can call `AutoCapture::poll` without a polling timer.
#[derive(Clone)]
pub struct EventSink {
    tx: Sender<GameEvent>,
    waker: Option<Arc<dyn Fn() + Send + Sync>>,
}

impl EventSink {
    pub fn new(tx: Sender<GameEvent>, waker: Option<Arc<dyn Fn() + Send + Sync>>) -> Self {
        Self { tx, waker }
    }

    /// Returns false when the host has gone away.
    pub fn send(&self, event: GameEvent) -> bool {
        let ok = self.tx.send(event).is_ok();
        if ok && let Some(waker) = &self.waker {
            waker();
        }
        ok
    }
}

pub trait Provider: Send {
    fn descriptor(&self) -> &ProviderDescriptor;

    fn id(&self) -> &'static str {
        self.descriptor().id
    }

    fn game(&self) -> GameId {
        self.descriptor().game
    }

    /// Cheap check against the cached library scan. Must not start anything.
    fn availability(&self, games: &[DetectedGame]) -> Availability;

    /// One-time user-initiated setup (CS2 writes its integration file).
    fn setup(&mut self, _games: &[DetectedGame]) -> anyhow::Result<Availability> {
        anyhow::bail!("{} does not require setup.", self.descriptor().display_name)
    }

    /// Apply per-game settings (War Thunder identity). Safe while running.
    fn configure(&mut self, _settings: &GameSettings) {}

    /// Start listening. Idempotent while running. Called only after
    /// `availability` returned `Available`.
    fn start(&mut self, sink: EventSink) -> anyhow::Result<()>;

    /// Stop and release every thread, socket and handle. Idempotent; returns
    /// only after worker threads have been joined.
    fn stop(&mut self);

    fn status(&self) -> ProviderStatus;
}

/// Status shared between a provider and its worker thread.
#[derive(Clone)]
pub(crate) struct StatusCell(Arc<Mutex<ProviderStatus>>);

impl StatusCell {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(ProviderStatus::stopped())))
    }

    pub fn get(&self) -> ProviderStatus {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set(&self, state: ProviderState, message: Option<String>) {
        let mut s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let last = s.last_event_at_ms;
        *s = ProviderStatus {
            state,
            message,
            last_event_at_ms: last,
        };
    }

    pub fn update(&self, f: impl FnOnce(&mut ProviderStatus)) {
        f(&mut self.0.lock().unwrap_or_else(|e| e.into_inner()));
    }

    pub fn reset(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = ProviderStatus::stopped();
    }
}
