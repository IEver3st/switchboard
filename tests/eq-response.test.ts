import { describe, expect, test } from 'bun:test';
import type { EqBand } from '../src/shared/contracts';
import { equalizerResponseDb } from '../src/renderer/src/lib/eq-response';

describe('parametric EQ response', () => {
  test('a flat enabled band remains at zero decibels', () => {
    const flat: EqBand = { id: 'flat', enabled: true, type: 'bell', frequency: 1_000, gainDb: 0, q: 1 };
    expect(equalizerResponseDb(1_000, [flat])).toBeCloseTo(0, 6);
  });

  test('a peaking band reaches its configured gain at center frequency', () => {
    const band: EqBand = { id: 'presence', enabled: true, type: 'bell', frequency: 2_500, gainDb: 6, q: 1.2 };
    expect(equalizerResponseDb(2_500, [band])).toBeCloseTo(6, 3);
    expect(equalizerResponseDb(100, [band])).toBeLessThan(0.2);
  });

  test('bypassed bands do not affect the response', () => {
    const band: EqBand = { id: 'off', enabled: false, type: 'low-shelf', frequency: 120, gainDb: 10, q: 0.7 };
    expect(equalizerResponseDb(40, [band])).toBe(0);
  });
});
