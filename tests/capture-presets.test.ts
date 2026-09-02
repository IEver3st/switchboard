import { describe, expect, test } from 'bun:test';
import {
  canTransitionReplayState,
  estimateClipSize,
  getEncodingPreset,
  sanitizeClipBaseName,
  selectEvictionCandidates,
  selectReplaySegments,
  type ReplaySegment,
} from '../src/shared/capture-presets';
import { captureRuntimeSchema } from '../src/shared/contracts';
import { defaultCaptureRuntime } from '../src/shared/defaults';

const baseConfig = {
  quality: 3 as const,
  resolution: '1080p' as const,
  fps: 60 as const,
  codec: 'h264' as const,
  includeMic: true,
  replaySeconds: 60,
};

describe('capture encoding presets', () => {
  test('scales bitrate with resolution, frame rate, quality, and codec', () => {
    const baseline = getEncodingPreset(baseConfig).targetVideoBitrateBps;
    expect(getEncodingPreset({ ...baseConfig, quality: 5 }).targetVideoBitrateBps).toBeGreaterThan(baseline);
    expect(getEncodingPreset({ ...baseConfig, resolution: '1440p' }).targetVideoBitrateBps).toBeGreaterThan(baseline);
    expect(getEncodingPreset({ ...baseConfig, fps: 120 }).targetVideoBitrateBps).toBeGreaterThan(baseline);
    expect(getEncodingPreset({ ...baseConfig, codec: 'av1' }).targetVideoBitrateBps).toBeLessThan(baseline);
  });

  test('returns honest ranges and narrows them after observing the workload', () => {
    const preset = estimateClipSize(baseConfig);
    const observed = estimateClipSize(baseConfig, 10_000_000);
    expect(preset.lowerBoundBytes).toBeLessThan(preset.estimatedBytes);
    expect(preset.upperBoundBytes).toBeGreaterThan(preset.estimatedBytes);
    expect(preset.source).toBe('preset');
    expect(observed.source).toBe('observed');
    expect(observed.upperBoundBytes - observed.lowerBoundBytes).toBeLessThan(
      preset.upperBoundBytes - preset.lowerBoundBytes,
    );
  });
});

function segment(index: number, sizeBytes = 100): ReplaySegment {
  return {
    path: `${index}.mkv`,
    startedAtMs: index * 1_000,
    endedAtMs: (index + 1) * 1_000,
    sizeBytes,
    complete: true,
  };
}

describe('replay ring selection', () => {
  test('selects only the completed segments covering the requested trailing window', () => {
    const segments = [segment(0), segment(1), segment(2), { ...segment(3), complete: false }];
    expect(selectReplaySegments(segments, 2_000).map((entry) => entry.path)).toEqual(['1.mkv', '2.mkv']);
  });

  test('evicts oldest segments until both duration and byte bounds hold', () => {
    expect(selectEvictionCandidates([segment(0), segment(1), segment(2), segment(3)], 3_000, 250)
      .map((entry) => entry.path)).toEqual(['0.mkv', '1.mkv']);
  });
});

describe('capture filesystem and state rules', () => {
  test('sanitizes illegal and reserved Windows names', () => {
    expect(sanitizeClipBaseName('Five:M / pursuit*')).toBe('FiveMpursuit');
    expect(sanitizeClipBaseName('CON.txt')).toBe('Capture');
    expect(sanitizeClipBaseName('   ')).toBe('Capture');
  });

  test('allows real replay transitions and rejects impossible ones', () => {
    expect(canTransitionReplayState('stopped', 'starting')).toBeTrue();
    expect(canTransitionReplayState('starting', 'buffering')).toBeTrue();
    expect(canTransitionReplayState('buffering', 'saving')).toBeTrue();
    expect(canTransitionReplayState('saving', 'buffering')).toBeTrue();
    expect(canTransitionReplayState('stopped', 'saving')).toBeFalse();
  });

  test('normalizes an omitted native-host source to null', () => {
    const runtime = captureRuntimeSchema.parse({
      state: 'stopped',
      bufferedSeconds: 0,
      segmentCount: 0,
      replayCacheBytes: 0,
      observedBitrateBps: 0,
      encoderLabel: 'Not selected',
      backendLabel: 'Unavailable',
      droppedFrames: 0,
      encodedFrames: 0,
      audioSyncCorrections: 0,
      saveQueueDepth: 0,
      shortcutRegistered: false,
      reactionClipping: defaultCaptureRuntime.reactionClipping,
    });
    expect(runtime.activeSource).toBeNull();
  });
});
