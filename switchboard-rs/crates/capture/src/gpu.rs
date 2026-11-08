//! D3D11 device and display enumeration.

use anyhow::{Context, Result, anyhow};
use windows::Win32::Foundation::{HMODULE, LUID};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_CREATE_DEVICE_VIDEO_SUPPORT, D3D11_SDK_VERSION, D3D11CreateDevice,
    ID3D11Device, ID3D11DeviceContext, ID3D11Multithread,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIAdapter, IDXGIAdapter1, IDXGIFactory1,
};
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::core::Interface;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DisplayInfo {
    pub index: usize,
    pub device_name: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub id: String,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
    pub adapter_name: String,
    /// Top-left in virtual-desktop pixels; negative left of or above the primary.
    #[serde(skip)]
    pub(crate) origin_x: i32,
    #[serde(skip)]
    pub(crate) origin_y: i32,
    #[serde(skip)]
    pub(crate) monitor: isize,
    #[serde(skip)]
    pub(crate) adapter_index: u32,
}

impl DisplayInfo {
    pub fn short_label(&self) -> String {
        if self.name.is_empty() { format!("Display {}", self.index + 1) } else { clip(&self.name, LABEL_MAX) }
    }

    pub fn label(&self) -> String {
        let primary = if self.primary { ", primary" } else { "" };
        format!("{} ({}\u{d7}{}{primary})", self.short_label(), self.width, self.height)
    }

    pub(crate) fn hmonitor(&self) -> HMONITOR {
        HMONITOR(self.monitor as *mut core::ffi::c_void)
    }
}

/// Lists desktop-attached outputs, primary first, then left to right.
pub fn list_displays() -> Result<Vec<DisplayInfo>> {
    let monitors = monitors();
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1()? };
    let mut out = Vec::new();
    let mut ai = 0u32;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(ai) } {
        let adesc = unsafe { adapter.GetDesc1()? };
        let adapter_name = utf16(&adesc.Description);
        let mut oi = 0u32;
        while let Ok(output) = unsafe { adapter.EnumOutputs(oi) } {
            let desc = unsafe { output.GetDesc()? };
            if desc.AttachedToDesktop.as_bool() {
                let r = desc.DesktopCoordinates;
                let device_name = utf16(&desc.DeviceName);
                let monitor = monitors.iter().find(|m| m.device.eq_ignore_ascii_case(&device_name));
                out.push(DisplayInfo {
                    index: 0,
                    name: monitor.map(|m| m.name.clone()).unwrap_or_default(),
                    id: monitor.map(|m| m.id.clone()).unwrap_or_default(),
                    device_name,
                    width: r.right - r.left,
                    height: r.bottom - r.top,
                    primary: r.left == 0 && r.top == 0,
                    adapter_name: adapter_name.clone(),
                    origin_x: r.left,
                    origin_y: r.top,
                    monitor: desc.Monitor.0 as isize,
                    adapter_index: ai,
                });
            }
            oi += 1;
        }
        ai += 1;
    }
    out.sort_by_key(|d| (!d.primary, d.origin_x, d.origin_y));
    for (i, d) in out.iter_mut().enumerate() {
        d.index = i;
    }
    let all: Vec<String> = out.iter().map(|d| d.name.clone()).collect();
    for d in out.iter_mut().filter(|d| !d.name.is_empty()) {
        let twins = all.iter().filter(|n| **n == d.name).count();
        if twins > 1 {
            let nth = all[..d.index].iter().filter(|n| **n == d.name).count() + 1;
            let suffix = format!(" {nth}");
            d.name = format!("{}{suffix}", clip(&d.name, LABEL_MAX - suffix.len()));
        }
    }
    Ok(out)
}

const LABEL_MAX: usize = 16;

fn clip(name: &str, max: usize) -> String {
    if name.chars().count() <= max {
        return name.to_string();
    }
    format!("{}\u{2026}", name.chars().take(max - 1).collect::<String>().trim_end())
}

pub(crate) fn hardware_adapters() -> Vec<u32> {
    let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else { return Vec::new() };
    let mut out = Vec::new();
    let mut i = 0u32;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(i) } {
        let software = unsafe { adapter.GetDesc1() }
            .map(|d| d.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0)
            .unwrap_or(true);
        if !software {
            out.push(i);
        }
        i += 1;
    }
    out
}

pub(crate) fn monitor_is(monitor: isize, device_name: &str) -> bool {
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITORINFO, MONITORINFOEXW};
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    let found = unsafe {
        GetMonitorInfoW(HMONITOR(monitor as *mut core::ffi::c_void), &mut info as *mut MONITORINFOEXW as *mut MONITORINFO)
    };
    found.as_bool() && utf16(&info.szDevice).eq_ignore_ascii_case(device_name)
}

struct Monitor {
    device: String,
    name: String,
    id: String,
}

