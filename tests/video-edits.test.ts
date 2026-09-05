import { describe, expect, test } from 'bun:test';
import { videoEditsSchema, editedDurationMs, montageSizeChoices } from '../src/shared/video-edits';
import { montageProjectV2Schema } from '../src/shared/montage-v2';
import { clipSchema } from '../src/shared/contracts';
import { createMontageProjectV2, mapMontageTime, normalizeMontageProject, splitMontageSegment } from '../src/renderer/src/components/capture/montage-v2-model';
import { buildMontageV2SegmentAudioFilter, tempoFilters } from '../src/main/services/montage-v2-renderer';

const clip = clipSchema.parse({ id: 'video-edits', path: 'source.mp4', name: 'Source', createdAt: 0, durationMs: 10000, fileSize: 1000, width: 1920, height: 1080, fps: 60 });

describe('video editing timing and validation', () => {
  test('old projects hydrate unchanged, while speed affects timeline boundaries and source seeking', () => {
    const old = createMontageProjectV2([clip, clip]);
    expect(montageProjectV2Schema.parse(old).durationMs).toBe(20000);
    const project = normalizeMontageProject({ ...old, segments: old.segments.map((segment, i) => ({ ...segment, videoEdits: { speed: i === 0 ? 0.5 : 2 } })) });
    expect(project.durationMs).toBe(25000);
    expect(mapMontageTime(project.segments, 12000)?.sourceTimeMs).toBe(6000);
    expect(mapMontageTime(project.segments, 20000)?.segmentIndex).toBe(1);
    expect(mapMontageTime(project.segments, 22000)?.sourceTimeMs).toBe(4000);
    expect(montageProjectV2Schema.safeParse({ ...project, durationMs: 20000 }).success).toBe(false);
  });
  test('split preserves source title timing and total speed-adjusted duration', () => {
    const project = createMontageProjectV2([{ ...clip, videoEdits: { speed: 0.5, text: { content: 'Round 1', startMs: 1000, endMs: 8000, position: 'bottom', size: 'medium' } } }]);
    const split = splitMontageSegment(project, project.segments[0]!.id, 4000);
    expect(split.durationMs).toBe(project.durationMs);
    expect(split.segments[1]?.videoEdits?.text?.startMs).toBe(1000);
    expect(mapMontageTime(split.segments, 9000)?.sourceTimeMs).toBe(4500);
  });
  test('rejects unsafe rates and invalid title timing', () => {
    for (const speed of [0, -1, 0.1, 5, Infinity, NaN]) expect(videoEditsSchema.safeParse({ speed }).success).toBe(false);
    expect(videoEditsSchema.safeParse({ text: { content: 'x\u0000', startMs: 0, endMs: 10, position: 'bottom', size: 'small' } }).success).toBe(false);
    expect(editedDurationMs(1000, 5000, { speed: 0.25 })).toBe(16000);
  });
  test('audio trims stretch and delay in output time, preserving pitch', () => {
    const project = createMontageProjectV2([clip]);
    const segment = { ...project.segments[0]!, trimStartMs: 1000, trimEndMs: 5000, videoEdits: { speed: 0.25 }, audioTrackTrims: [{ startMs: 2000, endMs: 4000 }] };
    const filter = buildMontageV2SegmentAudioFilter(1, segment)!;
    expect(filter).toContain('atempo=0.5,atempo=0.5');
    expect(filter).toContain('adelay=4000:all=1');
    expect(filter).toContain('atrim=duration=16.000');
    expect(tempoFilters(4)).toEqual(['atempo=2', 'atempo=2']);
  });
  test('size recommendations grow with runtime rather than topping out at 50 MB', () => {
    const short = montageSizeChoices(30000);
    const long = montageSizeChoices(1800000);
    expect(long[0]!).toBeGreaterThan(50);
    expect(long[1]!).toBeGreaterThan(short[1]! * 40);
    expect(long[2]!).toBeGreaterThan(long[1]!);
  });
});
