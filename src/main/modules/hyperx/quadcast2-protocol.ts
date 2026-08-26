export const quadCast2StatusRed = '#f20000';
export const quadCast2LightingFrameIntervalMs = 55;

export type QuadCast2LightingEffectId = 'solid' | 'breathing' | 'pulse';

export interface QuadCast2LightingConfig {
  enabled: boolean;
  brightness: number;
  effectId: QuadCast2LightingEffectId;
  speed: number;
  muteLinked: boolean;
}

/**
 * The QuadCast 2 audio function emits an absolute tap-mute state on its
 * vendor-defined 0xFFC0 collection. Other input reports are intentionally
 * ignored instead of being interpreted as toggle events.
 */
export function parseQuadCast2MuteReport(report: Uint8Array): boolean | null {
  if (report.byteLength < 3 || report[0] !== 0x77 || report[1] !== 0x06) return null;
  return report[2] !== 0;
}

export function buildQuadCast2LightingReports(
  config: QuadCast2LightingConfig,
  frameIndex: number,
  physicalMuted: boolean | null,
): Buffer[] {
  const intensity = lightingIntensity(config, frameIndex, physicalMuted);
  const red = Math.floor(0xf2 * intensity);
  const header = Buffer.alloc(65);
  header.set([0x00, 0x04, 0xf2], 0);
  header[9] = 0x01;

  const frame = Buffer.alloc(65);
  frame.set([0x00, 0x81, red, 0x00, 0x00, 0x81, red, 0x00, 0x00], 0);
  return [header, frame];
}

function lightingIntensity(
  config: QuadCast2LightingConfig,
  frameIndex: number,
  physicalMuted: boolean | null,
): number {
  if (!config.enabled || (config.muteLinked && physicalMuted === true)) return 0;
  const brightness = clamp(config.brightness, 0, 100) / 100;
  if (config.effectId === 'solid') return brightness;

  const normalizedSpeed = (clamp(config.speed, 1, 100) - 1) / 99;
  const durationMs = 10_000 - normalizedSpeed * 8_900;
  const phase = ((Math.max(0, frameIndex) * quadCast2LightingFrameIntervalMs) / durationMs) % 1;
  const sine = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  if (config.effectId === 'pulse') {
    return brightness * (0.04 + Math.pow(sine, 4) * 0.96);
  }
  return brightness * (0.06 + sine * 0.94);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
