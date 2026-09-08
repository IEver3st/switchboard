import { z } from 'zod';

const time = z.number().int().min(0).max(86_400_000);
const unit = z.number().min(0).max(1);
export const interpolationSchema = z.enum(['linear', 'smooth', 'hold']);
export const framingKeyframeSchema = z.object({
  timeMs: time, x: unit, y: unit, zoom: z.number().min(1).max(8), transition: interpolationSchema,
});
export type FramingKeyframe = z.infer<typeof framingKeyframeSchema>;
export const gainPointSchema = z.object({ timeMs: time, gain: unit });
export const muteRangeSchema = z.object({ startMs: time, endMs: time }).refine(value => value.endMs > value.startMs, 'The end must follow the start.');
export const audioAutomationSchema = z.object({
  trackIndex: z.number().int().min(0).max(7),
  points: z.array(gainPointSchema).max(128),
  mutes: z.array(muteRangeSchema).max(64),
});
export type AudioAutomation = z.infer<typeof audioAutomationSchema>;
export const videoOverlaySchema = z.object({
  id: z.string().uuid(), kind: z.enum(['text', 'blur', 'pixelate']),
  startMs: time, endMs: time,
  x: unit, y: unit, width: z.number().min(0.02).max(1), height: z.number().min(0.02).max(1),
  content: z.string().max(500).refine(value => !/[\x00-\x08\x0b-\x1f]/.test(value), 'Use printable text.').optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
}).superRefine((value, context) => {
  if (value.endMs <= value.startMs) context.addIssue({ code: 'custom', message: 'The overlay must end after it starts.' });
  if (value.x + value.width > 1.00001 || value.y + value.height > 1.00001) context.addIssue({ code: 'custom', message: 'Keep the overlay within the frame.' });
});
export type VideoOverlay = z.infer<typeof videoOverlaySchema>;

// Times stay in source coordinates so trims, splits and speed edits preserve titles.
export const videoTextSchema = z.object({
  content: z.string().max(160).refine((text) => !/[\x00-\x08\x0b-\x1f]/.test(text), 'Use printable text.'),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  position: z.enum(['top', 'center', 'bottom']),
  size: z.enum(['small', 'medium', 'large']),
}).refine((text) => text.endMs > text.startMs, 'Text must end after it starts.');

export const videoEditsSchema = z.object({
  speed: z.number().min(0.25).max(4).optional(),
  brightness: z.number().min(-0.3).max(0.3).optional(),
  contrast: z.number().min(0.5).max(1.5).optional(),
  saturation: z.number().min(0).max(2).optional(),
  flipHorizontal: z.boolean().optional(),
  text: videoTextSchema.optional(),
  framing: z.object({
    mode: z.enum(['fill', 'fit']), background: z.enum(['black', 'blur']),
    keyframes: z.array(framingKeyframeSchema).max(128),
  }).optional(),
  overlays: z.array(videoOverlaySchema).max(32).optional(),
  speedPoints: z.array(z.object({ timeMs: time, speed: z.number().min(0.25).max(4), transition: z.enum(['linear', 'hold']) })).max(64).optional(),
  freezes: z.array(z.object({ timeMs: time, durationMs: z.number().int().min(100).max(30_000) })).max(32).optional(),
  audioAutomation: z.array(audioAutomationSchema).max(8).optional(),
}).superRefine((value, context) => {
  for (const [name, points] of Object.entries({ framing: value.framing?.keyframes, speedPoints: value.speedPoints, freezes: value.freezes })) {
    if (points?.some((point, index) => index > 0 && point.timeMs <= points[index - 1]!.timeMs)) context.addIssue({ code: 'custom', message: `${name} points must have unique, increasing times.`, path: [name] });
  }
  const tracks = value.audioAutomation ?? [];
  if (new Set(tracks.map(track => track.trackIndex)).size !== tracks.length) context.addIssue({ code: 'custom', message: 'Use one automation lane per audio track.', path: ['audioAutomation'] });
  for (const track of tracks) if (track.points.some((point, index) => index > 0 && point.timeMs <= track.points[index - 1]!.timeMs)) context.addIssue({ code: 'custom', message: 'Volume points must have unique, increasing times.', path: ['audioAutomation'] });
});
export type VideoEdits = z.infer<typeof videoEditsSchema>;
export const videoTextSize = { small: 0.035, medium: 0.055, large: 0.08 } as const;
export function titleOverlay(text: z.infer<typeof videoTextSchema>, width: number, height: number): VideoOverlay {
  const lines = text.content.split('\n'), longest = Math.max(1, ...lines.map(line => [...line].length));
  const size = Math.min(height * videoTextSize[text.size], width * 0.88 / (longest * 0.65), height * 0.7 / (Math.max(1, lines.length) * 1.2));
  const boxHeight = Math.max(0.02, lines.length * size * 1.2 / height);
  return { id: 'legacy', kind: 'text', content: text.content, startMs: text.startMs, endMs: text.endMs, size: text.size, x: 0.06, y: text.position === 'top' ? 0.08 : text.position === 'center' ? 0.5 - boxHeight / 2 : 0.92 - boxHeight, width: 0.88, height: boxHeight };
}
export function editedDurationMs(startMs: number, endMs: number, edits?: VideoEdits): number {
  return Math.round(movingDurationMs(startMs, endMs, edits) + (edits?.freezes ?? []).filter(hold => hold.timeMs >= startMs && hold.timeMs < endMs).reduce((sum, hold) => sum + hold.durationMs, 0));
}

