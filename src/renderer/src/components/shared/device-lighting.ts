export type LightingMask = 'red-dominant' | 'saturated-rgb';

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export function applyLighting(
  data: Uint8ClampedArray,
  mask: LightingMask,
  enabled: boolean,
  color: string,
): void {
  const target = parseHexColor(color);
  const targetMaximum = Math.max(target.red, target.green, target.blue, 1);

  for (let offset = 0; offset < data.length; offset += 4) {
    if ((data[offset + 3] ?? 0) <= 0) continue;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;
    const matches = mask === 'red-dominant'
      ? red > 70 && red - Math.max(green, blue) > 24
      : maximum > 54 && chroma > 18 && chroma / maximum > 0.15;
    if (!matches) continue;

    if (!enabled) {
      const neutral = Math.round(relativeLuminance({ red, green, blue }) * 0.24);
      data[offset] = neutral;
      data[offset + 1] = neutral;
      data[offset + 2] = neutral;
      continue;
    }

    const floor = minimum * 0.12;
    data[offset] = Math.round(floor + (target.red / targetMaximum) * (maximum - floor));
    data[offset + 1] = Math.round(floor + (target.green / targetMaximum) * (maximum - floor));
    data[offset + 2] = Math.round(floor + (target.blue / targetMaximum) * (maximum - floor));
  }
}

function relativeLuminance(color: RgbColor): number {
  return color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722;
}

function parseHexColor(value: string): RgbColor {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}
