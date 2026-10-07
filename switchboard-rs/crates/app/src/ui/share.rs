//! Export for sharing. Clip edits export to a temporary share folder with a
//! size preset (10 MB default, as the old app); montages choose a size and
//! save where you pick. Rendering is the export crate's FFmpeg pipeline.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use egui::{Align, CornerRadius, Frame, Layout, Margin, RichText};
use switchboard_export::{ExportHandle, ExportJob, Progress, SizeTarget, export_suffix, share_path};
use switchboard_project::{Project, montage_size_choices, uuid};

use super::App;
use super::library::{Thumb, bytes_label};
use super::theme::*;
use super::widgets::{Kind, button, icon};
use crate::shell;

#[derive(Clone, Copy, PartialEq)]
enum Choice {
    Size(SizeTarget),
    Custom,
}

enum Phase {
    Choose,
    Running,
    Done { path: PathBuf, bytes: u64 },
    Failed(String),
    Cancelled,
}

pub(super) struct Share {
    project: Project,
    choice: Choice,
    custom_mb: String,
    phase: Phase,
    fraction: f32,
    stage: &'static str,
    progress: Arc<Mutex<Vec<Progress>>>,
    handle: Arc<Mutex<Option<ExportHandle>>>,
    copied: bool,
}

impl Share {
    pub fn new(project: Project) -> Share {
        let montage = !project.is_clip_edit();
        Share {
            choice: if montage { Choice::Size(SizeTarget::Original) } else { Choice::Size(SizeTarget::Megabytes(10)) },
            project,
            custom_mb: "100".into(),
            phase: Phase::Choose,
            fraction: 0.0,
            stage: "",
            progress: Arc::new(Mutex::new(Vec::new())),
            handle: Arc::new(Mutex::new(None)),
            copied: false,
        }
    }

    fn running(&self) -> bool {
        matches!(self.phase, Phase::Running)
    }

    /// For review renders: true once the export finished or stopped.
    pub fn settled(&self) -> bool {
        matches!(self.phase, Phase::Done { .. } | Phase::Failed(_) | Phase::Cancelled)
    }

    pub fn project_name(&self) -> &str {
        &self.project.name
    }
}

impl App {
    /// Opens the share dialog for a clip, using its edit draft if one exists.
    pub(super) fn open_share(&mut self, path: &std::path::Path) {
        let Some(clip) = self.lib.clips.iter().find(|c| c.path == path) else { return };
        let project = match self.store.find_for_clip(&clip.file_name) {
            Some(p) => p.clone(),
            None => Project::for_clip(&clip.file_name, &clip.title, clip.duration_ms().max(100), None, switchboard_project::now_ms()),
        };
        self.share = Some(Share::new(project));
    }

    pub(super) fn open_share_project(&mut self, project: Project) {
        self.share = Some(Share::new(project));
    }

    pub(super) fn start_export(&mut self, output: PathBuf, target: SizeTarget) {
        let Some(share) = self.share.as_mut() else { return };
        let Some((ffmpeg, ffprobe)) = switchboard_export::locate_ffmpeg() else {
            share.phase = Phase::Failed("FFmpeg wasn't found. Install FFmpeg or place ffmpeg.exe next to Switchboard.".into());
            return;
        };
        // Resolve every clip the project uses to a file in the library.
        let mut files: BTreeMap<String, PathBuf> = BTreeMap::new();
        for s in &share.project.segments {
            match self.lib.find(&s.clip_id) {
                Some(c) => {
                    files.insert(s.clip_id.clone(), c.path.clone());
                }
                None => {
                    share.phase = Phase::Failed(format!("{} is missing from the clips folder.", s.clip_id));
                    return;
                }
            }
        }
        let music = share.project.music.as_ref().map(|m| {
            let dir = crate::settings::data_dir().join("projects").join("audio");
            std::fs::read_dir(&dir)
                .ok()
                .and_then(|mut it| it.find_map(|e| e.ok().map(|e| e.path()).filter(|p| p.file_stem().is_some_and(|s| s == m.asset.id.as_str()))))
                .unwrap_or_default()
        });
        share.phase = Phase::Running;
        share.fraction = 0.0;
        share.stage = "Preparing";
        let project = share.project.clone();
        let progress = share.progress.clone();
        let handle = share.handle.clone();
        let ctx = self.ctx.clone();
        std::thread::spawn(move || {
            let mut sources = Vec::new();
            for (id, path) in &files {
                match switchboard_export::probe_clip(&ffprobe, id, path) {
                    Ok(p) => sources.push(p.source),
                    Err(e) => {
                        progress.lock().unwrap().push(Progress::Failed { message: format!("Couldn't read {id}: {e:#}") });
                        ctx.request_repaint();
                        return;
                    }
                }
            }
            let job = ExportJob { project, sources, music_path: music.filter(|p| p.is_file()), target, output };
            // A plain copy never encodes, so skip the encoder test for it.
            let encoders = if switchboard_export::needs_encoder(&job) {
                switchboard_export::detect_encoders(&ffmpeg)
            } else {
                switchboard_export::Encoders::default()
            };
            let sink = progress.clone();
            let repaint = ctx.clone();
            let h = switchboard_export::start(
                job,
                encoders,
                ffmpeg,
                Box::new(move |p| {
                    sink.lock().unwrap().push(p);
                    repaint.request_repaint();
                }),
            );
            *handle.lock().unwrap() = Some(h);
        });
    }

