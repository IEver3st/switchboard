//! "Clip saved" notice: a small click-through, non-activating window in the
//! top-right corner of the primary display. It never takes focus from the game.

use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::{PCWSTR, w};

/// Sizes are in 96-DPI units, scaled by `px` for the primary display.
const WIDTH: i32 = 340;
const HEIGHT: i32 = 64;

fn px(v: i32) -> i32 {
    let dpi = unsafe { windows::Win32::UI::HiDpi::GetDpiForSystem() }.max(96);
    (v as f32 * dpi as f32 / 96.0).round() as i32
}
const TIMER: usize = 1;
const SHOW_MS: u32 = 2600;

#[derive(Default)]
pub struct Toast {
    hwnd: Option<HWND>,
}

struct Content {
    ok: bool,
    title: Vec<u16>,
    detail: Vec<u16>,
}

thread_local! {
    static CONTENT: std::cell::RefCell<Option<Content>> = const { std::cell::RefCell::new(None) };
}

fn rgb(hex: u32) -> COLORREF {
    COLORREF(((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff))
}

impl Toast {
    pub fn show(&mut self, ok: bool, title: &str, detail: &str) {
        CONTENT.with(|c| {
            *c.borrow_mut() = Some(Content {
                ok,
                title: title.encode_utf16().collect(),
                detail: detail.encode_utf16().collect(),
            })
        });
        let Some(hwnd) = self.window() else { return };
        unsafe {
            let mut work = RECT::default();
            let _ = SystemParametersInfoW(SPI_GETWORKAREA, 0, Some(&mut work as *mut _ as *mut _), Default::default());
            let x = work.right - px(WIDTH) - px(24);
            let y = work.top + px(24);
            let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, px(WIDTH), px(HEIGHT), SWP_NOACTIVATE | SWP_SHOWWINDOW);
            let _ = InvalidateRect(Some(hwnd), None, true);
            SetTimer(Some(hwnd), TIMER, SHOW_MS, None);
        }
    }

    fn window(&mut self) -> Option<HWND> {
        if let Some(h) = self.hwnd {
            return Some(h);
        }
        unsafe {
            let instance = GetModuleHandleW(None).ok()?;
            let class = WNDCLASSW {
                lpfnWndProc: Some(proc),
                hInstance: instance.into(),
                lpszClassName: w!("SwitchboardToast"),
                hCursor: LoadCursorW(None, IDC_ARROW).ok()?,
                ..Default::default()
            };
            RegisterClassW(&class);
            let hwnd = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE,
                w!("SwitchboardToast"),
                w!("Switchboard"),
                WS_POPUP,
                0,
                0,
                px(WIDTH),
                px(HEIGHT),
                None,
                None,
                Some(instance.into()),
                None,
            )
            .ok()?;
            let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
            // Keep the notice out of recordings, including the clip saved next.
            let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
            let rgn = CreateRoundRectRgn(0, 0, px(WIDTH) + 1, px(HEIGHT) + 1, px(16), px(16));
            SetWindowRgn(hwnd, Some(rgn), false);
            self.hwnd = Some(hwnd);
            Some(hwnd)
        }
    }
}

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        match msg {
            WM_TIMER => {
                let _ = KillTimer(Some(hwnd), TIMER);
                let _ = ShowWindow(hwnd, SW_HIDE);
                LRESULT(0)
            }
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);
                paint(hdc);
                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}

unsafe fn paint(hdc: HDC) {
    unsafe {
        let bg = CreateSolidBrush(rgb(0x141821));
        let rect = RECT { left: 0, top: 0, right: px(WIDTH), bottom: px(HEIGHT) };
        FillRect(hdc, &rect, bg);
        let _ = DeleteObject(bg.into());
        let border = CreatePen(PS_SOLID, 1, rgb(0x374050));
        let old_pen = SelectObject(hdc, border.into());
        let old_brush = SelectObject(hdc, GetStockObject(NULL_BRUSH));
        let _ = RoundRect(hdc, 0, 0, px(WIDTH), px(HEIGHT), px(16), px(16));
        CONTENT.with(|c| {
            let c = c.borrow();
            let Some(c) = c.as_ref() else { return };
            // Status dot beside the text: green for saved, red for failure.
            let accent = if c.ok { rgb(0x3fd1bb) } else { rgb(0xf26d6d) };
            let dot = CreateSolidBrush(accent);
            let mark = RECT { left: px(18), top: px(22), right: px(38), bottom: px(42) };
            let r = CreateRoundRectRgn(mark.left, mark.top, mark.right, mark.bottom, px(20), px(20));
            let _ = FillRgn(hdc, r, dot);
            let _ = DeleteObject(r.into());
            let _ = DeleteObject(dot.into());
            SetBkMode(hdc, TRANSPARENT);
            let title_font = font(-px(16), 600);
            let detail_font = font(-px(13), 400);
            let prev = SelectObject(hdc, title_font.into());
            SetTextColor(hdc, rgb(0xf4f6fb));
            let mut tr = RECT { left: px(52), top: px(12), right: px(WIDTH - 16), bottom: px(34) };
            let mut title = c.title.clone();
            DrawTextW(hdc, &mut title, &mut tr, DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX);
            SelectObject(hdc, detail_font.into());
            SetTextColor(hdc, rgb(0x8b95a7));
            let mut dr = RECT { left: px(52), top: px(34), right: px(WIDTH - 16), bottom: px(54) };
            let mut detail = c.detail.clone();
            DrawTextW(hdc, &mut detail, &mut dr, DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX);
            SelectObject(hdc, prev);
            let _ = DeleteObject(title_font.into());
            let _ = DeleteObject(detail_font.into());
        });
        SelectObject(hdc, old_brush);
        SelectObject(hdc, old_pen);
        let _ = DeleteObject(border.into());
    }
}

unsafe fn font(height: i32, weight: i32) -> HFONT {
    unsafe {
        CreateFontW(
            height,
            0,
            0,
            0,
            weight,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            CLEARTYPE_QUALITY,
            0,
            PCWSTR(w!("Segoe UI").as_ptr()),
        )
    }
}
