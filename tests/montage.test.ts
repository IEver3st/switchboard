import { describe, expect, test } from 'bun:test';
import type { Clip } from '../src/shared/contracts';
import { montageProjectSchema, type MontageProjectSegment } from '../src/shared/contracts';
import { buildMontageSegmentAudioFilter } from '../src/main/services/clip-library';
import {
  mapMontageTime,
  normalizeClipProject,
  reorderProjectSegment,
  type ClipEditorSegment,
  type MontageClipEditorProject,
} from '../src/renderer/src/components/capture/clip-project-model';
import { applyMontageSegmentTrim } from '../src/renderer/src/components/capture/montage-timeline-model';

function clip(id: string, durationMs = 10_000): Clip {
  return {
    id,
    path: `C:\\Clips\\${id}.mp4`,
    name: id,
    createdAt: 1,
    durationMs,
    fileSize: 1_000_000,
    width: 1_920,
    height: 1_080,
    fps: 60,
    favorite: false,
    titleEdited: false,
    canvasSize: 'original',
  };
}

function segment(id: string, source: Clip, trimStartMs: number, trimEndMs: number): ClipEditorSegment {
  return { id, source, trimStartMs, trimEndMs, audioTrackLevels: [], audioTrackTrims: [] };
}

function project(segments: ClipEditorSegment[]): MontageClipEditorProject {
  return normalizeClipProject({ type: 'montage', id: 'montage-1', name: 'Montage', segments, durationMs: 0, canvasSize: 'original' });
}

describe('composed montage timeline', () => {
  test('maps global montage time to the correct segment and local source time at boundaries', () => {
    const segments = [segment('a', clip('clip-a'), 1_000, 4_000), segment('b', clip('clip-b'), 2_000, 6_000)];
    expect(mapMontageTime(segments, 2_500)).toMatchObject({ segmentIndex: 0, montageStartMs: 0, montageEndMs: 3_000, sourceTimeMs: 3_500 });
    expect(mapMontageTime(segments, 3_000)).toMatchObject({ segmentIndex: 1, montageStartMs: 3_000, montageEndMs: 7_000, sourceTimeMs: 2_000 });
    expect(mapMontageTime(segments, 99_000)).toMatchObject({ segmentIndex: 1, sourceTimeMs: 6_000 });
  });

  test('keeps selection order until an explicit reorder and recalculates duration after trims', () => {
    const initial = project([segment('a', clip('clip-a'), 0, 4_000), segment('b', clip('clip-b'), 0, 5_000)]);
    expect(initial.durationMs).toBe(9_000);
    const reordered = reorderProjectSegment(initial, 'b', 'a');
    expect(reordered.segments.map((entry) => entry.id)).toEqual(['b', 'a']);
    const trimmed = applyMontageSegmentTrim(reordered.segments[0]!, 'end', 3_000);
    expect(normalizeClipProject({ ...reordered, segments: [trimmed, reordered.segments[1]!] }).durationMs).toBe(7_000);
  });

  test('prevents segment trim handles from crossing or leaving the source range', () => {
    const value = segment('a', clip('clip-a'), 2_000, 8_000);
    expect(applyMontageSegmentTrim(value, 'start', 9_000).trimStartMs).toBe(7_900);
    expect(applyMontageSegmentTrim(value, 'end', 500).trimEndMs).toBe(2_100);
    expect(applyMontageSegmentTrim(value, 'end', 20_000).trimEndMs).toBe(10_000);
  });
});

describe('montage export contract and audio graph', () => {
  const exportedSegment: MontageProjectSegment = {
    id: 'segment-a',
    clipId: 'clip-a',
    sourceDurationMs: 10_000,
    trimStartMs: 2_000,
    trimEndMs: 8_000,
    audioTrackLevels: [100, 50, 0],
    audioTrackTrims: [null, { startMs: 3_000, endMs: 7_000 }],
  };

  test('validates project duration and rejects duplicate clip sources', () => {
    const valid = { type: 'montage' as const, id: 'montage-1', name: 'Montage', durationMs: 6_000, canvasSize: 'original' as const, segments: [exportedSegment] };
    expect(montageProjectSchema.parse(valid).durationMs).toBe(6_000);
    expect(() => montageProjectSchema.parse({ ...valid, durationMs: 5_999 })).toThrow();
    expect(() => montageProjectSchema.parse({ ...valid, durationMs: 12_000, segments: [exportedSegment, { ...exportedSegment, id: 'segment-b' }] })).toThrow();
  });

  test('mixes available audio, preserves per-track trims, and pads each segment to video duration', () => {
    const graph = buildMontageSegmentAudioFilter(3, exportedSegment)?.filter ?? '';
    expect(graph).toContain('[0:a:0]atrim=start=2.000:end=8.000');
    expect(graph).toContain('[0:a:1]atrim=start=3.000:end=7.000,asetpts=PTS-STARTPTS,adelay=1000:all=1,volume=0.50');
    expect(graph).not.toContain('[0:a:2]');
    expect(graph).toContain('amix=inputs=2');
    expect(graph).toContain('apad=whole_dur=6.000,atrim=duration=6.000');
  });
});
