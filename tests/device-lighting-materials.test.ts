import { expect, test } from 'bun:test';
import { applyLighting } from '../src/renderer/src/components/shared/device-lighting';

test('G502 off preserves pale diffuser and shell shading across faint source color', () => {
  const pixels = new Uint8ClampedArray(Array.from({ length: 25 }, (_, chroma) => [220, 220 - chroma, 220 - chroma / 2, 255]).flat());
  applyLighting(pixels, 'g502-rgb', false, '#89cff0');
  for (let i = 0; i < pixels.length; i += 4) {
    expect(pixels[i]!).toBeGreaterThan(190);
    if (i) expect(Math.abs(pixels[i]! - pixels[i - 4]!)).toBeLessThanOrEqual(2);
  }
});

test('Huntsman neutral metal and wrist-rest texture do not become saturated LEDs', () => {
  const pixels = new Uint8ClampedArray([80, 76, 78, 255, 52, 46, 49, 255]);
  applyLighting(pixels, 'photographic-rgb', true, '#0099ff');
  for (let i = 0; i < pixels.length; i += 4) {
    expect(Math.max(...pixels.slice(i, i + 3)) - Math.min(...pixels.slice(i, i + 3))).toBeLessThanOrEqual(8);
  }
});
