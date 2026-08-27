import { describe, expect, test } from 'bun:test';
import {
  adaptBlackHardwareForDarkSurface,
  applyLighting,
} from '../src/renderer/src/components/shared/device-lighting';

describe('HyperX device render treatment', () => {
  test('keeps muted grille lighting readable as charcoal on the dark stage', () => {
    const pixels = new Uint8ClampedArray([242, 12, 8, 255]);

    applyLighting(pixels, 'red-dominant', false, '#f20000');
    adaptBlackHardwareForDarkSurface(pixels);

    expect([...pixels]).toEqual([54, 54, 54, 255]);
  });

  test('lifts deep neutral hardware tones without changing lighting or highlights', () => {
    const pixels = new Uint8ClampedArray([
      12, 15, 18, 255,
      242, 12, 8, 255,
      178, 181, 184, 255,
      0, 0, 0, 0,
    ]);

    adaptBlackHardwareForDarkSurface(pixels);

    expect([...pixels.slice(0, 4)]).toEqual([34, 37, 40, 255]);
    expect([...pixels.slice(4, 8)]).toEqual([242, 12, 8, 255]);
    expect([...pixels.slice(8, 12)]).toEqual([178, 181, 184, 255]);
    expect([...pixels.slice(12, 16)]).toEqual([0, 0, 0, 0]);
  });
});
