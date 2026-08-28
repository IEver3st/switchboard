import { describe, expect, test } from 'bun:test';
import type { Clip } from '../src/shared/contracts';
import { latestClipCreatedAt, unreviewedClips } from '../src/shared/clip-review';

function clip(id: string, createdAt: number): Clip {
  return {
    id,
    path: `C:\\Clips\\${id}.mp4`,
    name: id,
    createdAt,
    durationMs: 30_000,
    fileSize: 1_000_000,
    width: 1_920,
    height: 1_080,
    fps: 60,
    favorite: false,
    titleEdited: false,
    canvasSize: 'original',
  };
}

describe('new clip review batches', () => {
  test('returns only clips newer than the durable marker in newest-first order', () => {
    const clips = [clip('older', 100), clip('newest', 400), clip('middle', 250), clip('reviewed', 200)];
    expect(unreviewedClips(clips, 200).map((entry) => entry.id)).toEqual(['newest', 'middle']);
    expect(latestClipCreatedAt(clips)).toBe(400);
  });

  test('does not re-open clips recorded at the reviewed boundary', () => {
    expect(unreviewedClips([clip('same-time', 400)], 400)).toEqual([]);
    expect(latestClipCreatedAt([])).toBe(0);
  });
});
