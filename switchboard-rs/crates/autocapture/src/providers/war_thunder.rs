//! War Thunder localhost API (port of `war-thunder-provider.ts` and
//! `war-thunder/parser.ts`). Polls `GET /hudmsg?lastEvt=&lastDmg=` on
//! `127.0.0.1:8111` every 750 ms only while running; 1 s timeout, 1 MiB cap.
//! The battle log covers every player, so personal events need the user's
//! nickname (or squadron tag in anonymous mode). Neither is logged or copied
//! into events.

use super::http::{AbortSlot, HttpError, get};
use super::{
    Availability, EventSink, Provider, ProviderDescriptor, ProviderState, ProviderStatus,
    StatusCell, SupportLevel,
};
use crate::discovery::{DetectedGame, find_detected};
use crate::events::{
    EventMetadata, GameEvent, GameEventSource, GameEventType, ObjectiveKind, now_ms,
};
use crate::games::GameId;
use crate::settings::{GameSettings, PlayerNameMode};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

pub const PROVIDER_ID: &str = "war-thunder-8111";
pub const DEFAULT_ENDPOINT: &str = "127.0.0.1:8111";
pub const POLL_INTERVAL: Duration = Duration::from_millis(750);
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(1);
pub const MAX_PAYLOAD_BYTES: usize = 1024 * 1024;
const MAX_MESSAGES: usize = 4_096;

const EVENTS: &[GameEventType] = &[
    GameEventType::Kill,
    GameEventType::Death,
    GameEventType::Objective,
];

// ---------------------------------------------------------------- parser --

