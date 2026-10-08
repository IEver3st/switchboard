//! Clip and montage editor, matching the old app's editor: header with
//! project actions, preview, transport, timeline, and an inspector.

pub mod playback;
mod inspector;
mod preview;
pub mod state;
mod timeline;
mod waves;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use egui::{Align, CornerRadius, Frame, Layout, Margin, RichText, Sense, Stroke, Ui, vec2};
use switchboard_media::MediaInfo;
use switchboard_project::{Canvas, Project, now_ms};

use super::library::duration_label;
use super::theme::*;
use super::widgets::{Kind, button, combo, icon, icon_button};
use super::{App, Page};
use crate::protocol::Request;
use playback::Playback;
use state::EditState;

#[derive(Clone, Copy, PartialEq)]
pub enum Tab {
    Edit,
    Audio,
    Music,
}

#[derive(Clone, PartialEq)]
pub enum SaveState {
    Saved,
    Pending,
    Failed(String),
}

pub struct Editor {
    pub state: EditState,
    pub playback: Playback,
    /// Clip id (file name) to path, for every clip the project uses.
    pub paths: HashMap<String, PathBuf>,
    pub infos: HashMap<String, MediaInfo>,
    pub waveforms: HashMap<String, Arc<Vec<Vec<f32>>>>,
    waves: waves::Waves,
    /// Timeline zoom (1 = fit) and left edge of the visible range, in ms.
    pub zoom: f32,
    pub view_start: f64,
    pub inspector: bool,
    pub tab: Tab,
    pub show_audio: bool,
    pub save: SaveState,
    pub name_edit: Option<String>,
    pub confirm_discard: bool,
    pub fullscreen: bool,
    pub selected_track: usize,
    pub selected_overlay: Option<String>,
    preview: preview::PreviewCache,
    pub drag: Option<timeline::Drag>,
    /// While trimming: grabbed edge x minus the press x, and the playhead
    /// position edges snap to.
    pub grab_dx: f32,
    pub snap_at: f64,
    /// Library thumbnails and titles for the clips in the project (set each frame).
    pub thumbs: HashMap<String, egui::TextureId>,
    pub clip_titles: HashMap<String, String>,
    /// "Add clips" dialog: search text and chosen clip files.
    pub adding: Option<(String, Vec<String>)>,
}

impl Editor {
    pub fn new(project: Project, paths: HashMap<String, PathBuf>, ctx: &egui::Context) -> Editor {
        let mut e = Editor {
            state: EditState::new(project),
            playback: Playback::new(ctx),
            paths,
            infos: HashMap::new(),
            waveforms: HashMap::new(),
            waves: waves::Waves::new(ctx),
            zoom: 1.0,
            view_start: 0.0,
            inspector: true,
            tab: Tab::Audio,
            show_audio: true,
            save: SaveState::Saved,
            name_edit: None,
            confirm_discard: false,
            fullscreen: false,
            selected_track: 0,
            selected_overlay: None,
            preview: Default::default(),
            drag: None,
            grab_dx: 0.0,
            snap_at: 0.0,
            thumbs: HashMap::new(),
            clip_titles: HashMap::new(),
            adding: None,
        };
        let ids: Vec<String> = e.state.project.segments.iter().map(|s| s.clip_id.clone()).collect();
        for id in ids {
            if let Some(p) = e.paths.get(&id).cloned()
                && let Some(info) = e.playback.ensure_info(&id, &p)
            {
                e.infos.insert(id, info);
            }
        }
        let project = e.state.project.clone();
        let paths = e.paths.clone();
        e.playback.seek(&project, &paths, 0.0, true);
        e
    }

    pub fn project(&self) -> &Project {
        &self.state.project
    }

    /// The clip whose source facts the inspector shows: the selected segment's.
    pub fn selected_info(&self) -> Option<&MediaInfo> {
        let s = self.state.project.segments.get(self.state.selected)?;
        self.infos.get(&s.clip_id)
    }

    fn poll_waveforms(&mut self) {
        self.waves.poll(&self.state.project, &self.paths, self.state.selected, &mut self.waveforms);
    }

    pub fn seek(&mut self, t: f64, exact: bool) {
        let project = self.state.project.clone();
        self.playback.seek(&project, &self.paths, t, exact);
    }

    pub fn toggle_play(&mut self) {
        let project = self.state.project.clone();
        if self.playback.playing {
            self.playback.pause();
        } else {
            self.playback.play(&project, &self.paths);
        }
    }

