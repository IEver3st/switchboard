//! Detection-only providers: the game is recognized so Settings can explain
//! the gap, but no runtime, thread, socket or handle is ever started.
//!
//! - Battlefield 6: events exist only through Overwolf's Game Events
//!   Provider, which this native build does not embed.
//! - WARDOGS: Easy Anti-Cheat client with no documented local event feed.

use super::{
    Availability, EventSink, Provider, ProviderDescriptor, ProviderState, ProviderStatus,
    SupportLevel,
};
use crate::discovery::{DetectedGame, find_detected};
use crate::events::{GameEventSource, GameEventType};
use crate::games::GameId;

pub const BATTLEFIELD_6_ID: &str = "battlefield-6-overwolf-gep";
pub const WARDOGS_ID: &str = "wardogs-events";

const BF6_REASON: &str = "Battlefield 6 events require an Overwolf-enabled Switchboard build.";
const WARDOGS_REASON: &str = "WARDOGS does not expose a verified local kill feed yet. Manual replay and reaction clipping remain available.";

pub struct DetectionOnlyProvider {
    descriptor: ProviderDescriptor,
    reason: &'static str,
    started: bool,
}

impl DetectionOnlyProvider {
    pub fn battlefield_6() -> Self {
        Self {
            descriptor: ProviderDescriptor {
                id: BATTLEFIELD_6_ID,
                game: GameId::Battlefield6,
                display_name: "Battlefield 6",
                // The Electron provider was experimental behind an Overwolf
                // build; nothing here can receive its events.
                support_level: SupportLevel::Unavailable,
                source: GameEventSource::Api,
                events: &[
                    GameEventType::Kill,
                    GameEventType::Knockdown,
                    GameEventType::RoundWin,
                    GameEventType::RoundLoss,
                ],
                native_multi_kill: false,
                requires_player_name: false,
                supports_anonymous_name: false,
                development_only: false,
            },
            reason: BF6_REASON,
            started: false,
        }
    }

    pub fn wardogs() -> Self {
        Self {
            descriptor: ProviderDescriptor {
                id: WARDOGS_ID,
                game: GameId::Wardogs,
                display_name: "WARDOGS",
                support_level: SupportLevel::Unavailable,
                source: GameEventSource::Log,
                events: &[GameEventType::Kill, GameEventType::Death],
                native_multi_kill: false,
                requires_player_name: false,
                supports_anonymous_name: false,
                development_only: false,
            },
            reason: WARDOGS_REASON,
            started: false,
        }
    }
}

impl Provider for DetectionOnlyProvider {
    fn descriptor(&self) -> &ProviderDescriptor {
        &self.descriptor
    }

    fn availability(&self, games: &[DetectedGame]) -> Availability {
        if find_detected(self.descriptor.game, games).is_none() {
            return Availability::unavailable(format!(
                "{} was not found in the detected game library.",
                self.descriptor.display_name
            ));
        }
        Availability::unavailable(self.reason)
    }

    /// Records a degraded status explaining the gap; starts nothing.
    fn start(&mut self, _sink: EventSink) -> anyhow::Result<()> {
        self.started = true;
        Ok(())
    }

    fn stop(&mut self) {
        self.started = false;
    }

    fn status(&self) -> ProviderStatus {
        if self.started {
            ProviderStatus::new(ProviderState::Degraded, Some(self.reason.into()))
        } else {
            ProviderStatus::stopped()
        }
    }
}
