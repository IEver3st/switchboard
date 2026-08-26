import type { ChannelProcessing } from '../../../../shared/contracts';

export type SemanticStrength = 'light' | 'balanced' | 'strong';
export type GateStrength = 'low' | 'balanced' | 'high';
export type VoiceStyle = 'natural' | 'balanced' | 'broadcast';

export const noiseRemovalAmounts: Record<SemanticStrength, number> = {
  light: 25,
  balanced: 50,
  strong: 80,
};

export const gateThresholds: Record<GateStrength, number> = {
  low: -56,
  balanced: -48,
  high: -40,
};

export const voiceConsistency: Record<VoiceStyle, {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}> = {
  natural: { thresholdDb: -16, ratio: 2.2, attackMs: 18, releaseMs: 220, makeupDb: 1 },
  balanced: { thresholdDb: -18, ratio: 3, attackMs: 12, releaseMs: 180, makeupDb: 2 },
  broadcast: { thresholdDb: -22, ratio: 4, attackMs: 8, releaseMs: 130, makeupDb: 3 },
};

export const channelLeveling: Record<SemanticStrength, {
  targetLufs: number;
  maxGainDb: number;
  compressor: {
    thresholdDb: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
    makeupDb: number;
  };
}> = {
  light: {
    targetLufs: -20,
    maxGainDb: 4,
    compressor: { thresholdDb: -16, ratio: 2, attackMs: 18, releaseMs: 220, makeupDb: 0 },
  },
  balanced: {
    targetLufs: -18,
    maxGainDb: 8,
    compressor: { thresholdDb: -18, ratio: 3, attackMs: 15, releaseMs: 180, makeupDb: 0 },
  },
  strong: {
    targetLufs: -16,
    maxGainDb: 10,
    compressor: { thresholdDb: -22, ratio: 4, attackMs: 10, releaseMs: 140, makeupDb: 2 },
  },
};

export function matchNoiseRemoval(amount: number): SemanticStrength | 'custom' {
  return matchNumber(amount, noiseRemovalAmounts);
}

export function matchGate(thresholdDb: number): GateStrength | 'custom' {
  return matchNumber(thresholdDb, gateThresholds);
}

export function matchVoiceConsistency(parameters: typeof voiceConsistency[VoiceStyle]): VoiceStyle | 'custom' {
  return matchObject(parameters, voiceConsistency);
}

export function matchChannelLeveling(processing: ChannelProcessing): SemanticStrength | 'custom' {
  for (const [key, candidate] of Object.entries(channelLeveling) as Array<[SemanticStrength, typeof channelLeveling[SemanticStrength]]>) {
    if (
      close(processing.normalization.targetLufs, candidate.targetLufs)
      && close(processing.normalization.maxGainDb, candidate.maxGainDb)
      && Object.entries(candidate.compressor).every(([field, value]) => (
        close(processing.compressor[field as keyof typeof candidate.compressor], value)
      ))
    ) return key;
  }
  return 'custom';
}

function matchNumber<T extends string>(value: number, candidates: Record<T, number>): T | 'custom' {
  for (const [key, candidate] of Object.entries(candidates) as Array<[T, number]>) {
    if (close(value, candidate)) return key;
  }
  return 'custom';
}

function matchObject<T extends string, V extends Record<string, number>>(value: V, candidates: Record<T, V>): T | 'custom' {
  for (const [key, candidate] of Object.entries(candidates) as Array<[T, V]>) {
    if (Object.entries(candidate).every(([field, expected]) => {
      const current = value[field];
      return typeof current === 'number' && close(current, expected);
    })) return key;
  }
  return 'custom';
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}
