import { describe, expect, test } from 'bun:test';
import {
  applyAudioPathPreset,
  findMatchingAudioPresetId,
  snapshotAudioPathPreset,
} from '../src/shared/audio-presets';
import { audioPathPresetSchema, audioPresetFileSchema } from '../src/shared/contracts';
import { defaultAudio } from '../src/shared/defaults';

describe('audio path presets', () => {
  test('apply complete channel processor state and match exactly', () => {
    const audio = structuredClone(defaultAudio);
    const preset = audio.pathPresets.find((candidate) => candidate.id === 'game-competitive-fps');
    expect(preset).toBeDefined();
    applyAudioPathPreset(audio, preset!);
    expect(audio.activePresetIds.game).toBe('game-competitive-fps');
    expect(audio.channelProcessing.find((candidate) => candidate.busId === 'game')?.normalization.enabled).toBe(true);
    expect(findMatchingAudioPresetId(audio, 'game')).toBe('game-competitive-fps');

    const processing = audio.channelProcessing.find((candidate) => candidate.busId === 'game')!;
    processing.equalizer.bands[0]!.gainDb += 0.5;
    expect(findMatchingAudioPresetId(audio, 'game')).toBeNull();
  });

  test('snapshots all microphone parameters into a user preset', () => {
    const audio = structuredClone(defaultAudio);
    const preset = snapshotAudioPathPreset(audio, 'microphone', 'user-mic', 'Desk microphone');
    const parsed = audioPathPresetSchema.parse(preset);
    expect(parsed.kind).toBe('microphone');
    if (parsed.kind !== 'microphone') throw new Error('Expected a microphone preset.');
    expect(parsed.processors).toEqual(audio.micProcessors);
    expect(parsed.builtIn).toBe(false);
  });

  test('rejects unversioned imported preset files', () => {
    const preset = defaultAudio.pathPresets[0]!;
    expect(audioPresetFileSchema.safeParse({ preset }).success).toBe(false);
    expect(audioPresetFileSchema.safeParse({ schemaVersion: 2, preset }).success).toBe(false);
    expect(audioPresetFileSchema.safeParse({ schemaVersion: 1, preset }).success).toBe(true);
  });
});
