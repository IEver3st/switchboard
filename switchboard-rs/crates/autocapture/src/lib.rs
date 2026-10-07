//! Auto Capture: game-event-driven clip saving over the existing replay ring.
//!
//! Port of the Electron app's `src/main/autocapture/**` (see
//! `docs/AUTO_CAPTURE.md` and `docs/REACTION_CLIPPING.md` in the parent repo).
//! A provider turns a safe local integration into normalized [`GameEvent`]s;
//! the [`Engine`] applies policy, deduplicates, plans and merges replay
//! windows, and emits [`SaveRequest`]s that the capture engine fulfils by
//! saving the explicit `[start, end]` window from its ring.
//!
//! The tray service owns one [`AutoCapture`] host:
//!
//! ```no_run
//! # use switchboard_autocapture::*;
//! # use std::time::SystemTime;
//! let mut host = AutoCapture::new(AutoCaptureSettings::default(), "C:/data/autocapture");
//! host.set_replay_length(60);
//! host.set_capture_active(true);
//! host.on_game_changed(active_game());
//! for save in host.poll(SystemTime::now()) {
//!     // capture.save_window(save.start_time(), save.end_time(), &save.title) ...
//!     host.record_saved(&save, Ok(()));
//! }
//! let _final_saves = host.shutdown();
//! ```

pub mod dedupe;
pub mod discovery;
pub mod engine;
pub mod events;
pub mod games;
pub mod host;
pub mod planner;
pub mod providers;
pub mod reaction;
pub mod settings;
#[cfg(test)]
pub(crate) mod test_support;

pub use discovery::{
    DetectedGame, DiscoveryOptions, GameDetection, active_game, detect_games, foreground_game,
    scan_games,
};
pub use engine::{Engine, EventOutcome, EventPolicy, FlushReason, SaveRequest};
pub use events::{EventMetadata, GameEvent, GameEventSource, GameEventType};
pub use games::GameId;
pub use host::{AutoCapture, HostOptions, ProviderSnapshot, RuntimeSnapshot, RuntimeState};
pub use planner::Marker;
pub use providers::{
    Availability, AvailabilityState, EventSink, Provider, ProviderState, ProviderStatus,
    SupportLevel,
};
pub use reaction::{ReactionDetection, ReactionDetector, ReactionFrame, ReactionSnapshot};
pub use settings::{
    AutoCaptureSettings, GameSettings, PlayerNameMode, ReactionSettings, Sensitivity,
};
