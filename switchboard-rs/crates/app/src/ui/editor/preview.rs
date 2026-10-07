//! Preview: the current frame on the output canvas with framing, picture
//! adjustments, flip, title and overlays applied the same way export does.
//!
//! Sharp and cheap at any scale: frames are decoded at the physical pixel
//! size the picture is drawn at (never above the source size) and drawn
//! 1:1, which the software renderer turns into a row copy. Its direct copy
//! needs a pixel-snapped quad followed by another triangle in the same mesh
//! and a texture that extends past the drawn area, so the texture carries
//! one spare column and row. Flip and picture adjustments are applied while
//! filling the texture. Animated framing (keyframes) and sizes beyond the
//! source fall back to scaled drawing.

use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Stroke, StrokeKind, Ui, pos2, vec2};
use switchboard_media::Frame;
use switchboard_project::{
    FramingBackground, FramingMode, OverlayKind, VideoEdits, canvas_dimensions, framing_at, framing_geometry, title_overlay,
};

use super::Editor;
use crate::media_host::frames;
use crate::ui::theme::*;

#[derive(Default)]
pub struct PreviewCache {
    tex: Option<egui::TextureHandle>,
    /// What the texture currently holds: (frame sequence, adjustment key).
    shown: Option<(u64, [i32; 4])>,
    /// Picture size inside the texture (one column and row smaller).
    picture: [usize; 2],
}

/// Brightness/contrast/saturation/flip as integers, so a change re-uploads.
fn adjust_key(e: Option<&VideoEdits>) -> [i32; 4] {
    let e = e.cloned().unwrap_or_default();
    [
        (e.brightness.unwrap_or(0.0) * 1000.0) as i32,
        (e.contrast.unwrap_or(1.0) * 1000.0) as i32,
        (e.saturation.unwrap_or(1.0) * 1000.0) as i32,
        e.flip_horizontal.unwrap_or(false) as i32,
    ]
}

/// The frame as a texture one pixel wider and taller than the picture (the
/// spare column and row repeat the edge), with flip and the picture
/// adjustments applied on the CPU.
fn texture_image(frame: &Frame, e: Option<&VideoEdits>) -> egui::ColorImage {
    let (w, h) = (frame.width as usize, frame.height as usize);
    let (tw, th) = (w + 1, h + 1);
    let flip = e.and_then(|e| e.flip_horizontal).unwrap_or(false);
    let b = e.and_then(|e| e.brightness).unwrap_or(0.0) as f32;
    let c = e.and_then(|e| e.contrast).unwrap_or(1.0) as f32;
    let s = e.and_then(|e| e.saturation).unwrap_or(1.0) as f32;
    let adjust = b != 0.0 || c != 1.0 || s != 1.0;
    let mut px = vec![Color32::BLACK; tw * th];
    if w == 0 || h == 0 || frame.rgba.len() < w * h * 4 {
        return egui::ColorImage::new([tw, th], px);
    }
    for (y, row) in frame.rgba.chunks_exact(w * 4).take(h).enumerate() {
        let out = &mut px[y * tw..y * tw + w];
        for (x, p) in row.chunks_exact(4).enumerate() {
            let (r, g, bl) = if adjust {
                let (r, g, bl) = (p[0] as f32 / 255.0, p[1] as f32 / 255.0, p[2] as f32 / 255.0);
                let l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
                let f = |v: f32| ((((l + (v - l) * s) - 0.5) * c + 0.5 + b).clamp(0.0, 1.0) * 255.0) as u8;
                (f(r), f(g), f(bl))
            } else {
                (p[0], p[1], p[2])
            };
            out[if flip { w - 1 - x } else { x }] = Color32::from_rgb(r, g, bl);
        }
        px[y * tw + w] = px[y * tw + w - 1];
    }
    let (picture, spare) = px.split_at_mut(h * tw);
    spare.copy_from_slice(&picture[(h - 1) * tw..]);
    egui::ColorImage::new([tw, th], px)
}

/// `r` moved and sized to whole physical pixels, and that pixel size.
fn snap(r: Rect, ppp: f32) -> (Rect, [u32; 2]) {
    let min = (r.min.to_vec2() * ppp).round() / ppp;
    let px = [(r.width() * ppp).round().max(1.0) as u32, (r.height() * ppp).round().max(1.0) as u32];
    (Rect::from_min_size(min.to_pos2(), vec2(px[0] as f32, px[1] as f32) / ppp), px)
}

