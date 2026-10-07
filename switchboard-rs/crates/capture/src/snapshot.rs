//! A small still of the newest captured frame, scaled on the GPU by the video
//! processor. Saves use it for the clip's thumbnail, so a new clip never has
//! to be decoded just to show a preview.

use std::mem::ManuallyDrop;

use anyhow::{Context, Result, anyhow};
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::core::Interface;

use crate::wgc::CaptureShared;

fn texture(device: &ID3D11Device, w: u32, h: u32, staging: bool) -> Result<ID3D11Texture2D> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: w,
        Height: h,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
        Usage: if staging { D3D11_USAGE_STAGING } else { D3D11_USAGE_DEFAULT },
        BindFlags: if staging { 0 } else { D3D11_BIND_RENDER_TARGET.0 as u32 },
        CPUAccessFlags: if staging { D3D11_CPU_ACCESS_READ.0 as u32 } else { 0 },
        MiscFlags: 0,
    };
    let mut tex = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut tex))? };
    tex.ok_or_else(|| anyhow!("texture creation failed"))
}

/// The newest frame fitted (letterboxed) into `out_w` x `out_h`, as RGBA.
pub(crate) fn snapshot_rgba(shared: &CaptureShared, out_w: u32, out_h: u32) -> Result<Vec<u8>> {
    // Hold the lock for the blit: the capture callback copies into this texture.
    let latest = shared.latest.lock().unwrap();
    let src = latest.texture.clone().ok_or_else(|| anyhow!("no frame captured yet"))?;
    let (w, h) = (latest.width, latest.height);
    let device = unsafe { src.GetDevice()? };
    let context = unsafe { device.GetImmediateContext()? };
    let vdev: ID3D11VideoDevice = device.cast().context("no D3D11 video device")?;
    let vctx: ID3D11VideoContext1 = context.cast().context("no D3D11 video context")?;

    let rate = DXGI_RATIONAL { Numerator: 60, Denominator: 1 };
    let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
        InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
        InputFrameRate: rate,
        InputWidth: w,
        InputHeight: h,
        OutputFrameRate: rate,
        OutputWidth: out_w,
        OutputHeight: out_h,
        Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
    };
    let en = unsafe { vdev.CreateVideoProcessorEnumerator(&desc)? };
    let vp = unsafe { vdev.CreateVideoProcessor(&en, 0)? };
    let scale = f64::min(out_w as f64 / w as f64, out_h as f64 / h as f64);
    let dw = ((w as f64 * scale).round() as i32).min(out_w as i32);
    let dh = ((h as f64 * scale).round() as i32).min(out_h as i32);
    let (dx, dy) = ((out_w as i32 - dw) / 2, (out_h as i32 - dh) / 2);
    let black = D3D11_VIDEO_COLOR { Anonymous: D3D11_VIDEO_COLOR_0 { RGBA: D3D11_VIDEO_COLOR_RGBA { R: 0.0, G: 0.0, B: 0.0, A: 1.0 } } };
    unsafe {
        vctx.VideoProcessorSetStreamFrameFormat(&vp, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
        vctx.VideoProcessorSetStreamAutoProcessingMode(&vp, 0, false);
        vctx.VideoProcessorSetStreamSourceRect(&vp, 0, true, Some(&RECT { left: 0, top: 0, right: w as i32, bottom: h as i32 }));
        vctx.VideoProcessorSetStreamDestRect(&vp, 0, true, Some(&RECT { left: dx, top: dy, right: dx + dw, bottom: dy + dh }));
        vctx.VideoProcessorSetOutputBackgroundColor(&vp, false, &black);
        vctx.VideoProcessorSetStreamColorSpace1(&vp, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
        vctx.VideoProcessorSetOutputColorSpace1(&vp, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
    }

    let target = texture(&device, out_w, out_h, false)?;
    let in_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
        FourCC: 0,
        ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
        Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: 0 } },
    };
    let out_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
        ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
        Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 } },
    };
    let mut input = None;
    let mut output = None;
    unsafe {
        vdev.CreateVideoProcessorInputView(&src, &en, &in_desc, Some(&mut input))?;
        vdev.CreateVideoProcessorOutputView(&target, &en, &out_desc, Some(&mut output))?;
    }
    let output = output.ok_or_else(|| anyhow!("no output view"))?;
    let streams = [D3D11_VIDEO_PROCESSOR_STREAM { Enable: true.into(), pInputSurface: ManuallyDrop::new(input), ..Default::default() }];
    let result = unsafe { vctx.VideoProcessorBlt(&vp, &output, 0, &streams) };
    let [stream] = streams;
    drop(ManuallyDrop::into_inner(stream.pInputSurface));
    result.context("VideoProcessorBlt")?;
    drop(latest);

    let staging = texture(&device, out_w, out_h, true)?;
    let mut rgba = vec![0u8; (out_w * out_h * 4) as usize];
    unsafe {
        context.CopyResource(&staging, &target);
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        let row = (out_w * 4) as usize;
        for y in 0..out_h as usize {
            let src = std::slice::from_raw_parts((mapped.pData as *const u8).add(y * mapped.RowPitch as usize), row);
            let dst = &mut rgba[y * row..(y + 1) * row];
            for (d, s) in dst.chunks_exact_mut(4).zip(src.chunks_exact(4)) {
                d[0] = s[2];
                d[1] = s[1];
                d[2] = s[0];
                d[3] = 255;
            }
        }
        context.Unmap(&staging, 0);
    }
    Ok(rgba)
}
