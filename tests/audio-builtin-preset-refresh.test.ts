import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { defaultAudioPathPresets, snapshotAudioPathPreset } from '../src/shared/audio-presets';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('built-in audio presets', () => {
  test('load from the shipped definitions while user presets survive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-builtin-presets-'));
    directories.push(directory);
    const path = join(directory, 'state.json');
    const first = new StateStore(path);
    await first.load();
    first.update((draft) => {
      // Simulate a state saved by an older build: a stale built-in, a retired one, and a user preset.
      const clear = draft.audio.pathPresets.find((preset) => preset.id === 'mic-clear-speech')!;
      clear.name = 'Old Clear Speech';
      draft.audio.pathPresets = draft.audio.pathPresets.filter((preset) => preset.id !== 'mic-deep-voice');
      draft.audio.pathPresets.push({ ...clear, id: 'mic-retired', name: 'Retired' });
      draft.audio.pathPresets.push(snapshotAudioPathPreset(draft.audio, 'microphone', 'user-mine', 'Mine'));
    });
    await first.flush();

    const restarted = new StateStore(path);
    await restarted.load();
    const presets = restarted.get().audio.pathPresets;
    const builtIns = presets.filter((preset) => preset.builtIn);
    expect(builtIns).toEqual(defaultAudioPathPresets);
    expect(presets.some((preset) => preset.id === 'mic-retired')).toBe(false);
    expect(presets.find((preset) => preset.id === 'user-mine')?.name).toBe('Mine');
  });
});
