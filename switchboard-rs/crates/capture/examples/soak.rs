//! Replay soak: start the engine, run N seconds, save a clip to a temp dir,
//! stop, repeat. Prints private memory, handles, threads, CPU and context
//! switches (a wakeup proxy) once per second, plus save and stop times.
//!
//!   SB_TRACKS=gcm cargo run --release --example soak -- [cycles=3] [seconds=20] [height=1440] [fps=60]
//!
//! Clips go to %TEMP%\switchboard-soak and are deleted after each cycle
//! unless SB_KEEP is set.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use switchboard_capture::{Engine, EngineConfig, Quality, process_memory};
use windows::Win32::Foundation::{CloseHandle, FILETIME};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetProcessHandleCount, GetProcessTimes, GetThreadDescription, OpenThread,
    THREAD_QUERY_LIMITED_INFORMATION,
};

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQuerySystemInformation(class: u32, info: *mut u8, len: u32, ret: *mut u32) -> i32;
}

fn handles() -> u32 {
    let mut n = 0;
    unsafe {
        let _ = GetProcessHandleCount(GetCurrentProcess(), &mut n);
    }
    n
}

fn cpu_hns() -> i64 {
    let (mut c, mut e, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
    unsafe {
        let _ = GetProcessTimes(GetCurrentProcess(), &mut c, &mut e, &mut k, &mut u);
    }
    let f = |t: FILETIME| ((t.dwHighDateTime as i64) << 32) | t.dwLowDateTime as i64;
    f(k) + f(u)
}

fn thread_name(tid: u32) -> String {
    unsafe {
        let Ok(h) = OpenThread(THREAD_QUERY_LIMITED_INFORMATION, false, tid) else { return String::new() };
        let name = GetThreadDescription(h).ok().and_then(|p| {
            let s = p.to_string().ok();
            let _ = windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(p.0 as _)));
            s
        });
        let _ = CloseHandle(h);
        name.unwrap_or_default()
    }
}

/// Context switches per thread of this process: tid -> (name, switches).
fn threads(names: &mut HashMap<u32, String>) -> HashMap<u32, u32> {
    const SYSTEM_PROCESS_INFORMATION: u32 = 5;
    let mut buf = vec![0u8; 4 << 20];
    let mut ret = 0u32;
    let status = unsafe { NtQuerySystemInformation(SYSTEM_PROCESS_INFORMATION, buf.as_mut_ptr(), buf.len() as u32, &mut ret) };
    let mut out = HashMap::new();
    if status < 0 {
        return out;
    }
    let pid = std::process::id() as usize;
    let rd = |o: usize, n: usize| -> u64 {
        let mut v = 0u64;
        for i in 0..n {
            v |= (buf[o + i] as u64) << (8 * i);
        }
        v
    };
    let mut off = 0usize;
    loop {
        let next = rd(off, 4) as usize;
        let count = rd(off + 4, 4) as usize;
        if rd(off + 80, 8) as usize == pid {
            for t in 0..count {
                let base = off + 256 + t * 80;
                let tid = rd(base + 48, 8) as u32;
                let switches = rd(base + 64, 4) as u32;
                names.entry(tid).or_insert_with(|| thread_name(tid));
                out.insert(tid, switches);
            }
            break;
        }
        if next == 0 {
            break;
        }
        off += next;
    }
    out
}

