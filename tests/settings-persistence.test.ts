import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { createDefaultSnapshot } from '../src/shared/defaults';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('settings persistence', () => {
  it('persists app and capture preferences across a store restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-settings-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);

    await first.load();
    first.update((draft) => {
      draft.settings.closeToTray = false;
      draft.settings.diagnosticsRetentionDays = 14;
      draft.settings.scanGamesAutomatically = false;
      draft.capture.config.replaySeconds = 90;
      draft.capture.config.hotkey = 'Ctrl+Alt+F9';
      draft.capture.config.clipsDirectory = 'C:\\Switchboard Test Clips';
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    const snapshot = restarted.get();

    expect(snapshot.settings.closeToTray).toBeFalse();
    expect(snapshot.settings.diagnosticsRetentionDays).toBe(14);
    expect(snapshot.settings.scanGamesAutomatically).toBeFalse();
    expect(snapshot.capture.config.replaySeconds).toBe(90);
    expect(snapshot.capture.config.hotkey).toBe('Ctrl+Alt+F9');
    expect(snapshot.capture.config.clipsDirectory).toBe('C:\\Switchboard Test Clips');
  });

  it('migrates existing state that predates game detection without discarding preferences', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-settings-legacy-games-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const legacy = createDefaultSnapshot() as unknown as Record<string, unknown>;
    const settings = legacy.settings as Record<string, unknown>;
    settings.closeToTray = false;
    delete settings.scanGamesAutomatically;
    delete legacy.gameDetection;
    delete legacy.appUpdate;
    await writeFile(filePath, JSON.stringify(legacy));

    const store = new StateStore(filePath);
    await store.load();
    const snapshot = store.get();

    expect(snapshot.settings.closeToTray).toBeFalse();
    expect(snapshot.settings.scanGamesAutomatically).toBeTrue();
    expect(snapshot.gameDetection.games).toEqual([]);
    expect(snapshot.gameDetection.scanState).toBe('idle');
    expect(snapshot.appUpdate).toEqual(createDefaultSnapshot().appUpdate);
  });
});
