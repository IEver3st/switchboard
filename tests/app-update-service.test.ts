import { describe, expect, it } from 'bun:test';
import type { AppUpdateState } from '../src/shared/contracts';
import { AppUpdateService, appUpdateCheckIntervalMs, resolveAppUpdaterClient } from '../src/main/services/app-update-service';

type Listener = (payload?: unknown) => void;

class FakeUpdater {
  public autoDownload = false;
  public autoInstallOnAppQuit = true;
  public checks = 0;
  public downloads = 0;
  public installArguments: [boolean | undefined, boolean | undefined] | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  public on(event: string, listener: Listener): this {
    const registered = this.listeners.get(event) ?? new Set<Listener>();
    registered.add(listener);
    this.listeners.set(event, registered);
    return this;
  }

  public removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  public async checkForUpdates(): Promise<void> {
    this.checks += 1;
    this.emit('checking-for-update');
  }

  public async downloadUpdate(): Promise<void> {
    this.downloads += 1;
  }

  public quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.installArguments = [isSilent, isForceRunAfter];
  }

  public emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  public listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

describe('application update lifecycle', () => {
  it('checks every 30 minutes in production and stops scheduled checks when disabled', async () => {
    expect(appUpdateCheckIntervalMs).toBe(30 * 60_000);
    const updater = new FakeUpdater();
    const service = new AppUpdateService({
      currentVersion: '0.8.0', isPackaged: true, platform: 'win32',
      onStateChanged: () => undefined, loadUpdater: async () => updater,
      startupDelayMs: 1, repeatIntervalMs: 5,
    });
    try {
      await service.initialize(preferences());
      await waitUntil(() => updater.checks >= 2);
      service.setPreferences(preferences({ automaticChecks: false }));
      const checks = updater.checks;
      await Bun.sleep(20);
      expect(updater.checks).toBe(checks);
    } finally { service.dispose(); }
  });

  it('keeps the downloaded update and waits for both system idle and safe background work', async () => {
    const updater = new FakeUpdater();
    let idleSeconds = 599;
    let safe = false;
    const installs: Array<[boolean, boolean]> = [];
    const service = new AppUpdateService({
      currentVersion: '0.8.0', isPackaged: true, platform: 'win32',
      onStateChanged: () => undefined, loadUpdater: async () => updater,
      getSystemIdleTime: () => idleSeconds, canInstallInBackground: () => safe,
      onInstallRequested: (installing, background) => installs.push([installing, background]),
      startupDelayMs: 100_000, idlePollIntervalMs: 5,
    });
    try {
      await service.initialize(preferences());
      updater.emit('update-downloaded', { version: '0.8.1' });
      await service.checkForUpdates();
      expect(updater.checks).toBe(0);
      expect(service.getState().status).toBe('downloaded');
      await Bun.sleep(20);
      expect(updater.installArguments).toBeNull();
      idleSeconds = 600;
      await Bun.sleep(20);
      expect(updater.installArguments).toBeNull();
      safe = true;
      idleSeconds = 0; // Returning to the keyboard cancels eligibility.
      await Bun.sleep(20);
      expect(updater.installArguments).toBeNull();
      idleSeconds = 600;
      await waitUntil(() => updater.installArguments !== null);
      expect(updater.installArguments).toEqual([true, true]);
      expect(installs).toEqual([[true, true]]);
      await Bun.sleep(20);
      expect(installs).toHaveLength(1);
    } finally { service.dispose(); }
  });

  it('cancels idle monitoring on preference disable and disposal and allows re-enabling', async () => {
    const updater = new FakeUpdater();
    let idleReads = 0;
    const service = new AppUpdateService({
      currentVersion: '0.8.0', isPackaged: true, platform: 'win32',
      onStateChanged: () => undefined, loadUpdater: async () => updater,
      getSystemIdleTime: () => { idleReads++; return 0; },
      canInstallInBackground: () => true, startupDelayMs: 100_000, idlePollIntervalMs: 5,
    });
    await service.initialize(preferences());
    updater.emit('update-downloaded', { version: '0.8.1' });
    service.setPreferences(preferences({ installWhenIdle: false }));
    await Bun.sleep(20);
    expect(idleReads).toBe(0);
    service.setPreferences(preferences());
    await waitUntil(() => idleReads > 0);
    service.setPreferences(preferences({ automaticChecks: false }));
    const reads = idleReads;
    await Bun.sleep(20);
    expect(idleReads).toBe(reads);
    service.setPreferences(preferences());
    service.dispose();
    service.dispose();
    await Bun.sleep(20);
    expect(idleReads).toBe(reads);
    expect(updater.listenerCount()).toBe(0);
  });

  it('resolves autoUpdater from the CommonJS namespace returned by dynamic import', () => {
    const updater = new FakeUpdater();

    expect(resolveAppUpdaterClient({ default: { autoUpdater: updater } })).toBe(updater);
    expect(resolveAppUpdaterClient({ autoUpdater: updater })).toBe(updater);
  });

  it('does not load or schedule the updater outside an installed Windows build', async () => {
    let loaderCalled = false;
    const states: AppUpdateState[] = [];
    const service = new AppUpdateService({
      currentVersion: '0.5.1',
      isPackaged: false,
      platform: 'win32',
      onStateChanged: (state) => states.push(state),
      loadUpdater: async () => {
        loaderCalled = true;
        return new FakeUpdater();
      },
    });

    const state = await service.initialize(preferences());

    expect(loaderCalled).toBeFalse();
    expect(state.status).toBe('unavailable');
    expect(state.unavailableReason).toContain('installed Windows build');
    expect(states.at(-1)?.status).toBe('unavailable');
    service.dispose();
  });

  it('supports an explicit development-only pending update presentation', async () => {
    let loaderCalled = false;
    const service = new AppUpdateService({
      currentVersion: '0.5.1',
      isPackaged: false,
      platform: 'win32',
      demoUpdate: true,
      onStateChanged: () => undefined,
      loadUpdater: async () => {
        loaderCalled = true;
        return new FakeUpdater();
      },
    });

    await expect(service.initialize(preferences())).resolves.toMatchObject({
      capability: 'available',
      status: 'available',
      availableVersion: '0.6.0',
      downloadProgress: 0,
    });
    expect(loaderCalled).toBeFalse();
    await expect(service.checkForUpdates()).resolves.toMatchObject({ status: 'available' });
    service.dispose();
  });

  it('can activate the development update presentation after initialization', async () => {
    const service = new AppUpdateService({
      currentVersion: '0.5.1',
      isPackaged: false,
      platform: 'win32',
      onStateChanged: () => undefined,
    });

    expect((await service.initialize(preferences())).status).toBe('unavailable');
    expect(service.enableDemoUpdate()).toMatchObject({
      capability: 'available',
      status: 'available',
      availableVersion: '0.6.0',
    });
    service.dispose();
  });

  it('publishes check, download, and restart-ready state through the canonical contract', async () => {
    const updater = new FakeUpdater();
    const states: AppUpdateState[] = [];
    const installRequests: boolean[] = [];
    const service = new AppUpdateService({
      currentVersion: '0.5.1',
      isPackaged: true,
      platform: 'win32',
      onStateChanged: (state) => states.push(state),
      onInstallRequested: (installing) => installRequests.push(installing),
      loadUpdater: async () => updater,
    });

    expect((await service.initialize(preferences({ automaticChecks: false }))).status).toBe('idle');
    expect(updater.autoDownload).toBeTrue();
    expect(updater.autoInstallOnAppQuit).toBeFalse();

    expect((await service.checkForUpdates()).status).toBe('checking');
    expect(updater.checks).toBe(1);

    updater.emit('update-available', { version: '0.6.0' });
    updater.emit('download-progress', { percent: 42.4 });
    expect(service.getState()).toMatchObject({
      status: 'downloading',
      availableVersion: '0.6.0',
      downloadProgress: 42.4,
    });

    updater.emit('update-downloaded', { version: '0.6.0' });
    expect(service.getState().status).toBe('downloaded');
    service.installDownloadedUpdate();

    expect(states.at(-1)?.status).toBe('installing');
    expect(installRequests).toEqual([true]);
    expect(updater.installArguments).toEqual([true, true]);

    service.dispose();
    expect(updater.listenerCount()).toBe(0);
  });

  it('applies download and next-startup preferences to the updater', async () => {
    const updater = new FakeUpdater();
    const service = new AppUpdateService({
      currentVersion: '0.5.1',
      isPackaged: true,
      platform: 'win32',
      onStateChanged: () => undefined,
      loadUpdater: async () => updater,
    });

    await service.initialize(preferences({
      automaticDownloads: false,
      installOnNextStartup: true,
    }));
    expect(updater.autoDownload).toBeFalse();
    expect(updater.autoInstallOnAppQuit).toBeTrue();

    updater.emit('update-available', { version: '0.6.0' });
    await service.downloadAvailableUpdate();
    expect(updater.downloads).toBe(1);

    service.dispose();
  });
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for updater transition.');
    await Bun.sleep(5);
  }
}

function preferences(overrides: Partial<{
  automaticChecks: boolean;
  automaticDownloads: boolean;
  installOnNextStartup: boolean;
  installWhenIdle: boolean;
}> = {}) {
  return {
    automaticChecks: true,
    automaticDownloads: true,
    installOnNextStartup: false,
    installWhenIdle: true,
    ...overrides,
  };
}
