//! D3D11 device and display enumeration.

use anyhow::{Context, Result, anyhow};
use windows::Win32::Foundation::{HMODULE, LUID};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_CREATE_DEVICE_VIDEO_SUPPORT, D3D11_SDK_VERSION, D3D11CreateDevice,
    ID3D11Device, ID3D11DeviceContext, ID3D11Multithread,
};
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIAdapter, IDXGIAdapter1, IDXGIFactory1};
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::core::Interface;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DisplayInfo {
    pub index: usize,
    pub device_name: String,
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
    pub fn label(&self) -> String {
        let n = self.device_name.trim_start_matches("\\\\.\\DISPLAY");
        let primary = if self.primary { ", primary" } else { "" };
        format!("Display {n} ({}\u{d7}{}{primary})", self.width, self.height)
    }

    pub(crate) fn hmonitor(&self) -> HMONITOR {
        HMONITOR(self.monitor as *mut core::ffi::c_void)
    }
}

/// Lists desktop-attached outputs, primary first, then left to right.
pub fn list_displays() -> Result<Vec<DisplayInfo>> {
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
                out.push(DisplayInfo {
                    index: 0,
                    device_name: utf16(&desc.DeviceName),
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
    out.sort_by_key(|d| (!d.primary, d.device_name.clone()));
    for (i, d) in out.iter_mut().enumerate() {
        d.index = i;
    }
    Ok(out)
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
    pub adapter_name: String,
}

impl Gpu {
    /// Creates the device on the adapter that drives `display`, so capture,
    /// conversion and encoding stay on one GPU with no cross-adapter copies.
    pub fn for_display(display: &DisplayInfo) -> Result<Gpu> {
        let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1()? };
        let adapter: IDXGIAdapter1 = unsafe { factory.EnumAdapters1(display.adapter_index) }
            .context("display adapter disappeared")?;
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
        Ok(Gpu { device, context, luid: desc.AdapterLuid, adapter_name: utf16(&desc.Description) })
    }
}
