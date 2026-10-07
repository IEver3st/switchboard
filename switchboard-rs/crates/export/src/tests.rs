use super::*;
use switchboard_project::{
    AudioAsset, AudioAutomation, Ducking, Framing, FramingKeyframe, FramingMode, Freeze, GainPoint, Interpolation, Music,
    MuteRange, Overlay, OverlayKind, SpeedPoint, SpeedTransition, TextSize, Title, TitlePosition, VideoEdits,
};

fn source(id: &str) -> ClipSource {
    ClipSource {
        clip_id: id.into(),
        path: PathBuf::from(format!("C:\\clips\\{id}.mp4")),
        width: 1280,
        height: 720,
        fps: 30.0,
        audio_tracks: 3,
        mic_track: Some(2),
    }
}

fn job(project: Project, target: SizeTarget) -> ExportJob {
    let sources = project.segments.iter().map(|s| source(&s.clip_id)).collect();
    ExportJob { project, sources, music_path: None, target, output: PathBuf::from("C:\\out\\clip.mp4") }
}

fn clip(ms: i64) -> Project {
    Project::for_clip("c1", "Test clip", ms, None, 0)
}

fn amf() -> Encoders {
    Encoders { amf: true, ..Default::default() }
}

fn with_edits(mut p: Project, e: VideoEdits) -> Project {
    p.segments[0].video_edits = Some(e);
    p.refresh();
    p
}

fn graph_of(step: &Step) -> &str {
    let i = step.args.iter().position(|a| a == "-filter_complex").expect("inline graph");
    &step.args[i + 1]
}

fn has_seq(args: &[String], seq: &[&str]) -> bool {
    args.windows(seq.len()).any(|w| w.iter().zip(seq).all(|(a, b)| a == b))
}

fn plan_of(p: Project, target: SizeTarget) -> Plan {
    plan_with_id(&job(p, target), &amf(), "test").unwrap()
}

#[test]
fn plain_single_clip_is_copied() {
    let plan = plan_of(clip(12_000), SizeTarget::Original);
    assert_eq!(plan.kind, PlanKind::Copy { source: PathBuf::from("C:\\clips\\c1.mp4") });
    assert!(plan.steps.is_empty());
    // Any edit leaves the copy path.
    let mut p = clip(12_000);
    p.segments[0].set_level(1, 50, 3);
    assert_eq!(plan_of(p, SizeTarget::Original).kind, PlanKind::Render);
    assert_eq!(plan_of(clip(12_000), SizeTarget::Megabytes(10)).kind, PlanKind::Render);
}

