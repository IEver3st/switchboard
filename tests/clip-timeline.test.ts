import { describe, expect, test } from 'bun:test';
import {
  applyPlayheadKeyboard,
  applyTimelineInteraction,
  applyTrimKeyboard,
  minimumClipDurationMs,
  timeFromTimelinePoint,
  type TimelineValues,
} from '../src/renderer/src/components/capture/clip-timeline-model';

const initial: TimelineValues = {
  currentMs: 4_000,
  startMs: 2_000,
  endMs: 8_000,
  durationMs: 10_000,
};

describe('clip timeline interaction model', () => {
  test('click-to-seek maps the timeline point to the exact playhead time', () => {
    const clickedMs = timeFromTimelinePoint(350, 100, 500, initial.durationMs);
    const next = applyTimelineInteraction('scrubbing', clickedMs, initial);

    expect(clickedMs).toBe(5_000);
    expect(next.currentMs).toBe(5_000);
    expect([next.startMs, next.endMs]).toEqual([2_000, 8_000]);
  });

  test('drag-to-scrub updates continuously without changing the trim range', () => {
    const first = applyTimelineInteraction('scrubbing', 3_250, initial);
    const second = applyTimelineInteraction('scrubbing', 7_750, first);

    expect(first.currentMs).toBe(3_250);
    expect(second.currentMs).toBe(7_750);
    expect([second.startMs, second.endMs]).toEqual([2_000, 8_000]);
  });

  test('left trim handle changes only trim start', () => {
    const next = applyTimelineInteraction('dragging-trim-start', 3_500, initial);

    expect(next.startMs).toBe(3_500);
    expect(next.endMs).toBe(8_000);
    expect(next.currentMs).toBe(4_000);
  });

  test('right trim handle changes only trim end', () => {
    const next = applyTimelineInteraction('dragging-trim-end', 6_500, initial);

    expect(next.startMs).toBe(2_000);
    expect(next.endMs).toBe(6_500);
    expect(next.currentMs).toBe(4_000);
  });

  test('trim bounds clamp to the clip duration', () => {
    const start = applyTimelineInteraction('dragging-trim-start', -2_000, initial);
    const end = applyTimelineInteraction('dragging-trim-end', 15_000, initial);

    expect(start.startMs).toBe(0);
    expect(end.endMs).toBe(10_000);
  });

  test('trim handles cannot cross and preserve the minimum clip duration', () => {
    const crossedStart = applyTimelineInteraction('dragging-trim-start', 9_500, initial);
    const crossedEnd = applyTimelineInteraction('dragging-trim-end', 500, initial);

    expect(crossedStart.startMs).toBe(initial.endMs - minimumClipDurationMs);
    expect(crossedStart.endMs - crossedStart.startMs).toBe(minimumClipDurationMs);
    expect(crossedEnd.endMs).toBe(initial.startMs + minimumClipDurationMs);
    expect(crossedEnd.endMs - crossedEnd.startMs).toBe(minimumClipDurationMs);
  });

  test('scrubbing outside the selected range does not change trim', () => {
    const before = applyTimelineInteraction('scrubbing', 250, initial);
    const after = applyTimelineInteraction('scrubbing', 9_750, initial);

    expect([before.startMs, before.endMs]).toEqual([2_000, 8_000]);
    expect([after.startMs, after.endMs]).toEqual([2_000, 8_000]);
  });

  test('trimming does not unexpectedly seek the playhead', () => {
    const start = applyTimelineInteraction('dragging-trim-start', 5_000, initial);
    const end = applyTimelineInteraction('dragging-trim-end', 6_000, initial);

    expect(start.currentMs).toBe(initial.currentMs);
    expect(end.currentMs).toBe(initial.currentMs);
  });

  test('trim handles expose complete keyboard adjustment behavior', () => {
    const startArrow = applyTrimKeyboard('dragging-trim-start', 'ArrowRight', initial, 100);
    const endHome = applyTrimKeyboard('dragging-trim-end', 'Home', initial, 100);
    const startEnd = applyTrimKeyboard('dragging-trim-start', 'End', initial, 100);

    expect(startArrow?.startMs).toBe(2_100);
    expect(endHome?.endMs).toBe(2_000 + minimumClipDurationMs);
    expect(startEnd?.startMs).toBe(8_000 - minimumClipDurationMs);
  });

  test('playhead keyboard access changes only the current time', () => {
    const next = applyPlayheadKeyboard('ArrowRight', initial, 40);
    const end = applyPlayheadKeyboard('End', initial, 40);

    expect(next).toEqual({ ...initial, currentMs: 4_040 });
    expect(end).toEqual({ ...initial, currentMs: initial.durationMs });
  });
});
