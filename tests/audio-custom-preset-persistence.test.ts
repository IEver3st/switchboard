import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { MAX_EQ_BANDS } from '../src/shared/contracts';
import { snapshotAudioPathPreset } from '../src/shared/audio-presets';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('custom audio state persistence', () => {
  test('persists a 64-band preset and an empty microphone EQ across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-many-bands-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'state.json');
    const store = new StateStore(path);
    await store.load();
    store.update(draft => {
      const eq = draft.audio.channelProcessing.find(p => p.busId === 'game')!.equalizer;
      eq.bands = Array.from({ length: MAX_EQ_BANDS }, (_, i) => ({ ...eq.bands[0]!, id: `eq-${i}`, frequency: 20 + i * 200 }));
      const mic = draft.audio.micProcessors.find(p => p.id === 'equalizer')!;
      if (mic.id === 'equalizer') mic.parameters.bands = [];
      draft.audio.pathPresets.push(snapshotAudioPathPreset(draft.audio, 'game', 'user-many', 'Many bands'));
      draft.audio.activePresetIds.game = 'user-many';
      draft.audio.activePresetIds.microphone = null;
    });
    await store.flush();
    const restarted = new StateStore(path);
    await restarted.load();
    const state = restarted.get().audio;
    expect(state.channelProcessing.find(p => p.busId === 'game')!.equalizer.bands).toHaveLength(MAX_EQ_BANDS);
    expect(state.pathPresets.find(p => p.id === 'user-many')).toEqual(store.get().audio.pathPresets.find(p => p.id === 'user-many'));
    const mic = state.micProcessors.find(p => p.id === 'equalizer')!;
    if (mic.id === 'equalizer') expect(mic.parameters.bands).toEqual([]);
  });
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
