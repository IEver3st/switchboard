# Switchboard Virtual Audio Device

This directory contains the release contract and reproducible source patch for Switchboard's Windows audio transport driver. The driver exposes the exact eight active endpoints in `endpoint-manifest.json` under the device-interface name `Switchboard Virtual Audio Device`. Windows Sound Settings presents `Switchboard Audio - Gaming`, `Switchboard Audio - Chat`, `Switchboard Audio - Media`, and the capture endpoint `Switchboard Audio - Microphone`. Aux, Stream, and the render side of the microphone transport exist for internal routing and may remain visible in the legacy endpoint list; Switchboard never selects them as ordinary physical outputs.

The render buses are captured by `Audio.Host` with WASAPI loopback and mixed into the user's selected physical outputs. The Microphone and Stream render/capture pairs are duplex transports: Audio.Host writes the processed microphone and broadcast mix to the render side, and Windows applications record the paired capture side. DSP, device selection, monitoring, application policy, and persistence remain in user mode; the driver only transports 48 kHz stereo frames.

Do not install a renamed stock SysVAD or SimpleAudioSample package. Microsoft's stock capture implementation generates a test tone rather than transporting Switchboard audio, so it would create convincing endpoint names with incorrect behavior.

A distributable package must be built with the Windows 11 24H2 SDK/WDK, use unique production hardware/interface GUIDs, pass HLK audio tests, and be Microsoft attestation- or WHQL-signed. Development test signing requires an elevated machine configured for test mode and a reboot. Audio.Host deliberately refuses to start routing when any manifest endpoint is absent; it never substitutes simulated endpoints.

## Build and installation

`bun run build:virtual-audio-driver` checks out Microsoft Windows-driver-samples at commit `717778a20ba4dd2440fe609f69153a1f8a64f597`, applies `patches/simpleaudiosample-switchboard.patch`, restores WDK `10.0.26100.6584`, and builds the x64 package. Visual Studio 2022 must have its **Windows Driver Kit** individual component installed; the WDK NuGet payload alone does not install the MSBuild driver toolset.

For a fast local prerequisite check that does not clone or download anything, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-virtual-audio-driver.ps1 -PrerequisitesOnly`.

The patch replaces the sample tone generator with fixed, nonpaged single-producer/single-consumer transport rings for the Microphone and Stream pairs. Game, Chat, Media, and Aux are ordinary WaveRT render endpoints consumed through WASAPI loopback. All endpoint formats are 48 kHz, stereo, 32-bit PCM; no DSP or product policy runs in kernel mode.

Installation is intentionally separate from the build because Windows only loads an accepted kernel-driver signature. From an elevated PowerShell session, run `scripts\install-virtual-audio-driver.ps1 -PackageDirectory <built-package>`. The installer rejects an invalid catalog unless `-AllowTestSigned` is explicitly supplied on an isolated test-mode machine, and verifies all eight endpoints after Windows accepts the package.

Run `powershell -ExecutionPolicy Bypass -File .\scripts\verify-virtual-audio-driver.ps1` after installing a signed package. The verifier checks endpoint names, flows, and the Switchboard interface identity through the same discovery path used by Electron.
