//! Messages between the tray service and the UI process (JSON lines over a
//! local named pipe).

use serde::{Deserialize, Serialize};
use switchboard_capture::{AudioDevices, DisplayInfo, EngineInfo, EngineStatus, SavedClip};

use crate::settings::Settings;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Request {
    Subscribe,
    SaveClip,
    SetReplay { enabled: bool },
    /// Turn the on-screen 9:16 framing guide on or off.
    SetGuide { enabled: bool },
    ApplySettings { settings: Settings },
    /// Re-enumerate displays and audio devices (sent when Settings opens).
    RefreshDevices,
    /// Change a clip's favorite flag and/or title (`Some(None)` restores the default title).
    UpdateClip { file: String, favorite: Option<bool>, title: Option<Option<String>> },
    /// Forget index entries for clips that no longer exist.
    PruneLibrary,
    /// Install a game's Auto Capture integration (e.g. the CS2 config file).
    SetupProvider { id: String },
    CheckForUpdates,
    /// Restart into the downloaded version.
    InstallUpdate,
    OpenUi,
    Quit,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state")]
pub enum ReplayState {
    Off,
    Starting,
    Running,
    Failed { message: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServiceState {
    pub settings: Settings,
    pub replay: ReplayState,
    pub info: Option<EngineInfo>,
    pub status: Option<EngineStatus>,
    pub displays: Vec<DisplayInfo>,
    #[serde(default)]
    pub audio_devices: AudioDevices,
    /// Present while Auto Capture or reaction clipping is on.
    #[serde(default)]
    pub auto: Option<crate::auto::AutoStatus>,
    pub hotkey_error: Option<String>,
    /// Why the framing guide couldn't be shown, if it couldn't.
    #[serde(default)]
    pub guide_error: Option<String>,
    pub saving: bool,
    /// Private bytes of the tray/engine process.
    pub service_memory: u64,
    #[serde(default)]
    pub update: crate::update::UpdateStatus,
    /// The service's build; empty from builds before this field existed.
    #[serde(default)]
    pub build: String,
}

/// This executable's build identity.
pub const BUILD: &str = env!("SWITCHBOARD_BUILD");

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Event {
    State { state: Box<ServiceState> },
    ClipSaved { clip: SavedClip },
    ClipFailed { message: String },
    /// library.json changed; reload it.
    LibraryChanged,
    Focus,
    Shutdown,
}
