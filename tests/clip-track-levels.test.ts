import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureConfigSchema,
  setCaptureConfigInputSchema,
  type DefaultClipTrackLevels,
} from '../src/shared/contracts';
import {
  applyClipTrackLevel,
  defaultClipTrackLevelForChannel,
  effectiveClipTrackLevels,
  hasEffectiveClipMixChanged,
  normalizeClipTrackLevels,
  resolveClipTrackLevel,
} from '../src/shared/clip-track-levels';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { StateStore } from '../src/main/services/state-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const defaults: DefaultClipTrackLevels = { game: 100, chat: 100, microphone: 20, media: 100 };
const channels = ['game', 'microphone'] as const;

describe('clip track level defaults', () => {
  test('falls back to the channel default, then to 100', () => {
    expect(resolveClipTrackLevel(undefined, 1, 'microphone', defaults)).toBe(20);
    expect(resolveClipTrackLevel(undefined, 0, 'game', defaults)).toBe(100);
    expect(resolveClipTrackLevel(undefined, 0, undefined, defaults)).toBe(100);
    expect(resolveClipTrackLevel(undefined, 0, 'game', undefined)).toBe(100);
    expect(resolveClipTrackLevel([80], 0, 'microphone', defaults)).toBe(80);
  });

  test('rejects out-of-range configured defaults when resolving', () => {
    expect(defaultClipTrackLevelForChannel('microphone', { ...defaults, microphone: 100 })).toBe(100);
    expect(defaultClipTrackLevelForChannel(undefined, defaults)).toBe(100);
  });

  test('fills untouched tracks with their channel default instead of 100', () => {
    // Microphone lives at index 1; setting it must not reset Game to 100
    // when the Game default itself was customized.
    const customDefaults: DefaultClipTrackLevels = { game: 80, chat: 100, microphone: 20, media: 100 };
    expect(applyClipTrackLevel(undefined, [...channels], customDefaults, 1, 30)).toEqual([80, 30]);
  });

  test('trims trailing tracks that match their channel default', () => {
    expect(applyClipTrackLevel([100, 20], [...channels], defaults, 1, 20)).toEqual([]);
    expect(applyClipTrackLevel(undefined, [...channels], defaults, 0, 100)).toEqual([]);
    expect(applyClipTrackLevel(undefined, [...channels], defaults, 0, 80)).toEqual([80]);
  });

  test('normalizes stored levels so future default changes keep applying', () => {
    expect(normalizeClipTrackLevels([100, 20], [...channels], defaults)).toBeUndefined();
    expect(normalizeClipTrackLevels([80, 20], [...channels], defaults)).toEqual([80]);
  });

  test('detects an effective mix change from defaults alone', () => {
    expect(hasEffectiveClipMixChanged(undefined, [...channels], defaults)).toBeTrue();
    expect(hasEffectiveClipMixChanged(undefined, [...channels], {
      game: 100, chat: 100, microphone: 100, media: 100,
    })).toBeFalse();
    expect(effectiveClipTrackLevels(undefined, [...channels], defaults)).toEqual([100, 20]);
  });

  test('defaults new capture configs to a flat 100% mix', () => {
    expect(createDefaultSnapshot().capture.config.defaultTrackLevels).toEqual({
      game: 100, chat: 100, microphone: 100, media: 100,
    });
  });

  test('parses legacy capture configs without track defaults', () => {
    const legacy = { ...createDefaultSnapshot().capture.config };
    delete (legacy as Record<string, unknown>).defaultTrackLevels;
    expect(captureConfigSchema.parse(legacy).defaultTrackLevels).toEqual({
      game: 100, chat: 100, microphone: 100, media: 100,
    });
  });

  test('rejects out-of-range track defaults', () => {
    expect(() => captureConfigSchema.parse({
      ...createDefaultSnapshot().capture.config,
      defaultTrackLevels: { game: 100, chat: 100, microphone: 101, media: 100 },
    })).toThrow();
  });

  test('accepts partial track-default updates over IPC', () => {
    expect(setCaptureConfigInputSchema.parse({ defaultTrackLevels: { microphone: 20 } })).toMatchObject({
      defaultTrackLevels: { microphone: 20 },
    });
  });

  test('migrates persisted state that predates track defaults', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-track-defaults-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const legacy = createDefaultSnapshot() as unknown as Record<string, unknown>;
    const config = (legacy.capture as Record<string, unknown>).config as Record<string, unknown>;
    delete config.defaultTrackLevels;
    config.replaySeconds = 90;
    await writeFile(filePath, JSON.stringify(legacy));

    const store = new StateStore(filePath);
    await store.load();
    const snapshot = store.get();

    expect(snapshot.capture.config.replaySeconds).toBe(90);
    expect(snapshot.capture.config.defaultTrackLevels).toEqual({
      game: 100, chat: 100, microphone: 100, media: 100,
    });

    store.update((draft) => {
      draft.capture.config.defaultTrackLevels.microphone = 20;
    });
    await store.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    expect(restarted.get().capture.config.defaultTrackLevels.microphone).toBe(20);
  });
});