    /// After an edit, keep the playhead inside the project and on the right frame.
    pub fn after_edit(&mut self) {
        let t = self.playback.out_ms.min(self.state.project.duration_ms as f64);
        self.seek(t, true);
    }
}

impl App {
    /// Opens a clip for editing, resuming its draft if there is one.
    pub(super) fn open_editor(&mut self, path: &std::path::Path) {
        let Some(clip) = self.lib.clips.iter().find(|c| c.path == path) else { return };
        let project = match self.store.find_for_clip(&clip.file_name) {
            Some(p) => p.clone(),
            None => {
                let levels = self.default_levels(clip);
                Project::for_clip(&clip.file_name, &clip.title, clip.duration_ms().max(100), levels, now_ms())
            }
        };
        self.open_project(project);
    }

    /// Track levels a new edit starts with, from Settings, by track role.
    pub(super) fn default_levels(&self, clip: &super::library::Clip) -> Option<Vec<u8>> {
        let d = self.state.as_ref()?.settings.default_levels;
        let tracks = clip.info.map(|i| i.audio_tracks).unwrap_or(0);
        if tracks == 0 || d == [100, 100, 100] {
            return None;
        }
        // Switchboard clips order tracks Game, Chat, Microphone.
        Some((0..tracks).map(|t| d.get(t).copied().unwrap_or(100)).collect())
    }

    /// Opens a draft, kept project or new montage in the editor.
    pub(super) fn open_project(&mut self, project: Project) {
        let paths: HashMap<String, PathBuf> = project
            .segments
            .iter()
            .filter_map(|s| self.lib.find(&s.clip_id).map(|c| (s.clip_id.clone(), c.path.clone())))
            .collect();
        // Opening creates the draft, as in the old app.
        let _ = self.store.save(project.clone(), now_ms());
        self.editor = Some(Editor::new(project, paths, &self.ctx));
        self.page = Page::Editor;
        self.popover = false;
    }

    pub(super) fn close_editor(&mut self) {
        if let Some(e) = &mut self.editor {
            e.playback.pause();
            let _ = self.store.save(e.state.project.clone(), now_ms());
        }
        self.editor = None;
        self.page = Page::Clips;
    }

    pub(super) fn editor_page(&mut self, ui: &mut Ui) {
        let ctx = ui.ctx().clone();
        let Some(mut ed) = self.editor.take() else {
            self.page = Page::Clips;
            return;
        };
        ed.poll_waveforms();
        // Library thumbnails and titles for the timeline and inspector.
        for s in ed.state.project.segments.clone() {
            if let Some(path) = ed.paths.get(&s.clip_id).cloned() {
                if let super::library::Thumb::Ready(tex) = self.lib.thumb(&path) {
                    ed.thumbs.insert(s.clip_id.clone(), tex.id());
                }
                if let Some(c) = self.lib.find(&s.clip_id) {
                    ed.clip_titles.insert(s.clip_id.clone(), c.title.clone());
                }
            }
        }
        let project = ed.state.project.clone();
        ed.playback.tick(&project, &ed.paths);
        self.editor_keys(&ctx, &mut ed);
        let mut close = std::mem::take(&mut self.close_requested);

        if !ed.fullscreen {
            Frame::new().inner_margin(Margin { left: 16, right: 16, top: 4, bottom: 6 }).show(ui, |ui| {
                close = self.editor_header(ui, &mut ed);
            });
        }
        let inspector_w = if ed.inspector && !ed.fullscreen { 320.0 } else { 0.0 };
        let avail = ui.available_rect_before_wrap();
        let timeline_h = if ed.fullscreen { 0.0 } else { timeline::height(&ed) };
        let transport_h = 48.0;
        let main = egui::Rect::from_min_max(avail.min, egui::pos2(avail.max.x - inspector_w, avail.max.y));
        let preview_rect = egui::Rect::from_min_max(main.min + vec2(16.0, 0.0), egui::pos2(main.max.x - 16.0, main.max.y - timeline_h - transport_h));
        let transport_rect = egui::Rect::from_min_size(egui::pos2(main.min.x + 16.0, preview_rect.bottom()), vec2(main.width() - 32.0, transport_h));
        let timeline_rect = egui::Rect::from_min_max(egui::pos2(main.min.x + 16.0, transport_rect.bottom()), egui::pos2(main.max.x - 16.0, main.max.y - 12.0));

        ed.preview_ui(ui, preview_rect);
        ui.scope_builder(egui::UiBuilder::new().max_rect(transport_rect).layout(Layout::left_to_right(Align::Center)), |ui| {
            transport(ui, &mut ed);
        });
        if !ed.fullscreen {
            ed.timeline_ui(ui, timeline_rect);
        }
        if inspector_w > 0.0 {
            let r = egui::Rect::from_min_max(egui::pos2(avail.max.x - inspector_w, avail.min.y), avail.max);
            ui.painter().rect_filled(r, CornerRadius::ZERO, SURFACE_1);
            ui.scope_builder(egui::UiBuilder::new().max_rect(r.shrink2(vec2(16.0, 12.0))), |ui| {
                self.inspector_ui(ui, &mut ed);
            });
        }
        ui.allocate_rect(avail, Sense::hover());

        // Autosave shortly after edits.
        if ed.state.should_save() {
            ed.state.dirty_since = None;
            ed.save = match self.store.save(ed.state.project.clone(), now_ms()) {
                Ok(()) => SaveState::Saved,
                Err(e) => SaveState::Failed(format!("{e:#}")),
            };
        } else if ed.state.dirty_since.is_some() {
            ed.save = SaveState::Pending;
            ctx.request_repaint_after(state::AUTOSAVE_DELAY);
        }
        self.discard_dialog(&ctx, &mut ed, &mut close);
        self.add_clips_dialog(&ctx, &mut ed);
        if close {
            self.editor = Some(ed);
            self.close_editor();
        } else {
            self.editor = Some(ed);
        }
    }

