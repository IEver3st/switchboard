import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Clip } from '../../shared/contracts';
import type { MontageV2Segment } from '../../shared/montage-v2';
import { editedDurationMs, movingDurationMs, speedAt, videoTextSize, titleOverlay, type VideoEdits, type VideoOverlay, type AudioAutomation } from '../../shared/video-edits';

export type EditRenderTarget = { width: number; height: number; fps: number; canvasSize: string };
const number = (value: number) => Number(value.toFixed(9)).toString();
const seconds = (ms: number) => number(ms / 1000);
const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
const filterPath = (path: string) => `'${path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\\\''")}'`;

export function hasAdvancedEdits(edits?: VideoEdits): boolean {
  return !!(edits?.text?.content || edits?.framing || edits?.overlays?.length || edits?.speedPoints?.length || edits?.freezes?.length || edits?.audioAutomation?.length);
}

function interpolate(points: readonly { timeMs: number; value: number; transition?: string }[], variable: string, fallback: number): string {
  if (!points.length) return number(fallback);
  let expression = number(points.at(-1)!.value);
  for (let index = points.length - 2; index >= 0; index--) {
    const a = points[index]!, b = points[index + 1]!;
    let t = `clip((${variable}-${seconds(a.timeMs)})/${seconds(b.timeMs - a.timeMs)},0,1)`;
    if (a.transition === 'smooth') t = `(${t})*(${t})*(3-2*(${t}))`;
    const value = a.transition === 'hold' ? number(a.value) : `${number(a.value)}+(${number(b.value - a.value)})*(${t})`;
    expression = `if(lt(${variable},${seconds(b.timeMs)}),${value},${expression})`;
  }
  return expression;
}

export function automationExpression(automation: Pick<AudioAutomation, 'points' | 'mutes'> | undefined, variable = 't'): string {
  const gain = interpolate((automation?.points ?? []).map(point => ({ ...point, value: point.gain })), variable, 1);
  const mutes = automation?.mutes.map(range => `(1-gte(${variable},${seconds(range.startMs)})*lt(${variable},${seconds(range.endMs)}))`) ?? [];
  return `(${gain})${mutes.length ? `*${mutes.join('*')}` : ''}`;
}

export function editedPtsExpression(startMs: number, endMs: number, edits?: VideoEdits, variable = 'T'): string {
  const bounds = [startMs, ...(edits?.speedPoints ?? []).map(point => point.timeMs).filter(t => t > startMs && t < endMs), endMs];
  const terms: string[] = [];
  for (let i = 1; i < bounds.length; i++) {
    const a = bounds[i - 1]!, b = bounds[i]!;
    const from = speedAt(a, edits), to = speedAt(b - 0.000001, edits);
    const slope = (to - from) / ((b - a) / 1000);
    const u = `clip(${variable}-${seconds(a)},0,${seconds(b - a)})`;
    terms.push(Math.abs(slope) < 0.000001 ? `(${u})/${number(from)}` : `log((${number(from)}+(${number(slope)})*(${u}))/${number(from)})/(${number(slope)})`);
  }
  for (const hold of edits?.freezes ?? []) if (hold.timeMs >= startMs && hold.timeMs < endMs) terms.push(`gt(${variable},${seconds(hold.timeMs)})*${seconds(hold.durationMs)}`);
  return terms.join('+') || '0';
}

