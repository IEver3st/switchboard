# Setup controls

Settings → Setup contains scenes, quick controls, and status lighting. These
features are disabled or manual by default.

## Scenes

Configure your devices, Audio, and Replay, then save the selected parts as a
named scene. A scene can remember supported mouse DPI/report rate and lighting,
Audio routing/mixes/microphone processing, and Replay settings. Audio requires
Developer mode. Clip storage paths and global replay shortcuts are not captured.

Apply a scene manually or associate it with an executable such as `aces.exe`.
Automatic matching checks every two seconds while an automatic scene is enabled.
When several configured apps are running, the first matching scene takes priority.
The original setup remains available across successive scene changes. Automatic
restoration preserves any subsystem you changed during the scene; manual Restore
returns the saved original setup. Failed or disconnected targets report partial
application. Recovery state survives an app restart.

## Game-only audio

In Settings → Capture → Audio, set Game track captures to Selected game or window
only. Capture must use a game or window source. Windows build 20348 or later is
required. The process and its children feed the Game track through process loopback.
Failure to activate that input stops capture with an error; desktop audio is never
substituted. Microphone and Chat remain independent inputs. A separately enabled
Chat track can still contain other desktop audio from its selected output.

## Quick controls

Enable Open from anywhere and choose a shortcut. Hold the full shortcut to open
the panel; releasing any required key closes it. The title-bar button and Open
panel action open it without holding a key. Escape, losing focus, or Close also
destroy the panel. Choose which of Scenes, Save replay, Microphone, Output, and
ChatMix appear. Audio actions require a running Audio engine in Developer mode.

The optional desktop helper reports registration conflicts and unexpected exits.
After resolving a conflict or rebuilding a missing host, toggle the shortcut or
automatic scene setting to retry. No media engine starts just to watch shortcuts.

## Status lighting

Enable status lighting and select a supported connected device. Native G502 X Plus
static lighting currently supports temporary cues. Battery warning/cutoff comes
first, followed by capture error (red), clip saved (green for 1.5 seconds), and
microphone mute (amber). Clearing a cue restores the selected effect. Commands
use temporary RAM settings and preserve the user's saved lighting configuration.

## Validation

`node scripts/verify-desktop-controls.mjs` exercises the built Windows helper
without opening a window or injecting keys. `node scripts/run-native-review.mjs setup`
checks the built app in hidden native Electron with canonical fixture devices,
including settings persistence, scene application/restoration, unavailable targets,
quick-panel IPC restrictions, and responsive screenshots.

Deterministic tests and hidden UI captures do not prove physical LED output,
global hold/release focus behavior, game-audio separation in a saved recording,
long-running resource use, or installed-package delivery. Those remain live
acceptance checks.