fn main() -> anyhow::Result<()> {
    let args: Vec<u32> = std::env::args().skip(1).filter_map(|a| a.parse().ok()).collect();
    let cycles = *args.first().unwrap_or(&3);
    let run = *args.get(1).unwrap_or(&20);
    let height = *args.get(2).unwrap_or(&1440);
    let fps = *args.get(3).unwrap_or(&60);
    let tracks = std::env::var("SB_TRACKS").unwrap_or_else(|_| "gcm".into());
    let out = std::env::temp_dir().join("switchboard-soak");
    let cfg = EngineConfig {
        display_index: 0,
        fps,
        target_height: height,
        quality: Quality::High,
        replay_seconds: 30,
        game_audio: tracks.contains('g'),
        chat_audio: tracks.contains('c'),
        microphone: tracks.contains('m'),
        game_device: None,
        chat_device: None,
        mic_device: None,
        cursor: false, cursor_track: false,
        cache_dir: out.join("cache"),
    };
    let mut names = HashMap::new();
    let (p0, _) = process_memory();
    println!("baseline private={:.1}MB handles={} threads={}", p0 as f64 / 1e6, handles(), threads(&mut names).len());
    let mut summary = Vec::new();
    for c in 0..cycles {
        let t = Instant::now();
        let engine = Engine::start(&cfg)?;
        let start_ms = t.elapsed().as_secs_f64() * 1e3;
        let mut prev_cpu = cpu_hns();
        let mut prev_sw = threads(&mut names);
        let mut prev_t = Instant::now();
        let mut cpu = Vec::new();
        let mut audio_sw = Vec::new();
        let mut total_sw = Vec::new();
        let mut private = Vec::new();
        for s in 1..=run {
            std::thread::sleep(Duration::from_secs(1));
            let now_cpu = cpu_hns();
            let sw = threads(&mut names);
            let dt = prev_t.elapsed().as_secs_f64();
            prev_t = Instant::now();
            let pct = (now_cpu - prev_cpu) as f64 / 1e7 / dt * 100.0;
            prev_cpu = now_cpu;
            let mut per: HashMap<String, f64> = HashMap::new();
            let mut total = 0.0;
            for (tid, n) in &sw {
                let d = n.wrapping_sub(*prev_sw.get(tid).unwrap_or(n)) as f64 / dt;
                total += d;
                let name = names.get(tid).cloned().unwrap_or_default();
                let key = if name.starts_with("sb-") { name } else { "other".into() };
                *per.entry(key).or_default() += d;
            }
            prev_sw = sw;
            let audio: f64 = per.iter().filter(|(k, _)| k.starts_with("sb-audio")).map(|(_, v)| v).sum();
            let (p, _) = process_memory();
            let st = engine.status();
            let mut keys: Vec<_> = per.iter().collect();
            keys.sort_by(|a, b| a.0.cmp(b.0));
            let detail: Vec<String> = keys.iter().map(|(k, v)| format!("{k}={v:.0}")).collect();
            println!(
                "c{c} t={s:>4}s private={:>6.1}MB handles={} threads={} cpu={:>5.2}% csw/s={:>5.0} [{}] enc={} skip={} drop={} buf={:.1}s cache={:.1}MB",
                p as f64 / 1e6,
                handles(),
                prev_sw.len(),
                pct,
                total,
                detail.join(" "),
                st.frames_encoded,
                st.frames_skipped,
                st.frames_dropped,
                st.buffered_seconds,
                st.cache_bytes as f64 / 1e6,
            );
            if s > 2 {
                cpu.push(pct);
                audio_sw.push(audio);
                total_sw.push(total);
                private.push(p as f64 / 1e6);
            }
        }
        println!("{}", engine.debug_counters());
        std::fs::create_dir_all(&out)?;
        let t = Instant::now();
        let saved = engine.save(run.min(30), &out, "Soak")?;
        let save_ms = t.elapsed().as_secs_f64() * 1e3;
        // SB_SAVES=n: n-1 more saves of the same length for a timing spread.
        let extra: u32 = std::env::var("SB_SAVES").ok().and_then(|v| v.parse().ok()).unwrap_or(1);
        let mut more = Vec::new();
        for _ in 1..extra {
            let t = Instant::now();
            let s = engine.save(run.min(30), &out, "Soak")?;
            more.push(format!("{:.0}", t.elapsed().as_secs_f64() * 1e3));
            let _ = std::fs::remove_file(&s.path);
        }
        if !more.is_empty() {
            println!("c{c} more saves (ms): {}", more.join(" "));
        }
        let t = Instant::now();
        drop(engine);
        let stop_ms = t.elapsed().as_secs_f64() * 1e3;
        let (p, _) = process_memory();
        println!(
            "c{c} saved {:.1}s {:.1}MB in {save_ms:.1} ms; start {start_ms:.0} ms; stop {stop_ms:.1} ms; after stop private={:.1}MB handles={} threads={}",
            saved.seconds,
            saved.bytes as f64 / 1e6,
            p as f64 / 1e6,
            handles(),
            threads(&mut names).len()
        );
        if std::env::var("SB_KEEP").is_err() {
            let _ = std::fs::remove_file(&saved.path);
        } else {
            println!("kept {}", saved.path.display());
        }
        let med = |v: &mut Vec<f64>| {
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            v.get(v.len() / 2).copied().unwrap_or(0.0)
        };
        summary.push(format!(
            "c{c}: cpu median {:.2}% | csw/s median total {:.0}, audio {:.0} | private median {:.1}MB | save {save_ms:.1} ms | stop {stop_ms:.1} ms",
            med(&mut cpu),
            med(&mut total_sw),
            med(&mut audio_sw),
            med(&mut private)
        ));
    }
    for s in summary {
        println!("{s}");
    }
    println!("end private={:.1}MB handles={} threads={}", process_memory().0 as f64 / 1e6, handles(), threads(&mut names).len());
    Ok(())
}
