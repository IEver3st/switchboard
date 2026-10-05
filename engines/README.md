# Realtime engine

Electron launches this isolated `.NET 10` host directly; realtime media never crosses Electron IPC:

- `capture-host`: FFmpeg-backed rolling replay buffer, no-reencode clip save, and one-shot Windows audio endpoint discovery for clip track selection.

It uses a narrow JSON-lines control vocabulary. Audio and video sample buffers remain inside the native host.