    pub(super) fn share_dialog(&mut self, ctx: &egui::Context) {
        // Thumbnail of the first clip for the drag tile.
        let first = self.share.as_ref().and_then(|s| s.project.segments.first()).map(|s| s.clip_id.clone());
        let first_path = first.and_then(|id| self.lib.find(&id).map(|c| c.path.clone()));
        let thumb = first_path.and_then(|p| match self.lib.thumb(&p) {
            Thumb::Ready(t) => Some(t.id()),
            _ => None,
        });
        let mut drag: Option<PathBuf> = None;
        let Some(share) = self.share.as_mut() else { return };
        for p in std::mem::take(&mut *share.progress.lock().unwrap()) {
            match p {
                Progress::Preparing => share.stage = "Preparing",
                Progress::Rendering { fraction } => {
                    share.stage = "Compressing";
                    share.fraction = fraction;
                }
                Progress::Finalizing => share.stage = "Finalizing",
                Progress::Done { path, bytes } => share.phase = Phase::Done { path, bytes },
                Progress::Failed { message } => share.phase = Phase::Failed(message),
                Progress::Cancelled => share.phase = Phase::Cancelled,
            }
        }
        let montage = !share.project.is_clip_edit();
        let duration = share.project.duration_ms;
        let name = share.project.name.clone();
        let mut close = false;
        let mut start: Option<(PathBuf, SizeTarget)> = None;
        let modal = egui::Modal::new(egui::Id::new("share"))
            .frame(
                Frame::new()
                    .fill(SURFACE_1)
                    .corner_radius(CornerRadius::same(R_OVERLAY))
                    .inner_margin(Margin::same(20))
                    .shadow(ctx.global_style().visuals.popup_shadow),
            )
            .show(ctx, |ui| {
                ui.set_width(440.0);
                let title = if montage { "Export montage" } else { "Export for sharing" };
                ui.label(RichText::new(title).font(font_strong(16.0)).color(TEXT));
                ui.add(egui::Label::new(RichText::new(&name).font(font(12.5)).color(TEXT_DESCRIPTION)).truncate());
                ui.add_space(14.0);
                match &share.phase {
                    Phase::Choose => {
                        let options: Vec<(Choice, String, String)> = if montage {
                            let [a, b, c] = montage_size_choices(duration);
                            vec![
                                (Choice::Size(SizeTarget::Megabytes(a)), "Compact".into(), format!("About {a} MB")),
                                (Choice::Size(SizeTarget::Megabytes(b)), "Balanced".into(), format!("About {b} MB")),
                                (Choice::Size(SizeTarget::Megabytes(c)), "More detail".into(), format!("About {c} MB")),
                                (Choice::Size(SizeTarget::Original), "Quality".into(), "No size limit".into()),
                                (Choice::Custom, "Custom size".into(), "Choose a limit in MB".into()),
                            ]
                        } else {
                            vec![
                                (Choice::Size(SizeTarget::Megabytes(10)), "10 MB".into(), "Fits Discord's free upload limit".into()),
                                (Choice::Size(SizeTarget::Megabytes(25)), "25 MB".into(), "Sharper, still quick to upload".into()),
                                (Choice::Size(SizeTarget::Megabytes(50)), "50 MB".into(), "Sharpest with a size limit".into()),
                                (Choice::Size(SizeTarget::Original), "Original".into(), "Full quality, no size limit".into()),
                            ]
                        };
                        for (choice, label, desc) in options {
                            let selected = share.choice == choice;
                            let r = option_row(ui, selected, &label, &desc);
                            if r.clicked() {
                                share.choice = choice;
                            }
                        }
                        if share.choice == Choice::Custom {
                            ui.horizontal(|ui| {
                                ui.add(egui::TextEdit::singleline(&mut share.custom_mb).desired_width(90.0).char_limit(6));
                                ui.label(RichText::new("MB (5 to 100,000)").font(font(12.5)).color(TEXT_DESCRIPTION));
                            });
                        }
                        ui.add_space(14.0);
                        let target = match share.choice {
                            Choice::Size(t) => Some(t),
                            Choice::Custom => share.custom_mb.trim().parse::<u64>().ok().filter(|v| (5..=100_000).contains(v)).map(SizeTarget::Megabytes),
                        };
                        ui.horizontal(|ui| {
                            let label = if montage { "Export\u{2026}" } else { "Export" };
                            if button(ui, Kind::Primary, Some(icon::SHARE), label, target.is_some()).clicked() {
                                let target = target.unwrap();
                                if montage {
                                    if let Some(path) = pick_save_path(&name) {
                                        start = Some((path, target));
                                    }
                                } else {
                                    let id = uuid();
                                    let suffix = export_suffix(&share.project, target);
                                    start = Some((share_path(&id, &name, &suffix), target));
                                }
                            }
                            if button(ui, Kind::Secondary, None, "Cancel", true).clicked() {
                                close = true;
                            }
                        });
                    }
                    Phase::Running => {
                        ui.label(RichText::new(format!("{}\u{2026} {:.0}%", share.stage, share.fraction * 100.0)).font(font(13.0)).color(TEXT));
                        ui.add_space(8.0);
                        let (r, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 6.0), egui::Sense::hover());
                        super::widgets::level_bar(ui, r, share.fraction.powi(2), ACCENT);
                        ui.add_space(14.0);
                        if button(ui, Kind::Secondary, None, "Cancel export", true).clicked() {
                            if let Some(h) = share.handle.lock().unwrap().as_ref() {
                                h.cancel();
                            }
                        }
                    }
                    Phase::Done { path, bytes } => {
                        let file = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                        ui.label(RichText::new("Ready to share").font(font_strong(13.5)).color(SUCCESS));
                        if !montage {
                            ui.label(
                                RichText::new("This copy is temporary and clears when Switchboard closes.")
                                    .font(font(12.0))
                                    .color(TEXT_MUTED),
                            );
                        }
                        ui.add_space(12.0);
                        if drag_tile(ui, thumb, &file, *bytes).drag_started() {
                            drag = Some(path.clone());
                        }
                        ui.add_space(14.0);
                        let path = path.clone();
                        ui.horizontal(|ui| {
                            let copy_label = if share.copied { "Copied" } else { "Copy file" };
                            if button(ui, Kind::Primary, Some(icon::COPY), copy_label, true).on_hover_text("Paste into Discord or a folder").clicked() {
                                share.copied = shell::copy_file(&path).is_ok();
                            }
                            if button(ui, Kind::Secondary, Some(icon::FOLDER), "Show in folder", true).clicked() {
                                shell::reveal(&path);
                            }
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if button(ui, Kind::Ghost, None, "Done", true).clicked() {
                                    close = true;
                                }
                            });
                        });
                    }
                    Phase::Failed(msg) => {
                        ui.label(RichText::new("The export didn't finish").font(font_strong(13.5)).color(DANGER));
                        ui.label(RichText::new(msg).font(font(12.5)).color(TEXT_SECONDARY));
                        ui.add_space(14.0);
                        ui.horizontal(|ui| {
                            if button(ui, Kind::Secondary, None, "Try again", true).clicked() {
                                share.phase = Phase::Choose;
                            }
                            if button(ui, Kind::Ghost, None, "Close", true).clicked() {
                                close = true;
                            }
                        });
                    }
                    Phase::Cancelled => {
                        ui.label(RichText::new("Export cancelled. Nothing was saved.").font(font(13.0)).color(TEXT_SECONDARY));
                        ui.add_space(14.0);
                        ui.horizontal(|ui| {
                            if button(ui, Kind::Secondary, None, "Start over", true).clicked() {
                                share.phase = Phase::Choose;
                            }
                            if button(ui, Kind::Ghost, None, "Close", true).clicked() {
                                close = true;
                            }
                        });
                    }
                }
            });
        // A running export can't be dismissed by clicking outside.
        let running = share.running();
        if (close || (modal.should_close() && !running)) && !running {
            self.share = None;
        }
        if let Some((path, target)) = start {
            self.start_export(path, target);
        }
        if let Some(path) = drag {
            if let Err(e) = shell::drag_file(&path) {
                self.notice = Some(super::Notice { ok: false, text: format!("Couldn't start the drag: {e:#}"), path: None, undo: None, at: std::time::Instant::now() });
            }
            self.chrome.release_pointer();
        }
    }
}

