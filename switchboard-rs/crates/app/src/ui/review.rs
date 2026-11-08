//! Headless review renders: drives the real App through the same CPU
//! rasterizer the window uses and writes a PNG, so layout and states can be
//! checked at several sizes without putting a window over the foreground
//! app. It does not prove on-screen presentation or real input handling.
//!
//!   switchboard-rs --review-shot out.png <width> <height> <scale> <scenario> [scroll]
//!
//! Scenarios: clips, list, selection, popover, guide, search, empty, settings, settings-auto, delete, share, share-run,
//! editor, editor-edit, add-clips, add-clips-run, new-clips, editor-play, editor-close, editor-kill,
//! thumbs-idle.

use std::path::Path;
use std::time::{Duration, Instant};

use anyhow::Result;
use egui_software_backend::{BufferMutRef, ColorFieldOrder, EguiSoftwareRender};

use super::library::View;
use super::App;

/// Sample provider rows covering each state the Settings page shows.
fn sample_auto() -> crate::auto::AutoStatus {
    use switchboard_autocapture::GameEventType as E;
    let row = |id: &str, game: &str, name: &str, support: &str, availability: &str, reason: Option<&str>, status: &str| {
        crate::auto::ProviderRow {
            id: id.into(),
            game_id: game.into(),
            name: name.into(),
            support: support.into(),
            availability: availability.into(),
            reason: reason.map(str::to_string),
            status: status.into(),
            message: None,
            events: if support == "unavailable" { vec![] } else { vec![E::Kill, E::Headshot, E::MultiKill, E::RoundWin, E::MatchWin, E::Death] },
        }
    };
    crate::auto::AutoStatus {
        state: "idle".into(),
        active_game: None,
        last_error: None,
        clips_created: 0,
        providers: vec![
            row("cs2-gsi", "counter-strike-2", "Counter-Strike 2", "supported", "setup-required", Some("Add the game state config to Counter-Strike 2."), "stopped"),
            row("war-thunder", "war-thunder", "War Thunder", "experimental", "available", None, "stopped"),
            row("bf6", "battlefield-6", "Battlefield 6", "unavailable", "unavailable", Some("Battlefield 6 has no supported event source."), "stopped"),
        ],
    }
}

