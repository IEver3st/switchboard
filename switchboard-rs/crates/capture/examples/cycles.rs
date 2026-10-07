//! Starts and stops the engine repeatedly and reports handle counts, to
//! catch per-cycle leaks.   SB_TRACKS=gcm cargo run --example cycles -- 20
use switchboard_capture::{Engine, EngineConfig, Quality};
use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessHandleCount};

fn handles() -> u32 {
    let mut n = 0;
    unsafe { let _ = GetProcessHandleCount(GetCurrentProcess(), &mut n); }
    n
}

fn main() -> anyhow::Result<()> {
    let cycles: usize = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(20);
    let tracks = std::env::var("SB_TRACKS").unwrap_or_default();
    let cfg = EngineConfig {
        display_index: 0, fps: 60, target_height: 720, quality: Quality::Standard, replay_seconds: 10,
        game_audio: tracks.contains('g'), chat_audio: tracks.contains('c'), microphone: tracks.contains('m'),
        game_device: None, chat_device: None, mic_device: None,
        cursor: false, cache_dir: std::env::temp_dir().join("switchboard-cycles"),
    };
    // Warm up once so one-time loader and driver handles are excluded.
    drop(Engine::start(&cfg)?);
    let base = handles();
    let verbose = std::env::var("SB_VERBOSE").is_ok();
    for i in 0..cycles {
        let e = Engine::start(&cfg)?;
        std::thread::sleep(std::time::Duration::from_millis(300));
        let t = std::time::Instant::now();
        if verbose {
            let st = e.status();
            eprintln!("cycle {i}: tracks {:?}", st.tracks.iter().map(|t| (t.kind, t.error.clone())).collect::<Vec<_>>());
        }
        drop(e);
        if verbose {
            eprintln!("cycle {i}: stop {:?} handles={}", t.elapsed(), handles());
        }
    }
    println!("tracks={tracks:<4} handles before={base} after={} per-cycle={:.2}", handles(), (handles() as f64 - base as f64) / cycles as f64);
    Ok(())
}
