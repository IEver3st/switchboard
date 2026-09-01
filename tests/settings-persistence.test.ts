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
      draft.settings.automaticAppUpdates = false;
      draft.settings.automaticAppUpdateDownloads = false;
      draft.settings.installAppUpdatesOnNextStartup = true;
      draft.clipReview.reviewedThrough = 1_777_777_777_777;
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
    expect(snapshot.settings.automaticAppUpdates).toBeFalse();
    expect(snapshot.settings.automaticAppUpdateDownloads).toBeFalse();
    expect(snapshot.settings.installAppUpdatesOnNextStartup).toBeTrue();
    expect(snapshot.clipReview.reviewedThrough).toBe(1_777_777_777_777);
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
    delete settings.automaticAppUpdates;
    delete settings.automaticAppUpdateDownloads;
    delete settings.installAppUpdatesOnNextStartup;
    delete legacy.appUpdate;
    delete legacy.gameDetection;
    await writeFile(filePath, JSON.stringify(legacy));

    const store = new StateStore(filePath);
    await store.load();
    const snapshot = store.get();

    expect(snapshot.settings.closeToTray).toBeFalse();
    expect(snapshot.settings.scanGamesAutomatically).toBeTrue();
    expect(snapshot.settings.automaticAppUpdates).toBeTrue();
    expect(snapshot.settings.automaticAppUpdateDownloads).toBeTrue();
    expect(snapshot.settings.installAppUpdatesOnNextStartup).toBeFalse();
    expect(snapshot.appUpdate.status).toBe('unavailable');
    expect(snapshot.gameDetection.games).toEqual([]);
    expect(snapshot.gameDetection.scanState).toBe('idle');
  });

  it('treats clips from before the review feature as already reviewed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-settings-legacy-clip-review-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const legacy = createDefaultSnapshot() as unknown as Record<string, unknown>;
    legacy.clips = [
      {
        id: 'legacy-clip', path: 'C:\\Clips\\legacy.mp4', name: 'Legacy clip', createdAt: 42_000,
        durationMs: 30_000, fileSize: 1_000_000, width: 1_920, height: 1_080, fps: 60,
        favorite: false, titleEdited: false, canvasSize: 'original',
      },
    ];
    delete legacy.clipReview;
    await writeFile(filePath, JSON.stringify(legacy));

    const store = new StateStore(filePath);
    await store.load();

    expect(store.get().clipReview.reviewedThrough).toBe(42_000);
  });

  it('preserves sampled runtime performance across unrelated canonical updates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-performance-state-'));
    temporaryDirectories.push(directory);
    const store = new StateStore(join(directory, 'switchboard-state.json'));
    await store.load();
    const sampled = {
      ...store.get().performance,
      coreMemoryMb: 74,
      rendererMemoryMb: 81,
      totalMemoryMb: 155,
      residentMemoryMb: 192,
      totalCpuPercent: 0.4,
      activeProcesses: 4,
      sampledAt: '2026-08-27T12:00:00.000Z',
      guardState: 'within-budget' as const,
    };

    store.setPerformance(sampled);
    store.update((draft) => { draft.settings.closeToTray = false; });

    expect(store.get().performance).toEqual(sampled);
    await store.flush();
  });
});
