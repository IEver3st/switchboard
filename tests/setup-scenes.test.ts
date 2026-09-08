import { describe, test, expect } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { setCaptureConfigInputSchema, systemSnapshotSchema } from '../src/shared/contracts';
import { snapshotSceneValues } from '../src/shared/setup-scenes';
import { SetupScenes } from '../src/main/services/setup-scenes';
import type { StateStore } from '../src/main/services/state-store';

function harness() {
  let snapshot = createDefaultSnapshot();
  const store = {
    get: () => structuredClone(snapshot),
    update: (mutator: (draft: typeof snapshot) => void) => { const draft = structuredClone(snapshot); mutator(draft); snapshot = systemSnapshotSchema.parse(draft); return structuredClone(snapshot); },
  };
  let rejectCapture = false;
  const scenes = new SetupScenes(store as StateStore, {
    audio: async value => { store.update(draft => { const buses = draft.audio.buses.map(bus => ({ ...bus, ...value.buses.find(item => item.id === bus.id) })); Object.assign(draft.audio, value, { buses }); }); },
    capture: async value => { if (rejectCapture) throw new Error('Recorder unavailable'); store.update(draft => { Object.assign(draft.capture.config, value); }); },
    device: async () => { throw new Error('Device refused the write'); },
  });
  const save = (name: string, extra = {}) => scenes.save({ name, executable: '', automatic: false, restoreOnExit: true,
    captureCurrent: true, includeAudio: false, includeDevices: false, includeCapture: true, ...extra }).setup.scenes.at(-1)!;
  return { store, scenes, save, reject: () => { rejectCapture = true; } };
}

describe('setup scenes', () => {
  test('unrelated capture patches do not reset game-only audio', () => {
    expect(setCaptureConfigInputSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(setCaptureConfigInputSchema.parse({ systemAudioMode: 'game' })).toEqual({ systemAudioMode: 'game' });
  });
  test('applies a saved scene and restores the original across successive scenes', async () => {
    const h = harness(); const first = h.save('First');
    h.store.update(draft => { draft.capture.config.replaySeconds = 120; draft.capture.config.systemAudioMode = 'game'; });
    const second = h.save('Second');
    h.store.update(draft => { draft.capture.config.replaySeconds = 90; });
    await h.scenes.apply(first.id); expect(h.store.get().capture.config.replaySeconds).toBe(60);
    await h.scenes.apply(second.id); expect(h.store.get().capture.config.replaySeconds).toBe(120);
    await h.scenes.restore(); expect(h.store.get().capture.config.replaySeconds).toBe(90);
    expect(h.store.get().setup.restore).toBeNull();
    await h.scenes.dispose();
  });
  test('failed subsystem retains its confirmed configuration and reports partial application', async () => {
    const h = harness(); const scene = h.save('Game');
    h.store.update(draft => { draft.capture.config.replaySeconds = 120; }); h.reject();
    const result = await h.scenes.apply(scene.id);
    expect(result.capture.config.replaySeconds).toBe(120);
    expect(result.setup.runtime.state).toBe('partial');
    expect(result.setup.runtime.issues).toEqual(['Capture: Recorder unavailable']);
  });
  test('automatic restore preserves user edits and waits for a fresh launch after manual restore', async () => {
    const h = harness(); h.save('Game', { automatic: true, executable: 'game.exe' });
    h.store.update(draft => { draft.capture.config.replaySeconds = 120; });
    await h.scenes.runningApplications(['GAME.exe']); expect(h.store.get().capture.config.replaySeconds).toBe(60);
    h.store.update(draft => { draft.capture.config.replaySeconds = 90; });
    await h.scenes.runningApplications([]); expect(h.store.get().capture.config.replaySeconds).toBe(90);
    await h.scenes.runningApplications(['game.exe']); await h.scenes.restore();
    await h.scenes.runningApplications(['game.exe']); expect(h.store.get().setup.runtime.activeSceneId).toBeNull();
    await h.scenes.runningApplications([]); await h.scenes.runningApplications(['game.exe']);
    expect(h.store.get().capture.config.replaySeconds).toBe(60);
  });
  test('rejects duplicate automatic app mappings and invalid scene updates', () => {
    const h = harness(); h.save('One', { automatic: true, executable: 'game.exe' });
    expect(() => h.save('Two', { automatic: true, executable: 'GAME.exe' })).toThrow('already has');
    expect(() => h.save('Audio', { includeAudio: true })).toThrow('Developer mode');
    expect(() => h.save('Missing', { id: 'missing' })).toThrow('no longer exists');
  });
  test('scene values exclude hotkeys, clip paths, sessions, devices, and runtime meters', () => {
    const values = snapshotSceneValues(createDefaultSnapshot());
    expect(values.capture).not.toHaveProperty('hotkey'); expect(values.capture).not.toHaveProperty('clipsDirectory');
    expect(values.audio).not.toHaveProperty('host'); expect(values.audio).not.toHaveProperty('devices');
    expect(values.audio!.buses[0]).not.toHaveProperty('meter');
  });
});
