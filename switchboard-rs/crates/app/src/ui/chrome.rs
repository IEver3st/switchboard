//! Custom title bar. The window has no native frame, so each page's first
//! row doubles as the title bar and the window buttons sit in the top-right
//! corner. Windows still does the real work: a subclassed window procedure
//! answers hit tests, so dragging, Snap, double-click to maximize, the
//! system menu and edge resizing are all native.
//!
//! Each frame the app publishes the title band height and every clickable
//! widget in it; the hit test treats the rest of the band as caption.

use std::sync::Mutex;

use egui::{Align2, Color32, Context, Id, Order, Rect, Sense, Ui, pos2, vec2};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DwmExtendFrameIntoClientArea, DwmSetWindowAttribute,
};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumThreadWindows, GWL_STYLE, GetClientRect, GetWindowLongW, HTBOTTOM, HTBOTTOMLEFT, HTBOTTOMRIGHT, HTCAPTION,
    HTLEFT, HTRIGHT, HTTOP, HTTOPLEFT, HTTOPRIGHT, IsWindowVisible, IsZoomed, SWP_FRAMECHANGED, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, SetWindowPos, WM_NCHITTEST, WS_SIZEBOX,
};
use windows::core::BOOL;

use super::theme::*;

/// Height of the title band every page's first row lives in.
pub const BAR_H: f32 = 48.0;
const BUTTON_W: f32 = 46.0;
/// Room each page leaves free at the right of its first row.
pub const BUTTONS_W: f32 = BUTTON_W * 3.0;

const GLYPH_MINIMIZE: &str = "\u{E921}";
const GLYPH_MAXIMIZE: &str = "\u{E922}";
const GLYPH_RESTORE: &str = "\u{E923}";
const GLYPH_CLOSE: &str = "\u{E8BB}";
const CLOSE_HOVER: Color32 = Color32::from_rgb(0xc4, 0x2b, 0x1c);

/// Hit-test layout in physical client pixels, read by the window procedure.
struct Layout {
    scale: f32,
    caption_h: f32,
    client: Vec<[f32; 4]>,
}

static LAYOUT: Mutex<Layout> = Mutex::new(Layout { scale: 1.0, caption_h: 0.0, client: Vec::new() });

#[derive(Default)]
pub struct Chrome {
    hwnd: Option<isize>,
}

impl Chrome {
    fn hwnd(&self) -> Option<HWND> {
        self.hwnd.map(|h| HWND(h as *mut _))
    }

    /// Tells the window the mouse button is up. Modal OLE drags swallow the
    /// release, which would leave egui thinking the button is still down.
    pub fn release_pointer(&self) {
        use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, PostMessageW, WM_LBUTTONUP};
        let Some(hwnd) = self.hwnd() else { return };
        let mut pt = POINT::default();
        unsafe {
            let _ = GetCursorPos(&mut pt);
            let _ = ScreenToClient(hwnd, &mut pt);
            let lparam = ((pt.y as u16 as isize) << 16) | (pt.x as u16 as isize);
            let _ = PostMessageW(Some(hwnd), WM_LBUTTONUP, WPARAM(0), LPARAM(lparam));
        }
    }

    pub fn maximized(&self) -> bool {
        self.hwnd().is_some_and(|h| unsafe { IsZoomed(h) }.as_bool())
    }

    /// Finds and prepares the window once it exists, then publishes this
    /// frame's title band. `active` is false for headless review renders.
    pub fn frame(&mut self, ctx: &Context, active: bool) {
        if active && self.hwnd.is_none() {
            self.hwnd = find_window().map(|h| {
                unsafe { install(h) };
                h.0 as isize
            });
        }
        let ppp = ctx.pixels_per_point();
        let client = ctx.viewport(|vp| {
            vp.prev_pass
                .widgets
                .layers()
                .flat_map(|(_, ws)| ws.iter())
                .filter(|w| w.interact_rect.top() < BAR_H && (w.sense.senses_click() || w.sense.senses_drag()))
                .map(|w| {
                    let r = w.interact_rect;
                    [r.min.x * ppp, r.min.y * ppp, r.max.x * ppp, r.max.y * ppp]
                })
                .collect()
        });
        if let Ok(mut l) = LAYOUT.lock() {
            *l = Layout { scale: ppp, caption_h: BAR_H * ppp, client };
        }
    }

    /// Minimize, maximize/restore and close, flush in the top-right corner.
    pub fn buttons(&self, ctx: &Context) {
        let screen = ctx.content_rect();
        let maximized = self.maximized();
        egui::Area::new(Id::new("window-buttons"))
            .order(Order::Foreground)
            .fixed_pos(pos2(screen.right() - BUTTONS_W, screen.top()))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 0.0;
                    if caption_button(ui, GLYPH_MINIMIZE, "Minimize", false) {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
                    }
                    let (glyph, name) = if maximized { (GLYPH_RESTORE, "Restore") } else { (GLYPH_MAXIMIZE, "Maximize") };
                    if caption_button(ui, glyph, name, false) {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
                    }
                    if caption_button(ui, GLYPH_CLOSE, "Close", true) {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
            });
    }
}

