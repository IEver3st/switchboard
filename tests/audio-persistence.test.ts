import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('audio workspace persistence', () => {
  test('restores path processing, microphone parameters, and user presets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();

    first.update((draft) => {
      const game = draft.audio.channelProcessing.find((processing) => processing.busId === 'game')!;
      game.equalizer.bands[0]!.gainDb = 3.5;
      game.normalization.enabled = true;
      const compressor = draft.audio.micProcessors.find((processor) => processor.id === 'compressor');
      if (compressor?.id === 'compressor') compressor.parameters.ratio = 5;
      const custom = structuredClone(draft.audio.pathPresets.find((preset) => preset.id === 'game-flat')!);
      custom.id = 'user-game-test';
      custom.name = 'Test preset';
      custom.builtIn = false;
      draft.audio.pathPresets.push(custom);
      draft.audio.activePresetIds.game = custom.id;
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    const audio = restarted.get().audio;
    expect(audio.channelProcessing.find((processing) => processing.busId === 'game')?.equalizer.bands[0]?.gainDb).toBe(3.5);
    expect(audio.channelProcessing.find((processing) => processing.busId === 'game')?.normalization.enabled).toBeTrue();
    const compressor = audio.micProcessors.find((processor) => processor.id === 'compressor');
    expect(compressor?.id === 'compressor' ? compressor.parameters.ratio : null).toBe(5);
    expect(audio.pathPresets.some((preset) => preset.id === 'user-game-test')).toBeTrue();
    expect(audio.activePresetIds.game).toBe('user-game-test');
  });
});
