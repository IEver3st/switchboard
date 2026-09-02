import { describe, expect, test } from 'bun:test';
import { estimateWindowedGrowth } from '../scripts/performance-statistics.mjs';

describe('performance sample statistics', () => {
  test('does not turn one delayed allocation into a sustained-growth failure', () => {
    const samples = Array.from({ length: 13 }, (_, index) => ({
      sampledAt: index * 5_000,
      privateMemoryMb: index === 0 ? 592 : 782,
    }));

    const growth = estimateWindowedGrowth(samples, 'privateMemoryMb');

    expect(growth.firstWindowMedian).toBe(782);
    expect(growth.lastWindowMedian).toBe(782);
    expect(growth.perMinute).toBe(0);
  });

  test('continues to detect sustained growth across the sample window', () => {
    const samples = Array.from({ length: 13 }, (_, index) => ({
      sampledAt: index * 5_000,
      privateMemoryMb: 700 + index * 5,
    }));

    const growth = estimateWindowedGrowth(samples, 'privateMemoryMb');

    expect(growth.perMinute).toBeGreaterThan(32);
  });

  test('supports Electron idle samples keyed by total private memory', () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      sampledAt: index * 5_000,
      privateMemoryMb: index < 4 ? 310 : index < 8 ? 340 : 390,
    }));

    const growth = estimateWindowedGrowth(samples, 'privateMemoryMb');

    expect(growth.firstWindowMedian).toBe(310);
    expect(growth.lastWindowMedian).toBe(390);
    expect(growth.perMinute).toBeGreaterThan(80);
  });
});
