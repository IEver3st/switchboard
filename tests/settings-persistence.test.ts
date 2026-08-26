import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';

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
    expect(snapshot.capture.config.replaySeconds).toBe(90);
    expect(snapshot.capture.config.hotkey).toBe('Ctrl+Alt+F9');
    expect(snapshot.capture.config.clipsDirectory).toBe('C:\\Switchboard Test Clips');
  });
});
