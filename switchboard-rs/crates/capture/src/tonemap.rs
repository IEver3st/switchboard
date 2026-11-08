use std::sync::OnceLock;

use anyhow::{Result, anyhow};
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::{D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST, ID3DBlob};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_SAMPLE_DESC};
use windows::core::{Interface, PCSTR, s};

const SHADER: &str = r#"
Texture2D<float4> src : register(t0);
cbuffer Params : register(b0) { float scale; float knee; float2 unused; };

float4 vs(uint id : SV_VertexID) : SV_Position {
    float2 uv = float2((id << 1) & 2, id & 2);
    return float4(uv * float2(2, -2) + float2(-1, 1), 0, 1);
}

float3 encode_srgb(float3 c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

float4 ps(float4 pos : SV_Position) : SV_Target {
    float3 c = max(src.Load(int3(pos.xy, 0)).rgb * scale, 0);
    float peak = max(c.r, max(c.g, c.b));
    if (peak > knee) {
        float room = 1 - knee;
        float mapped = knee + room * (1 - exp(-(peak - knee) / room));
        c *= mapped / peak;
    }
    return float4(encode_srgb(saturate(c)), 1);
}
"#;

const KNEE: f32 = 0.8;

struct Bytecode {
    vs: Vec<u8>,
    ps: Vec<u8>,
}

fn bytecode() -> Result<&'static Bytecode> {
    static CODE: OnceLock<std::result::Result<Bytecode, String>> = OnceLock::new();
    CODE.get_or_init(|| Ok(Bytecode { vs: compile(s!("vs"), s!("vs_4_0"))?, ps: compile(s!("ps"), s!("ps_4_0"))? }))
        .as_ref()
        .map_err(|e| anyhow!("{e}"))
}

fn compile(entry: PCSTR, target: PCSTR) -> std::result::Result<Vec<u8>, String> {
    let mut code: Option<ID3DBlob> = None;
    let mut errors: Option<ID3DBlob> = None;
    let r = unsafe {
        D3DCompile(SHADER.as_ptr().cast(), SHADER.len(), None, None, None, entry, target, 0, 0, &mut code, Some(&mut errors))
    };
    let bytes = |b: &ID3DBlob| unsafe { std::slice::from_raw_parts(b.GetBufferPointer() as *const u8, b.GetBufferSize()).to_vec() };
    match (r, code) {
        (Ok(()), Some(code)) => Ok(bytes(&code)),
        (r, _) => Err(format!(
            "HDR shader did not compile ({}): {}",
            r.err().map(|e| e.message()).unwrap_or_default(),
            errors.as_ref().map(|e| String::from_utf8_lossy(&bytes(e)).into_owned()).unwrap_or_default()
        )),
    }
}

pub(crate) fn available() -> bool {
    match bytecode() {
        Ok(_) => true,
        Err(e) => {
            static LOGGED: OnceLock<()> = OnceLock::new();
            LOGGED.get_or_init(|| switchboard_log::log!("capture: {e:#}; HDR displays are recorded without tone mapping"));
            false
        }
    }
}

pub(crate) struct ToneMap {
    vs: ID3D11VertexShader,
    ps: ID3D11PixelShader,
    params: ID3D11Buffer,
    multithread: ID3D11Multithread,
    source: Option<(ID3D11Texture2D, ID3D11ShaderResourceView, u32, u32)>,
    target: Option<(u64, ID3D11RenderTargetView)>,
}

#[repr(C)]
struct Params {
    scale: f32,
    knee: f32,
    unused: [f32; 2],
}

impl ToneMap {
    pub fn new(device: &ID3D11Device) -> Result<ToneMap> {
        let code = bytecode()?;
        unsafe {
            let mut vs = None;
            device.CreateVertexShader(&code.vs, None, Some(&mut vs))?;
            let mut ps = None;
            device.CreatePixelShader(&code.ps, None, Some(&mut ps))?;
            let desc = D3D11_BUFFER_DESC {
                ByteWidth: size_of::<Params>() as u32,
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
                ..Default::default()
            };
            let mut params = None;
            device.CreateBuffer(&desc, None, Some(&mut params))?;
            Ok(ToneMap {
                vs: vs.unwrap(),
                ps: ps.unwrap(),
                params: params.unwrap(),
                multithread: device.cast()?,
                source: None,
                target: None,
            })
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn draw(
        &mut self,
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        src: &ID3D11Texture2D,
        w: u32,
        h: u32,
        dst: &ID3D11Texture2D,
        generation: u64,
        scale: f32,
    ) -> Result<()> {
        unsafe {
            if self.source.as_ref().is_none_or(|s| s.2 != w || s.3 != h) {
                self.source = None;
                let desc = D3D11_TEXTURE2D_DESC {
                    Width: w,
                    Height: h,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_R16G16B16A16_FLOAT,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_DEFAULT,
                    BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                    CPUAccessFlags: 0,
                    MiscFlags: 0,
                };
                let mut tex = None;
                device.CreateTexture2D(&desc, None, Some(&mut tex))?;
                let tex = tex.unwrap();
                let mut view = None;
                device.CreateShaderResourceView(&tex, None, Some(&mut view))?;
                self.source = Some((tex, view.unwrap(), w, h));
            }
            if self.target.as_ref().is_none_or(|t| t.0 != generation) {
                self.target = None;
                let mut view = None;
                device.CreateRenderTargetView(dst, None, Some(&mut view))?;
                self.target = Some((generation, view.unwrap()));
            }
            let (tex, view, _, _) = self.source.as_ref().unwrap();
            let rtv = &self.target.as_ref().unwrap().1;
            let bx = D3D11_BOX { left: 0, top: 0, front: 0, right: w, bottom: h, back: 1 };
            let params = Params { scale, knee: KNEE, unused: [0.0; 2] };
            self.multithread.Enter();
            context.CopySubresourceRegion(tex, 0, 0, 0, 0, src, 0, Some(&bx));
            context.UpdateSubresource(&self.params, 0, None, &params as *const Params as *const _, 0, 0);
            context.IASetInputLayout(None);
            context.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.VSSetShader(&self.vs, None);
            context.PSSetShader(&self.ps, None);
            context.PSSetShaderResources(0, Some(&[Some(view.clone())]));
            context.PSSetConstantBuffers(0, Some(&[Some(self.params.clone())]));
            context.RSSetState(None);
            context.RSSetViewports(Some(&[D3D11_VIEWPORT { TopLeftX: 0.0, TopLeftY: 0.0, Width: w as f32, Height: h as f32, MinDepth: 0.0, MaxDepth: 1.0 }]));
            context.OMSetBlendState(None, None, u32::MAX);
            context.OMSetRenderTargets(Some(&[Some(rtv.clone())]), None);
            context.Draw(3, 0);
            context.OMSetRenderTargets(None, None);
            context.PSSetShaderResources(0, Some(&[None]));
            self.multithread.Leave();
        }
        Ok(())
    }
}
