import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/main/services/state-store';
import { debugDiagnostics } from '../src/main/services/debug-diagnostics';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { captureConfigSchema, setCaptureConfigInputSchema } from '../src/shared/contracts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'switchboard-state-recovery-'));
  directories.push(directory);
  return { directory, path: join(directory, 'switchboard-state.json') };
}

describe('state recovery', () => {
  test('loads saves from builds that still had the audio router', async () => {
    const { path } = await fixture();
    const saved = JSON.parse(JSON.stringify(createDefaultSnapshot())) as Record<string, any>;
    saved.audio = { enabled: true, buses: [{ id: 'mic', enabled: false }], devices: [{ id: 'x' }] };
    saved.modules.push({ ...saved.modules[0], id: 'capability.audio-router', kind: 'audio', enabled: true });
    saved.engines.unshift({ ...saved.engines[0], kind: 'audio' });
    saved.settings.visibleWorkspaces = ['devices', 'audio', 'capture'];
    saved.setup.preferences.quickActions = ['scenes', 'replay', 'microphone', 'output', 'chatmix'];
    saved.capture.config.microphoneDeviceId = 'mic-endpoint';
    await writeFile(path, JSON.stringify(saved), 'utf8');

    const store = new StateStore(path);
    await store.load();
    const snapshot = store.get();
    expect(snapshot).not.toHaveProperty('audio');
    expect(snapshot.modules.some(module => module.id === 'capability.audio-router')).toBe(false);
    expect(snapshot.engines.map(engine => engine.kind)).toEqual(['capture']);
    expect(snapshot.settings.visibleWorkspaces).toEqual(['devices', 'capture']);
    expect(snapshot.setup.preferences.quickActions).toEqual(['scenes', 'replay']);
    expect(snapshot.capture.config.microphoneDeviceId).toBe('mic-endpoint');
    expect(snapshot.capture.audioDevices).toEqual([]);
  });

  test('coalesces a synchronous burst and excludes later non-persistent changes from the saved generation', async () => {
    const { path } = await fixture();
    const store = new StateStore(path);
    await store.load();
    const previous = JSON.parse(await readFile(path, 'utf8'));
    for (let i = 0; i < 40; i++) {
      store.updateBranches(['settings'], draft => { draft.settings.uiScalePercent = i === 39 ? 150 : 125; }, { emit: false });
    }
    store.updateBranches(['settings'], draft => { draft.settings.uiScalePercent = 110; }, { persist: false });
    await store.flush();
    expect(JSON.parse(await readFile(path, 'utf8')).settings.uiScalePercent).toBe(150);
    expect(JSON.parse(await readFile(`${path}.bak`, 'utf8'))).toEqual(previous);
    expect(store.read('settings').uiScalePercent).toBe(110);
  });

  test.each([false, true])('flush drains pending changes after an in-flight write (failure: %s) and retains the last durable backup', async (failFirstWrite) => {
    const { path } = await fixture();
    const store = new StateStore(path);
    await store.load();
    store.updateBranches(['settings'], draft => { draft.settings.uiScalePercent = 100; });
    await store.flush();
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const measure = debugDiagnostics.measureAsync.bind(debugDiagnostics);
    let writes = 0;
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const barrier = spyOn(debugDiagnostics, 'measureAsync').mockImplementation(async (label, action) => {
      if (label === 'state.disk-write' && ++writes === 1) {
        started(); await gate;
        if (failFirstWrite) throw new Error('Fixture disk write failure');
      }
      return measure(label, action);
    });
    try {
      store.updateBranches(['settings'], draft => { draft.settings.uiScalePercent = 125; });
      await entered;
      const flushed = store.flush();
      for (let i = 0; i < 40; i++) {
        store.updateBranches(['settings'], draft => { draft.settings.uiScalePercent = i === 39 ? 150 : 110; });
      }
      release();
      await flushed;
      expect(writes).toBe(2);
      expect(JSON.parse(await readFile(path, 'utf8')).settings.uiScalePercent).toBe(150);
      expect(JSON.parse(await readFile(`${path}.bak`, 'utf8')).settings.uiScalePercent).toBe(failFirstWrite ? 100 : 125);
      expect(logged.mock.calls.length).toBe(failFirstWrite ? 1 : 0);
    } finally { release(); await store.flush(); barrier.mockRestore(); logged.mockRestore(); }
  });

  test('retains selected capture inputs through unrelated IPC patches and restart', async () => {
    const { path } = await fixture();
    const store = new StateStore(path);
    await store.load();
    const selection = {
      microphoneDeviceId: 'selected-microphone',
      systemAudioDeviceId: 'selected-output',
      chatAudioDeviceId: 'selected-chat',
      includeChatAudio: true,
    };
    store.update((draft) => { Object.assign(draft.capture.config, selection); });
    await store.flush();
    const restarted = new StateStore(path);
    await restarted.load();
    expect(restarted.get().capture.config).toMatchObject(selection);
    for (const input of [{ enabled: false }, { replaySeconds: 90 }, { includeMic: true }]) {
      const patch = setCaptureConfigInputSchema.parse(input);
      expect(patch).toEqual(input);
      restarted.update((draft) => {
        draft.capture.config = captureConfigSchema.parse({ ...draft.capture.config, ...patch });
      });
    }
    await restarted.flush();
    const updated = new StateStore(path);
    await updated.load();
    expect(updated.get().capture.config).toMatchObject(selection);
    expect(setCaptureConfigInputSchema.parse({ microphoneDeviceId: null })).toEqual({ microphoneDeviceId: null });
    expect(setCaptureConfigInputSchema.parse({ microphoneDeviceId: 'replacement' })).toEqual({ microphoneDeviceId: 'replacement' });
  });

  test('accepts a UTF-8 BOM without resetting a valid primary or preferring an older backup', async () => {
    const { directory, path } = await fixture();
    const saved = createDefaultSnapshot();
    saved.settings.onboardingCompleted = true;
    await writeFile(path, '\uFEFF' + JSON.stringify(saved));
    await writeFile(`${path}.bak`, JSON.stringify(createDefaultSnapshot()));
    const store = new StateStore(path);
    await store.load();
    expect(store.get().settings.onboardingCompleted).toBe(true);
    expect((await readdir(directory)).some((name) => name.includes('.corrupt-'))).toBe(false);
  });

  test('rejects a schema-invalid primary and recovers a missing primary from backup', async () => {
    const { path } = await fixture();
    const saved = createDefaultSnapshot();
    saved.settings.onboardingCompleted = true;
    await writeFile(`${path}.bak`, JSON.stringify(saved));
    await writeFile(path, JSON.stringify({ version: false }));
    const first = new StateStore(path);
    await first.load();
    expect(first.get().settings.onboardingCompleted).toBe(true);
    await rm(path);
    const second = new StateStore(path);
    await second.load();
    expect(second.get().settings.onboardingCompleted).toBe(true);
  });
  test('recovers a validated backup and preserves the exact corrupted primary', async () => {
    const { directory, path } = await fixture();
    const saved = createDefaultSnapshot();
    saved.settings.uiScalePercent = 125;
    saved.settings.onboardingCompleted = true;
    const damaged = Buffer.from('\0'.repeat(300));
    await writeFile(path, damaged);
    await writeFile(`${path}.bak`, JSON.stringify(saved));
    const store = new StateStore(path);
    await store.load();
    expect(store.get().settings.uiScalePercent).toBe(125);
    expect(store.get().settings.onboardingCompleted).toBe(true);
    const preserved = (await readdir(directory)).find((name) => name.includes('.corrupt-'));
    expect(preserved).toBeDefined();
    expect(await readFile(join(directory, preserved!))).toEqual(damaged);
    expect(JSON.parse(await readFile(path, 'utf8')).settings.uiScalePercent).toBe(125);
  });

  test('keeps a previous valid generation through consecutive writes', async () => {
    const { path } = await fixture();
    const store = new StateStore(path);
    await store.load();
    store.update((draft) => { draft.settings.uiScalePercent = 125; });
    await store.flush();
    store.update((draft) => { draft.settings.uiScalePercent = 150; });
    await store.flush();
    expect(JSON.parse(await readFile(`${path}.bak`, 'utf8')).settings.uiScalePercent).toBe(125);
    await writeFile(path, '{incomplete');
    const restarted = new StateStore(path);
    await restarted.load();
    expect(restarted.get().settings.uiScalePercent).toBe(125);
  });

  test('preserves corruption when no valid backup exists before using defaults', async () => {
    const { directory, path } = await fixture();
    await writeFile(path, '{broken');
    await writeFile(`${path}.bak`, '{also broken');
    const store = new StateStore(path);
    await store.load();
    const preserved = (await readdir(directory)).find((name) => name.includes('.corrupt-'));
    expect(preserved).toBeDefined();
    expect(await readFile(join(directory, preserved!), 'utf8')).toBe('{broken');
    expect(await readFile(`${path}.bak`, 'utf8')).toBe('{also broken');
  });
});
