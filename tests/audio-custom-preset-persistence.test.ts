import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('custom audio state persistence', () => {
  test('preserves Custom preset identity after exact processor edits and restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-custom-audio-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();

    first.update((draft) => {
      draft.audio.activePresetIds.game = null;
      draft.audio.activePresetIds.microphone = null;
      draft.audio.channelProcessing.find(({ busId }) => busId === 'game')!.equalizer.bands[0]!.gainDb = -2.5;
      const compressor = draft.audio.micProcessors.find(({ id }) => id === 'compressor');
      if (compressor?.id === 'compressor') compressor.parameters.ratio = 4.1;
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    expect(restarted.get().audio.activePresetIds.game).toBeNull();
    expect(restarted.get().audio.activePresetIds.microphone).toBeNull();
  });
});