#[derive(Debug, Clone, Deserialize)]
pub struct HudMessage {
    pub id: u64,
    pub msg: String,
    #[serde(default)]
    pub time: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct HudResponse {
    #[serde(default)]
    pub events: Vec<HudMessage>,
    #[serde(default)]
    pub damage: Vec<HudMessage>,
}

pub fn parse_hud(body: &[u8]) -> Result<HudResponse, String> {
    let r: HudResponse = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    if r.events.len() > MAX_MESSAGES || r.damage.len() > MAX_MESSAGES {
        return Err("too many messages".into());
    }
    Ok(r)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlayerIdentity {
    Nickname(String),
    Anonymous { squadron_tag: String },
}

impl PlayerIdentity {
    /// Identity from per-game settings (`configure` in the old provider).
    /// `Err` carries the user-facing reason the identity is missing.
    pub fn from_settings(settings: &GameSettings) -> Result<Self, &'static str> {
        if settings.player_name_mode == Some(PlayerNameMode::Anonymous) {
            let tag = normalize_squadron_tag(settings.player_squadron_tag.as_deref().unwrap_or(""));
            return if tag.is_empty() {
                Err("Enter your squadron tag to match Player in War Thunder anonymous mode.")
            } else {
                Ok(Self::Anonymous { squadron_tag: tag })
            };
        }
        match settings
            .player_name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
        {
            Some(name) if name.eq_ignore_ascii_case("player") => Err(
                "Player is an anonymous name. Enable anonymous mode and enter your squadron tag.",
            ),
            Some(name) => Ok(Self::Nickname(name.to_owned())),
            None => Err("Enter your War Thunder nickname to identify personal events."),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stream {
    Event,
    Damage,
}

impl Stream {
    fn as_str(self) -> &'static str {
        match self {
            Self::Event => "event",
            Self::Damage => "damage",
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct WarThunderParser {
    last_event_id: u64,
    last_damage_id: u64,
}

impl WarThunderParser {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Adopt the highest IDs without emitting (start of a session).
    pub fn baseline(&mut self, r: &HudResponse) {
        self.last_event_id = highest(&r.events, self.last_event_id);
        self.last_damage_id = highest(&r.damage, self.last_damage_id);
    }

    pub fn cursor(&self) -> (u64, u64) {
        (self.last_event_id, self.last_damage_id)
    }

    pub fn parse(
        &mut self,
        r: &HudResponse,
        identity: Option<&PlayerIdentity>,
        received_at: u64,
    ) -> Vec<GameEvent> {
        let mut messages: Vec<(&HudMessage, Stream)> = r
            .events
            .iter()
            .filter(|m| m.id > self.last_event_id)
            .map(|m| (m, Stream::Event))
            .chain(
                r.damage
                    .iter()
                    .filter(|m| m.id > self.last_damage_id)
                    .map(|m| (m, Stream::Damage)),
            )
            .collect();
        messages.sort_by_key(|(m, _)| m.id);
        self.baseline(r);
        let Some(identity) = identity else {
            return Vec::new();
        };
        let mut events: Vec<GameEvent> = Vec::new();
        for (message, stream) in messages {
            let text = message.msg.trim();
            if text.is_empty() || text.len() > 512 {
                continue;
            }
            if let Some(event) = event_from_message(text, message.id, stream, identity, received_at)
                && !events.iter().any(|e| e.id == event.id)
            {
                events.push(event);
            }
        }
        events
    }
}

fn highest(messages: &[HudMessage], current: u64) -> u64 {
    messages.iter().map(|m| m.id).fold(current, u64::max)
}

fn event_from_message(
    text: &str,
    id: u64,
    stream: Stream,
    identity: &PlayerIdentity,
    timestamp: u64,
) -> Option<GameEvent> {
    if let Some((actor, action, target)) = parse_combat_action(text) {
        let code = if action == "shot down" {
            "shot_down"
        } else {
            "destroyed"
        };
        if combatant_matches(actor, identity) {
            if is_base_target(target) {
                let metadata = EventMetadata {
                    objective: Some(ObjectiveKind::Completed),
                    code: Some("base_destroyed".into()),
                    ..Default::default()
                };
                return Some(create_event(
                    stream,
                    id,
                    GameEventType::Objective,
                    timestamp,
                    "Base destroyed",
                    metadata,
                ));
            }
            let label = if action == "shot down" {
                "Aircraft shot down"
            } else {
                "Target destroyed"
            };
            let metadata = EventMetadata {
                code: Some(code.into()),
                ..Default::default()
            };
            return Some(create_event(
                stream,
                id,
                GameEventType::Kill,
                timestamp,
                label,
                metadata,
            ));
        }
        if combatant_matches(target, identity) {
            let metadata = EventMetadata {
                code: Some(code.into()),
                ..Default::default()
            };
            return Some(create_event(
                stream,
                id,
                GameEventType::Death,
                timestamp,
                "Vehicle lost",
                metadata,
            ));
        }
        return None;
    }
    let actor = actor_before_suffix(text, " has crashed")?;
    if combatant_matches(actor, identity) {
        let metadata = EventMetadata {
            code: Some("crashed".into()),
            ..Default::default()
        };
        return Some(create_event(
            stream,
            id,
            GameEventType::Death,
            timestamp,
            "Vehicle lost",
            metadata,
        ));
    }
    None
}

fn create_event(
    stream: Stream,
    id: u64,
    t: GameEventType,
    timestamp: u64,
    label: &str,
    mut metadata: EventMetadata,
) -> GameEvent {
    metadata.sequence = Some(id);
    GameEvent {
        id: format!("{PROVIDER_ID}:{}:{id}:{}", stream.as_str(), t.as_str()),
        game_id: GameId::WarThunder.as_str().into(),
        provider_id: PROVIDER_ID.into(),
        event_type: t,
        timestamp_ms: timestamp,
        confidence: Some(1.0),
        label: Some(label.into()),
        metadata,
        source: GameEventSource::Api,
    }
}

fn strip_trailing_punctuation(text: &str) -> &str {
    text.trim().trim_end_matches(['.', '!'])
}

/// `<actor> destroyed|shot down <target>`; separators are ASCII so byte
/// offsets from an ASCII-lowercased copy are valid in the original.
fn parse_combat_action(message: &str) -> Option<(&str, &'static str, &str)> {
    let normalized = strip_trailing_punctuation(message);
    let lower = normalized.to_ascii_lowercase();
    for (separator, action) in [(" destroyed ", "destroyed"), (" shot down ", "shot down")] {
        let Some(index) = lower.find(separator) else {
            continue;
        };
        if index == 0 {
            continue;
        }
        let actor = normalized[..index].trim();
        let target = normalized[index + separator.len()..].trim();
        if actor.is_empty() || target.is_empty() {
            return None;
        }
        return Some((actor, action, target));
    }
    None
}

fn actor_before_suffix<'a>(message: &'a str, suffix: &str) -> Option<&'a str> {
    let normalized = strip_trailing_punctuation(message);
    let index = normalized.to_ascii_lowercase().find(suffix)?;
    if index == 0 {
        return None;
    }
    Some(normalized[..index].trim()).filter(|s| !s.is_empty())
}

fn normalize_combatant(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// `[TAG] name`, `=TAG= name`, `^TAG^ name`, `-TAG- name`, `*TAG* name`.
fn split_squadron(value: &str) -> Option<(String, String)> {
    let mut chars = value.char_indices();
    let (_, open) = chars.next()?;
    let close = match open {
        '[' => ']',
        '=' | '^' | '-' | '*' => open,
        _ => return None,
    };
    let start = open.len_utf8();
    let end = start + value[start..].find(close)?;
    if end == start {
        return None;
    }
    let tag = value[start..end].trim();
    let rest = &value[end + close.len_utf8()..];
    let name = rest.trim_start();
    if name.len() == rest.len() || name.is_empty() {
        return None; // needs at least one whitespace and a name
    }
    Some((tag.to_owned(), name.to_owned()))
}

/// Accepts the tag with or without its surrounding symbols.
pub fn normalize_squadron_tag(value: &str) -> String {
    let normalized = normalize_combatant(value);
    split_squadron(&format!("{normalized} player"))
        .map(|(tag, _)| tag)
        .unwrap_or(normalized)
}

/// Remove a trailing ` (vehicle)` group, honoring nested parentheses.
fn strip_trailing_vehicle(value: &str) -> &str {
    let input = value.trim();
    if !input.ends_with(')') {
        return input;
    }
    let mut depth = 0i32;
    for (index, ch) in input.char_indices().rev() {
        match ch {
            ')' => depth += 1,
            '(' => {
                depth -= 1;
                if depth == 0 {
                    if index > 0 && input[..index].ends_with(' ') {
                        return input[..index - 1].trim();
                    }
                    return input;
                }
            }
            _ => {}
        }
    }
    input
}

fn combatant_matches(value: &str, identity: &PlayerIdentity) -> bool {
    let actor = normalize_combatant(strip_trailing_vehicle(value));
    let tagged = split_squadron(&actor);
    match identity {
        PlayerIdentity::Anonymous { squadron_tag } => {
            let tag = normalize_squadron_tag(squadron_tag);
            !tag.is_empty() && tagged.is_some_and(|(t, name)| t == tag && name == "player")
        }
        PlayerIdentity::Nickname(nickname) => {
            // Only a delimited squadron may precede the nickname; arbitrary
            // suffix matching would mistake another player's name for ours.
            let player = normalize_combatant(nickname);
            !player.is_empty()
                && (actor == player || tagged.is_some_and(|(_, name)| name == player))
        }
    }
}

fn is_base_target(value: &str) -> bool {
    let n = normalize_combatant(value);
    n == "a base" || n == "enemy base" || n.ends_with(" base")
}

// -------------------------------------------------------------- provider --

type Identity = Arc<Mutex<Result<PlayerIdentity, &'static str>>>;

pub struct WarThunderProvider {
    descriptor: ProviderDescriptor,
    endpoint: SocketAddr,
    interval: Duration,
    identity: Identity,
    status: StatusCell,
    worker: Option<(mpsc::Sender<()>, Arc<AbortSlot>, JoinHandle<()>)>,
}

impl WarThunderProvider {
    pub fn new() -> Self {
        Self::with_endpoint(
            DEFAULT_ENDPOINT.parse().expect("valid endpoint"),
            POLL_INTERVAL,
        )
    }

    pub fn with_endpoint(endpoint: SocketAddr, interval: Duration) -> Self {
        Self {
            descriptor: ProviderDescriptor {
                id: PROVIDER_ID,
                game: GameId::WarThunder,
                display_name: "War Thunder",
                support_level: SupportLevel::Experimental,
                source: GameEventSource::Api,
                events: EVENTS,
                native_multi_kill: false,
                requires_player_name: true,
                supports_anonymous_name: true,
                development_only: false,
            },
            endpoint,
            interval,
            identity: Arc::new(Mutex::new(Err(
                "Enter your War Thunder nickname to identify personal events.",
            ))),
            status: StatusCell::new(),
            worker: None,
        }
    }
}

impl Default for WarThunderProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl Provider for WarThunderProvider {
    fn descriptor(&self) -> &ProviderDescriptor {
        &self.descriptor
    }

    fn availability(&self, games: &[DetectedGame]) -> Availability {
        if !cfg!(windows) {
            return Availability::unavailable("War Thunder Auto Capture is supported on Windows.");
        }
        if find_detected(GameId::WarThunder, games).is_none() {
            return Availability::unavailable(
                "War Thunder was not found in the detected game library.",
            );
        }
        Availability::available()
    }

    fn configure(&mut self, settings: &GameSettings) {
        let identity = PlayerIdentity::from_settings(settings);
        let running = self.worker.is_some();
        if running {
            let status = self.status.get();
            match &identity {
                Err(message) if status.state != ProviderState::Starting => self
                    .status
                    .set(ProviderState::Degraded, Some((*message).into())),
                Ok(_)
                    if status.state == ProviderState::Degraded
                        && is_identity_message(status.message.as_deref()) =>
                {
                    self.status.set(ProviderState::Listening, None)
                }
                _ => {}
            }
        }
        *self.identity.lock().unwrap_or_else(|e| e.into_inner()) = identity;
    }

    fn start(&mut self, sink: EventSink) -> anyhow::Result<()> {
        if self.worker.is_some() {
            return Ok(());
        }
        self.status.set(ProviderState::Starting, None);
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let abort = Arc::new(AbortSlot::default());
        let thread = {
            let abort = abort.clone();
            let identity = self.identity.clone();
            let status = self.status.clone();
            let endpoint = self.endpoint;
            let interval = self.interval;
            std::thread::Builder::new()
                .name("autocapture-war-thunder".into())
                .spawn(move || {
                    let mut parser = WarThunderParser::default();
                    let mut initialized = false;
                    loop {
                        poll_once(
                            endpoint,
                            &abort,
                            &mut parser,
                            &mut initialized,
                            &identity,
                            &status,
                            &sink,
                        );
                        match stop_rx.recv_timeout(interval) {
                            Err(RecvTimeoutError::Timeout) => {}
                            _ => break,
                        }
                    }
                })?
        };
        self.worker = Some((stop_tx, abort, thread));
        Ok(())
    }

    fn stop(&mut self) {
        if let Some((stop, abort, thread)) = self.worker.take() {
            abort.abort();
            drop(stop);
            let _ = thread.join();
        }
        self.status.reset();
    }

    fn status(&self) -> ProviderStatus {
        self.status.get()
    }
}

impl Drop for WarThunderProvider {
    fn drop(&mut self) {
        self.stop();
    }
}

fn is_identity_message(message: Option<&str>) -> bool {
    message.is_some_and(|m| {
        m.contains("nickname") || m.contains("squadron tag") || m.contains("anonymous name")
    })
}

fn poll_once(
    endpoint: SocketAddr,
    abort: &AbortSlot,
    parser: &mut WarThunderParser,
    initialized: &mut bool,
    identity: &Identity,
    status: &StatusCell,
    sink: &EventSink,
) {
    let (last_evt, last_dmg) = if *initialized {
        parser.cursor()
    } else {
        (0, 0)
    };
    let path = format!("/hudmsg?lastEvt={last_evt}&lastDmg={last_dmg}");
    let result = get(endpoint, &path, REQUEST_TIMEOUT, MAX_PAYLOAD_BYTES, abort)
        .map_err(|e| match e {
            HttpError::TimedOut => None,
            HttpError::Io(ref io) if matches!(io.kind(), std::io::ErrorKind::ConnectionRefused) => {
                None
            }
            other => Some(other.to_string()),
        })
        .and_then(|(code, body)| {
            if code != 200 {
                return Err(Some(format!("HTTP {code}")));
            }
            parse_hud(&body).map_err(Some)
        });
    if abort.is_aborted() {
        return;
    }
    match result {
        Ok(response) => {
            let identity = identity.lock().unwrap_or_else(|e| e.into_inner()).clone();
            if !*initialized {
                parser.baseline(&response);
                *initialized = true;
            } else {
                for event in parser.parse(&response, identity.as_ref().ok(), now_ms()) {
                    let at = event.timestamp_ms;
                    status.update(|s| {
                        s.state = ProviderState::Listening;
                        s.message = None;
                        s.last_event_at_ms = Some(at);
                    });
                    sink.send(event);
                }
            }
            match identity {
                Err(message) => status.set(ProviderState::Degraded, Some(message.into())),
                Ok(_) => {
                    let current = status.get();
                    if current.state != ProviderState::Listening {
                        status.set(ProviderState::Listening, None);
                    }
                }
            }
        }
        Err(message) => status.set(
            ProviderState::Degraded,
            Some(match message {
                Some(m) => format!("War Thunder local API: {m}"),
                None => "Waiting for War Thunder's local API.".into(),
            }),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn hud(events: &[(u64, &str)], damage: &[(u64, &str)]) -> HudResponse {
        let msgs = |list: &[(u64, &str)]| {
            list.iter()
                .map(|(id, msg)| HudMessage {
                    id: *id,
                    msg: (*msg).into(),
                    time: Some(1.0),
                })
                .collect()
        };
        HudResponse {
            events: msgs(events),
            damage: msgs(damage),
        }
    }

    fn nick(n: &str) -> PlayerIdentity {
        PlayerIdentity::Nickname(n.into())
    }

    #[test]
    fn baseline_then_personal_events() {
        let mut p = WarThunderParser::default();
        p.baseline(&hud(
            &[],
            &[(1, "Pilot (Bf 109 F-4) shot down Other (Spitfire)")],
        ));
        assert_eq!(p.cursor(), (0, 1));
        let r = hud(
            &[],
            &[
                (1, "Pilot (Bf 109 F-4) shot down Other (Spitfire)"),
                (2, "Pilot (Tiger H1) destroyed Enemy (T-34)."),
                (3, "Enemy (IS-2) destroyed Pilot (Tiger H1)"),
                (4, "Somebody (P-51) destroyed Another (Fw 190)"),
                (5, "Pilot (Pe-8) destroyed A Base"),
                (6, "Pilot (Yak-3) has crashed."),
                (7, "Pilot (Tiger H1) set afire Enemy (T-34)"),
            ],
        );
        let events = p.parse(&r, Some(&nick("pilot")), 42);
        let summary: Vec<_> = events
            .iter()
            .map(|e| (e.event_type, e.label.clone().unwrap(), e.metadata.sequence))
            .collect();
        assert_eq!(
            summary,
            vec![
                (GameEventType::Kill, "Target destroyed".into(), Some(2)),
                (GameEventType::Death, "Vehicle lost".into(), Some(3)),
                (GameEventType::Objective, "Base destroyed".into(), Some(5)),
                (GameEventType::Death, "Vehicle lost".into(), Some(6)),
            ]
        );
        assert_eq!(events[0].id, "war-thunder-8111:damage:2:kill");
        assert_eq!(events[0].metadata.code.as_deref(), Some("destroyed"));
        assert_eq!(events[2].metadata.code.as_deref(), Some("base_destroyed"));
        assert_eq!(events[3].metadata.code.as_deref(), Some("crashed"));
        assert!(events.iter().all(|e| {
            !serde_json::to_string(e)
                .unwrap()
                .to_lowercase()
                .contains("pilot")
        }));
        // Same payload again: nothing new.
        assert!(p.parse(&r, Some(&nick("pilot")), 43).is_empty());
        assert_eq!(p.cursor(), (0, 7));
    }

    #[test]
    fn shot_down_and_both_streams() {
        let mut p = WarThunderParser::default();
        let r = hud(
            &[(3, "[ABC] Pilot (Spitfire) shot down Enemy (Bf 109)")],
            &[(2, "Pilot destroyed Enemy")],
        );
        let events = p.parse(&r, Some(&nick("Pilot")), 1);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].id, "war-thunder-8111:damage:2:kill");
        assert_eq!(events[1].label.as_deref(), Some("Aircraft shot down"));
        assert_eq!(events[1].metadata.code.as_deref(), Some("shot_down"));
    }

    #[test]
    fn nickname_matching_rules() {
        let id = nick("Ace Pilot");
        assert!(combatant_matches("Ace Pilot (Tiger)", &id));
        assert!(combatant_matches("=SQD= ace  pilot (Tiger (P))", &id));
        assert!(combatant_matches("^tag^ Ace Pilot", &id));
        assert!(!combatant_matches("Big Ace Pilot (Tiger)", &id));
        assert!(!combatant_matches("Ace Pilot2", &id));
        assert!(!combatant_matches("[] Ace Pilot", &id));
        let anon = PlayerIdentity::Anonymous {
            squadron_tag: "^TAG^".into(),
        };
        assert!(combatant_matches("^tag^ Player (Tiger H1)", &anon));
        assert!(!combatant_matches("^other^ Player (Tiger H1)", &anon));
        assert!(!combatant_matches("Player (Tiger H1)", &anon));
        assert_eq!(normalize_squadron_tag("[ABC]"), "abc");
        assert_eq!(normalize_squadron_tag(" AbC "), "abc");
        assert_eq!(strip_trailing_vehicle("Name (A (B))"), "Name");
        assert_eq!(strip_trailing_vehicle("Name(A)"), "Name(A)");
    }

    #[test]
    fn identity_from_settings() {
        let mut s = GameSettings::default();
        assert!(
            PlayerIdentity::from_settings(&s)
                .unwrap_err()
                .contains("nickname")
        );
        s.player_name = Some("Player".into());
        assert!(
            PlayerIdentity::from_settings(&s)
                .unwrap_err()
                .contains("anonymous")
        );
        s.player_name = Some(" Pilot ".into());
        assert_eq!(PlayerIdentity::from_settings(&s), Ok(nick("Pilot")));
        s.player_name_mode = Some(PlayerNameMode::Anonymous);
        assert!(
            PlayerIdentity::from_settings(&s)
                .unwrap_err()
                .contains("squadron")
        );
        s.player_squadron_tag = Some("=SQD=".into());
        assert_eq!(
            PlayerIdentity::from_settings(&s),
            Ok(PlayerIdentity::Anonymous {
                squadron_tag: "sqd".into()
            })
        );
    }

    #[test]
    fn no_identity_advances_cursor_without_events() {
        let mut p = WarThunderParser::default();
        assert!(
            p.parse(&hud(&[(9, "Pilot destroyed Enemy")], &[]), None, 1)
                .is_empty()
        );
        assert_eq!(p.cursor(), (9, 0));
    }

    #[test]
    fn hud_json_parsing() {
        let r = parse_hud(br#"{"events":[{"id":1,"msg":"a","sender":"x","enemy":false,"mode":""}],"damage":[{"id":2,"msg":"b","time":12}]}"#).unwrap();
        assert_eq!((r.events.len(), r.damage[0].id), (1, 2));
        assert!(parse_hud(br#"{}"#).unwrap().events.is_empty());
        assert!(parse_hud(br#"{"events":[{"id":-1,"msg":"a"}]}"#).is_err());
        assert!(parse_hud(b"nope").is_err());
    }

    /// Fake 8111 server: answers each GET with the next canned body.
    fn fake_server(bodies: Vec<String>) -> (SocketAddr, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let seen = requests.clone();
        std::thread::spawn(move || {
            let mut bodies = bodies.into_iter();
            for stream in listener.incoming() {
                let Ok(mut s) = stream else { break };
                let mut buf = [0u8; 2048];
                let n = s.read(&mut buf).unwrap_or(0);
                let line = String::from_utf8_lossy(&buf[..n])
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_owned();
                seen.lock().unwrap().push(line);
                let body = bodies
                    .next()
                    .unwrap_or_else(|| r#"{"events":[],"damage":[]}"#.into());
                let _ = write!(
                    s,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{body}",
                    body.len()
                );
            }
        });
        (addr, requests)
    }

    #[test]
    fn provider_polls_with_cursor_and_stops() {
        let (addr, requests) = fake_server(vec![
            r#"{"events":[],"damage":[{"id":5,"msg":"Pilot destroyed Old"}]}"#.into(),
            r#"{"events":[],"damage":[{"id":6,"msg":"Pilot (Tiger) destroyed Enemy (T-34)"}]}"#
                .into(),
        ]);
        let mut provider = WarThunderProvider::with_endpoint(addr, Duration::from_millis(30));
        provider.configure(&GameSettings {
            player_name: Some("Pilot".into()),
            ..Default::default()
        });
        let (tx, rx) = mpsc::channel();
        provider.start(EventSink::new(tx, None)).unwrap();
        let event = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(
            (event.event_type, event.metadata.sequence),
            (GameEventType::Kill, Some(6))
        );
        assert!(rx.recv_timeout(Duration::from_millis(100)).is_err());
        assert_eq!(provider.status().state, ProviderState::Listening);
        provider.stop();
        provider.stop();
        assert_eq!(provider.status().state, ProviderState::Stopped);
        let lines = requests.lock().unwrap().clone();
        assert_eq!(lines[0], "GET /hudmsg?lastEvt=0&lastDmg=0 HTTP/1.1");
        assert_eq!(lines[1], "GET /hudmsg?lastEvt=0&lastDmg=5 HTTP/1.1");
        let count = lines.len();
        std::thread::sleep(Duration::from_millis(120));
        assert_eq!(
            requests.lock().unwrap().len(),
            count,
            "polling continued after stop"
        );
    }

    #[test]
    fn provider_degrades_without_api_or_identity() {
        // Nothing listens on this port (bound then released).
        let addr = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let mut provider = WarThunderProvider::with_endpoint(addr, Duration::from_millis(20));
        provider.configure(&GameSettings {
            player_name: Some("Pilot".into()),
            ..Default::default()
        });
        provider
            .start(EventSink::new(mpsc::channel().0, None))
            .unwrap();
        // Windows retries refused loopback connects for ~2 s, so the 1 s
        // request timeout is what ends the first attempt.
        let started = std::time::Instant::now();
        while provider.status().state == ProviderState::Starting
            && started.elapsed() < Duration::from_secs(3)
        {
            std::thread::sleep(Duration::from_millis(20));
        }
        let status = provider.status();
        assert_eq!(status.state, ProviderState::Degraded);
        assert_eq!(
            status.message.as_deref(),
            Some("Waiting for War Thunder's local API.")
        );
        provider.stop();

        let (addr, _) = fake_server(vec![]);
        let mut provider = WarThunderProvider::with_endpoint(addr, Duration::from_millis(20));
        provider
            .start(EventSink::new(mpsc::channel().0, None))
            .unwrap();
        let started = std::time::Instant::now();
        while provider.status().state == ProviderState::Starting
            && started.elapsed() < Duration::from_secs(3)
        {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(provider.status().message.unwrap().contains("nickname"));
        provider.configure(&GameSettings {
            player_name: Some("Pilot".into()),
            ..Default::default()
        });
        assert_eq!(provider.status().state, ProviderState::Listening);
        provider.stop();
    }
}
