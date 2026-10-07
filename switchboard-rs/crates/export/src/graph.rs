//! FFmpeg filtergraph builders, ported from the Electron app's
//! `clip-effects-renderer.ts` (advanced path) and `montage-v2-renderer.ts`
//! (simple path and music pass). Expressions keep the old strings so output
//! matches the old exports.

use switchboard_project::{
    AudioAutomation, Canvas, FramingMode, FramingBackground, GainPoint, Interpolation, MuteRange, Music, OverlayKind,
    Segment, TextSize, VideoEdits, edited_duration_ms, moving_duration_ms, speed_at, title_overlay,
};

/// Output frame target shared by every segment of one export.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Target {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub canvas: Canvas,
}

/// Number formatting that matches `Number(value.toFixed(9)).toString()`.
pub fn num(v: f64) -> String {
    let r = (v * 1e9).round() / 1e9;
    if r == 0.0 || !r.is_finite() {
        return "0".into();
    }
    format!("{r}")
}

pub fn secs(ms: f64) -> String {
    num(ms / 1000.0)
}

pub fn fixed3(v: f64) -> String {
    let s = format!("{v:.3}");
    if s == "-0.000" { "0.000".into() } else { s }
}

fn even(v: f64) -> u32 {
    ((v / 2.0).floor() as i64 * 2).max(2) as u32
}

