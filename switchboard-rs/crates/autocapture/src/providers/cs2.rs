//! Counter-Strike 2 Game State Integration (port of `cs2-provider.ts` and
//! `cs2/parser.ts`). Loopback-only HTTP; requests only provider, map, round,
//! player state and local match stats (never `allplayers`). Player names and
//! Steam IDs are ignored and never enter events.

use super::http::{HttpError, LoopbackServer, Request, ServerConfig};
use super::{
    Availability, EventSink, Provider, ProviderDescriptor, ProviderState, ProviderStatus,
    StatusCell, SupportLevel,
};
use crate::discovery::{DetectedGame, find_detected};
use crate::events::{EventMetadata, GameEvent, GameEventSource, GameEventType, Team, now_ms};
use crate::games::GameId;
use anyhow::{Context, bail};
use serde::Deserialize;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const PROVIDER_ID: &str = "cs2-gsi";
pub const DEFAULT_PORT: u16 = 32_145;
pub const MAX_PAYLOAD_BYTES: usize = 256 * 1024;
pub const INTEGRATION_FILE_NAME: &str = "gamestate_integration_switchboard.cfg";
pub const TOKEN_FILE_NAME: &str = "cs2-gsi-token";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const RECONNECT_RESET_MS: u64 = 15_000;
const MAX_DELTA: u32 = 20;

const EVENTS: &[GameEventType] = &[
    GameEventType::Kill,
    GameEventType::Headshot,
    GameEventType::Assist,
    GameEventType::Death,
    GameEventType::RoundWin,
    GameEventType::RoundLoss,
    GameEventType::MatchWin,
    GameEventType::MatchLoss,
];

/// The `.cfg` CS2 reads from `game\csgo\cfg`.
pub fn integration_config(token: &str, port: u16) -> String {
    format!(
        "\"Switchboard Auto Capture\"\n{{\n  \"uri\" \"http://127.0.0.1:{port}/game-state\"\n  \"timeout\" \"5.0\"\n  \"buffer\" \"0.1\"\n  \"throttle\" \"0.1\"\n  \"heartbeat\" \"30.0\"\n  \"auth\"\n  {{\n    \"token\" \"{token}\"\n  }}\n  \"data\"\n  {{\n    \"provider\" \"1\"\n    \"map\" \"1\"\n    \"round\" \"1\"\n    \"player_id\" \"1\"\n    \"player_state\" \"1\"\n    \"player_match_stats\" \"1\"\n  }}\n}}\n"
    )
}

pub fn integration_path(install_dir: &Path) -> PathBuf {
    install_dir
        .join("game")
        .join("csgo")
        .join("cfg")
        .join(INTEGRATION_FILE_NAME)
}

// ---------------------------------------------------------------- parser --

#[derive(Debug, Deserialize)]
pub struct Cs2State {
    pub auth: Cs2Auth,
    pub provider: Cs2ProviderInfo,
    #[serde(default)]
    pub map: Option<Cs2Map>,
    #[serde(default)]
    pub round: Option<Cs2Round>,
    #[serde(default)]
    pub player: Option<Cs2Player>,
}

