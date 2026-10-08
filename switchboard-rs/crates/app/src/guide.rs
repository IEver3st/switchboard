//! Vertical framing guide: an outline around a 9:16 area of the screen and an
//! optional dim layer outside it, so short-form shots can be framed while
//! playing. Two click-through, non-activating, topmost windows on the tray
//! thread. Both are excluded from screen capture (WDA_EXCLUDEFROMCAPTURE), so
//! they never appear in clips; if Windows can't exclude them they are not
//! shown at all. No timers: they repaint only when settings or the display
//! layout change, and are destroyed when the guide is turned off.

use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::{BOOL, PCWSTR, w};

use crate::settings::VerticalGuide;

const CLASS: PCWSTR = w!("SwitchboardGuide");
/// Outline thickness at 100% scaling.
const EDGE_PX: i32 = 2;

/// Posted to the tray thread when the display layout changes.
pub const WM_GUIDE_LAYOUT: u32 = WM_APP + 6;

#[derive(Default)]
pub struct Guide {
    dim: Option<HWND>,
    edge: Option<HWND>,
    current: Option<(VerticalGuide, Option<String>)>,
}

impl Guide {
    /// Shows, moves or hides the guide. `device` is the display's device
    /// name (`\\.\DISPLAY1`); None or an unknown name uses the primary display.
    /// Returns why the guide can't be shown, if it can't.
    pub fn apply(&mut self, guide: VerticalGuide, device: Option<String>) -> Option<String> {
        if !guide.enabled {
            self.current = None;
            self.destroy();
            return None;
        }
        self.current = Some((guide, device));
        self.layout()
    }

    /// Re-applies the current guide to the display layout.
    pub fn layout(&mut self) -> Option<String> {
        let Some((guide, device)) = self.current.clone() else { return None };
        let Some((monitor, hmon)) = monitor_rect(device.as_deref()) else {
            self.destroy();
            return Some("No display is available for the guide.".into());
        };
        if let Err(e) = self.ensure_windows() {
            self.current = None;
            self.destroy();
            return Some(e);
        }
        let (dim, edge) = (self.dim.unwrap(), self.edge.unwrap());
        let (mw, mh) = (monitor.right - monitor.left, monitor.bottom - monitor.top);
        let (fx, fy, fw, fh) = guide.frame(mw, mh);
        let mut dpi_x = 96;
        let mut dpi_y = 96;
        unsafe {
            let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        }
        let t = (EDGE_PX * dpi_x.max(96) as i32 + 48) / 96;
        // Everything below is relative to the monitor's top-left corner. The
        // outline sits just outside the frame so the frame itself stays clear.
        let outer = RECT { left: fx - t, top: fy - t, right: fx + fw + t, bottom: fy + fh + t };
        let inner = RECT { left: fx, top: fy, right: fx + fw, bottom: fy + fh };
        unsafe {
            // Outline: a ring-shaped window region.
            set_ring_region(edge, &outer, &inner, mw, mh);
            SetWindowLongPtrW(edge, GWLP_USERDATA, guide.color.rgb() as isize);
            place(edge, &monitor);
            // Dim layer: the monitor with the frame and outline cut out.
            if guide.dim > 0 {
                let full = RECT { left: 0, top: 0, right: mw, bottom: mh };
                set_ring_region(dim, &full, &outer, mw, mh);
                let alpha = (guide.dim as u32 * 255 / 100) as u8;
                let _ = SetLayeredWindowAttributes(dim, COLORREF(0), alpha, LWA_ALPHA);
                place(dim, &monitor);
            } else {
                let _ = ShowWindow(dim, SW_HIDE);
            }
            let _ = InvalidateRect(Some(edge), None, true);
        }
        None
    }

    fn ensure_windows(&mut self) -> Result<(), String> {
        if self.dim.is_some() && self.edge.is_some() {
            return Ok(());
        }
        self.destroy();
        let dim = create().ok_or("Couldn't create the guide window.")?;
        self.dim = Some(dim);
        let edge = create().ok_or("Couldn't create the guide window.")?;
        self.edge = Some(edge);
        unsafe {
            SetWindowLongPtrW(dim, GWLP_USERDATA, 0);
            let _ = SetLayeredWindowAttributes(edge, COLORREF(0), 255, LWA_ALPHA);
            // Never show a guide that would end up in clips.
            let excluded = SetWindowDisplayAffinity(dim, WDA_EXCLUDEFROMCAPTURE).is_ok()
                && SetWindowDisplayAffinity(edge, WDA_EXCLUDEFROMCAPTURE).is_ok();
            if !excluded {
                return Err("This version of Windows can't keep the guide out of recordings, so it stays off.".into());
            }
        }
        Ok(())
    }

