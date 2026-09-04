import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/main/services/state-store';
import { createDefaultSnapshot } from '../src/shared/defaults';

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
