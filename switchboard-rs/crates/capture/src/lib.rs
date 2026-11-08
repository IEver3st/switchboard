//! Switchboard capture engine: zero-copy WGC -> GPU NV12 -> hardware H.264,
//! WASAPI process-loopback audio -> AAC, disk-backed replay ring, MP4 clips.

mod amf;
pub mod apps;
mod bitstream;
pub mod audio;
pub mod clock;
pub mod cursor;
pub mod engine;
pub mod gpu;
mod mf;
pub mod mp4;
mod ring;
mod signal;
mod snapshot;
mod tonemap;
mod video;
mod wgc;

pub use apps::{AppChoice, AppStatus, AppWindow, app_key, app_windows};
pub use audio::{AudioDevice, AudioDevices, TrackKind, list_audio_devices};
pub use cursor::cursor_track_path;
pub use engine::{
    Engine, EngineConfig, EngineInfo, EngineStatus, Quality, SavedClip, TrackStatus, find_chat_app,
    foreground_app_name, recordable_codecs, unique_clip_path,
};
pub use video::VideoCodec;
pub use gpu::{DisplayInfo, list_displays};

/// Private bytes and working set of this process, in bytes.
pub fn process_memory() -> (u64, u64) {
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::Threading::GetCurrentProcess;
    let mut c = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
    unsafe {
        let _ = GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut c as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
            c.cb,
        );
    }
    (c.PrivateUsage as u64, c.WorkingSetSize as u64)
}

