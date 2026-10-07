//! Development-only provider (`test-provider` feature). Emits synthetic
//! events through the real engine and save path; never matches a real game.

use super::{
    Availability, EventSink, Provider, ProviderDescriptor, ProviderState, ProviderStatus,
    StatusCell, SupportLevel,
};
use crate::discovery::DetectedGame;
use crate::events::{EventMetadata, GameEvent, GameEventSource, GameEventType};
use crate::games::GameId;
use std::sync::atomic::{AtomicU64, Ordering};

pub const PROVIDER_ID: &str = "switchboard-test-events";

pub const TEST_EVENTS: &[GameEventType] = &[
    GameEventType::Kill,
    GameEventType::Headshot,
    GameEventType::MultiKill,
    GameEventType::Death,
    GameEventType::RoundWin,
    GameEventType::MatchWin,
];

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub struct TestProvider {
    descriptor: ProviderDescriptor,
    sink: Option<EventSink>,
    status: StatusCell,
}

impl TestProvider {
    pub fn new() -> Self {
        Self {
            descriptor: ProviderDescriptor {
                id: PROVIDER_ID,
                game: GameId::SwitchboardTest,
                display_name: "Switchboard Test Game",
                support_level: SupportLevel::Supported,
                source: GameEventSource::Test,
                events: TEST_EVENTS,
                native_multi_kill: true,
                requires_player_name: false,
                supports_anonymous_name: false,
                development_only: true,
            },
            sink: None,
            status: StatusCell::new(),
        }
    }

    pub fn emit(
        &mut self,
        event_type: GameEventType,
        timestamp_ms: u64,
    ) -> anyhow::Result<GameEvent> {
        if !TEST_EVENTS.contains(&event_type) {
            anyhow::bail!("The test provider cannot emit {}.", event_type.as_str());
        }
        let Some(sink) = &self.sink else {
            anyhow::bail!("Start the Test Event Provider before emitting events.");
        };
        let label = match event_type {
            GameEventType::MultiKill => "Double Kill",
            other => other.label(),
        };
        let event = GameEvent {
            id: format!("test-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed)),
            game_id: GameId::SwitchboardTest.as_str().into(),
            provider_id: PROVIDER_ID.into(),
            event_type,
            timestamp_ms,
            confidence: Some(1.0),
            label: Some(label.into()),
            metadata: EventMetadata {
                count: (event_type == GameEventType::MultiKill).then_some(2),
                ..Default::default()
            },
            source: GameEventSource::Test,
        };
        self.status
            .update(|s| s.last_event_at_ms = Some(timestamp_ms));
        sink.send(event.clone());
        Ok(event)
    }
}

impl Default for TestProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl Provider for TestProvider {
    fn descriptor(&self) -> &ProviderDescriptor {
        &self.descriptor
    }

    fn availability(&self, _games: &[DetectedGame]) -> Availability {
        Availability::available()
    }

    fn start(&mut self, sink: EventSink) -> anyhow::Result<()> {
        self.sink = Some(sink);
        self.status.set(ProviderState::Listening, None);
        Ok(())
    }

    fn stop(&mut self) {
        self.sink = None;
        self.status.reset();
    }

    fn status(&self) -> ProviderStatus {
        self.status.get()
    }
}
