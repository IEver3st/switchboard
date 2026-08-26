import { describe, expect, test } from 'bun:test';
import {
  channelLeveling,
  matchChannelLeveling,
  matchGate,
  matchNoiseRemoval,
  matchVoiceConsistency,
  voiceConsistency,
} from '../src/renderer/src/components/audio/semantic-mapping';
import { createDefaultSnapshot } from '../src/shared/defaults';

describe('human-facing audio controls', () => {
  test('recognizes the named microphone strengths and reports exact edits as custom', () => {
    expect(matchNoiseRemoval(50)).toBe('balanced');
    expect(matchNoiseRemoval(63)).toBe('custom');
    expect(matchGate(-48)).toBe('balanced');
    expect(matchGate(-46)).toBe('custom');
    expect(matchVoiceConsistency(voiceConsistency.broadcast)).toBe('broadcast');
    expect(matchVoiceConsistency({ ...voiceConsistency.broadcast, attackMs: 11 })).toBe('custom');
  });

  test('maps channel leveling to the same canonical processor parameters', () => {
    const processing = createDefaultSnapshot().audio.channelProcessing.find(({ busId }) => busId === 'game');
    expect(processing).toBeDefined();
    if (!processing) return;

    const balanced = channelLeveling.balanced;
    processing.normalization.targetLufs = balanced.targetLufs;
    processing.normalization.maxGainDb = balanced.maxGainDb;
    Object.assign(processing.compressor, balanced.compressor);

    expect(matchChannelLeveling(processing)).toBe('balanced');
    processing.compressor.ratio = 3.4;
    expect(matchChannelLeveling(processing)).toBe('custom');
  });
});
