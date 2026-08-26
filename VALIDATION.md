# Validation record

Validated in the build environment:

- `node scripts/check.mjs`
- JavaScript syntax for both utility workers and the static preview
- utility worker start, configure, request, save, and shutdown smoke tests
- TypeScript and TSX transpilation for all 31 source files
- local import resolution
- Electron security configuration checks
- schema validation and renderer-bound IPC checks
- transient engine telemetry persistence checks
- FFmpeg replay ring argument construction checks
- allocation rules for the C# microphone realtime path
- interactive browser preview navigation, engine toggles, module toggles, device selection, and replay action

Not executable in the build environment:

- `bun install`, because Bun was not installed and outbound package-registry access was unavailable
- Electron bundle and installer generation, because dependencies could not be installed
- .NET 10 builds, because the .NET SDK was not installed
- Windows HID, WASAPI, WGC, FFmpeg `ddagrab`, and virtual-driver tests, because the environment was Linux

The GitHub Actions workflow runs the dependency-backed Electron and .NET checks on Windows.
