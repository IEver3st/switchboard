use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use switchboard_capture::clock::{HNS_PER_SECOND, now_hns};
use switchboard_capture::{Engine, EngineConfig, Quality, list_audio_devices, list_displays};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::Graphics::Gdi::{BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, InvalidateRect, PAINTSTRUCT, UpdateWindow};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::{CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::w;

const EVENTS: usize = 10;
const SQUARE: i32 = 200;
const CLICK_MS: u32 = 5;

static WHITE: AtomicBool = AtomicBool::new(false);

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    unsafe {
        if msg == WM_PAINT {
            let mut ps = PAINTSTRUCT::default();
            let dc = BeginPaint(hwnd, &mut ps);
            let mut r = RECT::default();
            let _ = GetClientRect(hwnd, &mut r);
            let color = if WHITE.load(Ordering::Relaxed) { 0x00ffffff } else { 0 };
            let brush = CreateSolidBrush(windows::Win32::Foundation::COLORREF(color));
            FillRect(dc, &r, brush);
            let _ = DeleteObject(brush.into());
            let _ = EndPaint(hwnd, &ps);
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wp, lp)
    }
}

struct Renderer {
    click_at: Mutex<Option<mpsc::Sender<i64>>>,
    request: AtomicBool,
    stop: AtomicBool,
}

fn render(r: Arc<Renderer>, ready: mpsc::Sender<Result<()>>) {
    let run = || -> Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
            let format = client.GetMixFormat()?;
            let (rate, channels, bits) = ((*format).nSamplesPerSec, (*format).nChannels as usize, (*format).wBitsPerSample);
            client.Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 1_000_000, 0, format, None)?;
            CoTaskMemFree(Some(format as *const _));
            if bits != 32 {
                bail!("expected a float mix format, got {bits}-bit");
            }
            let size = client.GetBufferSize()?;
            let out: IAudioRenderClient = client.GetService()?;
            let clock: IAudioClock = client.GetService()?;
            let freq = clock.GetFrequency()? as f64;
            client.Start()?;
            ready.send(Ok(())).ok();
            let mut written: u64 = 0;
            let mut click_left = 0u32;
            let click_len = rate * CLICK_MS / 1000;
            while !r.stop.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(5));
                let free = size - client.GetCurrentPadding()?;
                if free == 0 {
                    continue;
                }
                let buf = out.GetBuffer(free)? as *mut f32;
                let samples = std::slice::from_raw_parts_mut(buf, free as usize * channels);
                let mut click_frame = None;
                for f in 0..free as usize {
                    if click_left == 0 && r.request.swap(false, Ordering::Relaxed) {
                        click_left = click_len;
                        click_frame = Some(written + f as u64);
                    }
                    let v = if click_left > 0 {
                        click_left -= 1;
                        0.5
                    } else {
                        0.0
                    };
                    for c in 0..channels {
                        samples[f * channels + c] = v;
                    }
                }
                out.ReleaseBuffer(free, 0)?;
                written += free as u64;
                if let Some(frame) = click_frame {
                    let (mut pos, mut qpc) = (0u64, 0u64);
                    clock.GetPosition(&mut pos, Some(&mut qpc))?;
                    let at = qpc as i64 + ((frame as f64 / rate as f64 - pos as f64 / freq) * HNS_PER_SECOND as f64) as i64;
                    if let Some(tx) = r.click_at.lock().unwrap().as_ref() {
                        let _ = tx.send(at);
                    }
                }
            }
            client.Stop()?;
            Ok(())
        }
    };
    if let Err(e) = run() {
        let _ = ready.send(Err(e));
    }
}