pub fn review_shot(out: &Path, w: f32, h: f32, scale: f32, scenario: &str, scroll: f32) -> Result<()> {
    let ctx = egui::Context::default();
    ctx.set_pixels_per_point(scale);
    super::library::NO_PRUNE.store(true, std::sync::atomic::Ordering::Relaxed);
    // SB_REVIEW_DIR shows another clips folder (e.g. for README screenshots).
    let pinned = std::env::var_os("SB_REVIEW_DIR").map(std::path::PathBuf::from).or_else(|| {
        (scenario == "empty").then(|| {
            let d = std::env::temp_dir().join("switchboard-review-empty");
            let _ = std::fs::create_dir_all(&d);
            d
        })
    });
    // SB_REVIEW_CLEAN: the live state as if the service were this build with
    // no pending update, so version notices stay out of screenshots.
    let clean = std::env::var_os("SB_REVIEW_CLEAN").is_some();
    let displays = clean.then(|| {
        unsafe {
            let _ = windows::Win32::UI::HiDpi::SetProcessDpiAwarenessContext(
                windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            );
        }
        switchboard_capture::list_displays().ok()
    }).flatten();
    let click = std::env::var("SB_REVIEW_CLICK").ok().and_then(|v| {
        let (x, y) = v.split_once(',')?;
        Some(egui::pos2(x.trim().parse().ok()?, y.trim().parse().ok()?))
    });
    let mut app = App::new(ctx.clone(), pinned);
    app.windowed = false;
    // Drafts made by review scenarios stay out of the real projects store.
    let store_dir = std::env::temp_dir().join(format!("switchboard-review-projects-{}", std::process::id()));
    app.store = switchboard_project::store::Store::open(&store_dir);
    match scenario {
        "settings" | "settings-auto" | "settings-formats" | "settings-app" | "settings-blocked" => app.open_settings(),
        "list" => app.lib.view = View::List,
        "search" => app.lib.set_query("no such clip".into()),
        _ => {}
    }
    // Matches the window: uncached unless SB_CACHE is set, for comparison.
    let caching = std::env::var_os("SB_CACHE").is_some();
    let mut renderer = EguiSoftwareRender::new(ColorFieldOrder::Rgba).with_caching(caching);
    let mb = || switchboard_capture::process_memory().0 / (1024 * 1024);
    let base_mb = mb();
    let (pw, ph) = ((w * scale).round() as usize, (h * scale).round() as usize);
    let mut buf = vec![[0u8; 4]; pw * ph];
    let start = Instant::now();
    let mut raster = Vec::new();
    let mut play_from: Option<(Instant, f64)> = None;
    // Helper events (each one a repaint in the window) and helper CPU, from frame 10 on.
    let helper_cpu = || crate::media_client::debug_helpers().iter().map(|h| h.2).sum::<u64>();
    let mut window: Option<(Instant, u64, u64)> = None;
    // Several passes: state arrives over IPC and thumbnails load in the background.
    // thumbs-idle: the clips page held for 12 s, to watch thumbnail work
    // finish and the media helper exit after its idle window.
    let frames = match scenario {
        "share-run" => 400,
        "thumbs-idle" => 60,
        _ => 16,
    };
    for i in 0..frames {
        if scenario == "share-run" && i > 12 && app.share.as_ref().is_some_and(|s| s.settled()) {
            break;
        }
        let auto = scenario == "settings-auto" && i >= 8;
        let tweak = matches!(scenario, "settings-formats" | "settings-app" | "settings-blocked" | "app-waiting" | "app-blocked" | "share-ffmpeg" | "share-installing");
        if (clean || auto || tweak)
            && let Some(st) = app.link.state()
        {
            let mut st = (*st).clone();
            if clean {
                st.build = crate::protocol::BUILD.to_string();
                st.update = Default::default();
                if let Some(displays) = &displays {
                    st.displays = displays.clone();
                }            }
            if auto {
                st.settings.auto_capture.enabled = true;
                st.settings.auto_capture.reaction_clipping.enabled = true;
                st.auto = Some(sample_auto());
            }
            if scenario == "settings-formats" {
                st.codecs = switchboard_capture::VideoCodec::ALL.to_vec();
                if let Some(info) = &mut st.info {
                    info.codec_note = Some("AV1 could not start on this graphics card, so Switchboard is recording H.264".into());
                }
            }
            if scenario == "share-ffmpeg" {
                st.ffmpeg = crate::protocol::FfmpegState::Failed { message: "the server didn't answer".into() };
            } else if scenario == "share-installing" {
                st.ffmpeg = crate::protocol::FfmpegState::Downloading { permille: 420 };
            } else if tweak && scenario != "settings-formats" {
                let name = "Counter-Strike 2".to_string();
                st.settings.capture_app = Some(switchboard_capture::AppChoice { key: "cs2".into(), name: name.clone() });
                let problem = scenario.ends_with("blocked").then(|| format!("{name} runs as administrator, so Windows won't let Switchboard record it"));
                if let Some(s) = &mut st.status {
                    s.app = Some(switchboard_capture::AppStatus { name, recording: false, problem, recent: false });
                }
            }
            app.review_state = Some(std::sync::Arc::new(st));
        }
        if i == 8 {
            match scenario {
                "selection" => {
                    app.lib.selecting = true;
                    let paths: Vec<_> = app.lib.visible_paths().into_iter().take(3).collect();
                    for p in &paths {
                        app.lib.toggle(p);
                    }
                }
                "popover" => app.popover = true,
                "guide" => app.guide_panel = true,
                "drafts" => {
                    for (k, path) in app.lib.visible_paths().into_iter().take(2).enumerate() {
                        if let Some(c) = app.lib.clips.iter().find(|c| c.path == path) {
                            let mut p = switchboard_project::Project::for_clip(&c.file_name, &c.title, c.duration_ms().max(100), None, switchboard_project::now_ms());
                            if k == 1 {
                                p.kept = Some(true);
                            }
                            let _ = app.store.save(p, switchboard_project::now_ms());
                        }
                    }
                    if let Some(c) = app.lib.clips.first_mut() {
                        c.favorite = true;
                    }
                }
                "list" => {
                    for c in app.lib.clips.iter_mut().take(2) {
                        c.favorite = true;
                    }
                }
                "montage" => {
                    let clips: Vec<_> = app.lib.visible_paths().into_iter().take(3).collect();
                    app.create_montage(&clips);
                }
                "new-clips" => {
                    // In memory only: two clips shown as unreviewed Auto Capture saves.
                    app.auto_reviewed_ms = 0;
                    for c in app.lib.clips.iter_mut().take(2) {
                        c.source = crate::library_index::CaptureSource::Auto;
                    }
                }
                "filter" => {
                    ctx.data_mut(|d| d.insert_temp(egui::Id::new("review-open-filter"), true));
                }
                "add-clips" | "add-clips-run" => {
                    let clips: Vec<_> = app.lib.visible_paths().into_iter().take(2).collect();
                    app.create_montage(&clips);
                    let third = app.lib.visible_paths().get(2).and_then(|p| p.file_name()).map(|n| n.to_string_lossy().into_owned());
                    if let Some(mut ed) = app.editor.take() {
                        if scenario == "add-clips" {
                            ed.adding = Some((String::new(), vec![]));
                        } else if let Some(f) = third {
                            // Insert after the first segment, then move it to the end.
                            app.insert_clips(&mut ed, &[f]);
                            ed.state.move_segment(ed.state.selected, 1);
                            ed.after_edit();
                        }
                        app.editor = Some(ed);
                    }
                }
                "editor-play" => {
                    let chosen = std::env::var("SB_REVIEW_CLIP").ok().and_then(|f| app.lib.find(&f).map(|c| c.path.clone()));
                    if let Some(p) = chosen.or_else(|| app.lib.visible_paths().first().cloned()) {
                        app.open_editor(&p);
                        if let Some(ed) = &mut app.editor {
                            ed.seek(5_000.0, true);
                            ed.toggle_play();
                            play_from = Some((Instant::now(), ed.playback.out_ms));
                        }
                    }
                }
                "editor" | "editor-edit" | "editor-overlay" => {
                    // SB_REVIEW_CLIP=<file name> opens that clip instead of the newest.
                    let chosen = std::env::var("SB_REVIEW_CLIP").ok().and_then(|f| app.lib.find(&f).map(|c| c.path.clone()));
                    if let Some(p) = chosen.or_else(|| app.lib.visible_paths().first().cloned()) {
                        app.open_editor(&p);
                        if let Some(ed) = &mut app.editor {
                            ed.seek(12_000.0, true);
                            if scenario != "editor" {
                                ed.tab = super::editor::Tab::Edit;
                            }
                            if scenario == "editor-overlay" {
                                use switchboard_project::OverlayKind;
                                ed.state.add_overlay(0, OverlayKind::Blur, 4_000.0);
                                let text = ed.state.add_overlay(0, OverlayKind::Text, 12_000.0);
                                if let Some(id) = &text {
                                    ed.state.edit(0, "overlay", |e| {
                                        if let Some(o) = e.overlays.iter_mut().find(|o| &o.id == id) {
                                            o.content = Some("Clutch round".into());
                                        }
                                    });
                                }
                                ed.selected_overlay = text;
                            }
                        }
                    }
                }
                "share-ffmpeg" | "share-installing" => {
                    if let Some(p) = app.lib.visible_paths().first().cloned() {
                        app.open_share(&p);
                        if let Some(share) = &mut app.share {
                            share.review_ffmpeg();
                        }
                    }
                }
                "share" | "share-run" => {
                    if let Some(p) = app.lib.visible_paths().first().cloned() {
                        app.open_share(&p);
                        if scenario == "share-run" {
                            let name = app.share.as_ref().map(|s| s.project_name().to_string()).unwrap_or_default();
                            let out = switchboard_export::share_path(&switchboard_project::uuid(), &name, "-10mb");
                            app.start_export(out, switchboard_export::SizeTarget::Megabytes(10));
                        }
                    }
                }
                _ => {}
            }
        }
        if scenario == "editor-kill" {
            // The helper dies mid-edit: the preview must say so, and the
            // next seek must start a new helper.
            if i == 4 && let Some(p) = app.lib.visible_paths().first().cloned() {
                app.open_editor(&p);
            }
            if i == 8 {
                eprintln!("killed helper: {}", crate::media_client::debug_kill_helper());
            }
            if let Some(ed) = &mut app.editor {
                if i == 11 {
                    ed.seek(500.0, true);
                }
                if (8..=15).contains(&i) {
                    eprintln!("frame {i}: error {:?}, frame seq {}", ed.playback.error, ed.playback.frame_seq());
                }
            }
        }
        if scenario == "editor-close" {
            if i == 4 && let Some(p) = app.lib.visible_paths().first().cloned() {
                app.open_editor(&p);
            }
            if i == 10 {
                app.close_editor();
            }
        }
        let mut input = egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(w, h))),
            time: Some(start.elapsed().as_secs_f64()),
            ..Default::default()
        };
        if let Some(at) = click {
            if i == 8 {
                input.events.push(egui::Event::PointerMoved(at));
            }
            if i == 9 {
                for pressed in [true, false] {
                    let button = egui::PointerButton::Primary;
                    input.events.push(egui::Event::PointerButton { pos: at, button, pressed, modifiers: egui::Modifiers::NONE });
                }
            }
        }
        if scenario == "delete" || scenario == "menu" {
            let at = egui::pos2(super::theme::GUTTER + 60.0, 200.0);
            if i == 8 {
                input.events.push(egui::Event::PointerMoved(at));
            }
            if i == 9 {
                let (button, modifiers) = if scenario == "menu" {
                    (egui::PointerButton::Secondary, egui::Modifiers::NONE)
                } else {
                    (egui::PointerButton::Primary, egui::Modifiers::COMMAND)
                };
                input.modifiers = modifiers;
                for pressed in [true, false] {
                    input.events.push(egui::Event::PointerButton { pos: at, button, pressed, modifiers });
                }
            }
        }
        if scenario == "delete" {
            if i == 11 {
                input.events.push(egui::Event::Key {
                    key: egui::Key::Delete,
                    physical_key: None,
                    pressed: true,
                    repeat: false,
                    modifiers: egui::Modifiers::NONE,
                });
            }
        }
        if i >= 10 && scroll != 0.0 {
            let x = if scenario.starts_with("editor") { w - 150.0 } else { w / 2.0 };
            input.events.push(egui::Event::PointerMoved(egui::pos2(x, h / 2.0)));
            input.events.push(egui::Event::MouseWheel {
                unit: egui::MouseWheelUnit::Point,
                delta: egui::vec2(0.0, -scroll / 4.0),
                modifiers: egui::Modifiers::NONE,
                phase: egui::TouchPhase::Move,
            });
        }
        if i == 10 {
            window = Some((Instant::now(), crate::media_client::debug_repaints(), helper_cpu()));
        }
        let before_ui = mb();
        let output = ctx.run_ui(input, |ui| app.draw(ui));
        let after_ui = mb();
        let t = Instant::now();
        let prims = ctx.tessellate(output.shapes, output.pixels_per_point);
        let mut target = BufferMutRef::new(&mut buf, pw, ph);
        renderer.render(&mut target, &prims, &output.textures_delta, output.pixels_per_point);
        raster.push(t.elapsed());
        if std::env::var_os("SB_MEM_TRACE").is_some() {
            eprintln!("frame {i}: {before_ui} MB -> ui {after_ui} MB -> raster {} MB, helpers {:?}", mb(), crate::media_client::debug_helpers());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    if let (Some((t0, p0)), Some(ed)) = (play_from, &app.editor) {
        eprintln!(
            "playback: {:.0} ms of wall time advanced the playhead {:.0} ms (playing: {})",
            t0.elapsed().as_secs_f64() * 1e3,
            ed.playback.out_ms - p0,
            ed.playback.playing
        );
    }
    eprintln!("memory: {} MB private before the first frame, {} MB after (caching {caching})", base_mb, mb());
    if std::env::var_os("SB_MEM_TRACE").is_some() {
        // (pid, private MB, CPU ms) per media helper started; None = exited.
        eprintln!("media helpers: {:?}", crate::media_client::debug_helpers());
        if let Some((t0, r0, c0)) = window {
            let secs = t0.elapsed().as_secs_f64();
            eprintln!(
                "from frame 10: {:.1} repaints/s from helper events, helper CPU {:.1}% of one core (playing: {})",
                (crate::media_client::debug_repaints() - r0) as f64 / secs,
                helper_cpu().saturating_sub(c0) as f64 / (secs * 10.0),
                app.editor.as_ref().is_some_and(|e| e.playback.playing)
            );
        }
    }
    drop(app);
    let _ = std::fs::remove_dir_all(&store_dir);
    raster.sort();
    eprintln!(
        "{scenario} {w}x{h}@{scale}: tessellate+raster median {:.1} ms, max {:.1} ms",
        raster[raster.len() / 2].as_secs_f64() * 1e3,
        raster.last().unwrap().as_secs_f64() * 1e3
    );
    let file = std::fs::File::create(out)?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(file), pw as u32, ph as u32);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut writer = enc.write_header()?;
    let bytes: Vec<u8> = buf.iter().flat_map(|p| [p[0], p[1], p[2], 255]).collect();
    writer.write_image_data(&bytes)?;
    Ok(())
}
