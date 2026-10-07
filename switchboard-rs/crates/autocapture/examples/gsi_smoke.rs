//! End-to-end CS2 GSI smoke test without CS2 or Steam.
//!
//! Builds a fake Steam library in a temp dir, installs the integration into
//! it, starts the host's loopback listener on a free port, posts a baseline
//! and a two-kill payload over std::net, and prints the resulting save.
//!
//! cargo run -p switchboard-autocapture --example gsi_smoke

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, SystemTime};
use switchboard_autocapture::discovery::write_fake_steam_game;
use switchboard_autocapture::{
    AutoCapture, AutoCaptureSettings, DiscoveryOptions, FlushReason, GameId, HostOptions,
};

fn main() -> anyhow::Result<()> {
    let root = std::env::temp_dir().join(format!("switchboard-gsi-smoke-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let steam = root.join("Steam");
    let install = write_fake_steam_game(
        &steam,
        "730",
        "Counter-Strike 2",
        "Counter-Strike Global Offensive",
    )?;

    // Pick a free port (the real listener uses 32145).
    let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
    let options = HostOptions {
        discovery: DiscoveryOptions::isolated(vec![steam], vec![]),
        cs2_port: port,
        ..Default::default()
    };
    let settings = AutoCaptureSettings {
        enabled: true,
        ..Default::default()
    };
    let mut host = AutoCapture::with_options(settings, root.join("data"), options);
    host.set_replay_length(60);
    host.set_capture_active(true);
    host.on_game_changed(Some(GameId::CounterStrike2));
    println!("before setup: {:?}", host.runtime().last_error);
    host.setup_provider("cs2-gsi")?;
    println!(
        "installed {}",
        install
            .join("game/csgo/cfg/gamestate_integration_switchboard.cfg")
            .display()
    );
    println!(
        "runtime: {:?}, listening on 127.0.0.1:{port}",
        host.runtime().state
    );

    let token = std::fs::read_to_string(root.join("data").join("cs2-gsi-token"))?
        .trim()
        .to_owned();
    for (ts, kills, hs) in [(1u64, 0u32, 0u32), (2, 2, 1)] {
        let body = serde_json::json!({
            "provider": {"name": "Counter-Strike: Global Offensive", "appid": 730, "timestamp": ts},
            "map": {"name": "de_mirage", "phase": "live", "round": 4, "team_ct": {"score": 2}, "team_t": {"score": 1}},
            "round": {"phase": "live"},
            "player": {"team": "CT", "state": {"health": 100, "round_kills": kills, "round_killhs": hs},
                       "match_stats": {"kills": 5, "assists": 0, "deaths": 1}},
            "auth": {"token": token}
        })
        .to_string();
        let mut stream = TcpStream::connect(("127.0.0.1", port))?;
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        write!(
            stream,
            "POST /game-state HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )?;
        let mut response = String::new();
        stream.read_to_string(&mut response)?;
        println!(
            "POST payload {ts}: {}",
            response.lines().next().unwrap_or("")
        );
    }

    let pending = host.poll(SystemTime::now());
    println!(
        "due now: {} (window still open), runtime: {:?}",
        pending.len(),
        host.runtime().state
    );
    println!(
        "next deadline in {:?}",
        host.next_deadline()
            .and_then(|d| d.duration_since(SystemTime::now()).ok())
    );

    // Simulate the player leaving the match: pending windows flush immediately.
    host.flush(FlushReason::GameExited);
    for save in host.poll(SystemTime::now()) {
        println!("save: {}", serde_json::to_string_pretty(&save)?);
    }
    host.shutdown();
    std::fs::remove_dir_all(&root)?;
    Ok(())
}
