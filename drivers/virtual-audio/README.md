# Switchboard Virtual Audio Device

This directory is the release contract for Switchboard's Windows audio transport driver. The driver must expose the exact eight active endpoints in `endpoint-manifest.json` under the device-interface name `Switchboard Virtual Audio Device`.

The render buses are captured by `Audio.Host` with WASAPI loopback and mixed into the user's selected physical outputs. The Microphone and Stream render/capture pairs are duplex transports: Audio.Host writes the processed microphone and broadcast mix to the render side, and Windows applications record the paired capture side. DSP, device selection, monitoring, application policy, and persistence remain in user mode; the driver only transports 48 kHz stereo frames.

Do not install a renamed stock SysVAD or SimpleAudioSample package. Microsoft's stock capture implementation generates a test tone rather than transporting Switchboard audio, so it would create convincing endpoint names with incorrect behavior.

A distributable package must be built with the Windows 11 24H2 SDK/WDK, use unique production hardware/interface GUIDs, pass HLK audio tests, and be Microsoft attestation- or WHQL-signed. Development test signing requires an elevated machine configured for test mode and a reboot. Audio.Host deliberately refuses to start routing when any manifest endpoint is absent; it never substitutes simulated endpoints.

Run `powershell -ExecutionPolicy Bypass -File .\scripts\verify-virtual-audio-driver.ps1` after installing a signed package. The verifier checks endpoint names, flows, and the Switchboard interface identity through the same discovery path used by Electron.
