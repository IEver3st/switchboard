# Roadmap

Switchboard 1.x is the native Rust app. This list is ordered by what blocks trust first, then reach, then polish.

## Prove what is built

- Measure A/V sync acoustically. `--example av_sync` puts audio 24 to 31 ms ahead of the picture against the output clock; decide whether to shift audio once the device latency is known.
- Record on an HDR display and compare the tone-mapped clip with what the screen showed.
- Test NVIDIA (NVENC) and Intel (QSV) encoders, including HEVC and AV1, and multi-GPU laptops.
- Soak replay for hours across sleep and resume, display unplug, default device changes and chat app restarts.
- Check single-app capture against exclusive fullscreen games, elevated apps and apps that recreate their window.

## Trust

- Code-sign the executable and the update package so SmartScreen and antivirus stop flagging it.
- Screen-reader support for the window.

## Capture

- Record HDR clips (10-bit HEVC or AV1 with PQ) as an option beside tone-mapped SDR.
- Follow display mode changes during a session without restarting the engine.
- Multiple apps, or an app plus its child windows, as one source.

## Sharing

- Stream-copy HEVC and AV1 when the destination accepts them, instead of always re-encoding to H.264.
- Export without FFmpeg for the common case (trim and re-mux), keeping FFmpeg for compression.