    /// Returns true when the editor should close.
    fn editor_header(&mut self, ui: &mut Ui, ed: &mut Editor) -> bool {
        let mut close = false;
        ui.horizontal(|ui| {
            ui.set_height(40.0);
            if button(ui, Kind::Ghost, Some(icon::BACK), "Back to clips", true).on_hover_text("Esc").clicked() {
                close = true;
            }
            ui.add_space(10.0);
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                match &mut ed.name_edit {
                    Some(text) => {
                        let r = ui.add(egui::TextEdit::singleline(text).font(font_strong(15.0)).desired_width(320.0).char_limit(120));
                        r.request_focus();
                        if r.lost_focus() {
                            let t = text.clone();
                            ed.state.set_name(&t);
                            ed.name_edit = None;
                        }
                    }
                    None => {
                        let r = ui.add(egui::Label::new(RichText::new(&ed.state.project.name).font(font_strong(15.0)).color(TEXT)).sense(Sense::click()));
                        if r.on_hover_text("Rename").clicked() {
                            ed.name_edit = Some(ed.state.project.name.clone());
                        }
                    }
                }
                let (text, color) = match &ed.save {
                    SaveState::Saved => ("Saved".to_string(), TEXT_MUTED),
                    SaveState::Pending => ("Saving\u{2026}".to_string(), TEXT_MUTED),
                    SaveState::Failed(e) => (format!("Not saved: {e}"), DANGER),
                };
                ui.label(RichText::new(text).font(font(11.5)).color(color));
            });
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.add_space(super::chrome::BUTTONS_W - 8.0);
                if icon_button(ui, icon::DELETE, "Discard draft", false).clicked() {
                    ed.confirm_discard = true;
                }
                if button(ui, Kind::Primary, Some(icon::SHARE), "Share", true).clicked() {
                    let mut p = ed.state.project.clone();
                    p.refresh();
                    self.open_share_project(p);
                }
                if icon_button(ui, icon::INSPECTOR, "Inspector", ed.inspector).clicked() {
                    ed.inspector = !ed.inspector;
                }
                let mut canvas = ed.state.project.canvas_size;
                combo("canvas", canvas.label(), 150.0).show_ui(ui, |ui| {
                    for c in Canvas::ALL {
                        ui.selectable_value(&mut canvas, c, c.label());
                    }
                });
                if canvas != ed.state.project.canvas_size {
                    ed.state.set_canvas(canvas);
                }
                ui.label(RichText::new("Canvas").font(font(12.5)).color(TEXT_DESCRIPTION));
                // Favorite the source clip (single-clip edits).
                if let Some(src) = ed.state.project.source_clip_id.clone()
                    && let Some(clip) = self.lib.find(&src)
                {
                    let fav = clip.favorite;
                    let glyph = if fav { icon::STAR_FILLED } else { icon::STAR };
                    if icon_button(ui, glyph, if fav { "Remove from favorites" } else { "Add to favorites" }, fav).clicked() {
                        self.link.send(Request::UpdateClip { file: src, favorite: Some(!fav), title: None });
                    }
                }
                let kept = ed.state.project.is_kept();
                let label = if kept { "Kept" } else { "Keep project" };
                if button(ui, if kept { Kind::Secondary } else { Kind::Ghost }, Some(icon::BOOKMARK), label, true)
                    .on_hover_text("Kept projects stay until you discard them. Drafts clear 3 hours after their last save.")
                    .clicked()
                {
                    ed.state.change("keep", |p| p.kept = Some(!kept));
                }
            });
        });
        close
    }

    fn editor_keys(&mut self, ctx: &egui::Context, ed: &mut Editor) {
        if ctx.egui_wants_keyboard_input() || self.share.is_some() || ed.confirm_discard {
            return;
        }
        let fps = ed.selected_info().map(|i| i.fps).filter(|f| *f > 0.0).unwrap_or(60.0);
        let frame = 1000.0 / fps;
        let (alt_left, alt_right) = ctx.input_mut(|i| {
            (i.consume_key(egui::Modifiers::ALT, egui::Key::ArrowLeft), i.consume_key(egui::Modifiers::ALT, egui::Key::ArrowRight))
        });
        if alt_left || alt_right {
            ed.state.move_segment(ed.state.selected, if alt_left { -1 } else { 1 });
            ed.after_edit();
        }
        let (set_in, set_out) = ctx.input_mut(|i| {
            (i.consume_key(egui::Modifiers::NONE, egui::Key::I), i.consume_key(egui::Modifiers::NONE, egui::Key::O))
        });
        if set_in || set_out {
            let (i, src) = (ed.playback.segment, ed.playback.source_ms);
            if i < ed.state.project.segments.len() {
                ed.state.selected = i;
                let starts = ed.state.project.segment_starts();
                if set_in {
                    ed.state.set_trim_start(i, src);
                    ed.seek(starts[i] as f64, true);
                } else {
                    ed.state.set_trim_end(i, src);
                    let s = &ed.state.project.segments[i];
                    let end = (starts[i] + s.duration_ms()) as f64;
                    ed.seek((end - frame).max(starts[i] as f64), true);
                }
            }
        }
        let (space, s, del, undo, redo, home, end, left, right, esc, shift) = ctx.input_mut(|i| {
            (
                i.consume_key(egui::Modifiers::NONE, egui::Key::Space),
                i.consume_key(egui::Modifiers::NONE, egui::Key::S),
                i.consume_key(egui::Modifiers::NONE, egui::Key::Delete),
                i.consume_key(egui::Modifiers::COMMAND, egui::Key::Z),
                i.consume_key(egui::Modifiers::COMMAND | egui::Modifiers::SHIFT, egui::Key::Z)
                    || i.consume_key(egui::Modifiers::COMMAND, egui::Key::Y),
                i.consume_key(egui::Modifiers::NONE, egui::Key::Home),
                i.consume_key(egui::Modifiers::NONE, egui::Key::End),
                i.key_pressed(egui::Key::ArrowLeft),
                i.key_pressed(egui::Key::ArrowRight),
                i.consume_key(egui::Modifiers::NONE, egui::Key::Escape),
                i.modifiers.shift,
            )
        });
        if space {
            ed.toggle_play();
        }
        if s {
            let (i, src) = (ed.playback.segment, ed.playback.source_ms);
            if ed.state.split(i, src) {
                ed.after_edit();
            }
        }
        if del {
            ed.state.remove(ed.state.selected);
            ed.after_edit();
        }
        if undo {
            ed.state.undo();
            ed.after_edit();
        }
        if redo {
            ed.state.redo();
            ed.after_edit();
        }
        if home {
            ed.seek(0.0, true);
        }
        if end {
            ed.seek(ed.state.project.duration_ms as f64, true);
        }
        let step = if shift { 1000.0 } else { frame };
        if left {
            ed.seek(ed.playback.out_ms - step, true);
        }
        if right {
            ed.seek(ed.playback.out_ms + step, true);
        }
        if esc {
            if ed.fullscreen {
                ed.fullscreen = false;
            } else {
                self.close_requested = true;
            }
        }
    }

    /// Searchable multi-select of library clips, inserted after the selected segment.
    fn add_clips_dialog(&mut self, ctx: &egui::Context, ed: &mut Editor) {
        let Some((mut query, mut chosen)) = ed.adding.take() else { return };
        let mut done = false;
        let mut insert = false;
        let modal = egui::Modal::new(egui::Id::new("add-clips"))
            .frame(Frame::new().fill(SURFACE_1).corner_radius(CornerRadius::same(R_OVERLAY)).inner_margin(Margin::same(20)))
            .show(ctx, |ui| {
                ui.set_width(460.0);
                // Inputs need contrast against the dialog surface.
                ui.visuals_mut().extreme_bg_color = INTERACTIVE;
                ui.visuals_mut().widgets.inactive.bg_stroke = Stroke::new(1.0, BORDER_STRONG);
                ui.label(RichText::new("Add clips").font(font_strong(15.0)).color(TEXT));
                ui.add_space(8.0);
                ui.add(egui::TextEdit::singleline(&mut query).hint_text("Search clips").desired_width(f32::INFINITY));
                ui.add_space(6.0);
                let q = query.to_lowercase();
                egui::ScrollArea::vertical().max_height(320.0).show(ui, |ui| {
                    for c in self.lib.clips.iter().filter(|c| q.is_empty() || c.title.to_lowercase().contains(&q)) {
                        let mut on = chosen.contains(&c.file_name);
                        let label = format!("{}  \u{b7}  {}", c.title, c.seconds().map(duration_label).unwrap_or_default());
                        if ui.checkbox(&mut on, label).changed() {
                            if on {
                                chosen.push(c.file_name.clone());
                            } else {
                                chosen.retain(|f| f != &c.file_name);
                            }
                        }
                    }
                });
                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    let label = if chosen.is_empty() { "Add".to_string() } else { format!("Add {}", chosen.len()) };
                    if button(ui, Kind::Primary, Some(icon::ADD), &label, !chosen.is_empty()).clicked() {
                        insert = true;
                        done = true;
                    }
                    if button(ui, Kind::Secondary, None, "Cancel", true).clicked() {
                        done = true;
                    }
                });
            });
        if insert {
            self.insert_clips(ed, &chosen);
        }
        if !(done || modal.should_close()) {
            ed.adding = Some((query, chosen));
        }
    }

    /// Inserts library clips (by file name) after the selected segment.
    pub(super) fn insert_clips(&self, ed: &mut Editor, files: &[String]) {
        let mut segs = Vec::new();
        for f in files {
            if let Some(c) = self.lib.find(f) {
                ed.paths.insert(f.clone(), c.path.clone());
                segs.push(switchboard_project::Segment::new(f, c.duration_ms().max(100), self.default_levels(c)));
            }
        }
        for f in files {
            if let Some(p) = ed.paths.get(f).cloned()
                && let Some(info) = ed.playback.ensure_info(f, &p)
            {
                ed.infos.insert(f.clone(), info);
            }
        }
        let at = ed.state.selected;
        ed.state.insert_segments(at, segs);
        ed.after_edit();
    }

    fn discard_dialog(&mut self, ctx: &egui::Context, ed: &mut Editor, close: &mut bool) {
        if !ed.confirm_discard {
            return;
        }
        let kept = ed.state.project.is_kept();
        let modal = egui::Modal::new(egui::Id::new("discard-draft"))
            .frame(Frame::new().fill(SURFACE_1).corner_radius(CornerRadius::same(R_OVERLAY)).inner_margin(Margin::same(20)))
            .show(ctx, |ui| {
                ui.set_width(380.0);
                let title = if kept { "Discard this kept project?" } else { "Discard this draft?" };
                ui.label(RichText::new(title).font(font_strong(15.0)).color(TEXT));
                ui.label(RichText::new("Your edits can't be recovered. The original clip isn't affected.").font(font(12.5)).color(TEXT_DESCRIPTION));
                ui.add_space(14.0);
                ui.horizontal(|ui| {
                    if button(ui, Kind::Danger, Some(icon::DELETE), "Discard", true).clicked() {
                        ed.playback.pause();
                        let _ = self.store.delete(&ed.state.project.id);
                        ed.confirm_discard = false;
                        *close = true;
                    }
                    let cancel = button(ui, Kind::Secondary, None, "Cancel", true);
                    if cancel.clicked() {
                        ed.confirm_discard = false;
                    }
                    if ui.memory(|m| m.focused().is_none()) {
                        cancel.request_focus();
                    }
                });
            });
        if modal.should_close() {
            ed.confirm_discard = false;
        }
    }
}