export async function buildEditedVideoGraph(clip: Clip, segment: MontageV2Segment, target: EditRenderTarget, directory: string): Promise<string> {
  const edits = segment.videoEdits, start = segment.trimStartMs;
  const w = target.width, h = target.height, ratio = w / h;
  const sw = even(clip.width), sh = even(clip.height);
  const pw = even(Math.max(sw, sh * ratio)), ph = even(Math.max(sh, sw / ratio));
  const padX = (pw - sw) / 2, padY = (ph - sh) / 2;
  const mode = edits?.framing?.mode ?? (target.canvasSize === 'original' ? 'fit' : 'fill');
  const points = edits?.framing?.keyframes ?? [];
  const zoom = interpolate(points.map(point => ({ ...point, value: point.zoom })), `(in_time+${seconds(start)})`, 1);
  const x = interpolate(points.map(point => ({ ...point, value: point.x })), `(in_time+${seconds(start)})`, 0.5);
  const y = interpolate(points.map(point => ({ ...point, value: point.y })), `(in_time+${seconds(start)})`, 0.5);
  const look: string[] = ['setpts=PTS-STARTPTS', `scale=${sw}:${sh}`, 'setsar=1'];
  if (edits?.flipHorizontal) look.push('hflip');
  if (edits?.brightness) { const value = `clip(val*${number(1 + edits.brightness)},0,255)`; look.push(`lutrgb=r='${value}':g='${value}':b='${value}'`); }
  if (edits?.contrast !== undefined && edits.contrast !== 1) { const value = `clip((val-127.5)*${number(edits.contrast)}+127.5,0,255)`; look.push(`lutrgb=r='${value}':g='${value}':b='${value}'`); }
  if (edits?.saturation !== undefined && edits.saturation !== 1) {
    const amount = edits.saturation, r = 0.213 * (1 - amount), g = 0.715 * (1 - amount), b = 0.072 * (1 - amount);
    look.push(`colorchannelmixer=rr=${r + amount}:rg=${g}:rb=${b}:gr=${r}:gg=${g + amount}:gb=${b}:br=${r}:bg=${g}:bb=${b + amount}`);
  }
  const filters = [`[0:v:0]${look.join(',')}[picture]`];
  if (mode === 'fill') {
    // Keep user zoom within zoompan's 1–10 limit; crop the output aspect separately.
    // Applying the same normalized pan in both stages preserves the preview geometry.
    filters.push(`[picture]zoompan=z='${zoom}':x='(iw-iw/zoom)*(${x})':y='(ih-ih/zoom)*(${y})':d=1:s=${sw}x${sh}:fps=${number(target.fps)},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:x='(iw-ow)*(${x.replaceAll('in_time', 't')})':y='(ih-oh)*(${y.replaceAll('in_time', 't')})',setsar=1[framed]`);
  } else {
  if (edits?.framing?.background === 'blur') {
    filters.push(`[picture]split[foreground][background]`, `[background]scale=${pw}:${ph}:force_original_aspect_ratio=increase,crop=${pw}:${ph},gblur=sigma=${Math.min(64, Math.max(3, ph * 0.02))}[blurred]`, `[blurred][foreground]overlay=x=${padX}:y=${padY}[padded]`);
  } else filters.push(`[picture]pad=${pw}:${ph}:${padX}:${padY}:color=black[padded]`);
  filters.push(`[padded]zoompan=z='${zoom}':x='${padX}+(${sw}-iw/zoom)*(${x})':y='${padY}+(${sh}-ih/zoom)*(${y})':d=1:s=${w}x${h}:fps=${number(target.fps)},setsar=1[framed]`);
  }
  const overlays: VideoOverlay[] = [...(edits?.overlays ?? [])];
  if (edits?.text?.content) {
    overlays.unshift(titleOverlay(edits.text, w, h));
  }
  let label = 'framed';
  for (const [index, item] of overlays.entries()) {
    if (item.endMs <= start || item.startMs >= segment.trimEndMs) continue;
    const out = `overlay${index}`;
    const enabled = `gte(t,${seconds(item.startMs - start)})*lt(t,${seconds(item.endMs - start)})`;
    const ox = Math.floor(item.x * w), oy = Math.floor(item.y * h), ow = even(item.width * w), oh = even(item.height * h);
    if (item.kind === 'text') {
      if (!item.content) continue;
      const path = join(directory, `overlay-${index}.txt`); await writeFile(path, item.content, 'utf8');
      const lines = item.content.split('\n'), longest = Math.max(1, ...lines.map(line => [...line].length));
      const size = Math.max(1, Math.min(h * videoTextSize[item.size ?? 'medium'], item.width * w / (longest * 0.65), item.height * h / (Math.max(1, lines.length) * 1.2)));
      const font = process.platform === 'win32' ? `fontfile=${filterPath(join(process.env.WINDIR ?? 'C:/Windows', 'Fonts', 'arialbd.ttf'))}` : 'font=DejaVu Sans';
      filters.push(`[${label}]drawtext=${font}:textfile=${filterPath(path)}:expansion=none:fontsize=${number(size)}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6:x=${number((item.x + item.width / 2) * w)}-text_w/2:y=${oy}:enable='${enabled}'[${out}]`);
    } else {
      filters.push(`[${label}]split[mask-base${index}][mask-source${index}]`);
      const effect = item.kind === 'blur' ? `gblur=sigma=${Math.max(3, h * 0.02)}` : `scale=${Math.max(2, Math.round(ow / Math.max(6, h / 60)))}:${Math.max(2, Math.round(oh / Math.max(6, h / 60)))}:flags=neighbor,scale=${ow}:${oh}:flags=neighbor`;
      filters.push(`[mask-source${index}]crop=${ow}:${oh}:${Math.min(w - ow, ox)}:${Math.min(h - oh, oy)},${effect}[mask${index}]`, `[mask-base${index}][mask${index}]overlay=x=${ox}:y=${oy}:enable='${enabled}'[${out}]`);
    }
    label = out;
  }
  const duration = seconds(editedDurationMs(start, segment.trimEndMs, edits));
  const timing = editedPtsExpression(start, segment.trimEndMs, edits, `(T+${seconds(start)})`);
  filters.push(`[${label}]settb=AVTB,setpts='(${timing})/TB',tpad=stop_mode=clone:stop_duration=${duration},fps=${number(target.fps)},trim=duration=${duration},format=yuv420p[vout]`);
  return filters.join(';');
}

