import { describe, expect, test } from 'bun:test';
import { applyAudioPathPreset, defaultAudioPathPresets, findMatchingAudioPresetId } from '../src/shared/audio-presets';
import { audioPresetFileSchema } from '../src/shared/contracts';
import { defaultAudio } from '../src/shared/defaults';
import { equalizerResponseDb } from '../src/renderer/src/lib/eq-response';

const presets = defaultAudioPathPresets.filter(p => p.kind === 'microphone');
function curve(id: string, frequency: number): number {
  const eq = presets.find(p => p.id === id)?.processors.find(p => p.id === 'equalizer');
  if (!eq) throw new Error(`Missing EQ: ${id}`);
  return equalizerResponseDb(frequency, eq.parameters.bands);
}

describe('microphone preset tuning', () => {
  test('expanded curves survive file round-trip and application with their complete chain', () => {
    for (const preset of presets) {
      const imported = audioPresetFileSchema.parse(JSON.parse(JSON.stringify({ schemaVersion: 1, preset }))).preset;
      const audio = structuredClone(defaultAudio);
      applyAudioPathPreset(audio, imported);
      expect(audio.micProcessors).toEqual(preset.processors);
      expect(findMatchingAudioPresetId(audio, 'microphone')).toBe(preset.id);
      const eq = audio.micProcessors.find(p => p.id === 'equalizer')!;
      expect(eq.parameters.bands.length).toBeGreaterThan(6);
      const limiter = audio.micProcessors.find(p => p.id === 'limiter')!;
      expect(limiter.enabled).toBe(true);
      expect(limiter.parameters.thresholdDb).toBeLessThanOrEqual(-1);
    }
  });

  test('curves reduce sub-bass without excessive combined boosts or cuts', () => {
    for (const preset of presets) {
      expect(curve(preset.id, 30)).toBeLessThan(-2);
      // Check the summed filter response, not just individual band gains.
      for (let index = 0; index <= 240; index++) {
        const response = curve(preset.id, 20 * 1_000 ** (index / 240));
        expect(Number.isFinite(response)).toBe(true);
        expect(response).toBeGreaterThan(-9);
        expect(response).toBeLessThan(4);
      }
    }
  });

  test('tone identities remain distinct without broadly boosting sibilance', () => {
    expect(curve('mic-deep-voice', 120)).toBeGreaterThan(curve('mic-natural-voice', 120) + 1.5);
    expect(curve('mic-warm-smooth', 3_500)).toBeLessThan(curve('mic-natural-voice', 3_500) - 1.5);
    expect(curve('mic-clear-speech', 2_800)).toBeGreaterThan(curve('mic-natural-voice', 2_800) + 0.5);
    expect(curve('mic-crisp', 14_000)).toBeGreaterThan(curve('mic-natural-voice', 14_000) + 1);
    expect(curve('mic-noisy-room', 60)).toBeLessThan(curve('mic-natural-voice', 60) - 2);
    for (const id of ['mic-podcast', 'mic-broadcast', 'mic-streamer', 'mic-crisp']) {
      expect(curve(id, 7_200)).toBeLessThan(0);
    }
    for (const hz of [120, 300, 1_000, 3_200, 7_000, 12_000]) {
      expect(Math.abs(curve('mic-studio', hz))).toBeLessThan(1.5);
    }
  });
});