#[test]
fn trim_only_uses_simple_path_with_quality_encoder() {
    let mut p = clip(12_000);
    p.segments[0].trim_start_ms = 2_000;
    p.segments[0].trim_end_ms = 8_000;
    p.refresh();
    let plan = plan_of(p, SizeTarget::Original);
    assert_eq!(plan.kind, PlanKind::Render);
    assert_eq!((plan.width, plan.height, plan.duration_ms), (1280, 720, 6_000));
    assert_eq!(plan.steps.len(), 2);
    let seg = &plan.steps[0];
    assert!(has_seq(&seg.args, &["-ss", "2.000", "-t", "6.000", "-i", "C:\\clips\\c1.mp4"]));
    assert!(has_seq(&seg.args, &["-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "18", "-qp_p", "18", "-pix_fmt", "yuv420p"]));
    assert!(has_seq(&seg.args, &["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-t", "6.000"]));
    let g = graph_of(seg);
    assert!(g.starts_with("[0:v:0]trim=start=0.000:end=6.000,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30.000,format=yuv420p[vout]"), "{g}");
    assert!(g.contains("[0:a:0]atrim=start=0.000:end=6.000,asetpts=PTS-STARTPTS,volume=1.0000[montage-v2-track-0]"), "{g}");
    assert!(g.contains("amix=inputs=3:duration=longest:dropout_transition=0:normalize=0[montage-v2-mix]"));
    assert!(g.ends_with("alimiter=limit=0.95[aout]"));
    let concat = &plan.steps[1];
    assert_eq!(concat.kind, StepKind::Concat);
    assert!(has_seq(&concat.args, &["-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-metadata", "comment=Created with Switchboard", "-movflags", "+faststart"]));
    assert_eq!(concat.args.last().unwrap(), "C:\\out\\.switchboard-test.mp4");
    assert_eq!(plan.files[0].contents, format!("file '{}'", plan.work_dir.join("segment-0000.mp4").display()));
}

#[test]
fn vertical_canvas_crops_center_on_simple_path() {
    let mut p = clip(12_000);
    p.canvas_size = Canvas::Vertical;
    let plan = plan_of(p, SizeTarget::Original);
    assert_eq!((plan.width, plan.height), (404, 720));
    let g = graph_of(&plan.steps[0]);
    assert!(g.contains("crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=404:720:flags=lanczos,setsar=1"), "{g}");
    // 1:1 is not a simple canvas: it goes through the advanced framing graph.
    let mut p = clip(12_000);
    p.canvas_size = Canvas::Square;
    let g = graph_of(&plan_of(p, SizeTarget::Original).steps[0]).to_string();
    assert!(g.contains("zoompan=") && g.contains("crop=720:720"), "{g}");
}

#[test]
fn constant_speed_retimes_video_and_audio() {
    let p = with_edits(clip(12_000), VideoEdits { speed: Some(2.0), ..Default::default() });
    let plan = plan_of(p, SizeTarget::Original);
    assert_eq!(plan.duration_ms, 6_000);
    let seg = &plan.steps[0];
    let g = graph_of(seg);
    assert!(g.contains("setpts=(PTS-STARTPTS)/2,"), "{g}");
    assert!(g.contains("asetpts=PTS-STARTPTS,atempo=2,volume=1.0000"), "{g}");
    assert!(has_seq(&seg.args, &["-t", "6.000", "-movflags"]));
    // 4x chains two atempo filters.
    assert_eq!(graph::tempo_simple(4.0), vec!["atempo=2", "atempo=2"]);
    assert_eq!(graph::tempo_simple(0.25), vec!["atempo=0.5", "atempo=0.5"]);
}

#[test]
fn freeze_holds_frame_and_inserts_silence() {
    let p = with_edits(clip(10_000), VideoEdits { freezes: vec![Freeze { time_ms: 2_000, duration_ms: 1_000 }], ..Default::default() });
    let plan = plan_of(p, SizeTarget::Original);
    assert_eq!(plan.duration_ms, 11_000);
    let g = graph_of(&plan.steps[0]);
    assert!(g.contains("setpts='((clip((T+0)-0,0,10))/1+gt((T+0),2)*1)/TB',tpad=stop_mode=clone:stop_duration=11,fps=30,trim=duration=11,format=yuv420p[vout]"), "{g}");
    assert!(g.contains("anullsrc=r=48000:cl=stereo,atrim=duration=1,asetpts=PTS-STARTPTS[audio-0-1]"), "{g}");
    assert!(g.contains("[audio-0-0][audio-0-1][audio-0-2]concat=n=3:v=0:a=1[track0]"), "{g}");
    assert!(g.contains("amix=inputs=3:normalize=0:dropout_transition=0,apad=whole_dur=11,atrim=duration=11,alimiter=limit=0.95:latency=1[aout]"), "{g}");
}

#[test]
fn speed_ramp_uses_log_pts_and_sliced_atempo() {
    let e = VideoEdits {
        speed_points: vec![
            SpeedPoint { time_ms: 0, speed: 1.0, transition: SpeedTransition::Linear },
            SpeedPoint { time_ms: 1_000, speed: 2.0, transition: SpeedTransition::Hold },
        ],
        ..Default::default()
    };
    let p = with_edits(clip(5_000), e.clone());
    let plan = plan_of(p, SizeTarget::Original);
    assert_eq!(plan.duration_ms, (1_000.0 * 2f64.ln() + 2_000.0).round() as i64);
    let g = graph_of(&plan.steps[0]);
    assert!(g.contains("log((1+(0.999999999)*(clip((T+0)-0,0,1)))/1)/(0.999999999)+(clip((T+0)-1,0,4))/2"), "{g}");
    let slices = graph::audio_timing_slices(0, 5_000, Some(&e));
    assert_eq!(slices.len(), 11, "1 s ramp in 100 ms steps plus the 2x hold");
    assert!(slices[..10].iter().all(|s| (s.end_ms - s.start_ms - 100.0).abs() < 1e-9));
    assert!(g.contains("atempo=1.049205868"), "{g}");
    assert!(g.contains("concat=n=11:v=0:a=1[track0]"));
}

#[test]
fn framing_keyframes_drive_zoompan() {
    let k = |t, x, zoom, transition| FramingKeyframe { time_ms: t, x, y: 0.5, zoom, transition };
    let e = VideoEdits {
        framing: Some(Framing {
            mode: FramingMode::Fill,
            background: Default::default(),
            keyframes: vec![k(0, 0.2, 1.0, Interpolation::Smooth), k(2_000, 0.8, 2.0, Interpolation::Linear)],
        }),
        ..Default::default()
    };
    let mut p = with_edits(clip(12_000), e);
    p.canvas_size = Canvas::Vertical;
    p.segments[0].trim_start_ms = 1_000;
    p.refresh();
    let g = graph_of(&plan_of(p, SizeTarget::Original).steps[0]).to_string();
    let t = "clip(((in_time+1)-0)/2,0,1)";
    let zoom = format!("if(lt((in_time+1),2),1+(1)*(({t})*({t})*(3-2*({t}))),2)");
    assert!(g.contains(&format!("zoompan=z='{zoom}':x='(iw-iw/zoom)*(")), "{g}");
    assert!(g.contains(":d=1:s=1280x720:fps=30,scale=404:720:force_original_aspect_ratio=increase,crop=404:720:x='(iw-ow)*(if(lt((t+1),2)"), "{g}");
    // Fit with a blurred background pads to the canvas aspect.
    let e = VideoEdits {
        framing: Some(Framing { mode: FramingMode::Fit, background: switchboard_project::FramingBackground::Blur, keyframes: vec![] }),
        ..Default::default()
    };
    let mut p = with_edits(clip(12_000), e);
    p.canvas_size = Canvas::Vertical;
    let g = graph_of(&plan_of(p, SizeTarget::Original).steps[0]).to_string();
    assert!(g.contains("[background]scale=1280:2280:force_original_aspect_ratio=increase,crop=1280:2280,gblur=sigma=45.6[blurred]"), "{g}");
    assert!(g.contains("[blurred][foreground]overlay=x=0:y=780[padded]"), "{g}");
    assert!(g.contains("zoompan=z='1':x='0+(1280-iw/zoom)*(0.5)':y='780+(720-ih/zoom)*(0.5)':d=1:s=404x720:fps=30"), "{g}");
}

#[test]
fn text_blur_and_pixelate_overlays() {
    let o = |kind, content: Option<&str>| Overlay {
        id: "o".into(),
        kind,
        start_ms: 1_000,
        end_ms: 4_000,
        x: 0.1,
        y: 0.1,
        width: 0.5,
        height: 0.2,
        content: content.map(String::from),
        size: Some(TextSize::Large),
    };
    let e = VideoEdits {
        text: Some(Title { content: "GG: 100%, it's 'over'".into(), start_ms: 0, end_ms: 3_000, position: TitlePosition::Bottom, size: TextSize::Medium }),
        overlays: vec![o(OverlayKind::Blur, None), o(OverlayKind::Pixelate, None), o(OverlayKind::Text, Some("a;b[c]"))],
        ..Default::default()
    };
    let g = graph_of(&plan_of(with_edits(clip(12_000), e), SizeTarget::Original).steps[0]).to_string();
    let title = graph::filter_value("GG: 100%, it's 'over'");
    assert!(g.contains(&format!("[framed]drawtext=fontfile={}:text={title}:expansion=none:fontsize=39.6:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6:x=640-text_w/2:y=", graph::filter_value(&graph::font_file()))), "{g}");
    assert!(g.contains(":enable='gte(t,0)*lt(t,3)'[overlay0]"), "{g}");
    assert!(g.contains("[overlay0]split[mask-base1][mask-source1];[mask-source1]crop=640:144:128:72,gblur=sigma=14.4[mask1];[mask-base1][mask1]overlay=x=128:y=72:enable='gte(t,1)*lt(t,4)'[overlay1]"), "{g}");
    assert!(g.contains("[mask-source2]crop=640:144:128:72,scale=53:12:flags=neighbor,scale=640:144:flags=neighbor[mask2]"), "{g}");
    assert!(g.contains(&format!("text={}:expansion=none", graph::filter_value("a;b[c]"))));
    assert!(g.contains("[overlay3]settb=AVTB"), "{g}");
}

#[test]
fn filter_value_escapes_both_levels() {
    use graph::filter_value as f;
    assert_eq!(f("plain"), r"\'plain\'");
    assert_eq!(f("a:b"), r"\'a:b\'");
    assert_eq!(f("a,b;c"), r"\'a\,b\;c\'");
    assert_eq!(f("[x]"), r"\'\[x\]\'");
    assert_eq!(f("it's"), r"\'it\'\\\'\'s\'");
    assert_eq!(f(r"C:\x"), r"\'C:\\x\'");
    assert_eq!(f("100%"), r"\'100%\'");
    assert_eq!(f("C:/Windows/Fonts/arialbd.ttf"), r"\'C:/Windows/Fonts/arialbd.ttf\'");
    // Undo both levels the way FFmpeg's av_get_token does and get the input back.
    fn unescape(s: &str) -> String {
        let (mut out, mut it) = (String::new(), s.chars());
        while let Some(c) = it.next() {
            match c {
                '\\' => out.extend(it.next()),
                '\'' => {
                    for q in it.by_ref() {
                        if q == '\'' {
                            break;
                        }
                        out.push(q);
                    }
                }
                c => out.push(c),
            }
        }
        out
    }
    for s in ["GG: 100%, it's 'over'", r"back\slash", "a;b[c]=d", "''", "line one\nline two", "%{pts}"] {
        assert_eq!(unescape(&unescape(&f(s))), s);
    }
    assert_eq!(graph::concat_line("C:\\a\\it's.mp4"), "file 'C:\\a\\it'\\''s.mp4'");
}

#[test]
fn per_track_levels_mutes_and_automation() {
    let e = VideoEdits {
        audio_automation: vec![AudioAutomation {
            track_index: 0,
            points: vec![GainPoint { time_ms: 0, gain: 1.0 }, GainPoint { time_ms: 2_000, gain: 0.5 }],
            mutes: vec![MuteRange { start_ms: 3_000, end_ms: 4_000 }],
        }],
        ..Default::default()
    };
    let mut p = with_edits(clip(6_000), e);
    let s = &mut p.segments[0];
    s.audio_track_levels = Some(vec![50, 0, 100]);
    s.volume = 0.8;
    s.audio_track_trims = Some(vec![None, None, Some(TrackTrim { start_ms: 1_000, end_ms: 5_000 })]);
    let g = graph_of(&plan_of(p, SizeTarget::Original).steps[0]).to_string();
    assert!(g.contains("volume='0.4*(if(lt((t+0),2),1+(-0.5)*(clip(((t+0)-0)/2,0,1)),0.5))*(1-gte((t+0),3)*lt((t+0),4))':eval=frame"), "{g}");
    assert!(!g.contains("[0:a:1]"), "a zero-level track is dropped: {g}");
    assert!(g.contains("volume='0.8*(1)*gte((t+0),1)*lt((t+0),5)':eval=frame"), "{g}");
    assert!(g.contains("[track0][track2]amix=inputs=2:normalize=0:dropout_transition=0"), "{g}");
    // A muted segment renders silence on the simple path.
    let mut p = clip(6_000);
    p.segments[0].muted = true;
    p.segments[0].trim_end_ms = 5_000;
    let plan = plan_of(p, SizeTarget::Original);
    assert!(has_seq(&plan.steps[0].args, &["-f", "lavfi", "-t", "5.000", "-i", "anullsrc=r=48000:cl=stereo"]));
    assert!(has_seq(&plan.steps[0].args, &["-map", "[vout]", "-map", "1:a:0"]));
}

#[test]
fn montage_of_three_segments() {
    let clips = vec![("a".to_string(), 5_000, None), ("b".to_string(), 7_000, None), ("c".to_string(), 3_000, None)];
    let mut p = Project::montage("Night", &clips, 0);
    p.segments[1].trim_start_ms = 1_000;
    p.refresh();
    let mut j = job(p, SizeTarget::Original);
    j.sources[2].width = 1920;
    j.sources[2].height = 1080;
    let plan = plan_with_id(&j, &Encoders::default(), "m").unwrap();
    assert_eq!(plan.duration_ms, 14_000);
    assert_eq!(plan.steps.len(), 4);
    assert_eq!(plan.encoder, Encoder::Libx264);
    assert!(has_seq(&plan.steps[0].args, &["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"]));
    assert!(has_seq(&plan.steps[1].args, &["-ss", "1.000", "-t", "6.000"]));
    // Every segment renders at the first clip's size; others letterbox.
    assert!(graph_of(&plan.steps[2]).contains("scale=1280:720:force_original_aspect_ratio=decrease"));
    let list = &plan.files.last().unwrap().contents;
    assert_eq!(list.lines().count(), 3);
    assert!(list.lines().nth(2).unwrap().ends_with("segment-0002.mp4'"));
    assert_eq!(plan.steps[3].kind, StepKind::Concat);
    // Missing sources are named.
    let mut j2 = j.clone();
    j2.sources.remove(1);
    assert!(super::plan(&j2, &Encoders::default()).unwrap_err().to_string().contains("Montage source unavailable: b"));
}

fn music(duration_ms: i64) -> Music {
    let mut m = Music::new(AudioAsset {
        id: "m".into(),
        name: "Song".into(),
        original_name: "song.mp3".into(),
        duration_ms,
        file_size: 1,
        codec: None,
        created_at: 0,
    });
    m.fade_in_ms = 1_000;
    m.fade_out_ms = 2_000;
    m.timeline_start_ms = 500;
    m.ducking = Some(Ducking { enabled: true, amount: 0.75, attack_ms: 80, release_ms: 500 });
    m.automation = Some(switchboard_project::MusicAutomation { points: vec![], mutes: vec![MuteRange { start_ms: 4_000, end_ms: 5_000 }] });
    m
}

#[test]
fn music_with_fades_loop_and_ducking() {
    let mut p = clip(12_000);
    p.music = Some(music(5_000));
    p.refresh();
    let mut j = job(p, SizeTarget::Original);
    j.music_path = Some(PathBuf::from("C:\\music\\song.mp3"));
    let plan = plan_with_id(&j, &amf(), "mu").unwrap();
    assert!(plan.include_voice);
    let seg = &plan.steps[0];
    let g = graph_of(seg);
    assert!(g.contains("[track2]asplit[track2-mix][voice-track]"), "mic is split for the sidechain: {g}");
    assert!(g.contains("[voice-track]apad=whole_dur=12,atrim=duration=12[voiceout]"), "{g}");
    assert!(has_seq(&seg.args, &["-map", "[vout]", "-map", "[aout]", "-map", "[voiceout]"]));
    let mix = plan.steps.last().unwrap();
    assert_eq!(mix.kind, StepKind::Music);
    assert!(has_seq(&mix.args, &["-i", "C:\\music\\song.mp3", "-filter_complex"]));
    assert!(has_seq(&mix.args, &["-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k"]));
    let m = graph_of(mix);
    assert_eq!(
        m,
        "[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[montage-clips];\
[1:a:0]atrim=start=0.000:end=5.000,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,\
aloop=loop=-1:size=240000,atrim=duration=11.500,afade=t=in:st=0:d=1.000,afade=t=out:st=9.500:d=2.000,volume=0.1800,adelay=500:all=1,\
apad=whole_dur=12.000,atrim=duration=12.000,volume='(1)*(1-gte(t,4)*lt(t,5))':eval=frame[montage-music];\
[montage-music][0:a:1]sidechaincompress=threshold=0.02:ratio=8:attack=80:release=500:mix=0.75[ducked-music];\
[montage-clips][ducked-music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]"
    );
    // Muted music skips the pass and the voice stream.
    let mut j2 = j.clone();
    j2.project.music.as_mut().unwrap().muted = true;
    let plan = super::plan(&j2, &amf()).unwrap();
    assert!(!plan.include_voice);
    assert_eq!(plan.steps.last().unwrap().kind, StepKind::Concat);
    // Music without a file path is refused.
    j2.music_path = None;
    assert!(super::plan(&j2, &amf()).is_err());
}

#[test]
fn ten_megabyte_target_sets_bitrate_and_resolution_cap() {
    let mut j = job(clip(60_000), SizeTarget::Megabytes(10));
    j.sources[0].width = 1920;
    j.sources[0].height = 1080;
    j.sources[0].fps = 60.0;
    let plan = plan_with_id(&j, &amf(), "t").unwrap();
    // 10 MiB * 8 * 0.9 / 60 s = 1258.29 kbps; AAC 128k leaves 1130k video.
    assert_eq!((plan.video_kbps, plan.audio_kbps, plan.target_bytes), (Some(1130), 128, Some(10 * MB)));
    // 1130 kbps at 60 fps is under 1.2 Mbps: 360p.
    assert_eq!((plan.width, plan.height), (640, 360));
    assert!(has_seq(&plan.steps[0].args, &["-c:v", "h264_amf", "-quality", "balanced", "-rc", "vbr_peak", "-b:v", "1130k", "-maxrate", "1130k", "-bufsize", "2260k", "-pix_fmt", "yuv420p"]));
    // The same bitrate at 30 fps counts double and keeps 480p.
    assert_eq!(share_video_bounds(1920, 1080, 30.0, 1130), Some((854, 480)));
    assert_eq!(share_video_bounds(1080, 1920, 60.0, 5000), Some((720, 1280)));
    assert_eq!(share_video_bounds(1920, 1080, 60.0, 30_000), None);
    // Under 420 kbps total, audio drops to 64k; under 120k video is refused.
    assert_eq!(size_budget(Some(10 * MB), 200_000).unwrap(), (Some(313), 64));
    assert!(size_budget(Some(10 * MB), 600_000).is_err());
    assert_eq!(size_budget(None, 1).unwrap(), (None, 128));
    let nvenc = Encoder::Nvenc.args(None);
    assert_eq!(nvenc.join(" "), "-c:v h264_nvenc -preset p4 -rc vbr -cq 18 -b:v 0 -pix_fmt yuv420p");
    assert_eq!(Encoder::Qsv.args(None).join(" "), "-c:v h264_qsv -preset fast -global_quality 18 -pix_fmt yuv420p");
}

#[test]
fn long_graphs_move_to_a_script_file() {
    let e = VideoEdits {
        speed_points: (0..60)
            .map(|i| SpeedPoint { time_ms: i * 1_000, speed: if i % 2 == 0 { 1.0 } else { 2.0 }, transition: SpeedTransition::Linear })
            .collect(),
        ..Default::default()
    };
    let plan = plan_of(with_edits(clip(60_000), e), SizeTarget::Original);
    let seg = &plan.steps[0];
    let i = seg.args.iter().position(|a| a == "-/filter_complex").expect("script file");
    assert_eq!(PathBuf::from(&seg.args[i + 1]), plan.work_dir.join("segment-0000.graph.txt"));
    assert!(plan.files.iter().any(|f| f.path == plan.work_dir.join("segment-0000.graph.txt") && f.contents.contains("[vout]")));
    assert!(seg.args.iter().map(String::len).sum::<usize>() < 8_000);
}

#[test]
fn output_may_not_overwrite_a_source() {
    let mut j = job(clip(5_000), SizeTarget::Original);
    j.output = PathBuf::from("c:/CLIPS/c1.mp4");
    assert!(plan(&j, &amf()).unwrap_err().to_string().contains("different file name"));
}

#[test]
fn share_paths_and_names() {
    let p = share_path("abc-123", "My: clip?. ", "-9x16-10mb");
    assert!(p.ends_with("abc-123\\My clip-9x16-10mb.mp4"), "{}", p.display());
    assert!(p.starts_with(std::env::temp_dir().join("Switchboard\\Share").join(std::process::id().to_string())));
    assert_eq!(share_path("../x", "", "").file_name().unwrap(), "Switchboard montage.mp4");
    assert!(share_path("../x", "", "").parent().unwrap().ends_with("x"));
    let mut p = clip(1_000);
    p.canvas_size = Canvas::Vertical;
    assert_eq!(export_suffix(&p, SizeTarget::Megabytes(25)), "-9x16-25mb");
    p.canvas_size = Canvas::Original;
    assert_eq!(export_suffix(&p, SizeTarget::Original), "");
}

#[test]
fn number_formatting_matches_js() {
    assert_eq!(graph::num(2.0), "2");
    assert_eq!(graph::num(0.1 + 0.2), "0.3");
    assert_eq!(graph::num(-0.0), "0");
    assert_eq!(graph::num(1.0 / 3.0), "0.333333333");
    assert_eq!(graph::secs(1500.0), "1.5");
    assert_eq!(graph::fixed3(2.0), "2.000");
}