type AudioSlice = { startMs: number; endMs: number; durationMs: number; frozen: boolean };
export function audioTimingSlices(startMs: number, endMs: number, edits?: VideoEdits): AudioSlice[] {
  const boundaries = new Set([startMs, endMs, ...(edits?.speedPoints ?? []).map(point => point.timeMs).filter(t => t > startMs && t < endMs), ...(edits?.freezes ?? []).map(hold => hold.timeMs).filter(t => t >= startMs && t < endMs)]);
  const keys = [...boundaries].sort((a, b) => a - b), result: AudioSlice[] = [];
  // Bound graph size for long clips. Only ramp intervals need audio subdivisions.
  const stepMs = Math.max(100, (endMs - startMs) / 512);
  for (let index = 0; index < keys.length - 1; index++) {
    const start = keys[index]!, end = keys[index + 1]!;
    const hold = edits?.freezes?.find(item => item.timeMs === start);
    if (hold) result.push({ startMs: start, endMs: start, durationMs: hold.durationMs, frozen: true });
    const ramp = Math.abs(speedAt(start, edits) - speedAt(end - 0.000001, edits)) > 0.000001;
    const count = ramp ? Math.max(1, Math.ceil((end - start) / stepMs)) : 1;
    for (let n = 0; n < count; n++) {
      const a = start + (end - start) * n / count, b = start + (end - start) * (n + 1) / count;
      result.push({ startMs: a, endMs: b, durationMs: movingDurationMs(a, b, edits), frozen: false });
    }
  }
  return result;
}

function tempo(speed: number) {
  const filters: string[] = [];
  while (speed < 0.5 - 0.000001) { filters.push('atempo=0.5'); speed /= 0.5; }
  while (speed > 2 + 0.000001) { filters.push('atempo=2'); speed /= 2; }
  if (Math.abs(speed - 1) > 0.000001) filters.push(`atempo=${number(speed)}`);
  return filters;
}

export function buildEditedAudioGraph(clip: Clip, segment: MontageV2Segment, streamCount: number, includeVoice: boolean): string {
  const start = segment.trimStartMs, end = segment.trimEndMs, edits = segment.videoEdits;
  const total = seconds(editedDurationMs(start, end, edits));
  const filters: string[] = [], trackLabels: string[] = [];
  let voiceLabel: string | null = null;
  for (let track = 0; track < streamCount; track++) {
    const level = (segment.audioTrackLevels?.[track] ?? 100) / 100 * segment.volume;
    if (level <= 0 || segment.muted) continue;
    const automation = edits?.audioAutomation?.find(item => item.trackIndex === track);
    const trackTrim = segment.audioTrackTrims?.[track];
    const labels: string[] = [];
    for (const [index, slice] of audioTimingSlices(start, end, edits).entries()) {
      const label = `audio-${track}-${index}`, duration = seconds(slice.durationMs);
      labels.push(`[${label}]`);
      if (slice.frozen) { filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[${label}]`); continue; }
      const variable = `(t+${seconds(slice.startMs)})`;
      const trimGain = trackTrim ? `*gte(${variable},${seconds(trackTrim.startMs)})*lt(${variable},${seconds(trackTrim.endMs)})` : '';
      const gain = `${number(level)}*${automationExpression(automation, variable)}${trimGain}`;
      const chain = [
        `atrim=start=${seconds(slice.startMs - start)}:end=${seconds(slice.endMs - start)}`, 'asetpts=PTS-STARTPTS',
        `volume='${gain}':eval=frame`, ...tempo((slice.endMs - slice.startMs) / slice.durationMs),
        'aresample=48000', 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo', `apad=whole_dur=${duration}`, `atrim=duration=${duration}`, 'asetpts=PTS-STARTPTS',
      ];
      filters.push(`[0:a:${track}]${chain.join(',')}[${label}]`);
    }
    const joined = `track${track}`;
    filters.push(`${labels.join('')}${labels.length > 1 ? `concat=n=${labels.length}:v=0:a=1` : 'anull'}[${joined}]`);
    if (includeVoice && clip.audioChannels?.[track] === 'microphone' && voiceLabel === null) {
      filters.push(`[${joined}]asplit[${joined}-mix][voice-track]`); trackLabels.push(`[${joined}-mix]`); voiceLabel = 'voice-track';
    } else trackLabels.push(`[${joined}]`);
  }
  filters.push(trackLabels.length ? `${trackLabels.join('')}${trackLabels.length > 1 ? `amix=inputs=${trackLabels.length}:normalize=0:dropout_transition=0` : 'anull'},apad=whole_dur=${total},atrim=duration=${total},alimiter=limit=0.95:latency=1[aout]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${total}[aout]`);
  if (includeVoice) filters.push(voiceLabel ? `[${voiceLabel}]apad=whole_dur=${total},atrim=duration=${total}[voiceout]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${total}[voiceout]`);
  return filters.join(';');
}
