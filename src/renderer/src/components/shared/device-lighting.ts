export type LightingMask = 'red-dominant' | 'g502-rgb';

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
  if (mask === 'g502-rgb') {
    applyG502Lighting(data, target, enabled ? clamp(brightness, 0, 100) / 100 : 0);
    return;
  }

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
    const matches = red > 70 && red - Math.max(green, blue) > 24;
    if (!matches) continue;

    const neutral = Math.round(18 + maximum * 0.08);
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

function applyG502Lighting(data: Uint8ClampedArray, target: RgbColor, intensity: number): void {
  const targetHsl = rgbToHsl(target);

  for (let offset = 0; offset < data.length; offset += 4) {
    if ((data[offset + 3] ?? 0) <= 0) continue;

    const source = {
      red: data[offset] ?? 0,
      green: data[offset + 1] ?? 0,
      blue: data[offset + 2] ?? 0,
    };
    const maximum = Math.max(source.red, source.green, source.blue);
    const minimum = Math.min(source.red, source.green, source.blue);
    const chroma = maximum - minimum;
    if (maximum <= 0 || chroma <= 6) continue;

    // The official G502 artwork already contains a clean, shaded diffuser.
    // Use its chroma as a soft matte instead of turning every loosely saturated
    // pixel into a hard, flat-color cutout. This retains the white highlight,
    // translucent edge falloff, and shell antialiasing from the source render.
    const saturation = chroma / maximum;
    const maskStrength = smoothstep(6, 16, chroma) * smoothstep(0.025, 0.075, saturation);
    if (maskStrength <= 0) continue;

    const sourceHsl = rgbToHsl(source);
    const colorized = hslToRgb({
      hue: targetHsl.hue,
      saturation: sourceHsl.saturation * targetHsl.saturation,
      lightness: sourceHsl.lightness,
    });
    const neutralValue = relativeLuminance(source) * 0.24;
    const neutral = { red: neutralValue, green: neutralValue, blue: neutralValue };
    const lit = mixColor(neutral, colorized, intensity);
    const output = mixColor(source, lit, maskStrength);

    data[offset] = Math.round(output.red);
    data[offset + 1] = Math.round(output.green);
    data[offset + 2] = Math.round(output.blue);
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

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

function rgbToHsl(color: RgbColor): HslColor {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  if (chroma === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (maximum === red) hue = ((green - blue) / chroma) % 6;
  else if (maximum === green) hue = (blue - red) / chroma + 2;
  else hue = (red - green) / chroma + 4;

  return { hue: ((hue * 60) + 360) % 360, saturation, lightness };
}

function hslToRgb(color: HslColor): RgbColor {
  const chroma = (1 - Math.abs(2 * color.lightness - 1)) * color.saturation;
  const hue = color.hue / 60;
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 1) [red, green] = [chroma, secondary];
  else if (hue < 2) [red, green] = [secondary, chroma];
  else if (hue < 3) [green, blue] = [chroma, secondary];
  else if (hue < 4) [green, blue] = [secondary, chroma];
  else if (hue < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  const match = color.lightness - chroma / 2;
  return {
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
  };
}

function mixColor(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  return {
    red: from.red + (to.red - from.red) * amount,
    green: from.green + (to.green - from.green) * amount,
    blue: from.blue + (to.blue - from.blue) * amount,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
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
