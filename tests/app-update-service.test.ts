import { describe, expect, it } from 'bun:test';
import type { AppUpdateState } from '../src/shared/contracts';
import { AppUpdateService, resolveAppUpdaterClient } from '../src/main/services/app-update-service';

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
    expect(updater.installArguments).toEqual([false, true]);

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

function preferences(overrides: Partial<{
  automaticChecks: boolean;
  automaticDownloads: boolean;
  installOnNextStartup: boolean;
}> = {}) {
  return {
    automaticChecks: true,
    automaticDownloads: true,
    installOnNextStartup: false,
    ...overrides,
  };
}
