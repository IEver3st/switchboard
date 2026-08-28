# TODO

## Bug reports and GitHub issue handoff

- [x] Connect in-app bug reports to the Switchboard GitHub repository’s issue flow, with a fixed destination and a clear confirmation state.
- [x] Include reproducible context and opt-in diagnostics only, redact secrets and personal data, and preserve a copyable fallback when GitHub is unavailable.
- [x] Add regression coverage for issue URL construction, field validation, diagnostics opt-in, and browser handoff failure behavior.

## Virtual audio driver qualification and end-to-end use

- [ ] Replace the development WDK test certificate and sample identities with production hardware/interface identities.
- [ ] Obtain a Windows-accepted production signature through attestation or WHQL, or reserve an isolated development machine and reboot window for test-signing.
- [ ] Install the signed driver, then verify all eight 48 kHz stereo endpoints through `scripts/verify-virtual-audio-driver.ps1`.
- [ ] Exercise install, upgrade, uninstall, and clean-reinstall paths without leaving stale endpoints or routes behind.
- [ ] Verify per-application assignment across process restart and Windows audio-session recreation.
- [ ] Complete physical qualification: personal, game, chat, media, stream, and microphone listening; capture-file correctness; mute and lifecycle behavior; and a sustained soak run.
- [ ] Update `AUDIO_SYSTEM_AUDIT.html`, `drivers/virtual-audio/README.md`, and release documentation only after the driver-backed evidence is recorded.

Current status: the Windows 11 24H2 WDK and Visual Studio driver toolset are installed, and the x64 package builds successfully. The generated package is signed with the local WDK test certificate, which is not trusted on this machine, so no driver endpoints are installed yet.