/// Escapes a value for an option inside a `-filter_complex` graph. Two
/// levels: the option parser (single quotes, `'` as `'\''`) and the graph
/// parser (backslash before `\ ' [ ] , ;`). Pair drawtext with
/// `expansion=none` so `%` stays literal.
pub fn filter_value(raw: &str) -> String {
    let level1 = format!("'{}'", raw.replace('\'', "'\\''"));
    let mut out = String::with_capacity(level1.len() * 2);
    for c in level1.chars() {
        if matches!(c, '\\' | '\'' | '[' | ']' | ',' | ';') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Escapes one line of an FFmpeg concat demuxer list.
pub fn concat_line(path: &str) -> String {
    format!("file '{}'", path.replace('\'', "'\\''"))
}

pub fn has_advanced_edits(edits: Option<&VideoEdits>) -> bool {
    edits.is_some_and(|e| {
        e.text.as_ref().is_some_and(|t| !t.content.is_empty())
            || e.framing.is_some()
            || !e.overlays.is_empty()
            || !e.speed_points.is_empty()
            || !e.freezes.is_empty()
            || !e.audio_automation.is_empty()
    })
}

#[derive(Clone, Copy)]
enum Ease {
    Linear,
    Smooth,
    Hold,
}

struct Point {
    time_ms: f64,
    value: f64,
    ease: Ease,
}

fn interpolate(points: &[Point], var: &str, fallback: f64) -> String {
    let Some(last) = points.last() else { return num(fallback) };
    let mut expr = num(last.value);
    for i in (0..points.len() - 1).rev() {
        let (a, b) = (&points[i], &points[i + 1]);
        let mut t = format!("clip(({var}-{})/{},0,1)", secs(a.time_ms), secs(b.time_ms - a.time_ms));
        if matches!(a.ease, Ease::Smooth) {
            t = format!("({t})*({t})*(3-2*({t}))");
        }
        let value = if matches!(a.ease, Ease::Hold) {
            num(a.value)
        } else {
            format!("{}+({})*({t})", num(a.value), num(b.value - a.value))
        };
        expr = format!("if(lt({var},{}),{value},{expr})", secs(b.time_ms));
    }
    expr
}

fn ease(i: Interpolation) -> Ease {
    match i {
        Interpolation::Linear => Ease::Linear,
        Interpolation::Smooth => Ease::Smooth,
        Interpolation::Hold => Ease::Hold,
    }
}

/// Gain envelope times mute ranges, evaluated per audio frame.
pub fn automation_expression(points: &[GainPoint], mutes: &[MuteRange], var: &str) -> String {
    let pts: Vec<Point> =
        points.iter().map(|p| Point { time_ms: p.time_ms as f64, value: p.gain, ease: Ease::Linear }).collect();
    let gain = interpolate(&pts, var, 1.0);
    let mutes: Vec<String> = mutes
        .iter()
        .map(|m| format!("(1-gte({var},{})*lt({var},{}))", secs(m.start_ms as f64), secs(m.end_ms as f64)))
        .collect();
    if mutes.is_empty() { format!("({gain})") } else { format!("({gain})*{}", mutes.join("*")) }
}

fn track_automation_expression(a: Option<&AudioAutomation>, var: &str) -> String {
    match a {
        Some(a) => automation_expression(&a.points, &a.mutes, var),
        None => automation_expression(&[], &[], var),
    }
}

/// Output time (seconds) of source time `var`: the integral of 1/speed plus
/// freezes already passed.
pub fn edited_pts_expression(start: i64, end: i64, edits: Option<&VideoEdits>, var: &str) -> String {
    let (start, end) = (start as f64, end as f64);
    let mut bounds = vec![start];
    if let Some(e) = edits {
        bounds.extend(e.speed_points.iter().map(|p| p.time_ms as f64).filter(|&t| t > start && t < end));
    }
    bounds.push(end);
    let mut terms = Vec::new();
    for w in bounds.windows(2) {
        let (a, b) = (w[0], w[1]);
        let from = speed_at(a, edits);
        let to = speed_at(b - 0.000_001, edits);
        let slope = (to - from) / ((b - a) / 1000.0);
        let u = format!("clip({var}-{},0,{})", secs(a), secs(b - a));
        terms.push(if slope.abs() < 0.000_001 {
            format!("({u})/{}", num(from))
        } else {
            format!("log(({}+({})*({u}))/{})/({})", num(from), num(slope), num(from), num(slope))
        });
    }
    if let Some(e) = edits {
        for h in &e.freezes {
            let t = h.time_ms as f64;
            if t >= start && t < end {
                terms.push(format!("gt({var},{})*{}", secs(t), secs(h.duration_ms as f64)));
            }
        }
    }
    if terms.is_empty() { "0".into() } else { terms.join("+") }
}

fn lut(expr: &str) -> String {
    format!("lutrgb=r='{expr}':g='{expr}':b='{expr}'")
}

/// Brightness, contrast, saturation and flip, in the preview's order.
fn look_filters(edits: Option<&VideoEdits>, fmt: fn(f64) -> String) -> Vec<String> {
    let mut look = Vec::new();
    let Some(e) = edits else { return look };
    if e.flip_horizontal.unwrap_or(false) {
        look.push("hflip".into());
    }
    if let Some(b) = e.brightness.filter(|&b| b != 0.0) {
        look.push(lut(&format!("clip(val*{},0,255)", fmt(1.0 + b))));
    }
    if let Some(c) = e.contrast.filter(|&c| c != 1.0) {
        look.push(lut(&format!("clip((val-127.5)*{}+127.5,0,255)", fmt(c))));
    }
    if let Some(s) = e.saturation.filter(|&s| s != 1.0) {
        let (r, g, b) = (0.213 * (1.0 - s), 0.715 * (1.0 - s), 0.072 * (1.0 - s));
        look.push(format!(
            "colorchannelmixer=rr={}:rg={}:rb={}:gr={}:gg={}:gb={}:br={}:bg={}:bb={}",
            num(r + s),
            num(g),
            num(b),
            num(r),
            num(g + s),
            num(b),
            num(r),
            num(g),
            num(b + s)
        ));
    }
    look
}

pub fn font_file() -> String {
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
    format!("{windir}\\Fonts\\arialbd.ttf").replace('\\', "/")
}

/// Advanced video graph: framing keyframes (zoompan), blur background,
/// overlays, and speed ramps/freezes as a PTS expression. `[0:v:0]` must be
/// seeked to the segment's trim start.
pub fn advanced_video_graph(source_w: u32, source_h: u32, seg: &Segment, target: &Target) -> String {
    let edits = seg.edits();
    let start = seg.trim_start_ms as f64;
    let (w, h) = (target.width as f64, target.height as f64);
    let ratio = w / h;
    let (sw, sh) = (even(source_w as f64) as f64, even(source_h as f64) as f64);
    let pw = even(sw.max(sh * ratio)) as f64;
    let ph = even(sh.max(sw / ratio)) as f64;
    let (pad_x, pad_y) = ((pw - sw) / 2.0, (ph - sh) / 2.0);
    let framing = edits.and_then(|e| e.framing.as_ref());
    let mode = framing.map(|f| f.mode).unwrap_or(if target.canvas == Canvas::Original { FramingMode::Fit } else { FramingMode::Fill });
    let keys = framing.map(|f| f.keyframes.as_slice()).unwrap_or(&[]);
    let var = format!("(in_time+{})", secs(start));
    let series = |f: fn(&switchboard_project::FramingKeyframe) -> f64| -> Vec<Point> {
        keys.iter().map(|k| Point { time_ms: k.time_ms as f64, value: f(k), ease: ease(k.transition) }).collect()
    };
    let zoom = interpolate(&series(|k| k.zoom), &var, 1.0);
    let x = interpolate(&series(|k| k.x), &var, 0.5);
    let y = interpolate(&series(|k| k.y), &var, 0.5);
    let fps = num(target.fps);

    let mut look = vec!["setpts=PTS-STARTPTS".to_string(), format!("scale={sw}:{sh}"), "setsar=1".into()];
    look.extend(look_filters(edits, num));
    let mut filters = vec![format!("[0:v:0]{}[picture]", look.join(","))];
    if mode == FramingMode::Fill {
        filters.push(format!(
            "[picture]zoompan=z='{zoom}':x='(iw-iw/zoom)*({x})':y='(ih-ih/zoom)*({y})':d=1:s={sw}x{sh}:fps={fps},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:x='(iw-ow)*({xt})':y='(ih-oh)*({yt})',setsar=1[framed]",
            xt = x.replace("in_time", "t"),
            yt = y.replace("in_time", "t"),
        ));
    } else {
        if framing.is_some_and(|f| f.background == FramingBackground::Blur) {
            filters.push("[picture]split[foreground][background]".into());
            filters.push(format!(
                "[background]scale={pw}:{ph}:force_original_aspect_ratio=increase,crop={pw}:{ph},gblur=sigma={}[blurred]",
                num((ph * 0.02).clamp(3.0, 64.0))
            ));
            filters.push(format!("[blurred][foreground]overlay=x={}:y={}[padded]", num(pad_x), num(pad_y)));
        } else {
            filters.push(format!("[picture]pad={pw}:{ph}:{}:{}:color=black[padded]", num(pad_x), num(pad_y)));
        }
        filters.push(format!(
            "[padded]zoompan=z='{zoom}':x='{px}+({sw}-iw/zoom)*({x})':y='{py}+({sh}-ih/zoom)*({y})':d=1:s={w}x{h}:fps={fps},setsar=1[framed]",
            px = num(pad_x),
            py = num(pad_y),
        ));
    }

    let mut overlays = edits.map(|e| e.overlays.clone()).unwrap_or_default();
    if let Some(t) = edits.and_then(|e| e.text.as_ref()).filter(|t| !t.content.is_empty()) {
        overlays.insert(0, title_overlay(t, w, h));
    }
    let mut label = "framed".to_string();
    for (i, item) in overlays.iter().enumerate() {
        if item.end_ms as f64 <= start || item.start_ms >= seg.trim_end_ms {
            continue;
        }
        let out = format!("overlay{i}");
        let enabled = format!("gte(t,{})*lt(t,{})", secs(item.start_ms as f64 - start), secs(item.end_ms as f64 - start));
        let (ox, oy) = ((item.x * w).floor(), (item.y * h).floor());
        let (ow, oh) = (even(item.width * w) as f64, even(item.height * h) as f64);
        match item.kind {
            OverlayKind::Text => {
                let Some(content) = item.content.as_deref().filter(|c| !c.is_empty()) else { continue };
                let lines: Vec<&str> = content.split('\n').collect();
                let longest = lines.iter().map(|l| l.chars().count()).max().unwrap_or(1).max(1) as f64;
                let fraction = item.size.unwrap_or(TextSize::Medium).fraction();
                let size = (h * fraction)
                    .min(item.width * w / (longest * 0.65))
                    .min(item.height * h / (lines.len().max(1) as f64 * 1.2))
                    .max(1.0);
                filters.push(format!(
                    "[{label}]drawtext=fontfile={}:text={}:expansion=none:fontsize={}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6:x={}-text_w/2:y={}:enable='{enabled}'[{out}]",
                    filter_value(&font_file()),
                    filter_value(content),
                    num(size),
                    num((item.x + item.width / 2.0) * w),
                    num(oy),
                ));
            }
            kind => {
                filters.push(format!("[{label}]split[mask-base{i}][mask-source{i}]"));
                let effect = if kind == OverlayKind::Blur {
                    format!("gblur=sigma={}", num((h * 0.02).max(3.0)))
                } else {
                    let cell = (h / 60.0).max(6.0);
                    format!(
                        "scale={}:{}:flags=neighbor,scale={ow}:{oh}:flags=neighbor",
                        num((ow / cell).round().max(2.0)),
                        num((oh / cell).round().max(2.0))
                    )
                };
                filters.push(format!(
                    "[mask-source{i}]crop={ow}:{oh}:{}:{},{effect}[mask{i}]",
                    num((w - ow).min(ox)),
                    num((h - oh).min(oy))
                ));
                filters.push(format!("[mask-base{i}][mask{i}]overlay=x={}:y={}:enable='{enabled}'[{out}]", num(ox), num(oy)));
            }
        }
        label = out;
    }
    let duration = secs(edited_duration_ms(seg.trim_start_ms, seg.trim_end_ms, edits) as f64);
    let timing = edited_pts_expression(seg.trim_start_ms, seg.trim_end_ms, edits, &format!("(T+{})", secs(start)));
    filters.push(format!(
        "[{label}]settb=AVTB,setpts='({timing})/TB',tpad=stop_mode=clone:stop_duration={duration},fps={fps},trim=duration={duration},format=yuv420p[vout]"
    ));
    filters.join(";")
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AudioSlice {
    pub start_ms: f64,
    pub end_ms: f64,
    pub duration_ms: f64,
    pub frozen: bool,
}

/// Source intervals with constant tempo. Ramps split into at most ~512 steps.
pub fn audio_timing_slices(start: i64, end: i64, edits: Option<&VideoEdits>) -> Vec<AudioSlice> {
    let (s, e) = (start as f64, end as f64);
    let mut keys = vec![s, e];
    if let Some(ed) = edits {
        keys.extend(ed.speed_points.iter().map(|p| p.time_ms as f64).filter(|&t| t > s && t < e));
        keys.extend(ed.freezes.iter().map(|h| h.time_ms as f64).filter(|&t| t >= s && t < e));
    }
    keys.sort_by(f64::total_cmp);
    keys.dedup();
    let step = ((e - s) / 512.0).max(100.0);
    let mut out = Vec::new();
    for w in keys.windows(2) {
        let (a0, b0) = (w[0], w[1]);
        if let Some(h) = edits.and_then(|ed| ed.freezes.iter().find(|h| h.time_ms as f64 == a0)) {
            out.push(AudioSlice { start_ms: a0, end_ms: a0, duration_ms: h.duration_ms as f64, frozen: true });
        }
        let ramp = (speed_at(a0, edits) - speed_at(b0 - 0.000_001, edits)).abs() > 0.000_001;
        let count = if ramp { ((b0 - a0) / step).ceil().max(1.0) as usize } else { 1 };
        for n in 0..count {
            let a = a0 + (b0 - a0) * n as f64 / count as f64;
            let b = a0 + (b0 - a0) * (n + 1) as f64 / count as f64;
            out.push(AudioSlice { start_ms: a, end_ms: b, duration_ms: moving_duration_ms(a, b, edits), frozen: false });
        }
    }
    out
}

/// atempo chain for the advanced path (tolerant of float noise).
fn tempo_advanced(mut speed: f64) -> Vec<String> {
    let mut f = Vec::new();
    while speed < 0.5 - 0.000_001 {
        f.push("atempo=0.5".into());
        speed /= 0.5;
    }
    while speed > 2.0 + 0.000_001 {
        f.push("atempo=2".into());
        speed /= 2.0;
    }
    if (speed - 1.0).abs() > 0.000_001 {
        f.push(format!("atempo={}", num(speed)));
    }
    f
}

/// atempo chain for the simple path.
pub fn tempo_simple(mut speed: f64) -> Vec<String> {
    let mut f = Vec::new();
    while speed < 0.5 {
        f.push("atempo=0.5".into());
        speed /= 0.5;
    }
    while speed > 2.0 {
        f.push("atempo=2".into());
        speed /= 2.0;
    }
    if speed != 1.0 {
        f.push(format!("atempo={}", num(speed)));
    }
    f
}

/// Advanced audio graph: per-track gain (level x volume x automation x track
/// trim), retimed per slice, mixed with amix normalize=0 and limited. With
/// `mic_track`, also emits the microphone alone as `[voiceout]` for ducking.
pub fn advanced_audio_graph(seg: &Segment, streams: usize, mic_track: Option<usize>, include_voice: bool) -> String {
    let (start, end, edits) = (seg.trim_start_ms, seg.trim_end_ms, seg.edits());
    let total = secs(edited_duration_ms(start, end, edits) as f64);
    let slices = audio_timing_slices(start, end, edits);
    let mut filters = Vec::new();
    let mut tracks = Vec::new();
    let mut voice: Option<String> = None;
    for track in 0..streams {
        let level = seg.level(track) * seg.volume;
        if level <= 0.0 || seg.muted {
            continue;
        }
        let automation = edits.and_then(|e| e.automation(track));
        let trim = seg.track_trim(track);
        let mut labels = Vec::new();
        for (i, slice) in slices.iter().enumerate() {
            let label = format!("audio-{track}-{i}");
            let duration = secs(slice.duration_ms);
            labels.push(format!("[{label}]"));
            if slice.frozen {
                filters.push(format!("anullsrc=r=48000:cl=stereo,atrim=duration={duration},asetpts=PTS-STARTPTS[{label}]"));
                continue;
            }
            let var = format!("(t+{})", secs(slice.start_ms));
            let trim_gain = trim
                .map(|t| format!("*gte({var},{})*lt({var},{})", secs(t.start_ms as f64), secs(t.end_ms as f64)))
                .unwrap_or_default();
            let gain = format!("{}*{}{trim_gain}", num(level), track_automation_expression(automation, &var));
            let mut chain = vec![
                format!("atrim=start={}:end={}", secs(slice.start_ms - start as f64), secs(slice.end_ms - start as f64)),
                "asetpts=PTS-STARTPTS".into(),
                format!("volume='{gain}':eval=frame"),
            ];
            chain.extend(tempo_advanced((slice.end_ms - slice.start_ms) / slice.duration_ms));
            chain.extend([
                "aresample=48000".into(),
                "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo".into(),
                format!("apad=whole_dur={duration}"),
                format!("atrim=duration={duration}"),
                "asetpts=PTS-STARTPTS".into(),
            ]);
            filters.push(format!("[0:a:{track}]{}[{label}]", chain.join(",")));
        }
        let joined = format!("track{track}");
        let join = if labels.len() > 1 { format!("concat=n={}:v=0:a=1", labels.len()) } else { "anull".into() };
        filters.push(format!("{}{join}[{joined}]", labels.concat()));
        if include_voice && mic_track == Some(track) && voice.is_none() {
            filters.push(format!("[{joined}]asplit[{joined}-mix][voice-track]"));
            tracks.push(format!("[{joined}-mix]"));
            voice = Some("voice-track".into());
        } else {
            tracks.push(format!("[{joined}]"));
        }
    }
    if tracks.is_empty() {
        filters.push(format!("anullsrc=r=48000:cl=stereo,atrim=duration={total}[aout]"));
    } else {
        let mix = if tracks.len() > 1 {
            format!("amix=inputs={}:normalize=0:dropout_transition=0", tracks.len())
        } else {
            "anull".into()
        };
        filters.push(format!(
            "{}{mix},apad=whole_dur={total},atrim=duration={total},alimiter=limit=0.95:latency=1[aout]",
            tracks.concat()
        ));
    }
    if include_voice {
        filters.push(match voice {
            Some(v) => format!("[{v}]apad=whole_dur={total},atrim=duration={total}[voiceout]"),
            None => format!("anullsrc=r=48000:cl=stereo,atrim=duration={total}[voiceout]"),
        });
    }
    filters.join(";")
}

/// Simple video filter for segments without advanced edits. `seg` must be
/// rebased so its trim starts at 0 (the input is already seeked).
pub fn simple_video_filter(seg: &Segment, target: &Target) -> String {
    let (start, end) = (fixed3(seg.trim_start_ms as f64 / 1000.0), fixed3(seg.trim_end_ms as f64 / 1000.0));
    let (w, h) = (target.width, target.height);
    let normalize = if target.canvas == Canvas::Vertical {
        format!(
            "crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale={w}:{h}:flags=lanczos"
        )
    } else {
        format!(
            "scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black"
        )
    };
    let speed = seg.edits().and_then(|e| e.speed).unwrap_or(1.0);
    let look = look_filters(seg.edits(), raw);
    let look = if look.is_empty() { String::new() } else { format!(",{}", look.join(",")) };
    let timing = if speed == 1.0 { "PTS-STARTPTS".to_string() } else { format!("(PTS-STARTPTS)/{}", raw(speed)) };
    format!(
        "[0:v:0]trim=start={start}:end={end},setpts={timing},{normalize},setsar=1,fps={}{look},format=yuv420p[vout]",
        fixed3(target.fps)
    )
}

/// JS template-literal number formatting for values the old simple path
/// printed without rounding.
fn raw(v: f64) -> String {
    if v == 0.0 { "0".into() } else { format!("{v}") }
}

/// Simple per-track audio mix. `None` means the segment is silent and the
/// caller adds an `anullsrc` input. `seg` must be rebased to trim start 0.
pub fn simple_audio_filter(seg: &Segment, streams: usize) -> Option<String> {
    if seg.muted || seg.volume <= 0.0 {
        return None;
    }
    struct Active {
        track: usize,
        level: f64,
        start: i64,
        end: i64,
    }
    let active: Vec<Active> = (0..streams)
        .map(|track| {
            let trim = seg.track_trim(track);
            Active {
                track,
                level: (seg.level(track) * 100.0).clamp(0.0, 100.0),
                start: seg.trim_start_ms.max(trim.map(|t| t.start_ms).unwrap_or(seg.trim_start_ms)),
                end: seg.trim_end_ms.min(trim.map(|t| t.end_ms).unwrap_or(seg.trim_end_ms)),
            }
        })
        .filter(|t| t.level > 0.0 && t.end > t.start)
        .collect();
    if active.is_empty() {
        return None;
    }
    let speed = seg.edits().and_then(|e| e.speed).unwrap_or(1.0);
    let duration = fixed3(edited_duration_ms(seg.trim_start_ms, seg.trim_end_ms, seg.edits()) as f64 / 1000.0);
    let mut filters: Vec<String> = active
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let delay = (t.start - seg.trim_start_ms) as f64 / speed;
            let mut chain = vec![
                format!("atrim=start={}:end={}", fixed3(t.start as f64 / 1000.0), fixed3(t.end as f64 / 1000.0)),
                "asetpts=PTS-STARTPTS".to_string(),
            ];
            chain.extend(tempo_simple(speed));
            if delay > 0.0 {
                chain.push(format!("adelay={}:all=1", delay.round() as i64));
            }
            chain.push(format!("volume={:.4}", t.level / 100.0 * seg.volume));
            format!("[0:a:{}]{}[montage-v2-track-{i}]", t.track, chain.join(","))
        })
        .collect();
    let inputs: String = (0..active.len()).map(|i| format!("[montage-v2-track-{i}]")).collect();
    filters.push(if active.len() > 1 {
        format!("{inputs}amix=inputs={}:duration=longest:dropout_transition=0:normalize=0[montage-v2-mix]", active.len())
    } else {
        format!("{inputs}anull[montage-v2-mix]")
    });
    filters.push(format!(
        "[montage-v2-mix]apad=whole_dur={duration},atrim=duration={duration},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.95[aout]"
    ));
    Some(filters.join(";"))
}

/// Music pass over the concatenated segments: `[0]` is the concat output
/// (audio 0 = mix, audio 1 = microphone when ducking), `[1]` the music file.
/// Returns `None` when the music is silent or outside the project.
pub fn music_mix_graph(music: &Music, project_ms: i64) -> Option<String> {
    if music.muted || music.volume <= 0.0 || music.timeline_start_ms >= project_ms {
        return None;
    }
    let source_ms = music.source_end_ms - music.source_start_ms;
    let remaining = project_ms - music.timeline_start_ms;
    let active = if music.r#loop { remaining } else { source_ms.min(remaining) };
    if source_ms < 100 || active < 1 {
        return None;
    }
    let s = |ms: i64| fixed3(ms as f64 / 1000.0);
    let mut chain = vec![
        format!("atrim=start={}:end={}", s(music.source_start_ms), s(music.source_end_ms)),
        "asetpts=PTS-STARTPTS".to_string(),
        "aresample=48000".into(),
        "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo".into(),
    ];
    if music.r#loop && active > source_ms {
        chain.push(format!("aloop=loop=-1:size={}", (source_ms * 48).max(1)));
    }
    chain.push(format!("atrim=duration={}", s(active)));
    let fade_in = music.fade_in_ms.min(active / 2);
    let fade_out = music.fade_out_ms.min(active / 2);
    if fade_in > 0 {
        chain.push(format!("afade=t=in:st=0:d={}", s(fade_in)));
    }
    if fade_out > 0 {
        chain.push(format!("afade=t=out:st={}:d={}", s(active - fade_out), s(fade_out)));
    }
    chain.push(format!("volume={:.4}", music.volume));
    if music.timeline_start_ms > 0 {
        chain.push(format!("adelay={}:all=1", music.timeline_start_ms));
    }
    chain.push(format!("apad=whole_dur={}", s(project_ms)));
    chain.push(format!("atrim=duration={}", s(project_ms)));
    let (points, mutes) = music.automation.as_ref().map(|a| (a.points.as_slice(), a.mutes.as_slice())).unwrap_or((&[], &[]));
    chain.push(format!("volume='{}':eval=frame", automation_expression(points, mutes, "t")));
    let ducking = music.ducking.filter(|d| d.enabled);
    let mut filters = vec![
        "[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[montage-clips]".to_string(),
        format!("[1:a:0]{}[montage-music]", chain.join(",")),
    ];
    if let Some(d) = ducking {
        filters.push(format!(
            "[montage-music][0:a:1]sidechaincompress=threshold=0.02:ratio=8:attack={}:release={}:mix={}[ducked-music]",
            d.attack_ms,
            d.release_ms,
            raw(d.amount)
        ));
    }
    filters.push(format!(
        "[montage-clips][{}]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]",
        if ducking.is_some() { "ducked-music" } else { "montage-music" }
    ));
    Some(filters.join(";"))
}
