import { describe, expect, test } from 'bun:test';
import { formatClipDateGroup, formatClipTimestamp, formatDuration, formatReplayLength } from '../src/renderer/src/lib/format';

describe('capture media formatting', () => {
  test('uses media duration and human replay-length conventions', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(3_601)).toBe('1:00:01');
    expect(formatReplayLength(45)).toBe('45 sec');
    expect(formatReplayLength(60)).toBe('1 min');
  });

  test('moves from useful relative time to clock and dated metadata', () => {
    const now = new Date(2026, 7, 26, 14, 0).getTime();
    expect(formatClipTimestamp(now - 12 * 60_000, now)).toBe('12 min ago');

    const sameDay = new Date(2026, 7, 26, 9, 42);
    expect(formatClipTimestamp(sameDay.getTime(), now)).toBe(sameDay.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));

    const older = new Date(2026, 7, 24, 23, 42);
    expect(formatClipTimestamp(older.getTime(), now)).toContain(`${older.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · `);
    expect(formatClipDateGroup(older.getTime(), now)).toBe(older.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }));
  });
});
