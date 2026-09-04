import { expect, test } from 'bun:test';
import { visibleClipIndexes } from '../src/renderer/src/components/capture/virtual-clip-rows';

test('virtual rows cover the viewport and keep a distant focused row without mounting the gap', () => {
  const indexes = visibleClipIndexes(10000, 4, 200, 20, 22000, 600, 220, 1);
  expect(indexes.slice(0, 4)).toEqual([0, 1, 2, 3]);
  expect(indexes).toContain(400);
  expect(indexes).toContain(411);
  expect(indexes.length).toBeLessThan(32);
  expect(indexes).not.toContain(200);
});

test('virtual rows clamp partial final rows and omit offscreen groups', () => {
  expect(visibleClipIndexes(10, 4, 200, 20, 440, 600, 0)).toEqual([8, 9]);
  expect(visibleClipIndexes(10, 4, 200, 20, 1000, 600, 0)).toEqual([]);
  expect(visibleClipIndexes(10, 4, 200, 20, -1000, 600, 0)).toEqual([]);
  expect(visibleClipIndexes(0, 4, 200, 20, 0, 600, 220)).toEqual([]);
});

test('virtual list reaches both ends without duplicate positions', () => {
  expect(visibleClipIndexes(442, 1, 110, 0, 0, 220, 0)).toEqual([0, 1]);
  expect(visibleClipIndexes(442, 1, 110, 0, 440 * 110, 900, 0, 441)).toEqual([440, 441]);
});
