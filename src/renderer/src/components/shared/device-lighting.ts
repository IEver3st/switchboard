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
  brightness = 100,
): void {
  const target = parseHexColor(color);
  const targetMaximum = Math.max(target.red, target.green, target.blue, 1);
  const intensity = clamp(brightness, 0, 100) / 100;

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
      : maximum > 35 && chroma > 8 && chroma / maximum > 0.05;
    if (!matches) continue;

    const neutral = mask === 'red-dominant'
      ? Math.round(18 + maximum * 0.08)
      : Math.round(relativeLuminance({ red, green, blue }) * 0.24);
    if (!enabled || intensity === 0) {
      data[offset] = neutral;
      data[offset + 1] = neutral;
      data[offset + 2] = neutral;
      continue;
    }

    const litRange = Math.max(0, maximum - neutral) * intensity;
    data[offset] = Math.round(neutral + (target.red / targetMaximum) * litRange);
    data[offset + 1] = Math.round(neutral + (target.green / targetMaximum) * litRange);
    data[offset + 2] = Math.round(neutral + (target.blue / targetMaximum) * litRange);
  }
}

export function adaptBlackHardwareForDarkSurface(data: Uint8ClampedArray): void {
  const maximumTone = 112;
  const maximumLift = 26;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    if (alpha <= 0) continue;

    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    if (maximum >= maximumTone) continue;

    // The official black render is graded for a light page. Lift only neutral
    // shadow material for Switchboard's dark stage; saturated LEDs and metal
    // highlights retain their source color and intensity.
    const chroma = maximum - minimum;
    const neutralWeight = clamp(1 - Math.max(0, chroma - 10) / 24, 0, 1);
    if (neutralWeight <= 0) continue;
    const shadowWeight = 1 - maximum / maximumTone;
    const opacityWeight = Math.min(1, alpha / 192);
    const lift = Math.round(maximumLift * neutralWeight * shadowWeight * opacityWeight);
    if (lift <= 0) continue;

    data[offset] = Math.min(255, red + lift);
    data[offset + 1] = Math.min(255, green + lift);
    data[offset + 2] = Math.min(255, blue + lift);
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
