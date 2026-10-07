//! Exercises the media crate on a real clip and prints timings and memory.
//!
//! cargo run --release -p switchboard-media --example play_probe -- <clip.mp4> [--audible] [--dump frame.ppm] [--diag]
//!
//! Output volume is 0 unless --audible is given (the audio path still runs and
//! drives the clock). The clip is only read.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use switchboard_media::{FrameGrabber, Player, UnityGains, frame_at, probe, waveforms};
use windows::Win32::Foundation::FILETIME;
use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};

/// (private bytes, working set) in MB.
fn memory() -> (f64, f64) {
    let mut c = PROCESS_MEMORY_COUNTERS_EX::default();
    let ok = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut c as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
        )
    };
    if ok.is_err() { (0.0, 0.0) } else { (c.PrivateUsage as f64 / 1048576.0, c.WorkingSetSize as f64 / 1048576.0) }
}

fn mem() -> String {
    let (p, w) = memory();
    format!("private {p:.1} MB, working set {w:.1} MB")
}

/// Process CPU time (user + kernel), seconds.
fn cpu_seconds() -> f64 {
    let (mut a, mut b, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
    unsafe {
        let _ = GetProcessTimes(GetCurrentProcess(), &mut a, &mut b, &mut k, &mut u);
    }
    let t = |f: FILETIME| ((f.dwHighDateTime as u64) << 32 | f.dwLowDateTime as u64) as f64 / 1e7;
    t(k) + t(u)
}

/// CPU over `wall` as a percentage of the whole machine and of one core.
fn cpu_report(cpu: f64, wall: f64) -> String {
    let cores = std::thread::available_parallelism().map_or(1, |n| n.get()) as f64;
    format!("{:.2}% of machine ({:.1}% of one core)", cpu / wall / cores * 100.0, cpu / wall * 100.0)
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = PathBuf::from(args.iter().find(|a| !a.starts_with("--")).expect("usage: play_probe <clip.mp4> [--audible] [--dump f.ppm] [--diag]"));
    let audible = args.iter().any(|a| a == "--audible");
    let dump = args.iter().position(|a| a == "--dump").and_then(|i| args.get(i + 1)).map(PathBuf::from);
    println!("clip: {}", path.display());
    println!("at start: {}", mem());

    if args.iter().any(|a| a == "--diag") {
        for (i, (mf_ms, edit_ms)) in switchboard_media::debug_audio_starts(&path)?.iter().enumerate() {
            println!("  audio {i}: first MF sample at {mf_ms:.3} ms, edit-list offset {edit_ms:.3} ms");
        }
    }

    let t = Instant::now();
    let info = probe(&path)?;
    println!("probe: {:.2} ms", t.elapsed().as_secs_f64() * 1e3);
    println!(
        "  {} ms, {}x{} @ {} fps, {}",
        info.duration_ms, info.width, info.height, info.fps, info.video_codec
    );
    for tr in &info.tracks {
        println!("  audio {}: {:?} role {:?}", tr.index, tr.title, tr.role);
    }

    let t = Instant::now();
    let player = Player::open(&path, 960, 540, Arc::new(UnityGains))?;
    println!(
        "Player::open (960x540): {:.0} ms, hardware video {}, first frame {:?}",
        t.elapsed().as_secs_f64() * 1e3,
        player.hardware_video(),
        player.frame()
    );
    player.set_output_volume(if audible { 1.0 } else { 0.0 });
    let frames = Arc::new(AtomicU64::new(0));
    let fc = frames.clone();
    player.set_frame_callback(Box::new(move || {
        fc.fetch_add(1, Ordering::Relaxed);
    }));
    println!("after Player::open: {}", mem());

    // Idle CPU while paused.
    let (c0, w0) = (cpu_seconds(), Instant::now());
    std::thread::sleep(Duration::from_secs(2));
    println!("paused CPU over 2 s: {}", cpu_report(cpu_seconds() - c0, w0.elapsed().as_secs_f64()));

    // Play 3 s from 1 s in.
    player.seek(1_000.0, true);
    std::thread::sleep(Duration::from_millis(100));
    frames.store(0, Ordering::Relaxed);
    let (c0, w0) = (cpu_seconds(), Instant::now());
    player.play();
    let mut peak = (0.0f64, 0.0f64);
    let mut max_lag: f64 = 0.0;
    while w0.elapsed() < Duration::from_secs(3) {
        std::thread::sleep(Duration::from_millis(250));
        let pos = player.position_ms();
        let pts = player.frame().map(|f| f.source_ms).unwrap_or(f64::NAN);
        max_lag = max_lag.max(pos - pts);
        let (p, w) = memory();
        peak = (peak.0.max(p), peak.1.max(w));
        println!(
            "  t={:>5.0} ms  position {:>8.1} ms  frame {:>8.1} ms  (pos - frame {:>5.1} ms)",
            w0.elapsed().as_secs_f64() * 1e3,
            pos,
            pts,
            pos - pts
        );
    }
    let wall = w0.elapsed().as_secs_f64();
    let cpu = cpu_seconds() - c0;
    let pos_end = player.position_ms();
    player.pause();
    let shown = frames.load(Ordering::Relaxed);
    println!(
        "played {:.2} s of media in {:.2} s wall; {} frames shown ({:.1} fps); max pos - frame {:.1} ms",
        (pos_end - 1_000.0) / 1e3,
        wall,
        shown,
        shown as f64 / wall,
        max_lag
    );
    println!("playback CPU: {}", cpu_report(cpu, wall));
    println!("peak during playback: private {:.1} MB, working set {:.1} MB", peak.0, peak.1);

    // Exact seek latency (paused): until the frame covering 10.5 s is shown.
    for target in [10_500.0, 10_516.7, 3_250.0, 20_000.0] {
        let before = player.frame().map(|f| f.source_ms);
        let t = Instant::now();
        player.seek(target, true);
        let frame = loop {
            if let Some(f) = player.frame()
                && Some(f.source_ms) != before
                && f.source_ms <= target + 0.5
                && f.source_ms > target - 40.0
            {
                break Some(f);
            }
            if t.elapsed() > Duration::from_secs(5) {
                break None;
            }
            std::thread::sleep(Duration::from_millis(1));
        };
        match frame {
            Some(f) => println!(
                "seek exact {:.1} ms: frame pts {:.3} ms after {:.1} ms (position {:.1})",
                target,
                f.source_ms,
                t.elapsed().as_secs_f64() * 1e3,
                player.position_ms()
            ),
            None => println!("seek exact {target:.1} ms: TIMED OUT, showing {:?}", player.frame()),
        }
    }

    // Fast (keyframe) seek.
    let before = player.frame().map(|f| f.source_ms);
    let t = Instant::now();
    player.seek(15_300.0, false);
    while player.frame().map(|f| f.source_ms) == before && t.elapsed() < Duration::from_secs(5) {
        std::thread::sleep(Duration::from_millis(1));
    }
    println!(
        "seek fast 15300 ms: frame pts {:.1} ms after {:.1} ms",
        player.frame().map_or(f64::NAN, |f| f.source_ms),
        t.elapsed().as_secs_f64() * 1e3
    );

    // Play range: play from 12.0 to 12.5 and confirm it stops at the end.
    player.set_play_range(12_000.0, Some(12_500.0));
    player.seek(12_000.0, true);
    player.play();
    let t = Instant::now();
    while player.is_playing() && t.elapsed() < Duration::from_secs(3) {
        std::thread::sleep(Duration::from_millis(10));
    }
    println!(
        "play range 12.0..12.5 s: stopped after {:.0} ms at position {:.1} ms, frame {:.1} ms",
        t.elapsed().as_secs_f64() * 1e3,
        player.position_ms(),
        player.frame().map_or(f64::NAN, |f| f.source_ms)
    );

    // Rate 2x for 1 s (wall clock, audio muted).
    player.set_play_range(0.0, None);
    player.seek(5_000.0, true);
    player.set_rate(2.0);
    player.play();
    std::thread::sleep(Duration::from_secs(1));
    println!("rate 2x for 1 s: position {:.1} ms (expect ~7000)", player.position_ms());
    player.pause();
    player.set_rate(1.0);

    if let (Some(path), Some(f)) = (&dump, player.frame()) {
        let mut ppm = format!("P6\n{} {}\n255\n", f.width, f.height).into_bytes();
        for px in f.rgba.chunks_exact(4) {
            ppm.extend_from_slice(&px[..3]);
        }
        std::fs::write(path, ppm)?;
        println!("dumped {:?} to {}", f, path.display());
    }

    // Optional soak: seek / play / pause cycles to expose growth.
    if let Some(n) = args.iter().position(|a| a == "--soak").and_then(|i| args.get(i + 1)).and_then(|v| v.parse::<u32>().ok()) {
        if args.iter().any(|a| a == "--soak-video-only") {
            player.set_rate(2.0); // audio is not rendered off 1x
        }
        let mut x = 12345u64;
        for i in 1..=n {
            x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let target = (x >> 33) as f64 % (info.duration_ms as f64 - 2000.0).max(1.0);
            player.seek(target, i % 2 == 0);
            player.play();
            std::thread::sleep(Duration::from_millis(150));
            player.pause();
            if i % 20 == 0 {
                println!("  soak {i:>4}: {}", mem());
            }
        }
    }
    println!("before Player drop: {}", mem());
    let t = Instant::now();
    drop(player);
    println!("Player drop: {:.1} ms; after drop: {}", t.elapsed().as_secs_f64() * 1e3, mem());

    // Analysis APIs, after the player is gone (they create their own decoders).
    let t = Instant::now();
    let waves = waveforms(&path, 200)?;
    println!("waveforms (200 buckets, {} tracks): {:.0} ms", waves.len(), t.elapsed().as_secs_f64() * 1e3);
    for (i, w) in waves.iter().enumerate() {
        // Coarse text sparkline: 40 columns.
        let line: String = w
            .chunks(w.len().div_ceil(40).max(1))
            .map(|c| {
                let v = c.iter().copied().fold(0.0f32, f32::max);
                [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'][((v * 9.0).round() as usize).min(9)]
            })
            .collect();
        println!("  {i} |{line}|");
    }
    println!("after waveforms: {}", mem());

    let t = Instant::now();
    let thumb = frame_at(&path, 5_000.0, 320, 180)?;
    println!("frame_at(5 s, 320x180): {:.0} ms -> {:?}", t.elapsed().as_secs_f64() * 1e3, thumb);
    {
        let mut g = FrameGrabber::open(&path, 320, 180)?;
        let t = Instant::now();
        let n = 10;
        for i in 0..n {
            let _ = g.grab(info.duration_ms as f64 * i as f64 / n as f64, false)?;
        }
        println!(
            "FrameGrabber: {n} keyframe thumbs in {:.0} ms (hardware {})",
            t.elapsed().as_secs_f64() * 1e3,
            g.hardware()
        );
    }

    println!("at exit: {}", mem());
    Ok(())
}
