//! Windows Graphics Capture. Each arriving frame is copied GPU-side into one
//! "latest" BGRA texture; the video thread samples it at the output rate.

use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_BOX, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
    ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::core::{IInspectable, Interface};

use crate::clock::now_hns;
use crate::gpu::{DisplayInfo, Gpu, monitor_is, sdr_white_scale};
use crate::tonemap::{self, ToneMap};

#[derive(Default)]
pub struct Latest {
    pub texture: Option<ID3D11Texture2D>,
    pub width: u32,
    pub height: u32,
    /// Bumped whenever `texture` is replaced, so views can be rebuilt.
    pub generation: u64,
}

#[derive(Default)]
pub struct CaptureShared {
    pub latest: Mutex<Latest>,
    pub frames: AtomicU64,
    pub last_frame_hns: AtomicI64,
    /// Set when Windows closes the capture item (display removed, session lost).
    pub closed: std::sync::atomic::AtomicBool,
}

/// The device is created with multithread protection, so the immediate
/// context may be used from the WinRT callback thread.
struct SendGpu(
    windows::Win32::Graphics::Direct3D11::ID3D11Device,
    windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext,
    IDirect3DDevice,
);
unsafe impl Send for SendGpu {}
unsafe impl Sync for SendGpu {}

pub struct Capture {
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    item: GraphicsCaptureItem,
    token: i64,
    closed_token: i64,
    pub shared: Arc<CaptureShared>,
    target: Target,
}

#[derive(Clone)]
pub struct Target {
    monitor: isize,
    window: isize,
    device_name: String,
    fps: u32,
    cursor: bool,
}

const BUFFERS: i32 = 2;
const HDR_CHECK: Duration = Duration::from_secs(2);

struct Hdr {
    device_name: String,
    checked: Instant,
    scale: Option<f32>,
    format: DirectXPixelFormat,
    tonemap: Option<ToneMap>,
    failed: bool,
}

impl Hdr {
    fn new(device_name: &str) -> Hdr {
        let scale = Self::read(device_name);
        Hdr { device_name: device_name.to_string(), checked: Instant::now(), scale, format: Self::format(scale), tonemap: None, failed: false }
    }

    fn read(device_name: &str) -> Option<f32> {
        sdr_white_scale(device_name).filter(|_| tonemap::available())
    }

    fn fail(&mut self, e: anyhow::Error) {
        switchboard_log::log!("capture: HDR tone mapping failed ({e:#}); recording without it");
        self.tonemap = None;
        self.failed = true;
        self.checked = Instant::now() - HDR_CHECK;
    }

    fn format(scale: Option<f32>) -> DirectXPixelFormat {
        if scale.is_some() { DirectXPixelFormat::R16G16B16A16Float } else { DirectXPixelFormat::B8G8R8A8UIntNormalized }
    }

    fn refresh(&mut self) -> Option<DirectXPixelFormat> {
        if self.checked.elapsed() < HDR_CHECK {
            return None;
        }
        self.checked = Instant::now();
        let scale = if self.failed { None } else { Self::read(&self.device_name) };
        if scale.is_some() != self.scale.is_some() {
            switchboard_log::log!("capture: {} HDR is now {}", self.device_name, if scale.is_some() { "on" } else { "off" });
        }
        self.scale = scale;
        let format = Self::format(scale);
        (format != self.format).then(|| {
            self.format = format;
            format
        })
    }
}

impl Capture {
    pub fn start_display(gpu: &Gpu, display: &DisplayInfo, fps: u32, cursor: bool) -> Result<Capture> {
        let shared = Arc::new(CaptureShared::default());
        shared.last_frame_hns.store(now_hns(), Ordering::Relaxed);
        let target = Target { monitor: display.hmonitor().0 as isize, window: 0, device_name: display.device_name.clone(), fps, cursor };
        Self::start(gpu, target, shared)
    }

