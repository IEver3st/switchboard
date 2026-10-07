//! Headless replay probe: runs the engine, samples memory once per second,
//! then saves a clip.
//!
//!   cargo run --release --example probe -- [seconds=20] [clip=10] [height=1440] [fps=60]

use std::time::{Duration, Instant};

use switchboard_capture::{Engine, EngineConfig, Quality, process_memory};

fn main() -> anyhow::Result<()> {
    let args: Vec<u32> = std::env::args().skip(1).filter_map(|a| a.parse().ok()).collect();
    let run = *args.first().unwrap_or(&20);
    let clip = *args.get(1).unwrap_or(&10);
    let height = *args.get(2).unwrap_or(&1440);
    let fps = *args.get(3).unwrap_or(&60);
    let tracks = std::env::var("SB_TRACKS").unwrap_or_else(|_| "gcm".into());
    let out = std::env::temp_dir().join("switchboard-probe");
    let cfg = EngineConfig {
        display_index: 0,
        fps,
        target_height: height,
        quality: Quality::High,
        replay_seconds: clip.max(10),
        game_audio: tracks.contains('g'),
        chat_audio: tracks.contains('c'),
        microphone: tracks.contains('m'),
        game_device: None,
        chat_device: None,
        mic_device: None,
        cursor: false,
        cache_dir: out.join("cache"),
    };
    let (p0, w0) = process_memory();
    let started = Instant::now();
    let engine = Engine::start(&cfg)?;
    println!("started in {:?}: {:?}", started.elapsed(), engine.info);
    let mut samples = Vec::new();
    for s in 1..=run {
        std::thread::sleep(Duration::from_secs(1));
        let (p, w) = process_memory();
        samples.push(p);
        let st = engine.status();
        let tracks: Vec<String> = st
            .tracks
            .iter()
            .map(|t| format!("{:?}:{:.2}{}", t.kind, t.level, t.error.as_ref().map(|e| format!(" ERR {e}")).unwrap_or_default()))
            .collect();
        println!(
            "t={s:>3}s private={:>6.1}MB ws={:>6.1}MB buffered={:>5.1}s cap={} enc={} skip={} cache={:.1}MB [{}]",
            p as f64 / 1e6,
            w as f64 / 1e6,
            st.buffered_seconds,
            st.frames_captured,
            st.frames_encoded,
            st.frames_skipped,
            st.cache_bytes as f64 / 1e6,
            tracks.join(" ")
        );
    }
    let t = Instant::now();
    let saved = engine.save(clip, &out, "Probe")?;
    println!("saved {:?} ({:.1}s, {:.1}MB) in {:?}", saved.path, saved.seconds, saved.bytes as f64 / 1e6, t.elapsed());
    samples.sort();
    println!(
        "baseline private={:.1}MB ws={:.1}MB; running median private={:.1}MB max={:.1}MB",
        p0 as f64 / 1e6,
        w0 as f64 / 1e6,
        samples[samples.len() / 2] as f64 / 1e6,
        samples.last().copied().unwrap_or(0) as f64 / 1e6
    );
    let stop = Instant::now();
    drop(engine);
    println!("stopped in {:?}", stop.elapsed());
    Ok(())
}
