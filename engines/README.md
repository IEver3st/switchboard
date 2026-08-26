# Realtime engine prototypes

Electron launches these isolated `.NET 10` hosts directly; realtime media never crosses Electron IPC:

- `capture-host`: FFmpeg-backed rolling replay buffer and no-reencode clip save.
- `audio-host`: Windows endpoint/session discovery and the user-mode DSP/mixer graph.

They use a narrow JSON-lines control vocabulary. Audio and video sample buffers remain inside the native hosts.