    pub fn start_window(gpu: &Gpu, hwnd: isize, fps: u32, cursor: bool, shared: Arc<CaptureShared>) -> Result<Capture> {
        use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFOEXW, MonitorFromWindow};
        let monitor = unsafe { MonitorFromWindow(HWND(hwnd as *mut core::ffi::c_void), MONITOR_DEFAULTTONEAREST) };
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
        let device_name = if unsafe { GetMonitorInfoW(monitor, &mut info.monitorInfo) }.as_bool() {
            String::from_utf16_lossy(&info.szDevice[..info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len())])
        } else {
            String::new()
        };
        shared.last_frame_hns.store(now_hns(), Ordering::Relaxed);
        Self::start(gpu, Target { monitor: monitor.0 as isize, window: hwnd, device_name, fps, cursor }, shared)
    }

    pub fn target(&self) -> Target {
        self.target.clone()
    }

    pub fn reopen(gpu: &Gpu, target: Target, shared: Arc<CaptureShared>) -> Result<Capture> {
        if target.window != 0 && !crate::apps::window_alive(target.window) {
            bail!("the recorded app's window closed");
        }
        if target.window == 0 && !monitor_is(target.monitor, &target.device_name) {
            bail!("{} is no longer the same display", target.device_name);
        }
        Self::start(gpu, target, shared)
    }

    fn start(gpu: &Gpu, target: Target, shared: Arc<CaptureShared>) -> Result<Capture> {
        let (fps, cursor) = (target.fps, target.cursor);
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem = if target.window != 0 {
            unsafe { interop.CreateForWindow(HWND(target.window as *mut core::ffi::c_void)) }.context("CreateForWindow")?
        } else {
            let hmonitor = HMONITOR(target.monitor as *mut core::ffi::c_void);
            unsafe { interop.CreateForMonitor(hmonitor) }.context("CreateForMonitor")?
        };
        let dxgi: IDXGIDevice = gpu.device.cast()?;
        let d3d: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let size = item.Size()?;
        let hdr = Hdr::new(&target.device_name);
        if hdr.scale.is_some() {
            switchboard_log::log!("capture: {} is in HDR; recording tone-mapped SDR", target.device_name);
        }
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d, hdr.format, BUFFERS, size)?;
        let hdr = Mutex::new(hdr);
        let session = pool.CreateCaptureSession(&item)?;
        let _ = session.SetIsCursorCaptureEnabled(cursor);
        // Windows 11: no yellow border; ignored where unsupported.
        let _ = session.SetIsBorderRequired(false);
        // Windows 11 24H2: no point delivering frames faster than we encode.
        let _ = session.SetMinUpdateInterval(TimeSpan { Duration: 10_000_000 / fps.max(1) as i64 });

        let cb_shared = shared.clone();
        let gpu = SendGpu(gpu.device.clone(), gpu.context.clone(), d3d.clone());
        let pool_size = Mutex::new(size);
        let handler = TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(move |pool, _| {
            let SendGpu(device, context, d3d) = &gpu;
            let Some(pool) = pool.as_ref() else { return Ok(()) };
            let frame = pool.TryGetNextFrame()?;
            let content = frame.ContentSize()?;
            let mut hdr = hdr.lock().unwrap();
            {
                let mut ps = pool_size.lock().unwrap();
                let format = hdr.refresh();
                if content.Width != ps.Width || content.Height != ps.Height || format.is_some() {
                    *ps = content;
                    drop(ps);
                    let _ = frame.Close();
                    pool.Recreate(d3d, hdr.format, BUFFERS, content)?;
                    return Ok(());
                }
            }
            let access: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
            let src: ID3D11Texture2D = unsafe { access.GetInterface()? };
            let w = content.Width.max(1) as u32;
            let h = content.Height.max(1) as u32;
            let mut latest = cb_shared.latest.lock().unwrap();
            if latest.texture.is_none() || latest.width != w || latest.height != h {
                latest.texture = Some(create_bgra(device, w, h).map_err(|e| windows::core::Error::new(windows::Win32::Foundation::E_FAIL, e.to_string()))?);
                latest.width = w;
                latest.height = h;
                latest.generation += 1;
            }
            let dst = latest.texture.as_ref().unwrap();
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            unsafe { src.GetDesc(&mut desc) };
            if desc.Format == DXGI_FORMAT_R16G16B16A16_FLOAT {
                let hdr = &mut *hdr;
                let scale = hdr.scale.unwrap_or(1.0);
                let drawn = match &mut hdr.tonemap {
                    Some(t) => t.draw(device, context, &src, w, h, dst, latest.generation, scale),
                    None => ToneMap::new(device).and_then(|mut t| {
                        let r = t.draw(device, context, &src, w, h, dst, latest.generation, scale);
                        hdr.tonemap = Some(t);
                        r
                    }),
                };
                if let Err(e) = drawn {
                    hdr.fail(e);
                }
            } else {
                let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: w, bottom: h, back: 1 };
                unsafe { context.CopySubresourceRegion(dst, 0, 0, 0, 0, &src, 0, Some(&bx)) };
            }
            drop(latest);
            drop(hdr);
            cb_shared.frames.fetch_add(1, Ordering::Relaxed);
            cb_shared.last_frame_hns.store(now_hns(), Ordering::Relaxed);
            let _ = frame.Close();
            Ok(())
        });
        let token = pool.FrameArrived(&handler)?;
        let closed_shared = shared.clone();
        let closed_token = item.Closed(&TypedEventHandler::<GraphicsCaptureItem, IInspectable>::new(move |_, _| {
            closed_shared.closed.store(true, Ordering::Relaxed);
            Ok(())
        }))?;
        session.StartCapture()?;
        Ok(Capture { session, pool, item, token, closed_token, shared, target })
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        let _ = self.pool.RemoveFrameArrived(self.token);
        let _ = self.item.RemoveClosed(self.closed_token);
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

fn create_bgra(device: &windows::Win32::Graphics::Direct3D11::ID3D11Device, w: u32, h: u32) -> Result<ID3D11Texture2D> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: w,
        Height: h,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let mut tex = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut tex))? };
    Ok(tex.unwrap())
}
