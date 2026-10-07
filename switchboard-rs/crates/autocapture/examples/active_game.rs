//! Print the running/foreground supported game and the detection cost, plus
//! what the real library scan finds (read-only; writes nothing).
//!
//! cargo run --release -p switchboard-autocapture --example active_game

use std::time::Instant;
use switchboard_autocapture::{
    DiscoveryOptions, active_game, detect_games, foreground_game, scan_games,
};

fn main() {
    let started = Instant::now();
    let detection = detect_games();
    let first = started.elapsed();
    let runs = 200;
    let started = Instant::now();
    for _ in 0..runs {
        std::hint::black_box(detect_games());
    }
    let average = started.elapsed() / runs;
    println!(
        "detection: {detection:?} -> active {:?}",
        detection.active()
    );
    println!("detect_games(): first {first:?}, average {average:?} over {runs} calls");
    let started = Instant::now();
    for _ in 0..runs {
        std::hint::black_box(foreground_game());
    }
    println!(
        "foreground_game(): {:?}, average {:?}",
        foreground_game(),
        started.elapsed() / runs
    );
    let started = Instant::now();
    let active = active_game();
    println!("active_game(): {active:?} in {:?}", started.elapsed());

    let started = Instant::now();
    let scan = scan_games(&DiscoveryOptions::default());
    println!(
        "scan_games(): {} games in {:?}, {} warnings",
        scan.games.len(),
        started.elapsed(),
        scan.warnings.len()
    );
    for game in &scan.games {
        println!(
            "  {:?} {} ({})",
            game.source,
            game.name,
            game.steam_app_id.as_deref().unwrap_or("-")
        );
    }
}
