import { mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { clipSchema } from '../src/shared/contracts';
import { canvasDimensions, sourceToEditedMs } from '../src/shared/video-edits';
import { createMontageProjectV2, createMontageMusicTrack, normalizeMontageProject } from '../src/renderer/src/components/capture/montage-v2-model';
import { renderMontageV2 } from '../src/main/services/montage-v2-renderer';

const root = resolve('design-qa/clip-editor-upgrades/render');
await mkdir(root, { recursive: true });
async function run(args: string[]) {
  const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw Error(stderr); return stdout;
}
const path = join(root, 'fixture.mp4');
await run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=5', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=5', '-filter_complex', "[2:a]volume='if(between(t,1.5,3),1,0)':eval=frame[mic]", '-map', '0:v', '-map', '1:a', '-map', '[mic]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-metadata:s:a:0', 'title=Game', '-metadata:s:a:1', 'title=Microphone', '-y', path]);
const clip = clipSchema.parse({ id: 'effects-fixture', path, name: 'Generated editor verification fixture', createdAt: 0, durationMs: 5000, fileSize: (await stat(path)).size, width: 640, height: 360, fps: 30, audioChannels: ['game', 'microphone'] });
let project = createMontageProjectV2([clip]);
project = normalizeMontageProject({ ...project, sourceClipId: clip.id, canvasSize: '9:16', segments: project.segments.map(segment => ({ ...segment, trimStartMs: 500, trimEndMs: 4500, videoEdits: {
  framing: { mode: 'fill', background: 'blur', keyframes: [{ timeMs: 500, x: 0, y: 0.5, zoom: 1, transition: 'smooth' }, { timeMs: 3500, x: 1, y: 0.5, zoom: 1.4, transition: 'hold' }] },
  speedPoints: [{ timeMs: 500, speed: 1, transition: 'linear' }, { timeMs: 1500, speed: 0.5, transition: 'linear' }, { timeMs: 3500, speed: 2, transition: 'hold' }],
  freezes: [{ timeMs: 2500, durationMs: 800 }],
  overlays: [{ id: crypto.randomUUID(), kind: 'text', content: "Caption: 100% [safe] 'quoted'", size: 'small', startMs: 500, endMs: 4500, x: 0.05, y: 0.75, width: 0.9, height: 0.15 }, { id: crypto.randomUUID(), kind: 'pixelate', startMs: 500, endMs: 4500, x: 0.1, y: 0.1, width: 0.4, height: 0.25 }, { id: crypto.randomUUID(), kind: 'blur', startMs: 1000, endMs: 3500, x: 0.6, y: 0.4, width: 0.3, height: 0.25 }],
  audioAutomation: [{ trackIndex: 0, points: [{ timeMs: 500, gain: 0.2 }, { timeMs: 4500, gain: 1 }], mutes: [{ startMs: 1000, endMs: 1800 }] }],
} })) });
const destination = join(root, 'all-effects.mp4');
const before = performance.now();
await renderMontageV2({ project, entries: project.segments.map(segment => ({ segment, clip })), destination, preset: 'original', encoder: 'libx264' });
const probe = JSON.parse(await run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height', '-of', 'json', destination]));
if (Math.abs(Number(probe.format.duration) * 1000 - project.durationMs) > 100) throw Error(`Duration mismatch ${probe.format.duration} vs ${project.durationMs}`);
const dimensions = canvasDimensions(clip.width, clip.height, project.canvasSize);
const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
if (video.width !== dimensions.width || video.height !== dimensions.height) throw Error('Wrong export dimensions');
const freezeStart = sourceToEditedMs(500, 2500, project.segments[0]!.videoEdits) / 1000;
await run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', String(freezeStart + 0.2), '-i', destination, '-frames:v', '1', '-y', join(root, 'freeze.png')]);
const hashes: string[] = [];
for (const time of [freezeStart + 0.2, freezeStart + 0.55]) {
  const hash = await run(['ffmpeg', '-v', 'error', '-ss', String(time), '-i', destination, '-frames:v', '1', '-an', '-f', 'md5', '-']); hashes.push(hash.trim());
}
const frames = await Promise.all([freezeStart + 0.2, freezeStart + 0.55].map(async time => {
  const child = Bun.spawn(['ffmpeg', '-v', 'error', '-ss', String(time), '-i', destination, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdout: 'pipe', stderr: 'pipe' });
  return new Uint8Array(await new Response(child.stdout).arrayBuffer());
}));
let difference = 0;
if (!frames[0]!.length || frames[0]!.length !== frames[1]!.length) throw Error('Missing freeze sample');
for (let index = 0; index < frames[0]!.length; index++) difference += Math.abs(frames[0]![index]! - frames[1]![index]!);
const freezeMeanPixelDifference = difference / frames[0]!.length;
// Lossy H.264 may reconstruct repeated frames with slightly different pixels.
if (freezeMeanPixelDifference > 0.5) throw Error(`Freeze frame changed: mean pixel difference ${freezeMeanPixelDifference}`);
const layoutResults = [];
for (const canvasSize of ['16:9', '9:16', '1:1', '4:5'] as const) for (const mode of ['fit', 'fill'] as const) {
  const layout = normalizeMontageProject({ ...createMontageProjectV2([clip]), canvasSize, segments: [{ ...project.segments[0]!, trimStartMs: 0, trimEndMs: 500, videoEdits: { framing: { mode, background: 'blur', keyframes: [{ timeMs: 0, x: 0.7, y: 0.3, zoom: mode === 'fill' ? 8 : 1, transition: 'hold' }] } } }] });
  const output = join(root, `${canvasSize.replace(':', 'x')}-${mode}.mp4`);
  await renderMontageV2({ project: layout, entries: layout.segments.map(segment => ({ segment, clip })), destination: output, preset: 'original', encoder: 'libx264' });
  const actual = JSON.parse(await run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', output])).streams[0];
  const expected = canvasDimensions(clip.width, clip.height, canvasSize);
  if (actual.width !== expected.width || actual.height !== expected.height) throw Error(`Wrong layout: ${canvasSize} ${mode}`);
  layoutResults.push({ canvasSize, mode, ...actual });
}
const musicPath = join(root, 'music.wav');
await run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', '-af', 'volume=3', '-y', musicPath]);
const asset = { id: crypto.randomUUID(), name: 'Verification tone', originalName: 'music.wav', createdAt: 0, durationMs: 5000, fileSize: (await stat(musicPath)).size };
async function toneAmplitude(path: string, start: number, frequency = 330) {
  const child = Bun.spawn(['ffmpeg', '-v', 'error', '-ss', String(start), '-i', path, '-t', '0.5', '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { stdout: 'pipe', stderr: 'pipe' });
  const bytes = await new Response(child.stdout).arrayBuffer(); if(await child.exited) throw Error('Audio sample decode failed');
  const samples = new Float32Array(bytes); let real = 0, imaginary = 0, power = 0;
  for(let i=0;i<samples.length;i++) { real += samples[i]! * Math.cos(2 * Math.PI * frequency * i / 48000); imaginary += samples[i]! * Math.sin(2 * Math.PI * frequency * i / 48000); power += samples[i]! ** 2; }
  return { amplitude: Math.hypot(real, imaginary) * 2 / samples.length, rms: Math.sqrt(power / samples.length) };
}
const duckResults = [];
for (const enabled of [false, true]) {
  const music = { ...createMontageMusicTrack(asset), volume: 0.7, fadeInMs: 0, fadeOutMs: 0, ducking: { enabled, amount: 1, attackMs: 80, releaseMs: 300 }, automation: { points: [], mutes: [{ startMs: 4000, endMs: 5000 }] } };
  const value = normalizeMontageProject({ ...createMontageProjectV2([clip]), music });
  const output = join(root, enabled ? 'ducked.mp4' : 'unducked.mp4');
  await renderMontageV2({ project: value, entries: value.segments.map(segment => ({ segment, clip })), destination: output, musicPath, preset: 'original', encoder: 'libx264' });
  duckResults.push({ enabled, quiet: await toneAmplitude(output, 0.6), voice: await toneAmplitude(output, 2), muted: await toneAmplitude(output, 4.2) });
}
const duckRatio = duckResults[1]!.voice.amplitude / duckResults[0]!.voice.amplitude;
if (duckRatio > 0.65) throw Error(`Music did not duck beneath microphone: ratio ${duckRatio}`);
if (duckResults[1]!.quiet.amplitude / duckResults[0]!.quiet.amplitude < 0.85) throw Error('Music ducks without voice');
if (duckResults[0]!.muted.amplitude > duckResults[0]!.quiet.amplitude * 0.05) throw Error('Music mute interval not respected');
const freezeAudio = await toneAmplitude(destination, freezeStart + 0.15);
if (freezeAudio.rms > 0.001) throw Error('Clip audio leaked into a freeze');
await Bun.write(join(root, 'result.json'), JSON.stringify({ fixture: true, seconds: (performance.now() - before) / 1000, durationMs: project.durationMs, probe, freezeStart, freezeHashes: hashes, freezeMeanPixelDifference, freezeAudio, layoutResults, duckResults, duckRatio }, null, 2));
console.log({ durationMs: project.durationMs, layouts: layoutResults.length, freezeMeanPixelDifference, freezeAudio, duckRatio });
