import { describe, expect, test } from 'bun:test';
import { applyAudioPathPreset, defaultAudioPathPresets, findMatchingAudioPresetId } from '../src/shared/audio-presets';
import { audioPresetFileSchema } from '../src/shared/contracts';
import { defaultAudio } from '../src/shared/defaults';
import { equalizerResponseDb } from '../src/renderer/src/lib/eq-response';

const presets = defaultAudioPathPresets.filter(p => p.kind !== 'microphone');
function preset(id: string) {
  const value = presets.find(p => p.id === id);
  if (!value) throw new Error(`Missing output preset: ${id}`);
  return value;
}
const curve = (id: string, hz: number) => equalizerResponseDb(hz, preset(id).processors.equalizer.bands);

describe('Game, Chat and Media preset tuning', () => {
  test('expanded presets round-trip and change only the selected processing path', () => {
    for (const source of presets) {
      const imported = audioPresetFileSchema.parse(JSON.parse(JSON.stringify({ schemaVersion: 1, preset: source }))).preset;
      const audio = structuredClone(defaultAudio);
      const before = structuredClone(audio);
      applyAudioPathPreset(audio, imported);
      expect(audio.channelProcessing.find(p => p.busId === source.kind)).toEqual({ busId: source.kind, ...source.processors });
      expect(findMatchingAudioPresetId(audio, source.kind)).toBe(source.id);
      expect(source.processors.equalizer.bands.length).toBeGreaterThan(6);
      expect(audio.channelProcessing.filter(p => p.busId !== source.kind)).toEqual(before.channelProcessing.filter(p => p.busId !== source.kind));
      expect(audio.micProcessors).toEqual(before.micProcessors);
      expect(audio.spatial).toEqual(before.spatial);
      expect(audio.buses).toEqual(before.buses);
      expect(audio.mixes).toEqual(before.mixes);
    }
  });

  test('neutral presets stay flat and all summed curves retain modest gain', () => {
    for (const source of presets) {
      const neutral = ['game-flat', 'chat-natural', 'media-flat'].includes(source.id);
      for (let i = 0; i <= 240; i++) {
        const response = curve(source.id, 20 * 1_000 ** (i / 240));
        expect(Number.isFinite(response)).toBe(true);
        expect(response).toBeGreaterThan(-7);
        expect(response).toBeLessThan(4);
        if (neutral) expect(response).toBe(0);
      }
      expect(source.processors.limiter.enabled).toBe(true);
      expect(source.processors.limiter.thresholdDb).toBeLessThanOrEqual(-1);
      // Leveling and compression must not stack large amounts of added gain.
      if (source.processors.normalization.enabled) {
        expect(source.processors.normalization.maxGainDb).toBeLessThanOrEqual(4);
        expect(source.processors.compressor.makeupDb).toBe(0);
      }
    }
  });

  test('game profiles separate detail, immersion and lower-volume dynamics', () => {
    expect(curve('game-competitive-fps', 80)).toBeLessThan(-2);
    expect(curve('game-competitive-fps', 2_500)).toBeGreaterThan(2);
    expect(curve('game-competitive-fps', 6_500)).toBeLessThan(0.5);
    expect(curve('game-immersive', 40)).toBeGreaterThan(1);
    expect(preset('game-immersive').processors.compressor.enabled).toBe(false);
    expect(preset('game-immersive').processors.normalization.enabled).toBe(false);
    expect(curve('game-night', 80)).toBeLessThan(-3);
    expect(curve('game-night', 10_000)).toBeLessThan(-1);
    expect(preset('game-night').processors.compressor.ratio).toBeGreaterThan(preset('game-competitive-fps').processors.compressor.ratio);
    expect(preset('game-night').processors.limiter.thresholdDb).toBeLessThan(preset('game-flat').processors.limiter.thresholdDb);
  });

  test('speech curves emphasize intelligibility without a broad sibilance lift', () => {
    for (const id of ['chat-clear-voice', 'media-dialogue']) {
      expect(curve(id, 80)).toBeLessThan(-2);
      expect(curve(id, 350)).toBeLessThan(-1);
      expect(curve(id, 2_500)).toBeGreaterThan(1.5);
      expect(curve(id, 7_000)).toBeLessThan(-0.5);
    }
    expect(curve('chat-reduced-bass', 120)).toBeLessThan(-3);
    expect(Math.abs(curve('chat-reduced-bass', 2_500))).toBeLessThan(1);
  });

  test('music and warm retain dynamics while movies balance body and dialogue', () => {
    for (const id of ['game-flat', 'chat-natural', 'chat-reduced-bass', 'media-flat', 'media-music', 'media-warm']) {
      expect(preset(id).processors.compressor.enabled).toBe(false);
      expect(preset(id).processors.normalization.enabled).toBe(false);
    }
    expect(curve('media-music', 60)).toBeGreaterThan(0.5);
    expect(curve('media-music', 14_000)).toBeGreaterThan(0.5);
    expect(curve('media-warm', 140)).toBeGreaterThan(1);
    expect(curve('media-warm', 6_500)).toBeLessThan(-1.5);
    expect(curve('media-movies', 40)).toBeGreaterThan(1);
    expect(curve('media-movies', 2_500)).toBeGreaterThan(1.5);
    expect(preset('media-movies').processors.compressor.enabled).toBe(false);
  });
});