/// The exported file as a drag source: drop it into Discord, a browser or a folder.
fn drag_tile(ui: &mut egui::Ui, thumb: Option<egui::TextureId>, file: &str, bytes: u64) -> egui::Response {
    let (rect, r) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 84.0), egui::Sense::drag());
    let r = r.on_hover_cursor(egui::CursorIcon::Grab);
    r.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Other, true, format!("{file}, drag into another app")));
    let p = ui.painter();
    let hot = r.hovered() || r.dragged();
    p.rect_filled(rect, CornerRadius::same(R_OVERLAY), if hot { INTERACTIVE } else { SURFACE_2 });
    p.rect_stroke(
        rect,
        CornerRadius::same(R_OVERLAY),
        egui::Stroke::new(1.0, if hot { ACCENT } else { BORDER_STRONG }),
        egui::StrokeKind::Inside,
    );
    let image = egui::Rect::from_min_size(rect.min + egui::vec2(10.0, 10.0), egui::vec2(114.0, 64.0));
    match thumb {
        Some(t) => {
            let uv = egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0));
            p.image(t, image, uv, egui::Color32::WHITE);
        }
        None => {
            p.rect_filled(image, CornerRadius::same(R_CONTROL), SURFACE_1);
        }
    }
    let x = image.right() + 14.0;
    let w = rect.right() - x - 12.0;
    let name = p.layout(file.to_string(), font_strong(13.0), TEXT, w);
    let rows = name.rows.len().min(2) as f32;
    p.galley(egui::pos2(x, rect.top() + 14.0), name, TEXT);
    let y = rect.top() + 16.0 + 17.0 * rows;
    p.text(egui::pos2(x, y), egui::Align2::LEFT_TOP, bytes_label(bytes), font(12.0), TEXT_DESCRIPTION);
    p.text(
        egui::pos2(x, rect.bottom() - 12.0),
        egui::Align2::LEFT_BOTTOM,
        "Drag into Discord or a folder",
        font(12.0),
        if hot { TEXT } else { TEXT_SECONDARY },
    );
    if r.has_focus() {
        p.rect_stroke(rect.expand(2.0), CornerRadius::same(R_OVERLAY + 2), egui::Stroke::new(2.0, ACCENT_HOVER), egui::StrokeKind::Outside);
    }
    r
}