fn caption_button(ui: &mut Ui, glyph: &str, name: &str, close: bool) -> bool {
    let (rect, response) = ui.allocate_exact_size(vec2(BUTTON_W, BAR_H), Sense::click());
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, name));
    let hot = response.hovered() || response.is_pointer_button_down_on();
    let (fill, fg) = match (hot, close) {
        (true, true) => (CLOSE_HOVER, Color32::WHITE),
        (true, false) => (INTERACTIVE, TEXT),
        _ => (Color32::TRANSPARENT, TEXT_SECONDARY),
    };
    let p = ui.painter();
    p.rect_filled(rect, 0, fill);
    p.text(rect.center(), Align2::CENTER_CENTER, glyph, font_icon(10.0), fg);
    if response.has_focus() {
        let ring = Rect::from_center_size(rect.center(), vec2(BUTTON_W - 6.0, BAR_H - 10.0));
        p.rect_stroke(ring, R_CONTROL, egui::Stroke::new(2.0, ACCENT_HOVER), egui::StrokeKind::Inside);
    }
    response.clicked()
}

/// The app's visible, resizable top-level window on this (the UI) thread.
fn find_window() -> Option<HWND> {
    unsafe extern "system" fn each(hwnd: HWND, found: LPARAM) -> BOOL {
        let style = unsafe { GetWindowLongW(hwnd, GWL_STYLE) } as u32;
        if unsafe { IsWindowVisible(hwnd) }.as_bool() && style & WS_SIZEBOX.0 != 0 {
            unsafe { *(found.0 as *mut Option<HWND>) = Some(hwnd) };
            return false.into();
        }
        true.into()
    }
    let mut found: Option<HWND> = None;
    unsafe {
        let _ = EnumThreadWindows(GetCurrentThreadId(), Some(each), LPARAM(&mut found as *mut _ as isize));
    }
    found
}

unsafe fn install(hwnd: HWND) {
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(subclass), 1, 0);
        // Rounded corners and the standard shadow without a native frame.
        let pref = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const _ as *const _,
            std::mem::size_of_val(&pref) as u32,
        );
        let _ = DwmExtendFrameIntoClientArea(hwnd, &MARGINS { cxLeftWidth: 0, cxRightWidth: 0, cyTopHeight: 1, cyBottomHeight: 0 });
        let _ = SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER);
    }
}

/// Native hit test: resize edges, caption for empty title band, client otherwise.
pub fn hit_test(x: f32, y: f32, width: f32, height: f32, maximized: bool, scale: f32, caption_h: f32, client: &[[f32; 4]]) -> u32 {
    let edge = 6.0 * scale;
    if !maximized {
        let (left, right, top, bottom) = (x < edge, x >= width - edge, y < edge, y >= height - edge);
        match (left, right, top, bottom) {
            (true, _, true, _) => return HTTOPLEFT,
            (_, true, true, _) => return HTTOPRIGHT,
            (true, _, _, true) => return HTBOTTOMLEFT,
            (_, true, _, true) => return HTBOTTOMRIGHT,
            (true, ..) => return HTLEFT,
            (_, true, ..) => return HTRIGHT,
            (_, _, true, _) => return HTTOP,
            (.., true) => return HTBOTTOM,
            _ => {}
        }
    }
    let over_widget = client.iter().any(|r| x >= r[0] && x < r[2] && y >= r[1] && y < r[3]);
    if y < caption_h && !over_widget {
        return HTCAPTION;
    }
    windows::Win32::UI::WindowsAndMessaging::HTCLIENT
}

unsafe extern "system" fn subclass(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
    if msg == WM_NCHITTEST {
        let mut pt = POINT { x: (lparam.0 & 0xffff) as i16 as i32, y: ((lparam.0 >> 16) & 0xffff) as i16 as i32 };
        let mut rc = RECT::default();
        unsafe {
            let _ = ScreenToClient(hwnd, &mut pt);
            let _ = GetClientRect(hwnd, &mut rc);
        }
        if let Ok(l) = LAYOUT.lock() {
            let code = hit_test(
                pt.x as f32,
                pt.y as f32,
                rc.right as f32,
                rc.bottom as f32,
                unsafe { IsZoomed(hwnd) }.as_bool(),
                l.scale,
                l.caption_h,
                &l.client,
            );
            return LRESULT(code as isize);
        }
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hit_test_regions() {
        let client = [[900.0, 0.0, 1000.0, 48.0]];
        let t = |x, y, max| hit_test(x, y, 1000.0, 700.0, max, 1.0, 48.0, &client);
        assert_eq!(t(2.0, 300.0, false), HTLEFT);
        assert_eq!(t(998.0, 698.0, false), HTBOTTOMRIGHT);
        assert_eq!(t(2.0, 2.0, false), HTTOPLEFT);
        // Maximized windows have no resize edges.
        assert_eq!(t(2.0, 300.0, true), windows::Win32::UI::WindowsAndMessaging::HTCLIENT);
        // Empty title band drags; widgets in it stay clickable.
        assert_eq!(t(400.0, 20.0, false), HTCAPTION);
        assert_eq!(t(950.0, 20.0, false), windows::Win32::UI::WindowsAndMessaging::HTCLIENT);
        assert_eq!(t(400.0, 60.0, false), windows::Win32::UI::WindowsAndMessaging::HTCLIENT);
    }
}
