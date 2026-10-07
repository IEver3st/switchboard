//! Real exports against a synthetic clip, verified with ffprobe.
//!
//! cargo run -p switchboard-export --example export_smoke
//!
//! Writes only under %TEMP%\switchboard-export-smoke.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc;
use std::time::Instant;

use anyhow::{Context, Result, bail, ensure};
use switchboard_export::*;
use switchboard_project::*;

fn ffmpeg(exe: &Path, args: &[&str]) -> Result<()> {
    let out = Command::new(exe).args(["-hide_banner", "-loglevel", "error"]).args(args).output()?;
    ensure!(out.status.success(), "ffmpeg failed: {}", String::from_utf8_lossy(&out.stderr));
    Ok(())
}

struct Probe {
    duration_s: f64,
    bytes: u64,
    video: usize,
    audio: usize,
    width: u64,
    height: u64,
    comment: String,
    vcodec: String,
    pix_fmt: String,
    acodec: String,
    rate: String,
    channels: u64,
}

fn probe(ffprobe: &Path, path: &Path) -> Result<Probe> {
    let out = Command::new(ffprobe)
        .args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)?;
    let streams = v["streams"].as_array().cloned().unwrap_or_default();
    let video: Vec<_> = streams.iter().filter(|s| s["codec_type"] == "video").collect();
    let audio: Vec<_> = streams.iter().filter(|s| s["codec_type"] == "audio").collect();
    let s = |x: &serde_json::Value| x.as_str().unwrap_or("").to_string();
    Ok(Probe {
        duration_s: v["format"]["duration"].as_str().unwrap_or("0").parse()?,
        bytes: std::fs::metadata(path)?.len(),
        video: video.len(),
        audio: audio.len(),
        width: video.first().and_then(|s| s["width"].as_u64()).unwrap_or(0),
        height: video.first().and_then(|s| s["height"].as_u64()).unwrap_or(0),
        comment: s(&v["format"]["tags"]["comment"]),
        vcodec: video.first().map(|v| s(&v["codec_name"])).unwrap_or_default(),
        pix_fmt: video.first().map(|v| s(&v["pix_fmt"])).unwrap_or_default(),
        acodec: audio.first().map(|a| s(&a["codec_name"])).unwrap_or_default(),
        rate: audio.first().map(|a| s(&a["sample_rate"])).unwrap_or_default(),
        channels: audio.first().and_then(|a| a["channels"].as_u64()).unwrap_or(0),
    })
}

struct Outcome {
    result: Progress,
    seconds: f64,
    encoder: Option<Encoder>,
    updates: usize,
    /// Highest progress below 1.0; above 0.8 on a size target means a retry ran.
    peak_partial: f32,
}

fn run(job: ExportJob, encoders: Encoders, ffmpeg: &Path, cancel_after_ms: Option<u64>) -> Outcome {
    let (tx, rx) = mpsc::channel();
    let started = Instant::now();
    let handle = start(job, encoders, ffmpeg.to_path_buf(), Box::new(move |p| {
        let _ = tx.send(p);
    }));
    let mut updates = 0;
    let mut last = 0f32;
    let mut peak_partial = 0f32;
    let result = loop {
        if let Some(ms) = cancel_after_ms
            && started.elapsed().as_millis() as u64 >= ms
        {
            handle.cancel();
        }
        match rx.recv_timeout(std::time::Duration::from_millis(20)) {
            Ok(Progress::Rendering { fraction }) => {
                assert!(fraction >= last, "progress went backwards");
                last = fraction;
                if fraction < 1.0 {
                    peak_partial = fraction;
                }
                updates += 1;
            }
            Ok(p @ (Progress::Done { .. } | Progress::Failed { .. } | Progress::Cancelled)) => break p,
            Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break Progress::Failed { message: "worker vanished".into() },
        }
    };
    let encoder = handle.encoder_used();
    handle.join();
    Outcome { result, seconds: started.elapsed().as_secs_f64(), encoder, updates, peak_partial }
}

