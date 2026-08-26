import type { CaptureCodec, CaptureConfig, CaptureResolution, ReplayState } from './contracts';

export type EncodingPreset = {
  targetVideoBitrateBps: number;
  maximumVideoBitrateBps: number;
  systemAudioBitrateBps: number;
  microphoneBitrateBps: number;
};

export type ClipSizeEstimate = {
  estimatedBytes: number;
  lowerBoundBytes: number;
  upperBoundBytes: number;
  source: 'preset' | 'observed';
};

export type ReplaySegment = {
  path: string;
  startedAtMs: number;
  endedAtMs: number;
  sizeBytes: number;
  complete: boolean;
};

const BASE_60_FPS_MBPS: Record<Exclude<CaptureResolution, 'native'>, readonly number[]> = {
  '720p': [3, 5, 7.5, 11, 15],
  '1080p': [6, 9, 14, 20, 28],
  '1440p': [10, 16, 24, 35, 48],
  '2160p': [18, 28, 42, 60, 85],
};

const CODEC_FACTOR: Record<CaptureCodec, number> = {
  h264: 1,
  hevc: 0.74,
  av1: 0.64,
};

const FPS_FACTOR: Record<CaptureConfig['fps'], number> = {
  30: 0.66,
  60: 1,
  120: 1.72,
};

const TRANSITIONS: Record<ReplayState, readonly ReplayState[]> = {
  stopped: ['starting'],
  starting: ['buffering', 'waiting', 'recovering', 'error', 'stopped'],
  waiting: ['buffering', 'recovering', 'error', 'stopped'],
  buffering: ['saving', 'waiting', 'recovering', 'error', 'stopped'],
  saving: ['buffering', 'waiting', 'recovering', 'error', 'stopped'],
  recovering: ['buffering', 'waiting', 'error', 'stopped'],
  error: ['starting', 'recovering', 'stopped'],
};

function inferredResolution(config: Pick<CaptureConfig, 'resolution'>): Exclude<CaptureResolution, 'native'> {
  return config.resolution === 'native' ? '1440p' : config.resolution;
}

export function getEncodingPreset(
  config: Pick<CaptureConfig, 'quality' | 'resolution' | 'fps' | 'codec' | 'includeMic'>,
): EncodingPreset {
  const resolution = inferredResolution(config);
  const qualityIndex = Math.max(0, Math.min(4, config.quality - 1));
  const targetMbps = BASE_60_FPS_MBPS[resolution][qualityIndex]!
    * CODEC_FACTOR[config.codec]
    * FPS_FACTOR[config.fps];
  const targetVideoBitrateBps = Math.round(targetMbps * 1_000_000);

  return {
    targetVideoBitrateBps,
    maximumVideoBitrateBps: Math.round(targetVideoBitrateBps * 1.28),
    systemAudioBitrateBps: 192_000,
    microphoneBitrateBps: config.includeMic ? 128_000 : 0,
  };
}

export function estimateClipSize(
  config: Pick<CaptureConfig, 'quality' | 'resolution' | 'fps' | 'codec' | 'includeMic' | 'replaySeconds'>,
  observedBitrateBps?: number,
): ClipSizeEstimate {
  const preset = getEncodingPreset(config);
  const hasObservation = typeof observedBitrateBps === 'number' && Number.isFinite(observedBitrateBps) && observedBitrateBps > 0;
  const videoAndAudio = hasObservation
    ? observedBitrateBps
    : preset.targetVideoBitrateBps + preset.systemAudioBitrateBps + preset.microphoneBitrateBps;
  const estimatedBytes = videoAndAudio * config.replaySeconds / 8 * 1.015;
  const spread = hasObservation ? 0.12 : 0.22;

  return {
    estimatedBytes: Math.round(estimatedBytes),
    lowerBoundBytes: Math.round(estimatedBytes * (1 - spread)),
    upperBoundBytes: Math.round(estimatedBytes * (1 + spread)),
    source: hasObservation ? 'observed' : 'preset',
  };
}

export function selectReplaySegments(segments: readonly ReplaySegment[], durationMs: number): ReplaySegment[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  const completed = segments
    .filter((segment) => segment.complete && segment.endedAtMs > segment.startedAtMs)
    .sort((left, right) => left.startedAtMs - right.startedAtMs);
  if (completed.length === 0) return [];

  const selected: ReplaySegment[] = [];
  const replayEnd = completed.at(-1)!.endedAtMs;
  const replayStart = replayEnd - durationMs;
  for (let index = completed.length - 1; index >= 0; index -= 1) {
    const segment = completed[index]!;
    if (segment.endedAtMs <= replayStart && selected.length > 0) break;
    selected.unshift(segment);
  }
  return selected;
}

export function selectEvictionCandidates(
  segments: readonly ReplaySegment[],
  maximumDurationMs: number,
  maximumBytes: number,
): ReplaySegment[] {
  const ordered = segments
    .filter((segment) => segment.complete)
    .sort((left, right) => left.startedAtMs - right.startedAtMs);
  const evicted: ReplaySegment[] = [];
  let totalBytes = ordered.reduce((sum, segment) => sum + segment.sizeBytes, 0);
  let firstIndex = 0;

  while (firstIndex < ordered.length) {
    const remainingDuration = ordered.at(-1)!.endedAtMs - ordered[firstIndex]!.startedAtMs;
    if (remainingDuration <= maximumDurationMs && totalBytes <= maximumBytes) break;
    const segment = ordered[firstIndex]!;
    evicted.push(segment);
    totalBytes -= segment.sizeBytes;
    firstIndex += 1;
  }
  return evicted;
}

export function sanitizeClipBaseName(value: string): string {
  const sanitized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
  if (!sanitized || reserved.test(sanitized)) return 'Capture';
  return sanitized.replace(/\s+/g, '');
}

export function canTransitionReplayState(from: ReplayState, to: ReplayState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}