/// Average colour of a region of the frame (normalized coordinates).
fn average(frame: &Frame, x0: f32, y0: f32, x1: f32, y1: f32) -> Color32 {
    let (w, h) = (frame.width as usize, frame.height as usize);
    let (ax, bx) = (((x0 * w as f32) as usize).min(w - 1), ((x1 * w as f32) as usize).clamp(1, w));
    let (ay, by) = (((y0 * h as f32) as usize).min(h - 1), ((y1 * h as f32) as usize).clamp(1, h));
    let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
    let step = ((bx - ax).max(by - ay) / 6).max(1);
    let mut y = ay;
    while y < by.max(ay + 1) {
        let mut x = ax;
        while x < bx.max(ax + 1) {
            let i = (y * w + x) * 4;
            if i + 2 < frame.rgba.len() {
                r += frame.rgba[i] as u32;
                g += frame.rgba[i + 1] as u32;
                b += frame.rgba[i + 2] as u32;
                n += 1;
            }
            x += step;
        }
        y += step;
    }
    let n = n.max(1);
    Color32::from_rgb((r / n) as u8, (g / n) as u8, (b / n) as u8)
}

impl Editor {
    pub fn preview_ui(&mut self, ui: &mut Ui, area: Rect) {
        let p = ui.painter_at(area);
        p.rect_filled(area, CornerRadius::same(R_OVERLAY), Color32::from_rgb(7, 9, 12));
        let project = &self.state.project;
        let seg_i = self.playback.segment.min(project.segments.len().saturating_sub(1));
        let Some(seg) = project.segments.get(seg_i) else { return };
        let edits = seg.edits().cloned();
        let edits = edits.as_ref();
        let Some(info) = self.infos.get(&seg.clip_id).cloned() else {
            let msg = self.playback.error.clone().unwrap_or_else(|| "This clip is missing from the clips folder.".into());
            p.text(area.center(), Align2::CENTER_CENTER, msg, font(13.0), TEXT_DESCRIPTION);
            return;
        };
        let (sw, sh) = (info.width.max(2) as f32, info.height.max(2) as f32);
        let (cw, ch) = canvas_dimensions(info.width.max(2), info.height.max(2), project.canvas_size);
        let (cw, ch) = (cw as f32, ch as f32);
        let scale = ((area.width() - 24.0) / cw).min((area.height() - 24.0) / ch);
        let canvas = Rect::from_center_size(area.center(), vec2(cw * scale, ch * scale));
        p.rect_filled(canvas, CornerRadius::ZERO, Color32::BLACK);

        // Upload the frame when it or the picture adjustments changed.
        let frame = self.playback.frame();
        if let Some(frame) = &frame {
            let key = adjust_key(edits);
            let seq = self.playback.frame_seq();
            if self.preview.shown != Some((seq, key)) {
                let img = texture_image(frame, edits);
                match &mut self.preview.tex {
                    Some(t) => t.set(img, egui::TextureOptions::LINEAR),
                    None => self.preview.tex = Some(ui.ctx().load_texture("editor-preview", img, egui::TextureOptions::LINEAR)),
                }
                self.preview.shown = Some((seq, key));
                self.preview.picture = [frame.width as usize, frame.height as usize];
            }
        }
        let flip = edits.and_then(|e| e.flip_horizontal).unwrap_or(false);
        let src_ms = self.playback.source_ms;
        let framing = edits.and_then(|e| e.framing.as_ref());
        let mode = framing.map(|f| f.mode).unwrap_or(if project.canvas_size == switchboard_project::Canvas::Original {
            FramingMode::Fit
        } else {
            FramingMode::Fill
        });
        let key = framing_at(src_ms, edits);
        let g = framing_geometry(sw as f64, sh as f64, cw as f64, ch as f64, &key, mode);
        let img = Rect::from_min_size(canvas.min + vec2(g.x as f32 * scale, g.y as f32 * scale), vec2(g.width as f32 * scale, g.height as f32 * scale));
        let ppp = ui.ctx().pixels_per_point();
        let (snapped, px) = snap(img, ppp);
        // Decode at the drawn size when the picture holds still and the
        // source has that many pixels; otherwise at the canvas size (stable
        // while keyframes zoom), never above the source.
        let still = framing.is_none_or(|f| f.keyframes.len() <= 1);
        let want = if still && px[0] <= info.width && px[1] <= info.height {
            (px[0], px[1])
        } else {
            let (_, cpx) = snap(canvas, ppp);
            switchboard_media::fit(info.width, info.height, cpx[0], cpx[1])
        };
        let want = frames::clamp(want.0, want.1);
        self.playback.request_size(&seg.clip_id, want.0, want.1);

        let Some(tex) = &self.preview.tex else {
            p.text(canvas.center(), Align2::CENTER_CENTER, "Loading\u{2026}", font(13.0), TEXT_MUTED);
            return;
        };
        let [pw, ph] = self.preview.picture;
        // The picture without the spare column and row.
        let uv = Rect::from_min_max(Pos2::ZERO, pos2(pw as f32 / (pw + 1) as f32, ph as f32 / (ph + 1) as f32));
        let pc = ui.painter_at(canvas);
        if framing.is_some_and(|f| f.background == FramingBackground::Blur) {
            // Approximate the blurred backdrop: the frame scaled to cover, dimmed.
            let cover = (cw / sw).max(ch / sh);
            let bg = Rect::from_center_size(canvas.center(), vec2(sw * cover * scale * 1.1, sh * cover * scale * 1.1));
            pc.image(tex.id(), bg, uv, Color32::from_gray(90));
        }
        if [pw as u32, ph as u32] == px {
            // 1:1. The trailing empty triangle lets the renderer treat the
            // quad as a rectangle (it looks for a following triangle).
            let mut mesh = egui::Mesh::with_texture(tex.id());
            mesh.add_rect_with_uv(snapped, uv, Color32::WHITE);
            let v = mesh.vertices.len() as u32;
            mesh.colored_vertex(snapped.min, Color32::TRANSPARENT);
            mesh.add_triangle(v, v, v);
            pc.add(egui::Shape::mesh(mesh));
        } else {
            pc.image(tex.id(), img, uv, Color32::WHITE);
        }

        // Overlays and the legacy title, at the current source time.
        let mut overlays: Vec<switchboard_project::Overlay> = edits.map(|e| e.overlays.clone()).unwrap_or_default();
        if let Some(t) = edits.and_then(|e| e.text.as_ref()).filter(|t| !t.content.is_empty()) {
            overlays.push(title_overlay(t, cw as f64, ch as f64));
        }
        for o in overlays.iter().filter(|o| src_ms >= o.start_ms as f64 && src_ms < o.end_ms as f64) {
            let r = Rect::from_min_size(
                canvas.min + vec2(o.x as f32 * canvas.width(), o.y as f32 * canvas.height()),
                vec2(o.width as f32 * canvas.width(), o.height as f32 * canvas.height()),
            );
            match o.kind {
                OverlayKind::Text => {
                    let size = o.size.unwrap_or_default().fraction() as f32 * canvas.height();
                    let text = o.content.clone().unwrap_or_default();
                    let galley = pc.layout(text, egui::FontId::new(size.max(6.0), strong()), Color32::WHITE, r.width());
                    let bx = Rect::from_center_size(r.center(), galley.size() + vec2(size * 0.6, size * 0.3));
                    pc.rect_filled(bx, CornerRadius::same(3), Color32::from_black_alpha(140));
                    pc.galley(bx.center() - galley.size() / 2.0, galley, Color32::WHITE);
                }
                OverlayKind::Blur | OverlayKind::Pixelate => {
                    // Cells averaged from the real frame: coarse for pixelate,
                    // fine and soft for blur.
                    let Some(f) = &frame else { continue };
                    let cells = if o.kind == OverlayKind::Pixelate { 10.0 } else { 18.0 };
                    let cell = (r.width().max(r.height()) / cells).max(3.0);
                    let (nx, ny) = ((r.width() / cell).ceil() as usize, (r.height() / cell).ceil() as usize);
                    for yi in 0..ny {
                        for xi in 0..nx {
                            let c = Rect::from_min_size(r.min + vec2(xi as f32 * cell, yi as f32 * cell), vec2(cell, cell)).intersect(r);
                            // Screen -> source-normalized coordinates through the framing.
                            let to_src = |q: Pos2| {
                                let x = ((q.x - img.min.x) / img.width()).clamp(0.0, 1.0);
                                let y = ((q.y - img.min.y) / img.height()).clamp(0.0, 1.0);
                                (if flip { 1.0 - x } else { x }, y)
                            };
                            let (x0, y0) = to_src(c.min);
                            let (x1, y1) = to_src(c.max);
                            pc.rect_filled(c, CornerRadius::ZERO, average(f, x0.min(x1), y0, x0.max(x1), y1));
                        }
                    }
                }
            }
            if self.selected_overlay.as_deref() == Some(o.id.as_str()) {
                pc.rect_stroke(r, CornerRadius::ZERO, Stroke::new(1.5, ACCENT_HOVER), StrokeKind::Outside);
            }
        }
        if self.playback.frozen {
            p.text(canvas.right_top() + vec2(-10.0, 10.0), Align2::RIGHT_TOP, "Freeze frame", font(11.5), TEXT_SECONDARY);
        }
        if let Some(e) = &self.playback.error {
            let galley = p.layout(e.clone(), font(12.5), TEXT, (canvas.width() - 48.0).max(80.0));
            let bx = Rect::from_center_size(canvas.center(), galley.size() + vec2(24.0, 16.0));
            p.rect_filled(bx, CornerRadius::same(R_OVERLAY), Color32::from_black_alpha(200));
            p.galley(bx.center() - galley.size() / 2.0, galley, TEXT);
        }
    }
}
