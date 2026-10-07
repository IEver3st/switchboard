//! Private-bytes breakdown of the video decode setup (diagnostics).
//! cargo run --release -p switchboard-media --example mem_steps -- <clip.mp4>
//! cargo run --release -p switchboard-media --example mem_steps -- <clip.mp4> --waveforms
//! cargo run --release -p switchboard-media --example mem_steps -- <clip.mp4> --probe
//! cargo run --release -p switchboard-media --example mem_steps -- <clip.mp4> --grab <more clips...>

use std::path::PathBuf;

use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
use windows::Win32::System::Threading::GetCurrentProcess;

fn private_mb() -> f64 {
    let mut c = PROCESS_MEMORY_COUNTERS_EX::default();
    let _ = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut c as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
        )
    };
    c.PrivateUsage as f64 / 1048576.0
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = PathBuf::from(&args[0]);
    println!("start {:.1} MB", private_mb());
    match args.get(1).map(String::as_str) {
        Some("--waveforms") => {
            for round in 0..3 {
                let w = switchboard_media::waveforms(&path, 1200)?;
                println!("round {round}: waveforms for {} tracks {:>17.1} MB", w.len(), private_mb());
                drop(w);
            }
        }
        Some("--grab") => {
            // Thumbnail-style single frames from several clips in a row.
            let mut peak = 0f64;
            for (i, clip) in std::iter::once(&args[0]).chain(&args[2..]).enumerate() {
                let f = switchboard_media::frame_at(std::path::Path::new(clip), 1000.0, 480, 270)?;
                peak = peak.max(private_mb());
                println!("clip {i}: {}x{} frame {:>24.1} MB", f.width, f.height, private_mb());
            }
            println!("peak {peak:.1} MB");
        }
        Some("--probe") => {
            let info = switchboard_media::probe(&path)?;
            println!("probe ({}x{}, {} tracks) {:>24.1} MB", info.width, info.height, info.tracks.len(), private_mb());
        }
        _ => switchboard_media::debug_mem_steps(&path, &mut |label| println!("{label:<40} {:.1} MB", private_mb()))?,
    }
    Ok(())
}
