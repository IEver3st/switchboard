import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { MAX_EQ_BANDS, audioPresetFileSchema, eqBandsSchema, setAudioChannelProcessorInputSchema, setMicProcessorInputSchema } from '../src/shared/contracts';
import { applyAudioPathPreset, defaultAudioPathPresets, findMatchingAudioPresetId, snapshotAudioPathPreset } from '../src/shared/audio-presets';
import { defaultAudio } from '../src/shared/defaults';

const bands = Array.from({ length: MAX_EQ_BANDS }, (_, index) => ({ id: `band-${index}`, enabled: true, type: 'bell' as const, frequency: 20 * 1_000 ** (index / (MAX_EQ_BANDS - 1)), gainDb: index % 2 ? -1 : 1, q: 1 }));

describe('variable EQ bands', () => {
  test('accepts empty and 64-band edits through both IPC boundaries, rejects overflow and duplicate IDs', () => {
    for (const values of [[], bands]) {
      expect(setAudioChannelProcessorInputSchema.safeParse({ busId: 'game', processorId: 'equalizer', parameters: { bands: values } }).success).toBe(true);
      expect(setMicProcessorInputSchema.safeParse({ processorId: 'equalizer', parameters: { bands: values } }).success).toBe(true);
    }
    expect(eqBandsSchema.safeParse([...bands, { ...bands[0]!, id: 'overflow' }]).success).toBe(false);
    expect(eqBandsSchema.safeParse([bands[0], bands[0]]).success).toBe(false);
    expect(readFileSync(new URL('../engines/audio-host/AudioModels.cs', import.meta.url), 'utf8')).toContain(`MaximumProcessorBands = ${MAX_EQ_BANDS};`);
  });

  test('preset export/import retains every band for output and microphone', () => {
    const audio = structuredClone(defaultAudio);
    audio.channelProcessing[0]!.equalizer.bands = structuredClone(bands);
    const mic = audio.micProcessors.find(item => item.id === 'equalizer')!;
    if (mic.id !== 'equalizer') throw new Error('Missing equalizer');
    mic.parameters.bands = structuredClone(bands);
    for (const kind of ['game', 'microphone'] as const) {
      const preset = snapshotAudioPathPreset(audio, kind, `user-${kind}`, '64 bands');
      const imported = audioPresetFileSchema.parse(JSON.parse(JSON.stringify({ schemaVersion: 1, preset })));
      const target = structuredClone(defaultAudio);
      applyAudioPathPreset(target, imported.preset);
      expect(snapshotAudioPathPreset(target, kind, `user-${kind}`, '64 bands')).toEqual(preset);
    }
  });

  test('matches sound independently of editor IDs without ignoring processor identity', () => {
    const audio = structuredClone(defaultAudio);
    applyAudioPathPreset(audio, audio.pathPresets.find(p => p.id === 'game-immersive')!);
    audio.channelProcessing[0]!.equalizer.bands.forEach((band, i) => { band.id = `imported-${i}`; });
    expect(findMatchingAudioPresetId(audio, 'game')).toBe('game-immersive');
    audio.channelProcessing[0]!.equalizer.bands[0]!.q = 2;
    expect(findMatchingAudioPresetId(audio, 'game')).toBeNull();
  });

  test('all built-ins remain valid, bounded, and keep output safety enabled', () => {
    for (const preset of defaultAudioPathPresets) {
      expect(audioPresetFileSchema.safeParse({ schemaVersion: 1, preset }).success).toBe(true);
      if (preset.kind !== 'microphone') expect(preset.processors.limiter.enabled).toBe(true);
    }
  });
});