export function montageSizeChoices(durationMs: number): number[] {
  // Approximate 2, 5 and 10 Mbps budgets, with room for AAC and container overhead.
  return [2, 5, 10].map((mbps) => Math.max(10, Math.ceil(durationMs / 1000 * (mbps + 0.192) / 8 * 1_000_000 / 1_048_576 / 5) * 5));
}

export function hasVideoEdits(edits?: VideoEdits): boolean {
  return !!edits && ((edits.speed ?? 1) !== 1 || (edits.brightness ?? 0) !== 0
    || (edits.contrast ?? 1) !== 1 || (edits.saturation ?? 1) !== 1
    || !!edits.flipHorizontal || !!edits.text?.content || !!edits.framing || !!edits.overlays?.length
    || !!edits.speedPoints?.length || !!edits.freezes?.length || !!edits.audioAutomation?.length);
}

export function speedAt(timeMs: number, edits?: VideoEdits): number {
  const points = edits?.speedPoints ?? [];
  let previous = { timeMs: 0, speed: edits?.speed ?? 1, transition: 'hold' };
  for (const point of points) {
    if (point.timeMs > timeMs) {
      if (previous.transition === 'hold' || point.timeMs === previous.timeMs) return previous.speed;
      return previous.speed + (point.speed - previous.speed) * Math.max(0, (timeMs - previous.timeMs) / (point.timeMs - previous.timeMs));
    }
    previous = point;
  }
  return previous.speed;
}

// Integrate 1 / speed in source time. A linear speed ramp has a logarithmic duration.
export function movingDurationMs(startMs: number, endMs: number, edits?: VideoEdits): number {
  if (endMs <= startMs) return 0;
  const boundaries = [startMs, ...(edits?.speedPoints ?? []).map(point => point.timeMs).filter(t => t > startMs && t < endMs), endMs];
  let duration = 0;
  for (let i = 1; i < boundaries.length; i++) {
    const a = boundaries[i - 1]!, b = boundaries[i]!;
    const first = speedAt(a, edits), last = speedAt(b - 0.000001, edits);
    duration += Math.abs(last - first) < 0.000001 ? (b - a) / first : (b - a) * Math.log(last / first) / (last - first);
  }
  return duration;
}

export function sourceToEditedMs(startMs: number, sourceMs: number, edits?: VideoEdits): number {
  return movingDurationMs(startMs, sourceMs, edits) + (edits?.freezes ?? []).filter(hold => hold.timeMs >= startMs && hold.timeMs < sourceMs).reduce((sum, hold) => sum + hold.durationMs, 0);
}

