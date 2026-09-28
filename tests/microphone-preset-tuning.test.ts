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

  test('curves preserve body and avoid excessive combined boosts or cuts', () => {
    for (const preset of presets) {
      if (preset.id !== 'mic-studio') expect(curve(preset.id, 30)).toBeLessThan(-2);
      // Check the summed filter response, not just individual band gains.
      for (let index = 0; index <= 240; index++) {
        const response = curve(preset.id, 20 * 1_000 ** (index / 240));
        expect(Number.isFinite(response)).toBe(true);
        expect(response).toBeGreaterThan(-12);
        expect(response).toBeLessThan(5);
        if (preset.id !== 'mic-deep-voice' && index >= 72 && index <= 133) {
          // 159 Hz–920 Hz: avoid hollowing the body out of ordinary voices.
          expect(response).toBeGreaterThan(-1.25);
        }
      }
    }
  });

  test('tone identities remain distinct without broadly boosting sibilance', () => {
    expect(curve('mic-deep-voice', 120)).toBeGreaterThan(curve('mic-natural-voice', 120) + 1.5);
    expect(curve('mic-warm-smooth', 3_500)).toBeLessThan(curve('mic-natural-voice', 3_500) - 1.5);
    expect(curve('mic-clear-speech', 2_800)).toBeGreaterThan(curve('mic-natural-voice', 2_800) + 0.5);
    expect(curve('mic-crisp', 14_000)).toBeGreaterThan(curve('mic-natural-voice', 14_000) + 0.5);
    expect(curve('mic-noisy-room', 60)).toBeLessThan(curve('mic-natural-voice', 60) - 1.5);
    for (const id of ['mic-podcast', 'mic-broadcast', 'mic-streamer', 'mic-crisp']) {
      expect(curve(id, 7_200)).toBeLessThan(0);
    }
    for (const hz of [120, 300, 1_000, 3_200, 7_000, 12_000]) {
      expect(curve('mic-studio', hz)).toBe(0);
      expect(Math.abs(curve('mic-natural-voice', hz))).toBeLessThan(0.15);
    }
  });

  test('Deep Voice follows the supplied Sonar response rather than scooping body and boosting presence', () => {
    // Approximate trace readings, not the colored handles (individual filters).
    for (const [hz, target, tolerance] of [
      [20, -11, 1], [60, -4.5, 1], [120, 2.8, 1], [180, 4.2, 0.8],
      [250, 3.5, 0.8], [500, 0, 0.6], [1_000, -3, 0.7],
      [2_000, -1.6, 0.8], [4_000, -0.4, 0.5], [8_000, 0, 0.3],
    ]) expect(Math.abs(curve('mic-deep-voice', hz) - target)).toBeLessThan(tolerance);
  });

  test('clean-space presets do not impose learned masking or gating, and leveling stays restrained', () => {
    for (const preset of presets) {
      const processor = <T extends (typeof preset.processors)[number]['id']>(id: T) =>
        preset.processors.find(p => p.id === id)!;
      const compressor = preset.processors.find(p => p.id === 'compressor')!;
      expect(compressor.parameters.makeupDb).toBeLessThanOrEqual(1);
      expect(compressor.parameters.ratio).toBeLessThanOrEqual(2.5);
      expect(compressor.parameters.attackMs).toBeGreaterThanOrEqual(20);
      if (['mic-natural-voice', 'mic-clear-speech', 'mic-warm-smooth', 'mic-podcast', 'mic-crisp', 'mic-studio'].includes(preset.id)) {
        expect(processor('noise-gate').enabled).toBe(false);
        expect(processor('noise-suppression').enabled).toBe(false);
      }
      if (preset.id === 'mic-studio') expect(compressor.enabled).toBe(false);
      const gate = preset.processors.find(p => p.id === 'noise-gate')!;
      if (gate.enabled) {
        expect(gate.parameters.thresholdDb).toBeLessThanOrEqual(-54);
        expect(gate.parameters.releaseMs).toBeGreaterThanOrEqual(260);
      }
    }
  });
});
