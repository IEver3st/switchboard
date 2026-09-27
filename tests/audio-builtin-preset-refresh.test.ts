import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { applyAudioPathPreset, defaultAudioPathPresets, snapshotAudioPathPreset } from '../src/shared/audio-presets';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('built-in audio presets', () => {
  test.each([
    ['game', 'game-competitive-fps'],
    ['chat', 'chat-clear-voice'],
    ['media', 'media-music'],
  ] as const)('retuned %s presets retain old sound, custom presets and current selections across restart', async (kind, id) => {
    const directory = await mkdtemp(join(tmpdir(), `switchboard-retuned-${kind}-`));
    directories.push(directory);
    const path = join(directory, 'state.json');
    const first = new StateStore(path);
    await first.load();
    first.update(draft => {
      const preset = draft.audio.pathPresets.find(p => p.id === id)!;
      if (preset.kind === 'microphone') throw new Error('Expected channel preset');
      preset.processors.equalizer.bands = preset.processors.equalizer.bands.slice(0, 6);
      applyAudioPathPreset(draft.audio, preset);
      draft.audio.pathPresets.push(snapshotAudioPathPreset(draft.audio, kind, 'user-old-sound', 'Saved sound'));
    });
    const saved = structuredClone(first.get().audio);
    await first.flush();
    const restarted = new StateStore(path);
    await restarted.load();
    expect(restarted.get().audio.channelProcessing).toEqual(saved.channelProcessing);
    expect(restarted.get().audio.activePresetIds[kind]).toBeNull();
    expect(restarted.get().audio.pathPresets.find(p => p.id === 'user-old-sound')).toEqual(saved.pathPresets.find(p => p.id === 'user-old-sound'));

    restarted.update(draft => applyAudioPathPreset(draft.audio, draft.audio.pathPresets.find(p => p.id === 'user-old-sound')!));
    await restarted.flush();
    const custom = new StateStore(path);
    await custom.load();
    expect(custom.get().audio.activePresetIds[kind]).toBe('user-old-sound');
    expect(custom.get().audio.channelProcessing).toEqual(saved.channelProcessing);

    custom.update(draft => applyAudioPathPreset(draft.audio, draft.audio.pathPresets.find(p => p.id === id)!));
    await custom.flush();
    const current = new StateStore(path);
    await current.load();
    expect(current.get().audio.activePresetIds[kind]).toBe(id);
    expect(current.get().audio.channelProcessing.find(p => p.busId === kind)).toEqual({ busId: kind, ...defaultAudioPathPresets.find(p => p.id === id)!.processors });
  });

  test('retuned voice presets preserve saved sound as Custom until reapplied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-retuned-voice-'));
    directories.push(directory);
    const path = join(directory, 'state.json');
    const first = new StateStore(path);
    await first.load();
    first.update(draft => {
      const preset = draft.audio.pathPresets.find(p => p.id === 'mic-broadcast')!;
      if (preset.kind !== 'microphone') throw new Error('Expected microphone preset');
      const eq = preset.processors.find(p => p.id === 'equalizer')!;
      eq.parameters.bands = eq.parameters.bands.slice(0, 6);
      applyAudioPathPreset(draft.audio, preset);
      draft.audio.pathPresets.push(snapshotAudioPathPreset(draft.audio, 'microphone', 'user-old-sound', 'My broadcast'));
    });
    const saved = structuredClone(first.get().audio);
    await first.flush();
    const restarted = new StateStore(path);
    await restarted.load();
    expect(restarted.get().audio.micProcessors).toEqual(saved.micProcessors);
    expect(restarted.get().audio.activePresetIds.microphone).toBeNull();
    expect(restarted.get().audio.pathPresets.find(p => p.id === 'user-old-sound')).toEqual(saved.pathPresets.find(p => p.id === 'user-old-sound'));
    restarted.update(draft => applyAudioPathPreset(draft.audio, draft.audio.pathPresets.find(p => p.id === 'mic-broadcast')!));
    await restarted.flush();
    const current = new StateStore(path);
    await current.load();
    expect(current.get().audio.activePresetIds.microphone).toBe('mic-broadcast');
    expect(current.get().audio.micProcessors).toEqual(defaultAudioPathPresets.find(p => p.id === 'mic-broadcast')!.processors);
  });

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