/// Undo/redo and segment tools, play controls and time, preview volume and zoom.
fn transport(ui: &mut Ui, ed: &mut Editor) {
    let project = ed.state.project.clone();
    // Below this width (1080 x 720 windows) labels shorten and the volume
    // fader goes, so the centred play group never overlaps either side.
    let narrow = ui.max_rect().width() < 900.0;
    if icon_button(ui, icon::UNDO, "Undo (Ctrl+Z)", false).clicked() && ed.state.can_undo() {
        ed.state.undo();
        ed.after_edit();
    }
    if icon_button(ui, icon::REDO, "Redo (Ctrl+Y)", false).clicked() && ed.state.can_redo() {
        ed.state.redo();
        ed.after_edit();
    }
    let (sep, _) = ui.allocate_exact_size(vec2(9.0, 22.0), Sense::hover());
    ui.painter().vline(sep.center().x, sep.y_range(), Stroke::new(1.0, BORDER));
    if project.is_clip_edit() {
        let clicked = if narrow {
            icon_button(ui, icon::VOLUME, "Audio channels", ed.show_audio).clicked()
        } else {
            button(ui, Kind::Ghost, Some(icon::VOLUME), "Audio channels", true).clicked()
        };
        if clicked {
            ed.show_audio = !ed.show_audio;
        }
    }
    if icon_button(ui, icon::CLIP_EDIT, "Split at playhead (S)", false).clicked() {
        let (i, src) = (ed.playback.segment, ed.playback.source_ms);
        if ed.state.split(i, src) {
            ed.after_edit();
        }
    }
    if icon_button(ui, icon::COPY, "Duplicate segment", false).clicked() {
        ed.state.duplicate(ed.state.selected);
        ed.after_edit();
    }
    if icon_button(ui, icon::DELETE, "Remove segment (Delete)", false).clicked() {
        ed.state.remove(ed.state.selected);
        ed.after_edit();
    }
    if !project.is_clip_edit() && button(ui, Kind::Ghost, Some(icon::ADD), "Add clips", true).clicked() {
        ed.adding = Some((String::new(), Vec::new()));
    }

    // Centre: back to start, play, time.
    let center = ui.max_rect().center().x;
    let play_w = 92.0;
    let used = ui.min_rect().right();
    ui.add_space((center - play_w / 2.0 - 40.0 - used).max(8.0));
    if icon_button(ui, icon::PREVIOUS, "Back to start (Home)", false).clicked() {
        ed.seek(0.0, true);
    }
    let label = if ed.playback.playing { "Pause" } else { "Play" };
    let glyph = if ed.playback.playing { icon::PAUSE } else { icon::PLAY };
    if button(ui, Kind::Primary, Some(glyph), label, true).on_hover_text("Space").clicked() {
        ed.toggle_play();
    }
    let time = if narrow {
        precise(ed.playback.out_ms)
    } else {
        format!("{} / {}", precise(ed.playback.out_ms), precise(project.duration_ms as f64))
    };
    ui.label(RichText::new(time).font(font_mono(12.5)).color(TEXT_SECONDARY));

    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
        if icon_button(ui, icon::ZOOM_IN, "Zoom in", false).clicked() {
            ed.zoom = (ed.zoom * 1.5).min(32.0);
        }
        if button(ui, Kind::Ghost, None, "Fit", true).clicked() {
            ed.zoom = 1.0;
            ed.view_start = 0.0;
        }
        if icon_button(ui, icon::ZOOM_OUT, "Zoom out", false).clicked() {
            ed.zoom = (ed.zoom / 1.5).max(1.0);
        }
        let (sep, _) = ui.allocate_exact_size(vec2(9.0, 22.0), Sense::hover());
        ui.painter().vline(sep.center().x, sep.y_range(), Stroke::new(1.0, BORDER));
        if icon_button(ui, icon::FULLSCREEN, "Fullscreen preview (Esc to exit)", ed.fullscreen).clicked() {
            ed.fullscreen = !ed.fullscreen;
        }
        let mut v = ed.playback.volume;
        let changed = !narrow && super::widgets::fader(ui, &mut v, ACCENT, 96.0, "Preview volume").changed();
        let mut muted = ed.playback.muted;
        if icon_button(ui, if muted { icon::MUTE } else { icon::VOLUME }, "Preview volume", false).clicked() {
            muted = !muted;
        }
        if changed || muted != ed.playback.muted {
            ed.playback.set_volume(v, muted);
        }
    });
}

fn precise(ms: f64) -> String {
    let ms = ms.max(0.0).round() as u64;
    format!("{}:{:02}.{:03}", ms / 60_000, ms / 1000 % 60, ms % 1000)
}

#[allow(dead_code)]
fn _labels() -> String {
    duration_label(0.0)
}
