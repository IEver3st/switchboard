import { describe, expect, test } from 'bun:test';
import { applyLighting } from '../src/renderer/src/components/shared/device-lighting';

describe('device render lighting masks', () => {
  test('recolors each saturated G502 source zone from canonical lighting color', () => {
    const pixels = new Uint8ClampedArray([
      245, 86, 188, 255,
      78, 205, 252, 255,
      100, 239, 156, 255,
    ]);

    applyLighting(pixels, 'g502-rgb', true, '#ff1744');

    for (let offset = 0; offset < pixels.length; offset += 4) {
      expect(pixels[offset]).toBeGreaterThan(pixels[offset + 1]! * 2);
      expect(pixels[offset]).toBeGreaterThan(pixels[offset + 2]!);
    }
  });

  test('neutralizes G502 lighting when the canonical state is off', () => {
    const pixels = new Uint8ClampedArray([
      245, 86, 188, 255,
      78, 205, 252, 255,
      240, 225, 235, 255,
    ]);

    applyLighting(pixels, 'g502-rgb', false, '#ff1744');

    expect([...pixels.slice(0, 8)]).toEqual([
      31, 31, 31, 255,
      44, 44, 44, 255,
    ]);
    expect(Math.max(...pixels.slice(8, 11)) - Math.min(...pixels.slice(8, 11))).toBeLessThanOrEqual(2);
    expect(pixels[8]).toBeLessThan(100);
  });

  test('preserves neutral shell pixels and keeps the HyperX mask red-scoped', () => {
    const neutralShell = new Uint8ClampedArray([222, 219, 216, 255]);
    const nonRedHyperxDetail = new Uint8ClampedArray([52, 96, 184, 255]);

    applyLighting(neutralShell, 'g502-rgb', true, '#00ff00');
    applyLighting(nonRedHyperxDetail, 'red-dominant', true, '#00ff00');

    expect([...neutralShell]).toEqual([222, 219, 216, 255]);
    expect([...nonRedHyperxDetail]).toEqual([52, 96, 184, 255]);
  });

  test('projects canonical brightness without losing the unlit diffuser', () => {
    const full = new Uint8ClampedArray([245, 86, 188, 255]);
    const dimmed = new Uint8ClampedArray(full);
    const zero = new Uint8ClampedArray(full);

    applyLighting(full, 'g502-rgb', true, '#ff1744', 100);
    applyLighting(dimmed, 'g502-rgb', true, '#ff1744', 25);
    applyLighting(zero, 'g502-rgb', true, '#ff1744', 0);

    expect(dimmed[0]).toBeLessThan(full[0]!);
    expect(dimmed[0]).toBeGreaterThan(zero[0]!);
    expect([...zero]).toEqual([31, 31, 31, 255]);
  });

  test('keeps low-chroma shell spill soft instead of painting a hard LED cutout', () => {
    const diffuserCore = new Uint8ClampedArray([78, 205, 252, 255]);
    const shellSpill = new Uint8ClampedArray([220, 205, 214, 255]);

    applyLighting(diffuserCore, 'g502-rgb', true, '#00d8ff');
    applyLighting(shellSpill, 'g502-rgb', true, '#00d8ff');

    const coreChroma = Math.max(...diffuserCore.slice(0, 3)) - Math.min(...diffuserCore.slice(0, 3));
    const spillChroma = Math.max(...shellSpill.slice(0, 3)) - Math.min(...shellSpill.slice(0, 3));
    expect(diffuserCore[2]).toBeGreaterThan(diffuserCore[0]! * 2);
    expect(spillChroma).toBeLessThan(coreChroma / 3);
    expect(shellSpill[0]).toBeGreaterThan(180);
  });
});