fn ffmpeg_bytes(args: &[&str]) -> Result<Vec<u8>> {
    let out = Command::new("ffmpeg").args(["-v", "error"]).args(args).output().context("ffmpeg")?;
    if !out.status.success() {
        bail!("ffmpeg: {}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(out.stdout)
}

fn frame_times(clip: &str) -> Result<Vec<f64>> {
    let out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", clip])
        .output()?;
    Ok(String::from_utf8_lossy(&out.stdout).lines().filter_map(|l| l.trim().trim_end_matches(',').parse().ok()).collect())
}

fn stats(v: &[f64]) -> (f64, f64) {
    let mean = v.iter().sum::<f64>() / v.len().max(1) as f64;
    let var = v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / v.len().max(1) as f64;
    (mean, var.sqrt())
}

fn main() -> Result<()> {
    let out_dir = std::path::PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| ".".into()));
    std::fs::create_dir_all(&out_dir)?;
    let display = list_displays()?.into_iter().next().context("no display")?;
    let output = list_audio_devices().outputs.into_iter().find(|d| d.is_default).context("no default output")?;
    println!("display {} ({}x{}), Game on {}", display.label(), display.width, display.height, output.name);
    let cache = out_dir.join("av-sync-cache");
    let cfg = EngineConfig {
        display_index: display.index,
        app: None,
        fps: 60,
        target_height: 1080,
        quality: Quality::High,
        codec: Default::default(),
        replay_seconds: 30,
        game_audio: true,
        chat_audio: false,
        microphone: false,
        game_device: Some(output.id.clone()),
        chat_device: None,
        mic_device: None,
        cursor: false,
        cursor_track: false,
        cache_dir: cache.clone(),
    };
    let engine = Engine::start(&cfg)?;
    let (ow, oh) = (engine.info.width, engine.info.height);

    let renderer = Arc::new(Renderer { click_at: Mutex::new(None), request: AtomicBool::new(false), stop: AtomicBool::new(false) });
    let (click_tx, click_rx) = mpsc::channel();
    *renderer.click_at.lock().unwrap() = Some(click_tx);
    let (ready_tx, ready_rx) = mpsc::channel();
    let r = renderer.clone();
    let audio = std::thread::spawn(move || render(r, ready_tx));
    ready_rx.recv()??;

    let flashes = Arc::new(Mutex::new(Vec::new()));
    let hwnd = unsafe {
        let instance = GetModuleHandleW(None)?;
        let class = WNDCLASSW { lpfnWndProc: Some(proc), hInstance: instance.into(), lpszClassName: w!("SbAvSync"), ..Default::default() };
        RegisterClassW(&class);
        CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            w!("SbAvSync"),
            w!("Switchboard A/V sync"),
            WS_POPUP | WS_VISIBLE,
            0,
            0,
            SQUARE,
            SQUARE,
            None,
            None,
            Some(instance.into()),
            None,
        )?
    };
    let pump = |ms: u64| unsafe {
        let until = std::time::Instant::now() + Duration::from_millis(ms);
        while std::time::Instant::now() < until {
            let mut msg = MSG::default();
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    };
    let set = |white: bool| unsafe {
        WHITE.store(white, Ordering::Relaxed);
        let _ = InvalidateRect(Some(hwnd), None, false);
        let _ = UpdateWindow(hwnd);
        let _ = DwmFlush();
    };
    pump(1500);
    for _ in 0..EVENTS {
        set(true);
        flashes.lock().unwrap().push(now_hns());
        renderer.request.store(true, Ordering::Relaxed);
        let _ = flush_twice();
        pump(100);
        set(false);
        pump(1000);
    }
    pump(1000);
    let clip = engine.save(EVENTS as u32 + 3, &out_dir, "av-sync")?;
    renderer.stop.store(true, Ordering::Relaxed);
    let _ = audio.join();
    unsafe {
        let _ = DestroyWindow(hwnd);
    }
    drop(engine);
    let _ = std::fs::remove_dir_all(&cache);
    let clicks: Vec<i64> = click_rx.try_iter().collect();
    let flashes = flashes.lock().unwrap().clone();
    println!("clip {} ({} flashes, {} clicks emitted)", clip.path.display(), flashes.len(), clicks.len());

    let path = clip.path.to_string_lossy().to_string();
    let scale = ow as f64 / display.width as f64;
    let side = ((SQUARE as f64 * scale) as u32).max(4) - 2;
    let crop = format!("crop={side}:{side}:1:1,scale=1:1:flags=area,format=gray");
    let luma = ffmpeg_bytes(&["-i", &path, "-vf", &crop, "-fps_mode", "passthrough", "-f", "rawvideo", "-"])?;
    let times = frame_times(&path)?;
    let mut video = Vec::new();
    for i in 1..luma.len().min(times.len()) {
        if luma[i] > 128 && luma[i - 1] <= 128 {
            video.push(times[i]);
        }
    }
    let pcm = ffmpeg_bytes(&["-i", &path, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"])?;
    let samples: Vec<i16> = pcm.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    let mut sound = Vec::new();
    let mut last = -1.0f64;
    for (i, s) in samples.iter().enumerate() {
        let t = i as f64 / 48000.0;
        if s.unsigned_abs() > 4000 && t - last > 0.5 {
            sound.push(t);
            last = t;
        } else if s.unsigned_abs() > 4000 {
            last = t;
        }
    }
    println!("found {} flashes and {} clicks in the clip ({}x{} output)", video.len(), sound.len(), ow, oh);
    let secs = |hns: i64| hns as f64 / HNS_PER_SECOND as f64;
    let offset = video
        .iter()
        .flat_map(|v| flashes.iter().map(move |f| secs(*f) - v))
        .max_by_key(|o| video.iter().filter(|v| flashes.iter().any(|f| (secs(*f) - **v - o).abs() < 0.05)).count())
        .context("no flashes found")?;
    let mut errors = Vec::new();
    for v in &video {
        let Some(e) = (0..flashes.len().min(clicks.len())).find(|&e| (secs(flashes[e]) - v - offset).abs() < 0.05) else {
            println!("flash at {v:.3} s matches no emitted event");
            continue;
        };
        let emitted = secs(clicks[e]) - secs(flashes[e]);
        let expected = v + emitted;
        let Some(a) = sound.iter().copied().filter(|a| (a - expected).abs() < 0.3).min_by(|a, b| (a - expected).abs().total_cmp(&(b - expected).abs())) else {
            println!("event {e}: no click within 300 ms of where it should be");
            continue;
        };
        let measured = a - v;
        let error = (measured - emitted) * 1000.0;
        println!("event {e}: emitted audio-video {:+.1} ms, in clip {:+.1} ms, error {:+.1} ms", emitted * 1000.0, measured * 1000.0, error);
        errors.push(error);
    }
    if errors.is_empty() {
        bail!("no events matched");
    }
    let (mean, sd) = stats(&errors);
    println!("A/V error: mean {mean:+.1} ms, stddev {sd:.1} ms (positive = audio late in the clip)");
    Ok(())
}

fn flush_twice() -> windows::core::Result<()> {
    unsafe {
        DwmFlush()?;
        DwmFlush()
    }
}