fn check(name: &str, o: &Outcome, ffprobe: &Path, expect_s: f64, max_bytes: Option<u64>, size: (u64, u64), audio_streams: usize) -> Result<()> {
    let Progress::Done { path, bytes } = &o.result else { bail!("{name}: {:?}", o.result) };
    let p = probe(ffprobe, path)?;
    let err = (p.duration_s - expect_s).abs() / expect_s;
    println!(
        "{name:<28} {:>6.2}s  {:>9} B  dur {:.3}s (want {expect_s:.3}, {:.2}%)  {}x{}  v{} a{}  {}  {} updates{}",
        o.seconds,
        bytes,
        p.duration_s,
        err * 100.0,
        p.width,
        p.height,
        p.video,
        p.audio,
        o.encoder.map(Encoder::name).unwrap_or("copy"),
        o.updates,
        if o.peak_partial > 0.8 && max_bytes.is_some() { " (size retry ran)" } else { "" }
    );
    ensure!(err <= 0.02, "{name}: duration off by {:.2}%", err * 100.0);
    ensure!(p.bytes == *bytes);
    if let Some(m) = max_bytes {
        ensure!(p.bytes <= m, "{name}: {} bytes exceeds {m}", p.bytes);
    }
    ensure!((p.width, p.height) == size, "{name}: size {}x{}", p.width, p.height);
    ensure!(p.video == 1 && p.audio == audio_streams, "{name}: streams v{} a{}", p.video, p.audio);
    if audio_streams == 1 {
        ensure!(p.comment == "Created with Switchboard", "{name}: comment {:?}", p.comment);
        ensure!(p.vcodec == "h264" && p.pix_fmt == "yuv420p", "{name}: {} {}", p.vcodec, p.pix_fmt);
        ensure!(p.acodec == "aac" && p.rate == "48000" && p.channels == 2, "{name}: {} {} {}", p.acodec, p.rate, p.channels);
    }
    Ok(())
}

