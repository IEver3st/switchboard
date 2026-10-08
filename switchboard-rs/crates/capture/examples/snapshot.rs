//! Grabs a GPU-scaled still of the screen the way clip thumbnails are made:
//!   cargo run --release -p switchboard-capture --example snapshot -- <out.rgba> [w=480] [h=270]
use std::time::{Duration, Instant};

use switchboard_capture::{Engine, EngineConfig, Quality};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let out = std::path::PathBuf::from(args.first().cloned().unwrap_or_else(|| "snapshot.rgba".into()));
    let w: u32 = args.get(1).and_then(|v| v.parse().ok()).unwrap_or(480);
    let h: u32 = args.get(2).and_then(|v| v.parse().ok()).unwrap_or(270);
    let cfg = EngineConfig {
        display_index: 0,
        fps: 30,
        target_height: 1080,
        quality: Quality::Standard,
        replay_seconds: 15,
        game_audio: false,
        chat_audio: false,
        microphone: false,
        game_device: None,
        chat_device: None,
        mic_device: None,
        cursor: false, cursor_track: false,
        cache_dir: std::env::temp_dir().join("switchboard-snapshot-cache"),
    };
    let engine = Engine::start(&cfg)?;
    std::thread::sleep(Duration::from_millis(800));
    let t = Instant::now();
    let rgba = engine.snapshot_rgba(w, h)?;
    println!("snapshot {w}x{h} in {:.1} ms, {} bytes", t.elapsed().as_secs_f64() * 1e3, rgba.len());
    std::fs::write(&out, rgba)?;
    drop(engine);
    let _ = std::fs::remove_dir_all(std::env::temp_dir().join("switchboard-snapshot-cache"));
    Ok(())
}