export function editedTimeAt(startMs: number, endMs: number, outputMs: number, edits?: VideoEdits): { sourceMs: number; frozen: boolean } {
  const target = Math.max(0, outputMs);
  if (!edits?.speedPoints?.length && !edits?.freezes?.length) return { sourceMs: Math.min(endMs, startMs + target * (edits?.speed ?? 1)), frozen: false };
  for (const hold of edits?.freezes ?? []) {
    if (hold.timeMs < startMs || hold.timeMs >= endMs) continue;
    const begins = sourceToEditedMs(startMs, hold.timeMs, edits);
    if (target >= begins && target < begins + hold.durationMs) return { sourceMs: hold.timeMs, frozen: true };
  }
  let low = startMs, high = endMs;
  for (let i = 0; i < 36; i++) {
    const middle = (low + high) / 2;
    if (sourceToEditedMs(startMs, middle, edits) <= target) low = middle; else high = middle;
  }
  return { sourceMs: Math.round(Math.min(endMs, Math.max(startMs, (low + high) / 2)) * 1_000_000) / 1_000_000, frozen: false };
}

export function framingAt(timeMs: number, edits?: VideoEdits): FramingKeyframe {
  const points = edits?.framing?.keyframes ?? [];
  if (!points.length) return { timeMs, x: 0.5, y: 0.5, zoom: 1, transition: 'smooth' };
  let previous = points[0]!;
  if (timeMs <= previous.timeMs) return previous;
  for (const next of points.slice(1)) {
    if (next.timeMs > timeMs) {
      let t = previous.transition === 'hold' ? 0 : (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs);
      if (previous.transition === 'smooth') t = t * t * (3 - 2 * t);
      return { timeMs, x: previous.x + (next.x - previous.x) * t, y: previous.y + (next.y - previous.y) * t, zoom: previous.zoom + (next.zoom - previous.zoom) * t, transition: previous.transition };
    }
    previous = next;
  }
  return previous;
}

export function gainAt(points: readonly { timeMs: number; gain: number }[] | undefined, timeMs: number): number {
  if (!points?.length) return 1;
  let previous = points[0]!;
  for (const next of points.slice(1)) {
    if (next.timeMs > timeMs) {
      const t = Math.max(0, (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs));
      return previous.gain + (next.gain - previous.gain) * t;
    }
    previous = next;
  }
  return previous.gain;
}

export function automationGainAt(automation: AudioAutomation | undefined, timeMs: number): number {
  return automation?.mutes.some(range => timeMs >= range.startMs && timeMs < range.endMs) ? 0 : gainAt(automation?.points, timeMs);
}

export const canvasRatios = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 } as const;
export function canvasDimensions(width: number, height: number, layout: string): { width: number; height: number } {
  const ratio = canvasRatios[layout as keyof typeof canvasRatios];
  return { width: Math.max(2, Math.floor((ratio ? height * ratio : width) / 2) * 2), height: Math.max(2, Math.floor(height / 2) * 2) };
}

// The source is fitted into an output-shaped canvas before pan/zoom. Export uses
// the same padded geometry, so a crop can move without revealing empty edges.
export function framingGeometry(sourceWidth: number, sourceHeight: number, width: number, height: number, key: FramingKeyframe, mode: 'fit' | 'fill') {
  const fit = Math.min(width / sourceWidth, height / sourceHeight);
  const imageWidth = sourceWidth * fit, imageHeight = sourceHeight * fit;
  const base = mode === 'fill' ? Math.max(width / imageWidth, height / imageHeight) : 1;
  const zoom = base * key.zoom;
  const padX = (width - imageWidth) / 2, padY = (height - imageHeight) / 2;
  const cropX = Math.max(0, Math.min(width - width / zoom, padX + (imageWidth - width / zoom) * key.x));
  const cropY = Math.max(0, Math.min(height - height / zoom, padY + (imageHeight - height / zoom) * key.y));
  return { x: (padX - cropX) * zoom, y: (padY - cropY) * zoom, width: imageWidth * zoom, height: imageHeight * zoom, zoom, cropX, cropY };
}