#[derive(Debug, Deserialize)]
pub struct Cs2Auth {
    pub token: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2ProviderInfo {
    #[serde(default)]
    pub appid: Option<i64>,
    #[serde(default)]
    pub timestamp: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2Map {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub phase: Option<String>,
    #[serde(default)]
    pub round: Option<u32>,
    #[serde(default)]
    pub team_ct: Option<Cs2TeamScore>,
    #[serde(default)]
    pub team_t: Option<Cs2TeamScore>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2TeamScore {
    #[serde(default)]
    pub score: Option<u32>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2Round {
    #[serde(default)]
    pub phase: Option<String>,
    #[serde(default)]
    pub win_team: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2Player {
    #[serde(default)]
    pub team: Option<String>,
    #[serde(default)]
    pub state: Option<Cs2PlayerState>,
    #[serde(default)]
    pub match_stats: Option<Cs2MatchStats>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2PlayerState {
    #[serde(default)]
    pub round_kills: Option<u32>,
    #[serde(default)]
    pub round_killhs: Option<u32>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Cs2MatchStats {
    #[serde(default)]
    pub kills: Option<u32>,
    #[serde(default)]
    pub assists: Option<u32>,
    #[serde(default)]
    pub deaths: Option<u32>,
}

#[derive(Debug)]
pub enum Cs2Error {
    InvalidJson(String),
    InvalidToken,
    NotCs2,
}

impl std::fmt::Display for Cs2Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidJson(e) => write!(f, "CS2 telemetry was not valid: {e}"),
            Self::InvalidToken => f.write_str("CS2 telemetry authentication failed."),
            Self::NotCs2 => f.write_str("Ignored telemetry for a non-CS2 application."),
        }
    }
}

impl std::error::Error for Cs2Error {}

/// Parse and validate a payload (token length 16..=256, typed fields).
pub fn parse_state(body: &[u8]) -> Result<Cs2State, Cs2Error> {
    let state: Cs2State =
        serde_json::from_slice(body).map_err(|e| Cs2Error::InvalidJson(e.to_string()))?;
    if !(16..=256).contains(&state.auth.token.len()) {
        return Err(Cs2Error::InvalidToken);
    }
    Ok(state)
}

fn team(value: Option<&str>) -> Option<Team> {
    match value {
        Some("CT") => Some(Team::Ct),
        Some("T") => Some(Team::T),
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq)]
struct Counters {
    map_name: Option<String>,
    map_phase: Option<String>,
    round_number: Option<u32>,
    round_phase: Option<String>,
    round_kills: u32,
    round_headshots: u32,
    assists: u32,
    deaths: u32,
    team: Option<Team>,
    score_ct: u32,
    score_t: u32,
}

impl Counters {
    fn from(state: &Cs2State) -> Self {
        let map = state.map.as_ref();
        let player = state.player.as_ref();
        let pstate = player.and_then(|p| p.state.as_ref());
        let stats = player.and_then(|p| p.match_stats.as_ref());
        Self {
            map_name: map.and_then(|m| m.name.clone()),
            map_phase: map.and_then(|m| m.phase.clone()),
            round_number: map.and_then(|m| m.round),
            round_phase: state.round.as_ref().and_then(|r| r.phase.clone()),
            round_kills: pstate.and_then(|s| s.round_kills).unwrap_or(0),
            round_headshots: pstate.and_then(|s| s.round_killhs).unwrap_or(0),
            assists: stats.and_then(|s| s.assists).unwrap_or(0),
            deaths: stats.and_then(|s| s.deaths).unwrap_or(0),
            team: team(player.and_then(|p| p.team.as_deref())),
            score_ct: map
                .and_then(|m| m.team_ct.as_ref())
                .and_then(|t| t.score)
                .unwrap_or(0),
            score_t: map
                .and_then(|m| m.team_t.as_ref())
                .and_then(|t| t.score)
                .unwrap_or(0),
        }
    }
}

/// Diffs successive local-player states. The first payload, a reconnect
/// after 15 s of silence, or a map change only establishes a baseline.
#[derive(Debug, Default)]
pub struct Cs2Parser {
    previous: Option<Counters>,
    last_provider_timestamp: u64,
    last_received_at: u64,
    sequence: u64,
}

impl Cs2Parser {
    pub fn reset(&mut self) {
        self.previous = None;
        self.last_provider_timestamp = 0;
        self.last_received_at = 0;
    }

    pub fn parse(&mut self, body: &[u8], received_at_ms: u64) -> Result<Vec<GameEvent>, Cs2Error> {
        let state = parse_state(body)?;
        self.diff(&state, received_at_ms)
    }

    pub fn diff(&mut self, state: &Cs2State, received_at: u64) -> Result<Vec<GameEvent>, Cs2Error> {
        if state.provider.appid.is_some_and(|id| id != 730) {
            return Err(Cs2Error::NotCs2);
        }
        let provider_ts = state.provider.timestamp.unwrap_or(0);
        if provider_ts > 0 && provider_ts < self.last_provider_timestamp {
            return Ok(Vec::new());
        }
        self.last_provider_timestamp = self.last_provider_timestamp.max(provider_ts);

        let current = Counters::from(state);
        let disconnected = self.last_received_at > 0
            && received_at.saturating_sub(self.last_received_at) > RECONNECT_RESET_MS;
        self.last_received_at = received_at;
        let previous = match self.previous.replace(current.clone()) {
            Some(p) if !disconnected && p.map_name == current.map_name => p,
            _ => return Ok(Vec::new()),
        };

        let mut events = Vec::new();
        let round = current.round_number;
        let same_round = current.round_number == previous.round_number
            && current.round_kills >= previous.round_kills;
        if same_round {
            let kill_delta = current.round_kills - previous.round_kills;
            let headshot_delta = kill_delta.min(
                current
                    .round_headshots
                    .saturating_sub(previous.round_headshots),
            );
            for index in 0..kill_delta {
                let headshot = index < headshot_delta;
                let (t, label) = if headshot {
                    (GameEventType::Headshot, "Headshot")
                } else {
                    (GameEventType::Kill, "Kill")
                };
                let metadata = EventMetadata {
                    headshot: Some(headshot),
                    round_number: round,
                    ..Default::default()
                };
                events.push(self.event(t, received_at, label, metadata));
            }
        }
        for _ in 0..positive_delta(previous.assists, current.assists) {
            let metadata = EventMetadata {
                round_number: round,
                ..Default::default()
            };
            events.push(self.event(GameEventType::Assist, received_at, "Assist", metadata));
        }
        for _ in 0..positive_delta(previous.deaths, current.deaths) {
            let metadata = EventMetadata {
                round_number: round,
                ..Default::default()
            };
            events.push(self.event(GameEventType::Death, received_at, "Death", metadata));
        }

        let round_finished = current.round_phase.as_deref() == Some("over")
            && previous.round_phase.as_deref() != Some("over");
        let winner = team(state.round.as_ref().and_then(|r| r.win_team.as_deref()));
        if let (true, Some(winner), Some(mine)) = (round_finished, winner, current.team) {
            let won = winner == mine;
            let (t, label) = if won {
                (GameEventType::RoundWin, "Round Win")
            } else {
                (GameEventType::RoundLoss, "Round Loss")
            };
            let metadata = EventMetadata {
                round_number: round,
                team: Some(mine),
                ..Default::default()
            };
            events.push(self.event(t, received_at, label, metadata));
        }

        let match_finished = current.map_phase.as_deref() == Some("gameover")
            && previous.map_phase.as_deref() != Some("gameover");
        if let (true, Some(mine)) = (match_finished, current.team) {
            let (score_for, score_against) = if mine == Team::Ct {
                (current.score_ct, current.score_t)
            } else {
                (current.score_t, current.score_ct)
            };
            if score_for != score_against {
                let won = score_for > score_against;
                let (t, label) = if won {
                    (GameEventType::MatchWin, "Match Win")
                } else {
                    (GameEventType::MatchLoss, "Match Loss")
                };
                let metadata = EventMetadata {
                    score_for: Some(score_for),
                    score_against: Some(score_against),
                    team: Some(mine),
                    ..Default::default()
                };
                events.push(self.event(t, received_at, label, metadata));
            }
        }
        Ok(events)
    }

    fn event(
        &mut self,
        t: GameEventType,
        timestamp: u64,
        label: &str,
        mut metadata: EventMetadata,
    ) -> GameEvent {
        self.sequence += 1;
        metadata.sequence = Some(self.sequence);
        GameEvent {
            id: format!("cs2-{}-{timestamp}-{}", t.as_str(), self.sequence),
            game_id: GameId::CounterStrike2.as_str().into(),
            provider_id: PROVIDER_ID.into(),
            event_type: t,
            timestamp_ms: timestamp,
            confidence: Some(1.0),
            label: Some(label.into()),
            metadata,
            source: GameEventSource::Telemetry,
        }
    }
}

fn positive_delta(previous: u32, current: u32) -> u32 {
    if current >= previous {
        (current - previous).min(MAX_DELTA)
    } else {
        0
    }
}

fn tokens_match(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// -------------------------------------------------------------- provider --

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Cs2Diagnostics {
    pub payloads_received: u64,
    pub invalid_payloads: u64,
    pub events_emitted: u64,
}

pub struct Cs2Provider {
    descriptor: ProviderDescriptor,
    token_path: PathBuf,
    port: u16,
    server: Option<LoopbackServer>,
    status: StatusCell,
    diagnostics: Arc<Mutex<Cs2Diagnostics>>,
}

impl Cs2Provider {
    /// `data_dir` holds the token file. `port` is normally [`DEFAULT_PORT`];
    /// 0 binds an ephemeral port (tests, smoke example).
    pub fn new(data_dir: &Path, port: u16) -> Self {
        Self {
            descriptor: ProviderDescriptor {
                id: PROVIDER_ID,
                game: GameId::CounterStrike2,
                display_name: "Counter-Strike 2",
                support_level: SupportLevel::Supported,
                source: GameEventSource::Telemetry,
                events: EVENTS,
                native_multi_kill: false,
                requires_player_name: false,
                supports_anonymous_name: false,
                development_only: false,
            },
            token_path: data_dir.join(TOKEN_FILE_NAME),
            port,
            server: None,
            status: StatusCell::new(),
            diagnostics: Arc::default(),
        }
    }

    pub fn token_path(&self) -> &Path {
        &self.token_path
    }

    /// Address the listener is bound to while running.
    pub fn local_addr(&self) -> Option<SocketAddr> {
        self.server.as_ref().map(LoopbackServer::local_addr)
    }

    pub fn diagnostics(&self) -> Cs2Diagnostics {
        *self.diagnostics.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn read_token(&self) -> Option<String> {
        let token = std::fs::read_to_string(&self.token_path)
            .ok()?
            .trim()
            .to_owned();
        (token.len() >= 32).then_some(token)
    }

    /// Write the token and integration file into an explicit install
    /// directory (used by `setup`; exposed for tests with temp dirs).
    pub fn install_into(&self, install_dir: &Path) -> anyhow::Result<()> {
        if !install_dir.is_absolute() || !install_dir.is_dir() {
            bail!("Counter-Strike 2 must be detected before its integration can be installed.");
        }
        let target = integration_path(install_dir);
        if !target.starts_with(install_dir)
            || target
                .components()
                .any(|c| c == std::path::Component::ParentDir)
        {
            bail!("Refused to write the CS2 integration outside the detected game directory.");
        }
        let token = random_token()?;
        std::fs::create_dir_all(target.parent().expect("cfg dir"))
            .context("Could not create the CS2 cfg directory.")?;
        if let Some(parent) = self.token_path.parent() {
            std::fs::create_dir_all(parent)
                .context("Could not create the Switchboard data directory.")?;
        }
        atomic_write(&self.token_path, &format!("{token}\n"))?;
        atomic_write(
            &target,
            &integration_config(
                &token,
                if self.port == 0 {
                    DEFAULT_PORT
                } else {
                    self.port
                },
            ),
        )?;
        Ok(())
    }
}

impl Provider for Cs2Provider {
    fn descriptor(&self) -> &ProviderDescriptor {
        &self.descriptor
    }

    fn availability(&self, games: &[DetectedGame]) -> Availability {
        if !cfg!(windows) {
            return Availability::unavailable(
                "CS2 Game State Integration is supported on Windows.",
            );
        }
        let Some(game) = find_detected(GameId::CounterStrike2, games) else {
            return Availability::unavailable(
                "Counter-Strike 2 was not found in the detected game library.",
            );
        };
        let installed = self.read_token().is_some_and(|token| {
            std::fs::read_to_string(integration_path(&game.install_dir))
                .is_ok_and(|cfg| cfg.contains(&token))
        });
        if installed {
            Availability::available()
        } else {
            Availability::setup_required(
                "Install Switchboard's local CS2 Game State Integration file before launching the game.",
            )
        }
    }

    fn setup(&mut self, games: &[DetectedGame]) -> anyhow::Result<Availability> {
        let game = find_detected(GameId::CounterStrike2, games).context(
            "Counter-Strike 2 must be detected before its integration can be installed.",
        )?;
        self.install_into(&game.install_dir)?;
        Ok(Availability::available())
    }

    fn start(&mut self, sink: EventSink) -> anyhow::Result<()> {
        if self.server.is_some() {
            return Ok(());
        }
        self.status.set(ProviderState::Starting, None);
        let Some(token) = self.read_token() else {
            let message = "The CS2 integration token is missing or invalid.";
            self.status.set(ProviderState::Error, Some(message.into()));
            bail!(message);
        };
        let parser = Mutex::new(Cs2Parser::default());
        let status = self.status.clone();
        let error_status = self.status.clone();
        let diagnostics = self.diagnostics.clone();
        let error_diagnostics = self.diagnostics.clone();
        let handler = move |request: &Request| -> u16 {
            if request.method != "POST" || request.path != "/game-state" {
                return 404;
            }
            let result = parse_state(&request.body).and_then(|state| {
                if !tokens_match(&state.auth.token, &token) {
                    return Err(Cs2Error::InvalidToken);
                }
                parser
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .diff(&state, now_ms())
            });
            let mut d = diagnostics.lock().unwrap_or_else(|e| e.into_inner());
            match result {
                Ok(events) => {
                    d.payloads_received += 1;
                    status.update(|s| {
                        s.state = ProviderState::Listening;
                        s.message = None;
                    });
                    for event in events {
                        d.events_emitted += 1;
                        let at = event.timestamp_ms;
                        status.update(|s| s.last_event_at_ms = Some(at));
                        sink.send(event);
                    }
                    204
                }
                Err(e) => {
                    d.invalid_payloads += 1;
                    status.set(ProviderState::Degraded, Some(e.to_string()));
                    if matches!(e, Cs2Error::InvalidToken) {
                        401
                    } else {
                        400
                    }
                }
            }
        };
        let on_error = move |e: &HttpError| {
            error_diagnostics
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .invalid_payloads += 1;
            error_status.set(ProviderState::Degraded, Some(format!("CS2 telemetry: {e}")));
        };
        let config = ServerConfig {
            bind: SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, self.port)),
            max_body: MAX_PAYLOAD_BYTES,
            request_timeout: REQUEST_TIMEOUT,
        };
        match LoopbackServer::start(config, handler, on_error) {
            Ok(server) => {
                self.server = Some(server);
                self.status.set(ProviderState::Listening, None);
                Ok(())
            }
            Err(e) => {
                let message = format!("CS2 listener could not start on port {}: {e}", self.port);
                self.status.set(ProviderState::Error, Some(message.clone()));
                bail!(message)
            }
        }
    }

    fn stop(&mut self) {
        if let Some(mut server) = self.server.take() {
            server.stop();
        }
        self.status.reset();
    }

    fn status(&self) -> ProviderStatus {
        self.status.get()
    }
}

impl Drop for Cs2Provider {
    fn drop(&mut self) {
        self.stop();
    }
}

fn atomic_write(path: &Path, contents: &str) -> anyhow::Result<()> {
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".switchboard-writing");
    let temporary = PathBuf::from(temporary);
    std::fs::write(&temporary, contents)
        .with_context(|| format!("Could not write {}.", path.display()))?;
    std::fs::rename(&temporary, path)
        .with_context(|| format!("Could not replace {}.", path.display()))?;
    Ok(())
}

/// 32 random bytes as 64 hex characters.
pub fn random_token() -> anyhow::Result<String> {
    let mut bytes = [0u8; 32];
    fill_random(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(windows)]
fn fill_random(buf: &mut [u8]) -> anyhow::Result<()> {
    use windows::Win32::Security::Cryptography::{
        BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom,
    };
    let status = unsafe { BCryptGenRandom(None, buf, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
    if status.is_err() {
        bail!("The system random number generator failed.");
    }
    Ok(())
}

#[cfg(not(windows))]
fn fill_random(buf: &mut [u8]) -> anyhow::Result<()> {
    use std::io::Read;
    std::fs::File::open("/dev/urandom")?.read_exact(buf)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::{DiscoveryOptions, scan_games, write_fake_steam_game};
    use crate::test_support::TempDir;
    use std::sync::mpsc;

    pub(crate) const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    /// Recorded-shape fixtures following Valve's GSI payload layout.
    #[allow(clippy::too_many_arguments)]
    fn payload(
        ts: u64,
        round: u32,
        round_phase: &str,
        map_phase: &str,
        kills: u32,
        hs: u32,
        assists: u32,
        deaths: u32,
    ) -> Vec<u8> {
        serde_json::json!({
            "provider": {"name": "Counter-Strike: Global Offensive", "appid": 730, "version": 14000, "steamid": "76561190000000000", "timestamp": ts},
            "map": {"mode": "competitive", "name": "de_mirage", "phase": map_phase, "round": round,
                    "team_ct": {"score": 13, "consecutive_round_losses": 0}, "team_t": {"score": 9}},
            "round": {"phase": round_phase, "win_team": "CT"},
            "player": {"steamid": "76561190000000000", "name": "Someone", "team": "CT", "activity": "playing",
                       "state": {"health": 100, "armor": 100, "round_kills": kills, "round_killhs": hs},
                       "match_stats": {"kills": 10, "assists": assists, "deaths": deaths, "mvps": 1, "score": 20}},
            "auth": {"token": TOKEN}
        })
        .to_string()
        .into_bytes()
    }

    fn types(events: &[GameEvent]) -> Vec<GameEventType> {
        events.iter().map(|e| e.event_type).collect()
    }

    #[test]
    fn first_payload_is_baseline_then_deltas() {
        let mut p = Cs2Parser::default();
        let t = 1_000_000;
        assert!(
            p.parse(&payload(1, 5, "live", "live", 1, 0, 2, 3), t)
                .unwrap()
                .is_empty()
        );
        // +2 kills (1 headshot), +1 assist, +1 death in one packet.
        let events = p
            .parse(&payload(2, 5, "live", "live", 3, 1, 3, 4), t + 100)
            .unwrap();
        assert_eq!(
            types(&events),
            vec![
                GameEventType::Headshot,
                GameEventType::Kill,
                GameEventType::Assist,
                GameEventType::Death
            ]
        );
        assert_eq!(events[0].metadata.headshot, Some(true));
        assert_eq!(events[0].metadata.round_number, Some(5));
        assert_eq!(events[1].label.as_deref(), Some("Kill"));
        // Sequences are unique, so the deduplicator never collapses them.
        let seqs: Vec<_> = events
            .iter()
            .map(|e| e.metadata.sequence.unwrap())
            .collect();
        assert_eq!(seqs, vec![1, 2, 3, 4]);
        assert!(
            events
                .iter()
                .all(|e| e.timestamp_ms == t + 100 && e.game_id == "counter-strike-2")
        );
        // No change: nothing.
        assert!(
            p.parse(&payload(3, 5, "live", "live", 3, 1, 3, 4), t + 200)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn round_and_match_outcomes() {
        let mut p = Cs2Parser::default();
        p.parse(&payload(1, 21, "live", "live", 0, 0, 0, 0), 1)
            .unwrap();
        let events = p
            .parse(&payload(2, 21, "over", "live", 0, 0, 0, 0), 2)
            .unwrap();
        assert_eq!(types(&events), vec![GameEventType::RoundWin]);
        assert_eq!(events[0].metadata.team, Some(Team::Ct));
        // Phase staying "over" does not repeat.
        assert!(
            p.parse(&payload(3, 21, "over", "live", 0, 0, 0, 0), 3)
                .unwrap()
                .is_empty()
        );
        let events = p
            .parse(&payload(4, 22, "over", "gameover", 0, 0, 0, 0), 4)
            .unwrap();
        assert_eq!(types(&events), vec![GameEventType::MatchWin]);
        assert_eq!(
            (
                events[0].metadata.score_for,
                events[0].metadata.score_against
            ),
            (Some(13), Some(9))
        );

        // Losing side.
        let mut p = Cs2Parser::default();
        let mut lose = |ts: u64, phase: &str| {
            let mut v: serde_json::Value =
                serde_json::from_slice(&payload(ts, 3, phase, "live", 0, 0, 0, 0)).unwrap();
            v["round"]["win_team"] = "T".into();
            p.parse(v.to_string().as_bytes(), ts).unwrap()
        };
        lose(1, "live");
        assert_eq!(types(&lose(2, "over")), vec![GameEventType::RoundLoss]);
    }

    #[test]
    fn resets_on_map_change_reconnect_and_round_rollover() {
        let mut p = Cs2Parser::default();
        p.parse(&payload(1, 5, "live", "live", 0, 0, 0, 0), 1_000)
            .unwrap();
        // New round: round_kills reset; kills credited in the new round only.
        assert!(
            p.parse(&payload(2, 6, "freezetime", "live", 0, 0, 0, 0), 2_000)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            types(
                &p.parse(&payload(3, 6, "live", "live", 1, 0, 0, 0), 3_000)
                    .unwrap()
            ),
            vec![GameEventType::Kill]
        );
        // Reconnect after > 15 s: baseline only.
        assert!(
            p.parse(&payload(4, 6, "live", "live", 3, 0, 0, 0), 19_000)
                .unwrap()
                .is_empty()
        );
        // Map change: baseline only.
        let mut v: serde_json::Value =
            serde_json::from_slice(&payload(5, 6, "live", "live", 5, 0, 0, 0)).unwrap();
        v["map"]["name"] = "de_inferno".into();
        assert!(
            p.parse(v.to_string().as_bytes(), 19_100)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn stale_provider_timestamps_and_bounds() {
        let mut p = Cs2Parser::default();
        p.parse(&payload(10, 1, "live", "live", 0, 0, 0, 0), 1)
            .unwrap();
        // Older provider timestamp is ignored entirely.
        assert!(
            p.parse(&payload(9, 1, "live", "live", 2, 0, 0, 0), 2)
                .unwrap()
                .is_empty()
        );
        // Counter deltas are capped at 20.
        let events = p
            .parse(&payload(11, 1, "live", "live", 0, 0, 50, 0), 3)
            .unwrap();
        assert_eq!(events.len(), 20);
        // Decreasing match stats (reset) emit nothing.
        assert!(
            p.parse(&payload(12, 1, "live", "live", 0, 0, 0, 0), 4)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn rejects_invalid_payloads() {
        let mut p = Cs2Parser::default();
        assert!(matches!(p.parse(b"{", 1), Err(Cs2Error::InvalidJson(_))));
        assert!(matches!(
            p.parse(br#"{"provider":{}}"#, 1),
            Err(Cs2Error::InvalidJson(_))
        ));
        assert!(matches!(
            p.parse(br#"{"provider":{},"auth":{"token":"short"}}"#, 1),
            Err(Cs2Error::InvalidToken)
        ));
        let mut v: serde_json::Value =
            serde_json::from_slice(&payload(1, 1, "live", "live", 0, 0, 0, 0)).unwrap();
        v["provider"]["appid"] = 570.into();
        assert!(matches!(
            p.parse(v.to_string().as_bytes(), 1),
            Err(Cs2Error::NotCs2)
        ));
        v["provider"]["appid"] = 730.into();
        v["player"]["state"]["round_kills"] = (-1).into();
        assert!(matches!(
            p.parse(v.to_string().as_bytes(), 1),
            Err(Cs2Error::InvalidJson(_))
        ));
        assert!(
            tokens_match("abc", "abc")
                && !tokens_match("abc", "abd")
                && !tokens_match("abc", "abcd")
        );
    }

    #[test]
    fn setup_writes_into_detected_install_only() {
        let temp = TempDir::new("cs2-setup");
        let steam = temp.path().join("Steam");
        let install = write_fake_steam_game(
            &steam,
            "730",
            "Counter-Strike 2",
            "Counter-Strike Global Offensive",
        )
        .unwrap();
        let games = scan_games(&DiscoveryOptions::isolated(vec![steam], vec![])).games;
        let data = temp.path().join("data");
        let mut provider = Cs2Provider::new(&data, 0);
        assert_eq!(
            provider.availability(&[]).state,
            super::super::AvailabilityState::Unavailable
        );
        assert_eq!(
            provider.availability(&games).state,
            super::super::AvailabilityState::SetupRequired
        );
        assert_eq!(
            provider.setup(&games).unwrap().state,
            super::super::AvailabilityState::Available
        );
        assert_eq!(
            provider.availability(&games).state,
            super::super::AvailabilityState::Available
        );
        let token = std::fs::read_to_string(provider.token_path()).unwrap();
        assert_eq!(token.trim().len(), 64);
        let cfg = std::fs::read_to_string(integration_path(&install)).unwrap();
        assert!(cfg.contains(token.trim()));
        assert!(cfg.contains("http://127.0.0.1:32145/game-state"));
        assert!(!cfg.contains("allplayers"));
        assert!(provider.install_into(Path::new("relative")).is_err());
    }

    #[test]
    fn listener_end_to_end() {
        let temp = TempDir::new("cs2-listener");
        let data = temp.path().join("data");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(data.join(TOKEN_FILE_NAME), format!("{TOKEN}\n")).unwrap();
        let mut provider = Cs2Provider::new(&data, 0);
        let (tx, rx) = mpsc::channel();
        provider.start(EventSink::new(tx, None)).unwrap();
        provider
            .start(EventSink::new(mpsc::channel().0, None))
            .unwrap(); // idempotent
        let addr = provider.local_addr().unwrap();
        let post = |path: &str, body: &[u8]| -> u16 {
            use std::io::Write;
            let mut s = std::net::TcpStream::connect(addr).unwrap();
            write!(s, "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n", body.len()).unwrap();
            s.write_all(body).unwrap();
            super::super::http::read_response(&mut s, 1024).unwrap().0
        };
        assert_eq!(
            post("/game-state", &payload(1, 1, "live", "live", 0, 0, 0, 0)),
            204
        );
        assert_eq!(
            post("/game-state", &payload(2, 1, "live", "live", 2, 2, 0, 0)),
            204
        );
        let events: Vec<_> = rx.try_iter().collect();
        assert_eq!(
            types(&events),
            vec![GameEventType::Headshot, GameEventType::Headshot]
        );
        assert_eq!(provider.status().state, ProviderState::Listening);
        assert!(provider.status().last_event_at_ms.is_some());

        let bad = String::from_utf8(payload(3, 1, "live", "live", 3, 2, 0, 0))
            .unwrap()
            .replace(TOKEN, "ffffffffffffffffffffffffffffffff");
        assert_eq!(post("/game-state", bad.as_bytes()), 401);
        assert_eq!(provider.status().state, ProviderState::Degraded);
        assert_eq!(post("/other", b"{}"), 404);
        {
            use std::io::Write;
            let mut s = std::net::TcpStream::connect(addr).unwrap();
            write!(
                s,
                "POST /game-state HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
                MAX_PAYLOAD_BYTES + 1
            )
            .unwrap();
            assert_eq!(
                super::super::http::read_response(&mut s, 1024).unwrap().0,
                413
            );
        }
        assert!(rx.try_recv().is_err());
        let d = provider.diagnostics();
        assert_eq!((d.payloads_received, d.events_emitted), (2, 2));

        provider.stop();
        provider.stop();
        assert_eq!(provider.status().state, ProviderState::Stopped);
        assert!(std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_err());
    }

    #[test]
    fn start_without_token_errors() {
        let temp = TempDir::new("cs2-notoken");
        let mut provider = Cs2Provider::new(temp.path(), 0);
        assert!(
            provider
                .start(EventSink::new(mpsc::channel().0, None))
                .is_err()
        );
        assert_eq!(provider.status().state, ProviderState::Error);
    }
}