/// Save dialog for a montage, starting in Videos with the project name.
fn pick_save_path(name: &str) -> Option<PathBuf> {
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FOS_OVERWRITEPROMPT, FileSaveDialog, IFileSaveDialog, SIGDN_FILESYSPATH};
    use windows::core::{HSTRING, w};
    let file = format!("{}.mp4", switchboard_export::sanitize_file_base(name));
    // The dialog is modal; run it on its own STA thread and wait.
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        (|| -> windows::core::Result<PathBuf> {
            let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)?;
            dialog.SetOptions(FOS_OVERWRITEPROMPT)?;
            dialog.SetFileName(&HSTRING::from(file.as_str()))?;
            dialog.SetDefaultExtension(w!("mp4"))?;
            let filters = [COMDLG_FILTERSPEC { pszName: w!("MP4 video"), pszSpec: w!("*.mp4") }];
            dialog.SetFileTypes(&filters)?;
            dialog.SetTitle(w!("Save montage"))?;
            dialog.Show(None)?;
            let item = dialog.GetResult()?;
            let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
            let path = PathBuf::from(name.to_string().unwrap_or_default());
            CoTaskMemFree(Some(name.0 as *const _));
            Ok(path)
        })()
        .ok()
    })
    .join()
    .ok()
    .flatten()
}


/// A radio-style choice with a title and a description.
fn option_row(ui: &mut egui::Ui, selected: bool, label: &str, desc: &str) -> egui::Response {
    let (rect, r) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 46.0), egui::Sense::click());
    let a11y = format!("{label}, {desc}");
    r.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::RadioButton, true, selected, &a11y));
    let p = ui.painter();
    let fill = if selected {
        ACCENT.linear_multiply(0.16)
    } else if r.hovered() {
        INTERACTIVE
    } else {
        SURFACE_2
    };
    p.rect_filled(rect, CornerRadius::same(R_CONTROL + 2), fill);
    if selected {
        p.rect_stroke(rect, CornerRadius::same(R_CONTROL + 2), egui::Stroke::new(1.0, ACCENT), egui::StrokeKind::Inside);
    }
    let c = egui::pos2(rect.left() + 20.0, rect.center().y);
    p.circle_stroke(c, 7.0, egui::Stroke::new(1.5, if selected { ACCENT } else { TEXT_MUTED }));
    if selected {
        p.circle_filled(c, 3.5, ACCENT_HOVER);
    }
    p.text(egui::pos2(rect.left() + 38.0, rect.top() + 14.0), egui::Align2::LEFT_CENTER, label, font_strong(13.0), TEXT);
    p.text(egui::pos2(rect.left() + 38.0, rect.top() + 32.0), egui::Align2::LEFT_CENTER, desc, font(12.0), TEXT_DESCRIPTION);
    super::widgets::focus_ring(ui, &r, R_CONTROL + 2);
    ui.add_space(4.0);
    r
}
