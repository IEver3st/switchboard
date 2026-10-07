//! Windows Graphics Capture. Each arriving frame is copied GPU-side into one
//! "latest" BGRA texture; the video thread samples it at the output rate.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_BOX, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
    ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::core::{IInspectable, Interface};

use crate::gpu::{DisplayInfo, Gpu};

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
}

const BUFFERS: i32 = 2;

impl Capture {
    pub fn start_display(gpu: &Gpu, display: &DisplayInfo, fps: u32, cursor: bool) -> Result<Capture> {
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem =
            unsafe { interop.CreateForMonitor(display.hmonitor()) }.context("CreateForMonitor")?;
        Self::start(gpu, item, fps, cursor)
    }

    fn start(gpu: &Gpu, item: GraphicsCaptureItem, fps: u32, cursor: bool) -> Result<Capture> {
        let dxgi: IDXGIDevice = gpu.device.cast()?;
        let d3d: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let size = item.Size()?;
        let format = DirectXPixelFormat::B8G8R8A8UIntNormalized;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d, format, BUFFERS, size)?;
        let session = pool.CreateCaptureSession(&item)?;
        let _ = session.SetIsCursorCaptureEnabled(cursor);
        // Windows 11: no yellow border; ignored where unsupported.
        let _ = session.SetIsBorderRequired(false);
        // Windows 11 24H2: no point delivering frames faster than we encode.
        let _ = session.SetMinUpdateInterval(TimeSpan { Duration: 10_000_000 / fps.max(1) as i64 });

        let shared = Arc::new(CaptureShared::default());
        let cb_shared = shared.clone();
        let gpu = SendGpu(gpu.device.clone(), gpu.context.clone(), d3d.clone());
        let pool_size = Mutex::new(size);
        let handler = TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(move |pool, _| {
            let SendGpu(device, context, d3d) = &gpu;
            let Some(pool) = pool.as_ref() else { return Ok(()) };
            let frame = pool.TryGetNextFrame()?;
            let content = frame.ContentSize()?;
            {
                let mut ps = pool_size.lock().unwrap();
                if content.Width != ps.Width || content.Height != ps.Height {
                    *ps = content;
                    drop(ps);
                    let _ = frame.Close();
                    pool.Recreate(d3d, format, BUFFERS, content)?;
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
            let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: w, bottom: h, back: 1 };
            unsafe { context.CopySubresourceRegion(dst, 0, 0, 0, 0, &src, 0, Some(&bx)) };
            drop(latest);
            cb_shared.frames.fetch_add(1, Ordering::Relaxed);
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
        Ok(Capture { session, pool, item, token, closed_token, shared })
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
