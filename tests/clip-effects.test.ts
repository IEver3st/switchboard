import { describe, expect, test } from 'bun:test';
import { clipSchema } from '../src/shared/contracts';
import { editedDurationMs, editedTimeAt, sourceToEditedMs, speedAt, framingAt, framingGeometry, automationGainAt, videoEditsSchema, type VideoEdits } from '../src/shared/video-edits';
import { audioTimingSlices } from '../src/main/services/clip-effects-renderer';
import { createSingleClipDraft, splitMontageSegment, removeMontageSegment } from '../src/renderer/src/components/capture/montage-v2-model';

const clip = clipSchema.parse({ id: 'timing-fixture', path: 'fixture.mp4', name: 'Fixture', durationMs: 5000, width: 1920, height: 1080, fps: 60, createdAt: 0, fileSize: 1 });
const edits: VideoEdits = {
  speedPoints: [{ timeMs: 0, speed: 1, transition: 'linear' }, { timeMs: 2000, speed: 0.25, transition: 'linear' }, { timeMs: 4000, speed: 4, transition: 'hold' }],
  freezes: [{ timeMs: 0, durationMs: 500 }, { timeMs: 2500, durationMs: 1000 }, { timeMs: 4999, durationMs: 1000 }],
};

describe('advanced clip editing', () => {
  test('ramps use reciprocal-speed integration and reversible source time', () => {
    const ramp = { speedPoints: [{ timeMs: 0, speed: 1, transition: 'linear' as const }, { timeMs: 1000, speed: 2, transition: 'hold' as const }] };
    expect(editedDurationMs(0, 1000, ramp)).toBe(Math.round(1000 * Math.log(2)));
    for (const source of [0, 1, 250, 1000, 2000, 2499, 2500, 2501, 4000, 4999]) {
      const mapping = editedTimeAt(0, 5000, sourceToEditedMs(0, source, edits), edits);
      expect(mapping.sourceMs).toBeCloseTo(source, 3);
    }
  });
  test('freeze at start, interior, and final source frame holds without adding media', () => {
    for (const hold of edits.freezes!) {
      const from = sourceToEditedMs(0, hold.timeMs, edits);
      expect(editedTimeAt(0, 5000, from + hold.durationMs / 2, edits)).toEqual({ sourceMs: hold.timeMs, frozen: true });
      expect(editedTimeAt(0, 5000, from + hold.durationMs + 0.1, edits).frozen).toBe(false);
    }
    expect(editedDurationMs(0, 2500, { freezes: [{ timeMs: 2500, durationMs: 1000 }] })).toBe(2500);
  });
  test('splitting at a freeze boundary counts it once and middle removal keeps source effects', () => {
    const project = createSingleClipDraft({ ...clip, videoEdits: edits });
    const split = splitMontageSegment(project, project.segments[0]!.id, 2500);
    expect(Math.abs(split.durationMs - project.durationMs)).toBeLessThanOrEqual(1);
    const secondSplit = splitMontageSegment(split, split.segments[1]!.id, 4000);
    const removed = removeMontageSegment(secondSplit, secondSplit.segments[1]!.id);
    expect(removed.segments.map(segment => [segment.trimStartMs, segment.trimEndMs])).toEqual([[0, 2500], [4000, 5000]]);
    expect(removed.sourceClipId).toBe(clip.id);
    expect(removed.segments[1]!.videoEdits).toEqual(edits);
  });
  test('audio slices preserve ramp duration and insert silence at every retained freeze', () => {
    const slices = audioTimingSlices(0, 5000, edits);
    expect(slices.filter(slice => slice.frozen).map(slice => slice.durationMs)).toEqual([500, 1000, 1000]);
    expect(Math.round(slices.reduce((total, slice) => total + slice.durationMs, 0))).toBe(editedDurationMs(0, 5000, edits));
    expect(slices.filter(slice => !slice.frozen).reduce((total, slice) => total + slice.endMs - slice.startMs, 0)).toBe(5000);
    expect(audioTimingSlices(0, 86_400_000, { speedPoints: [{ timeMs: 0, speed: 0.25, transition: 'linear' }, { timeMs: 86_400_000, speed: 4, transition: 'hold' }] }).length).toBeLessThanOrEqual(512);
  });
  test('hold interpolation cuts at the following key; smooth framing does not jump', () => {
    const framing: VideoEdits = { framing: { mode: 'fill', background: 'black', keyframes: [{ timeMs: 0, x: 0, y: 0.5, zoom: 1, transition: 'hold' }, { timeMs: 1000, x: 1, y: 0.5, zoom: 8, transition: 'smooth' }] } };
    expect(framingAt(999, framing).x).toBe(0);
    expect(framingAt(1000, framing).x).toBe(1);
    framing.framing!.keyframes[0]!.transition = 'smooth';
    expect(framingAt(500, framing).x).toBe(0.5);
    expect(framingAt(1, framing).x).toBeLessThan(0.00001);
    expect(speedAt(1000, { speedPoints: [{ timeMs: 0, speed: 0.5, transition: 'hold' }, { timeMs: 1000, speed: 2, transition: 'linear' }] })).toBe(2);
  });
  test('fill geometry covers every output edge at high zoom and fit retains the source', () => {
    for (const [w, h] of [[1920, 1080], [608, 1080], [1080, 1080], [864, 1080]]) for (const x of [0, 0.5, 1]) {
      const frame = framingGeometry(1920, 1080, w!, h!, { timeMs: 0, x, y: x, zoom: 8, transition: 'linear' }, 'fill');
      expect(frame.x).toBeLessThanOrEqual(0.00001); expect(frame.y).toBeLessThanOrEqual(0.00001);
      expect(frame.x + frame.width).toBeGreaterThanOrEqual(w! - 0.001); expect(frame.y + frame.height).toBeGreaterThanOrEqual(h! - 0.001);
    }
    const fit = framingGeometry(1920, 1080, 608, 1080, { timeMs: 0, x: 0.5, y: 0.5, zoom: 1, transition: 'smooth' }, 'fit');
    expect(fit.width).toBe(608); expect(fit.height).toBe(342);
  });
  test('audio envelope interpolates and mute intervals are half open', () => {
    const lane = { trackIndex: 0, points: [{ timeMs: 100, gain: 1 }, { timeMs: 1100, gain: 0 }], mutes: [{ startMs: 300, endMs: 500 }] };
    expect(automationGainAt(lane, 0)).toBe(1);
    expect(automationGainAt(lane, 300)).toBe(0);
    expect(automationGainAt(lane, 500)).toBeCloseTo(0.6);
    expect(automationGainAt(lane, 600)).toBe(0.5);
  });
  test('rejects duplicate points, invalid regions and unbounded graphs before export', () => {
    expect(videoEditsSchema.safeParse({ freezes: [{ timeMs: 100, durationMs: 1000 }, { timeMs: 100, durationMs: 1000 }] }).success).toBe(false);
    expect(videoEditsSchema.safeParse({ overlays: [{ id: crypto.randomUUID(), kind: 'blur', startMs: 0, endMs: 1000, x: 0.9, y: 0, width: 0.5, height: 0.5 }] }).success).toBe(false);
    expect(videoEditsSchema.safeParse({ speedPoints: Array.from({ length: 65 }, (_, timeMs) => ({ timeMs, speed: 1, transition: 'linear' })) }).success).toBe(false);
    expect(videoEditsSchema.safeParse({ audioAutomation: [{ trackIndex: 8, points: [], mutes: [] }] }).success).toBe(false);
  });
});