fn main() -> Result<()> {
    let (ff, fp) = locate_ffmpeg().context("FFmpeg not found")?;
    println!("ffmpeg {}\nffprobe {}", ff.display(), fp.display());
    let t = Instant::now();
    let encoders = detect_encoders(&ff);
    println!("encoders {encoders:?} -> {} ({:.2}s probe)", encoders.best().name(), t.elapsed().as_secs_f64());
    let t = Instant::now();
    let again = detect_encoders(&ff);
    ensure!(again == encoders && t.elapsed().as_millis() < 5, "encoder cache");

    let root = std::env::temp_dir().join("switchboard-export-smoke");
    let _ = std::fs::remove_dir_all(&root);
    let out = root.join("out");
    std::fs::create_dir_all(&out)?;
    let src = root.join("source.mp4");
    let t = Instant::now();
    ffmpeg(
        &ff,
        &[
            "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=12",
            "-f", "lavfi", "-i", "sine=f=440:d=12:sample_rate=48000",
            "-f", "lavfi", "-i", "sine=f=660:d=12:sample_rate=48000",
            "-f", "lavfi", "-i", "sine=f=880:d=12:sample_rate=48000,volume='lt(mod(t,4),2)':eval=frame",
            "-map", "0", "-map", "1", "-map", "2", "-map", "3",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", "30",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-metadata:s:a:0", "title=Game", "-metadata:s:a:1", "title=Chat", "-metadata:s:a:2", "title=Microphone",
            "-y", src.to_str().unwrap(),
        ],
    )?;
    let music_path = root.join("music.m4a");
    ffmpeg(&ff, &["-f", "lavfi", "-i", "sine=f=330:d=5:sample_rate=44100", "-c:a", "aac", "-b:a", "96k", "-y", music_path.to_str().unwrap()])?;
    println!("synthetic sources in {:.2}s", t.elapsed().as_secs_f64());

    let probed = probe_clip(&fp, "clip", &src)?;
    println!("probe: {:?} duration {} ms titles {:?}", probed.source, probed.duration_ms, probed.track_titles);
    ensure!(probed.source.audio_tracks == 3 && probed.source.mic_track == Some(2));
    let clip_ms = probed.duration_ms;
    let sources = vec![probed.source.clone()];
    let job = |project: Project, target, name: &str| ExportJob {
        project,
        sources: sources.clone(),
        music_path: None,
        target,
        output: out.join(name),
    };

    // 1. Original, unedited: file copy.
    let p = Project::for_clip("clip", "Smoke", clip_ms, None, now_ms());
    let o = run(job(p, SizeTarget::Original, "original.mp4"), encoders, &ff, None);
    check("original copy", &o, &fp, clip_ms as f64 / 1000.0, None, (1280, 720), 3)?;
    ensure!(std::fs::metadata(out.join("original.mp4"))?.len() == std::fs::metadata(&src)?.len());

    // 2. Trimmed 2..10 s at 10 MB.
    let mut p = Project::for_clip("clip", "Smoke", clip_ms, None, now_ms());
    p.segments[0].trim_start_ms = 2_000;
    p.segments[0].trim_end_ms = 10_000;
    p.refresh();
    let o = run(job(p, SizeTarget::Megabytes(10), "trimmed-10mb.mp4"), encoders, &ff, None);
    check("trimmed 10MB", &o, &fp, 8.0, Some(10 * 1_048_576), (1280, 720), 1)?;

    // 3. 9:16 with a text title, special characters, two lines, speed 2x.
    let mut p = Project::for_clip("clip", "Smoke", clip_ms, None, now_ms());
    p.canvas_size = Canvas::Vertical;
    p.segments[0].video_edits = Some(VideoEdits {
        speed: Some(2.0),
        text: Some(Title {
            content: "GG: 100%, it's \"over\"\n[a;b] C:\\path".into(),
            start_ms: 0,
            end_ms: 12_000,
            position: TitlePosition::Center,
            size: TextSize::Large,
        }),
        ..Default::default()
    });
    p.refresh();
    let o = run(job(p, SizeTarget::Original, "vertical-text-2x.mp4"), encoders, &ff, None);
    check("9:16 text 2x", &o, &fp, 6.0, None, (404, 720), 1)?;
    ffmpeg(&ff, &["-ss", "1", "-i", out.join("vertical-text-2x.mp4").to_str().unwrap(), "-frames:v", "1", "-y", root.join("vertical-text-frame.png").to_str().unwrap()])?;

    // 4. Advanced: 1:1, framing keyframes, freeze, speed ramp, blur and pixelate.
    let mut p = Project::for_clip("clip", "Smoke", clip_ms, None, now_ms());
    p.canvas_size = Canvas::Square;
    let o_at = |kind, x| Overlay { id: "o".into(), kind, start_ms: 0, end_ms: 12_000, x, y: 0.1, width: 0.3, height: 0.3, content: None, size: None };
    p.segments[0].video_edits = Some(VideoEdits {
        framing: Some(Framing {
            mode: FramingMode::Fill,
            background: FramingBackground::Black,
            keyframes: vec![
                FramingKeyframe { time_ms: 0, x: 0.2, y: 0.5, zoom: 1.0, transition: Interpolation::Smooth },
                FramingKeyframe { time_ms: 6_000, x: 0.8, y: 0.4, zoom: 1.8, transition: Interpolation::Linear },
            ],
        }),
        freezes: vec![Freeze { time_ms: 3_000, duration_ms: 1_000 }],
        speed_points: vec![
            SpeedPoint { time_ms: 6_000, speed: 1.0, transition: SpeedTransition::Linear },
            SpeedPoint { time_ms: 8_000, speed: 2.0, transition: SpeedTransition::Hold },
        ],
        overlays: vec![o_at(OverlayKind::Blur, 0.05), o_at(OverlayKind::Pixelate, 0.6)],
        brightness: Some(0.1),
        saturation: Some(1.3),
        ..Default::default()
    });
    p.segments[0].audio_track_levels = Some(vec![100, 40, 0]);
    p.refresh();
    let want = p.duration_ms as f64 / 1000.0;
    let o = run(job(p, SizeTarget::Original, "square-advanced.mp4"), encoders, &ff, None);
    check("1:1 framing/freeze/ramp", &o, &fp, want, None, (720, 720), 1)?;

    // 5. Two-segment montage with music, fades, loop and ducking on the mic.
    let mut p = Project::montage("Smoke montage", &[("clip".into(), clip_ms, None), ("clip".into(), clip_ms, None)], now_ms());
    p.segments[0].trim_end_ms = 5_000;
    p.segments[1].trim_start_ms = 6_000;
    let asset = AudioAsset {
        id: uuid(),
        name: "music".into(),
        original_name: "music.m4a".into(),
        duration_ms: probe_audio(&fp, &music_path)?.0,
        file_size: std::fs::metadata(&music_path)?.len(),
        codec: Some("aac".into()),
        created_at: now_ms(),
    };
    let mut m = Music::new(asset);
    m.volume = 0.5;
    m.timeline_start_ms = 1_000;
    m.ducking = Some(Ducking::default());
    p.music = Some(m);
    p.refresh();
    let want = p.duration_ms as f64 / 1000.0;
    let mut j = job(p, SizeTarget::Megabytes(10), "montage-music.mp4");
    j.music_path = Some(music_path.clone());
    let planned = plan(&j, &encoders)?;
    println!("montage plan: {}x{} video {:?} kbps audio {} kbps, {} steps", planned.width, planned.height, planned.video_kbps, planned.audio_kbps, planned.steps.len());
    let o = run(j, encoders, &ff, None);
    check("montage + music 10MB", &o, &fp, want, Some(10 * 1_048_576), (1280, 720), 1)?;

    // 6. High-entropy noise at 1 MB: the first hardware pass may overshoot
    //    and fall back to libx264 two-pass with a measured correction.
    let noise = root.join("noise.mp4");
    ffmpeg(
        &ff,
        &[
            "-f", "lavfi", "-i", "nullsrc=s=1280x720:r=30:d=6,geq=lum='random(1)*255':cb=128:cr=128",
            "-f", "lavfi", "-i", "anoisesrc=d=6:r=48000",
            "-c:v", "libx264", "-preset", "ultrafast", "-qp", "10", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", noise.to_str().unwrap(),
        ],
    )?;
    let np = probe_clip(&fp, "noise", &noise)?;
    let nj = ExportJob {
        project: Project::for_clip("noise", "Noise", np.duration_ms, None, now_ms()),
        sources: vec![np.source.clone()],
        music_path: None,
        target: SizeTarget::Megabytes(1),
        output: out.join("noise-1mb.mp4"),
    };
    let planned = plan(&nj, &encoders)?;
    println!("noise plan: {}x{} video {:?} kbps audio {} kbps", planned.width, planned.height, planned.video_kbps, planned.audio_kbps);
    let o = run(nj, encoders, &ff, None);
    check("noise 1MB", &o, &fp, np.duration_ms as f64 / 1000.0, Some(1_048_576), (planned.width as u64, planned.height as u64), 1)?;

    // 7. A hardware encoder that fails (NVENC on a machine without it)
    //    falls back to libx264 for the segment and the rest of the export.
    let mut p = Project::for_clip("clip", "Smoke", clip_ms, None, now_ms());
    p.segments[0].trim_end_ms = 4_000;
    p.refresh();
    let broken = Encoders { nvenc: !encoders.nvenc, ..Default::default() };
    if broken.nvenc {
        let o = run(job(p, SizeTarget::Original, "fallback.mp4"), broken, &ff, None);
        check("forced nvenc fallback", &o, &fp, 4.0, None, (1280, 720), 1)?;
        ensure!(o.encoder == Some(Encoder::Libx264), "fallback used {:?}", o.encoder);
    }

    // 7b. Cancel mid-render: no partial output, no working file.
    let mut p = Project::for_clip("clip", "Smoke", clip_ms, None, now_ms());
    p.segments[0].video_edits = Some(VideoEdits { flip_horizontal: Some(true), ..Default::default() });
    p.refresh();
    let o = run(job(p, SizeTarget::Original, "cancelled.mp4"), Encoders::default(), &ff, Some(150));
    println!("cancel                       {:>6.2}s  {:?}", o.seconds, o.result);
    ensure!(o.result == Progress::Cancelled, "cancel: {:?}", o.result);
    let leftovers: Vec<PathBuf> = std::fs::read_dir(&out)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.') || n == "cancelled.mp4"))
        .collect();
    ensure!(leftovers.is_empty(), "partial output left: {leftovers:?}");

    // 8. Share folder lifecycle.
    let share = share_path("smoke-export", "Smoke: clip", "-10mb");
    std::fs::create_dir_all(share.parent().unwrap())?;
    std::fs::write(&share, b"x")?;
    cleanup_share_dir();
    ensure!(!share.exists());

    // 9. Music waveform.
    let wave = audio_waveform(&ff, &music_path, 5_000, 64)?;
    ensure!(wave.len() == 64 && wave.contains(&1.0));

    println!("all smoke checks passed; outputs in {}", out.display());
    Ok(())
}