fn active_paths() -> Vec<windows::Win32::Devices::Display::DISPLAYCONFIG_PATH_INFO> {
    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, GetDisplayConfigBufferSizes, QDC_ONLY_ACTIVE_PATHS,
        QueryDisplayConfig,
    };
    use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
    for _ in 0..3 {
        let (mut np, mut nm) = (0u32, 0u32);
        if unsafe { GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut np, &mut nm) }.is_err() {
            return Vec::new();
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); np as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); nm as usize];
        let result = unsafe {
            QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut np, paths.as_mut_ptr(), &mut nm, modes.as_mut_ptr(), None)
        };
        if result == ERROR_INSUFFICIENT_BUFFER {
            continue;
        }
        if result.is_err() {
            return Vec::new();
        }
        paths.truncate(np as usize);
        return paths;
    }
    Vec::new()
}

fn source_name(p: &windows::Win32::Devices::Display::DISPLAYCONFIG_PATH_INFO) -> Option<String> {
    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_SOURCE_DEVICE_NAME, DisplayConfigGetDeviceInfo,
    };
    let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
    source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
    source.header.size = std::mem::size_of_val(&source) as u32;
    source.header.adapterId = p.sourceInfo.adapterId;
    source.header.id = p.sourceInfo.id;
    (unsafe { DisplayConfigGetDeviceInfo(&mut source.header) } == 0).then(|| utf16(&source.viewGdiDeviceName))
}

pub(crate) fn sdr_white_scale(device_name: &str) -> Option<f32> {
    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO, DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL,
        DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO, DISPLAYCONFIG_SDR_WHITE_LEVEL, DisplayConfigGetDeviceInfo,
    };
    const ENABLED: u32 = 1 << 1;
    const WIDE_COLOR_ENFORCED: u32 = 1 << 2;
    let p = active_paths().into_iter().find(|p| source_name(p).is_some_and(|n| n.eq_ignore_ascii_case(device_name)))?;
    let mut color = DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO::default();
    color.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
    color.header.size = std::mem::size_of_val(&color) as u32;
    color.header.adapterId = p.targetInfo.adapterId;
    color.header.id = p.targetInfo.id;
    if unsafe { DisplayConfigGetDeviceInfo(&mut color.header) } != 0 {
        return None;
    }
    let bits = unsafe { color.Anonymous.value };
    if bits & ENABLED == 0 || bits & WIDE_COLOR_ENFORCED != 0 {
        return None;
    }
    let mut white = DISPLAYCONFIG_SDR_WHITE_LEVEL::default();
    white.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
    white.header.size = std::mem::size_of_val(&white) as u32;
    white.header.adapterId = p.targetInfo.adapterId;
    white.header.id = p.targetInfo.id;
    let level = if unsafe { DisplayConfigGetDeviceInfo(&mut white.header) } == 0 { white.SDRWhiteLevel } else { 1000 };
    Some(1000.0 / level.max(1000) as f32)
}

fn monitors() -> Vec<Monitor> {
    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME, DISPLAYCONFIG_TARGET_DEVICE_NAME, DisplayConfigGetDeviceInfo,
    };
    let mut out: Vec<Monitor> = Vec::new();
    for p in &active_paths() {
        let source = source_name(p);
        let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
        target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
        target.header.size = std::mem::size_of_val(&target) as u32;
        target.header.adapterId = p.targetInfo.adapterId;
        target.header.id = p.targetInfo.id;
        let Some(device) = source else { continue };
        let found = unsafe { DisplayConfigGetDeviceInfo(&mut target.header) == 0 };
        if found && !out.iter().any(|m| m.device.eq_ignore_ascii_case(&device)) {
            out.push(Monitor {
                device,
                name: utf16(&target.monitorFriendlyDeviceName).trim().to_string(),
                id: utf16(&target.monitorDevicePath),
            });
        }
    }
    out
}

fn utf16(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

#[derive(Clone)]
pub struct Gpu {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub luid: LUID,
    pub vendor_id: u32,
    pub adapter_name: String,
}

impl Gpu {
    /// Creates the device on the adapter that drives `display`, so capture,
    /// conversion and encoding stay on one GPU with no cross-adapter copies.
    pub fn for_display(display: &DisplayInfo) -> Result<Gpu> {
        Self::for_adapter(display.adapter_index)
    }

    pub fn for_adapter(index: u32) -> Result<Gpu> {
        let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1()? };
        let adapter: IDXGIAdapter1 = unsafe { factory.EnumAdapters1(index) }
            .context("graphics adapter disappeared")?;
        let desc = unsafe { adapter.GetDesc1()? };
        let base: IDXGIAdapter = adapter.cast()?;
        let mut device = None;
        let mut context = None;
        unsafe {
            D3D11CreateDevice(
                &base,
                D3D_DRIVER_TYPE_UNKNOWN,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
                Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .context("D3D11CreateDevice")?;
        }
        let device = device.ok_or_else(|| anyhow!("no D3D11 device"))?;
        let context = context.ok_or_else(|| anyhow!("no D3D11 context"))?;
        // The capture callback, video processor and encoder share the
        // immediate context from different threads.
        let mt: ID3D11Multithread = device.cast()?;
        unsafe {
            let _ = mt.SetMultithreadProtected(true);
        }
        Ok(Gpu { device, context, luid: desc.AdapterLuid, vendor_id: desc.VendorId, adapter_name: utf16(&desc.Description) })
    }
}
