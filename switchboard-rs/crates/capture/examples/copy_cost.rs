//! GPU cost of the per-frame WGC "latest" copy (wgc.rs): times a full-frame
//! BGRA CopySubresourceRegion with D3D11 timestamp queries.
//!
//!   cargo run --release --example copy_cost

use switchboard_capture::gpu::Gpu;
use switchboard_capture::list_displays;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};

fn texture(gpu: &Gpu, w: u32, h: u32) -> ID3D11Texture2D {
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
    let mut t = None;
    unsafe { gpu.device.CreateTexture2D(&desc, None, Some(&mut t)).unwrap() };
    t.unwrap()
}

fn query(gpu: &Gpu, kind: D3D11_QUERY) -> ID3D11Query {
    let mut q = None;
    unsafe { gpu.device.CreateQuery(&D3D11_QUERY_DESC { Query: kind, MiscFlags: 0 }, Some(&mut q)).unwrap() };
    q.unwrap()
}

/// Polls a query until the GPU has written it (S_FALSE also maps to Ok, so
/// readiness is a non-zero result).
fn wait<T: Default>(gpu: &Gpu, q: &ID3D11Query, ready: impl Fn(&T) -> bool) -> T {
    unsafe { gpu.context.Flush() };
    loop {
        let mut v = T::default();
        let ok = unsafe {
            gpu.context.GetData(q, Some(&mut v as *mut T as *mut _), std::mem::size_of::<T>() as u32, 0).is_ok()
        };
        if ok && ready(&v) {
            return v;
        }
        std::thread::yield_now();
    }
}

fn main() {
    let display = list_displays().unwrap().into_iter().next().unwrap();
    let gpu = Gpu::for_display(&display).unwrap();
    println!("adapter: {}", gpu.adapter_name);
    for (w, h) in [(1920u32, 1080u32), (2560, 1440), (3840, 2160)] {
        let src = texture(&gpu, w, h);
        let dst = texture(&gpu, w, h);
        let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: w, bottom: h, back: 1 };
        let mut samples = Vec::new();
        for i in 0..240 {
            let disjoint = query(&gpu, D3D11_QUERY_TIMESTAMP_DISJOINT);
            let (a, b) = (query(&gpu, D3D11_QUERY_TIMESTAMP), query(&gpu, D3D11_QUERY_TIMESTAMP));
            unsafe {
                gpu.context.Begin(&disjoint);
                gpu.context.End(&a);
                gpu.context.CopySubresourceRegion(&dst, 0, 0, 0, 0, &src, 0, Some(&bx));
                gpu.context.End(&b);
                gpu.context.End(&disjoint);
            }
            let d: D3D11_QUERY_DATA_TIMESTAMP_DISJOINT = wait(&gpu, &disjoint, |d: &D3D11_QUERY_DATA_TIMESTAMP_DISJOINT| d.Frequency > 0);
            let t0: u64 = wait(&gpu, &a, |t: &u64| *t > 0);
            let t1: u64 = wait(&gpu, &b, |t: &u64| *t > 0);
            if i >= 40 && !d.Disjoint.as_bool() {
                samples.push((t1 - t0) as f64 / d.Frequency as f64 * 1e6);
            }
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let med = samples[samples.len() / 2];
        let mib = w as f64 * h as f64 * 4.0 / (1024.0 * 1024.0);
        println!(
            "{w}x{h}: {mib:.1} MiB per copy, GPU median {med:.0} us, p95 {:.0} us; at 60 fps {:.2} ms/s GPU ({:.2}% of one engine), {:.2} GiB/s moved",
            samples[samples.len() * 95 / 100],
            med * 60.0 / 1000.0,
            med * 60.0 / 1e6 * 100.0,
            mib * 2.0 * 60.0 / 1024.0
        );
    }
}
