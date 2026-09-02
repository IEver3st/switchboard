import { describe, expect, test } from 'bun:test';
import { clipPreviewNeedsSync, clipPreviewTrackVolume } from '../src/renderer/src/components/capture/clip-preview-audio';

describe('clip preview audio', () => {
  test('applies the microphone track slider to preview volume', () => {
    expect(clipPreviewTrackVolume(100, 1, false, 5_000)).toBe(1);
    expect(clipPreviewTrackVolume(37, 1, false, 5_000)).toBeCloseTo(0.37);
    expect(clipPreviewTrackVolume(37, 0.5, false, 5_000)).toBeCloseTo(0.185);
  });

  test('honors mute and per-track trim boundaries', () => {
    const trim = { startMs: 2_000, endMs: 8_000 };
    expect(clipPreviewTrackVolume(100, 1, true, 5_000, trim)).toBe(0);
    expect(clipPreviewTrackVolume(100, 1, false, 1_999, trim)).toBe(0);
    expect(clipPreviewTrackVolume(100, 1, false, 2_000, trim)).toBe(1);
    expect(clipPreviewTrackVolume(100, 1, false, 8_000, trim)).toBe(0);
  });

  test('only corrects meaningful preview drift', () => {
    expect(clipPreviewNeedsSync(5, 5.04)).toBeFalse();
    expect(clipPreviewNeedsSync(5, 5.12)).toBeTrue();
  });
});
