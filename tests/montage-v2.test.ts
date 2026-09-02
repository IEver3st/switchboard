import { describe, expect, test } from 'bun:test';
import type { Clip } from '../src/shared/contracts';
import { montageProjectV2Schema, type MontageAudioAsset, type MontageMusicTrack } from '../src/shared/montage-v2';
import {
  buildMontageMusicMixPlan,
  buildMontageV2SegmentAudioFilter,
} from '../src/main/services/montage-v2-renderer';
import {
  addClipsToMontage,
  createMontageMusicTrack,
  createMontageProjectV2,
  duplicateMontageSegment,
  mapMontageTime,
  musicPlaybackAt,
  splitMontageSegment,
} from '../src/renderer/src/components/capture/montage-v2-model';

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

function audioAsset(durationMs = 5_000): MontageAudioAsset {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Track',
    originalName: 'track.mp3',
    durationMs,
    fileSize: 500_000,
    codec: 'mp3',
    createdAt: 1,
  };
}

describe('montage v2 project operations', () => {
  test('allows the same source clip to appear repeatedly', () => {
    const source = clip('clip-a');
    const project = createMontageProjectV2([source, source]);
    expect(project.segments.map((segment) => segment.clipId)).toEqual(['clip-a', 'clip-a']);
    expect(() => montageProjectV2Schema.parse(project)).not.toThrow();

    const duplicated = duplicateMontageSegment(project, project.segments[0]!.id);
    expect(duplicated.segments).toHaveLength(3);
    expect(new Set(duplicated.segments.map((segment) => segment.id)).size).toBe(3);
  });

  test('adds clips after the selected segment and splits at source time', () => {
    const first = clip('clip-a');
    const second = clip('clip-b');
    const project = createMontageProjectV2([first]);
    const added = addClipsToMontage(project, [second], project.segments[0]!.id);
    expect(added.segments.map((segment) => segment.clipId)).toEqual(['clip-a', 'clip-b']);

    const split = splitMontageSegment(added, added.segments[0]!.id, 4_000);
    expect(split.segments).toHaveLength(3);
    expect(split.segments[0]).toMatchObject({ clipId: 'clip-a', trimStartMs: 0, trimEndMs: 4_000 });
    expect(split.segments[1]).toMatchObject({ clipId: 'clip-a', trimStartMs: 4_000, trimEndMs: 10_000 });
    expect(mapMontageTime(split.segments, 4_000)).toMatchObject({ segmentIndex: 1, sourceTimeMs: 4_000 });
  });
});

describe('montage v2 music timing and export filters', () => {
  test('maps a looped music source and applies project-edge fades', () => {
    const track: MontageMusicTrack = {
      ...createMontageMusicTrack(audioAsset(5_000)),
      timelineStartMs: 1_000,
      sourceStartMs: 1_000,
      sourceEndMs: 4_000,
      volume: 0.5,
      fadeInMs: 1_000,
      fadeOutMs: 1_000,
      loop: true,
    };
    expect(musicPlaybackAt(track, 500, 10_000).active).toBe(false);
    expect(musicPlaybackAt(track, 1_500, 10_000)).toMatchObject({ active: true, sourceTimeMs: 1_500, gain: 0.25 });
    expect(musicPlaybackAt(track, 4_500, 10_000)).toMatchObject({ active: true, sourceTimeMs: 1_500 });
    expect(musicPlaybackAt(track, 9_500, 10_000).gain).toBe(0.25);
  });

  test('builds an explicit, limited clip and music mix without automatic normalization', () => {
    const project = createMontageProjectV2([clip('clip-a')]);
    const segment = { ...project.segments[0]!, volume: 0.5, audioTrackLevels: [100, 40] };
    const segmentGraph = buildMontageV2SegmentAudioFilter(2, segment) ?? '';
    expect(segmentGraph).toContain('volume=0.5000');
    expect(segmentGraph).toContain('volume=0.2000');
    expect(segmentGraph).toContain('normalize=0');
    expect(segmentGraph).toContain('alimiter=limit=0.95');

    const track: MontageMusicTrack = {
      ...createMontageMusicTrack(audioAsset()),
      timelineStartMs: 750,
      volume: 0.2,
      fadeInMs: 500,
      fadeOutMs: 800,
      loop: true,
    };
    const plan = buildMontageMusicMixPlan(track, 12_000, 'C:\\Music\\track.mp3');
    expect(plan?.inputArguments).toEqual(['-i', 'C:\\Music\\track.mp3']);
    expect(plan?.filter).toContain('aloop=loop=-1');
    expect(plan?.filter).toContain('adelay=750:all=1');
    expect(plan?.filter).toContain('volume=0.2000');
    expect(plan?.filter).toContain('normalize=0,alimiter=limit=0.95[aout]');
  });
});
