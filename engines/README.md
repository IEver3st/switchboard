# Realtime engine prototypes

The Electron app runs small JavaScript utility workers so the control plane can be exercised on any development machine. These `.NET 10` projects are the production migration path:

- `capture-host`: FFmpeg-backed rolling replay buffer and no-reencode clip save.
- `audio-host`: Windows endpoint/session discovery and the user-mode DSP/mixer graph.

They intentionally share a boring JSON-lines command vocabulary with the utility workers. Replace the transport with named pipes when the hosts are wired into packaged Windows builds.