    fn destroy(&mut self) {
        for h in [self.dim.take(), self.edge.take()].into_iter().flatten() {
            unsafe {
                let _ = DestroyWindow(h);
            }
        }
    }
}

impl Drop for Guide {
    fn drop(&mut self) {
        self.destroy();
    }
}

fn create() -> Option<HWND> {
    unsafe {
        let instance = GetModuleHandleW(None).ok()?;
        let class = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: instance.into(),
            lpszClassName: CLASS,
            ..Default::default()
        };
        // Fails harmlessly once the class exists.
        RegisterClassW(&class);
        CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE,
            CLASS,
            w!("Switchboard framing guide"),
            WS_POPUP,
            0,
            0,
            1,
            1,
            None,
            None,
            Some(instance.into()),
            None,
        )
        .ok()
    }
}

unsafe fn place(hwnd: HWND, monitor: &RECT) {
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            monitor.left,
            monitor.top,
            monitor.right - monitor.left,
            monitor.bottom - monitor.top,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
}

/// Sets the window region to `outer` minus `inner`, clipped to the window.
unsafe fn set_ring_region(hwnd: HWND, outer: &RECT, inner: &RECT, w: i32, h: i32) {
    unsafe {
        let clip = |r: &RECT| RECT { left: r.left.max(0), top: r.top.max(0), right: r.right.min(w), bottom: r.bottom.min(h) };
        let (o, i) = (clip(outer), clip(inner));
        let region = CreateRectRgn(o.left, o.top, o.right, o.bottom);
        let hole = CreateRectRgn(i.left, i.top, i.right, i.bottom);
        CombineRgn(Some(region), Some(region), Some(hole), RGN_DIFF);
        let _ = DeleteObject(hole.into());
        // The system owns the region after this call.
        SetWindowRgn(hwnd, Some(region), true);
    }
}

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        match msg {
            WM_ERASEBKGND => {
                let hdc = HDC(wparam.0 as *mut _);
                let mut rc = RECT::default();
                let _ = GetClientRect(hwnd, &mut rc);
                let hex = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as u32;
                let brush = CreateSolidBrush(COLORREF(((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff)));
                FillRect(hdc, &rc, brush);
                let _ = DeleteObject(brush.into());
                LRESULT(1)
            }
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                BeginPaint(hwnd, &mut ps);
                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
            WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
            WM_DISPLAYCHANGE | WM_DPICHANGED => {
                let _ = windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                    windows::Win32::System::Threading::GetCurrentThreadId(),
                    WM_GUIDE_LAYOUT,
                    WPARAM(0),
                    LPARAM(0),
                );
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}

/// The named display's rectangle in physical desktop pixels (the process is
/// per-monitor DPI aware), falling back to the primary display.
fn monitor_rect(device: Option<&str>) -> Option<(RECT, HMONITOR)> {
    struct Search<'a> {
        device: Option<&'a str>,
        found: Option<(RECT, HMONITOR)>,
        primary: Option<(RECT, HMONITOR)>,
    }
    unsafe extern "system" fn each(hmon: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
        unsafe {
            let search = &mut *(data.0 as *mut Search);
            let mut info = MONITORINFOEXW::default();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmon, &mut info.monitorInfo).as_bool() {
                let end = info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len());
                let name = String::from_utf16_lossy(&info.szDevice[..end]);
                let entry = (info.monitorInfo.rcMonitor, hmon);
                if search.device.is_some_and(|d| d.eq_ignore_ascii_case(&name)) {
                    search.found = Some(entry);
                }
                if info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0 {
                    search.primary = Some(entry);
                }
            }
            true.into()
        }
    }
    let mut search = Search { device, found: None, primary: None };
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut search as *mut Search as isize));
    }
    search.found.or(search.primary)
}
