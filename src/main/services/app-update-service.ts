import { z } from 'zod';
import { appUpdateStateSchema, type AppUpdateState } from '../../shared/contracts';

type UpdaterEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error';

export interface AppUpdaterClient {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: UpdaterEvent, listener: (payload?: unknown) => void): unknown;
  removeListener(event: UpdaterEvent, listener: (payload?: unknown) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

type AppUpdaterModuleNamespace = {
  autoUpdater?: AppUpdaterClient;
  default?: {
    autoUpdater?: AppUpdaterClient;
  };
};

export type AppUpdatePreferences = {
  automaticChecks: boolean;
  automaticDownloads: boolean;
  installOnNextStartup: boolean;
};

type AppUpdateServiceOptions = {
  currentVersion: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  demoUpdate?: boolean;
  onStateChanged: (state: AppUpdateState) => void;
  onInstallRequested?: (installing: boolean) => void;
  loadUpdater?: () => Promise<AppUpdaterClient>;
  startupDelayMs?: number;
  repeatIntervalMs?: number;
};

const updateInfoSchema = z.object({ version: z.string().min(1) }).passthrough();
const downloadProgressSchema = z.object({ percent: z.number().finite() }).passthrough();
const startupDelayMs = 15_000;
// Six hours keeps long-running tray sessions current without turning release
// discovery into a frequent poll. The timer exists only while checks are enabled.
const repeatIntervalMs = 6 * 60 * 60 * 1_000;

export class AppUpdateService {
  private state: AppUpdateState;
  private updater: AppUpdaterClient | null = null;
  private preferences: AppUpdatePreferences = {
    automaticChecks: true,
    automaticDownloads: true,
    installOnNextStartup: true,
  };
  private demoUpdateEnabled: boolean;
  private initialized = false;
  private disposed = false;
  private scheduledCheck: NodeJS.Timeout | null = null;
  private activeCheck: Promise<AppUpdateState> | null = null;
  private readonly listeners: Array<{
    event: UpdaterEvent;
    listener: (payload?: unknown) => void;
  }> = [];

  public constructor(private readonly options: AppUpdateServiceOptions) {
    this.demoUpdateEnabled = options.demoUpdate === true && !options.isPackaged;
    this.state = appUpdateStateSchema.parse({
      capability: 'unavailable',
      status: 'unavailable',
      currentVersion: options.currentVersion,
      availableVersion: null,
      downloadProgress: null,
      checkedAt: null,
      error: null,
      unavailableReason: 'Application updates are available only in an installed Windows build.',
    });
  }

  public async initialize(preferences: AppUpdatePreferences): Promise<AppUpdateState> {
    this.preferences = structuredClone(preferences);
    if (this.initialized || this.disposed) return this.getState();
    this.initialized = true;

    if (this.demoUpdateEnabled) return this.publishDemoUpdate();

    if (!this.options.isPackaged || this.options.platform !== 'win32') {
      return this.publish({
        capability: 'unavailable',
        status: 'unavailable',
        unavailableReason: this.options.isPackaged
          ? 'Application updates are currently supported only on Windows.'
          : 'Application updates are available only in an installed Windows build.',
      });
    }

    try {
      const loadUpdater = this.options.loadUpdater ?? loadDefaultAppUpdaterClient;
      this.updater = await loadUpdater();
      if (this.disposed) {
        this.updater = null;
        return this.getState();
      }
      this.applyPreferencesToUpdater(this.updater);
      this.attachListeners(this.updater);
      const next = this.publish({
        capability: 'available',
        status: 'idle',
        error: null,
        unavailableReason: null,
      });
      if (this.preferences.automaticChecks) this.scheduleCheck(this.options.startupDelayMs ?? startupDelayMs);
      return next;
    } catch (error) {
      console.error('Switchboard app updater failed to initialize.', error);
      return this.publish({
        capability: 'unavailable',
        status: 'unavailable',
        error: null,
        unavailableReason: 'The application updater could not start in this installation.',
      });
    }
  }

  public enableDemoUpdate(): AppUpdateState {
    if (this.options.isPackaged || this.disposed) return this.getState();
    this.demoUpdateEnabled = true;
    this.clearScheduledCheck();
    return this.publishDemoUpdate();
  }

  public setPreferences(preferences: AppUpdatePreferences): AppUpdateState {
    const shouldStartDownload = !this.preferences.automaticDownloads
      && preferences.automaticDownloads
      && this.state.status === 'available';
    this.preferences = structuredClone(preferences);
    if (this.updater) this.applyPreferencesToUpdater(this.updater);

    if (!preferences.automaticChecks) this.clearScheduledCheck();
    else if (this.updater && !this.disposed) {
      this.scheduleCheck(this.options.startupDelayMs ?? startupDelayMs);
    }
    if (shouldStartDownload) void this.downloadAvailableUpdate();
    return this.getState();
  }

  public checkForUpdates(): Promise<AppUpdateState> {
    if (this.demoUpdateEnabled) return Promise.resolve(this.publishDemoUpdate());
    if (!this.updater || this.disposed || this.state.capability !== 'available') {
      return Promise.resolve(this.getState());
    }
    if (this.activeCheck) return this.activeCheck;

    const check = this.performCheck().finally(() => {
      if (this.activeCheck === check) this.activeCheck = null;
    });
    this.activeCheck = check;
    return check;
  }

  public async downloadAvailableUpdate(): Promise<AppUpdateState> {
    if (this.demoUpdateEnabled) {
      if (this.state.status !== 'available') return this.getState();
      return this.publish({ status: 'downloaded', downloadProgress: 100, error: null });
    }
    if (!this.updater || this.disposed || this.state.status !== 'available') {
      throw new Error('No Switchboard update is available to download.');
    }

    this.publish({ status: 'downloading', downloadProgress: 0, error: null });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      console.error('Switchboard app update download failed.', error);
      this.publish({
        status: 'error',
        error: 'Switchboard could not download the update. Check your connection and try again.',
      });
    }
    return this.getState();
  }

  public installDownloadedUpdate(): void {
    if (this.demoUpdateEnabled) {
      throw new Error('The development update preview does not include an installer.');
    }
    if (!this.updater || this.state.status !== 'downloaded') {
      throw new Error('No downloaded Switchboard update is ready to install.');
    }

    this.publish({ status: 'installing', error: null });
    this.options.onInstallRequested?.(true);
    try {
      // Silent install is required for background updates. The packaged NSIS
      // installer is oneClick so this restarts without the setup wizard.
      this.updater.quitAndInstall(true, true);
    } catch (error) {
      this.options.onInstallRequested?.(false);
      console.error('Switchboard failed to launch the downloaded update.', error);
      this.publish({
        status: 'error',
        error: 'The downloaded update could not be started. Try again or reinstall Switchboard manually.',
      });
      throw error;
    }
  }

  public getState(): AppUpdateState {
    return structuredClone(this.state);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearScheduledCheck();
    if (this.updater) {
      for (const { event, listener } of this.listeners) {
        this.updater.removeListener(event, listener);
      }
    }
    this.listeners.length = 0;
    this.updater = null;
  }

  private async performCheck(): Promise<AppUpdateState> {
    this.publish({ status: 'checking', downloadProgress: null, error: null });
    try {
      await this.updater?.checkForUpdates();
    } catch (error) {
      console.error('Switchboard app update check failed.', error);
      if (this.state.status !== 'error') {
        this.publish({
          status: 'error',
          checkedAt: new Date().toISOString(),
          error: 'Switchboard could not reach its update feed. Check your connection and try again.',
        });
      }
    }
    return this.getState();
  }

  private attachListeners(updater: AppUpdaterClient): void {
    this.listen(updater, 'checking-for-update', () => {
      this.publish({ status: 'checking', downloadProgress: null, error: null });
    });
    this.listen(updater, 'update-available', (payload) => {
      const parsed = updateInfoSchema.safeParse(payload);
      if (!parsed.success) return this.handleInvalidProviderPayload('available update metadata');
      this.publish({
        status: 'available',
        availableVersion: parsed.data.version,
        downloadProgress: 0,
        checkedAt: new Date().toISOString(),
        error: null,
      });
    });
    this.listen(updater, 'update-not-available', () => {
      this.publish({
        status: 'idle',
        availableVersion: null,
        downloadProgress: null,
        checkedAt: new Date().toISOString(),
        error: null,
      });
    });
    this.listen(updater, 'download-progress', (payload) => {
      const parsed = downloadProgressSchema.safeParse(payload);
      if (!parsed.success) return this.handleInvalidProviderPayload('download progress');
      this.publish({
        status: 'downloading',
        downloadProgress: Math.min(100, Math.max(0, parsed.data.percent)),
        error: null,
      });
    });
    this.listen(updater, 'update-downloaded', (payload) => {
      const parsed = updateInfoSchema.safeParse(payload);
      if (!parsed.success) return this.handleInvalidProviderPayload('downloaded update metadata');
      this.publish({
        status: 'downloaded',
        availableVersion: parsed.data.version,
        downloadProgress: 100,
        checkedAt: new Date().toISOString(),
        error: null,
      });
    });
    this.listen(updater, 'error', (payload) => {
      console.error('Switchboard app updater reported an error.', payload);
      this.publish({
        status: 'error',
        checkedAt: new Date().toISOString(),
        error: 'Switchboard could not complete the update. Check your connection and try again.',
      });
    });
  }

  private applyPreferencesToUpdater(updater: AppUpdaterClient): void {
    updater.autoDownload = this.preferences.automaticDownloads;
    updater.autoInstallOnAppQuit = this.preferences.installOnNextStartup;
  }

  private publishDemoUpdate(): AppUpdateState {
    return this.publish({
      capability: 'available',
      status: 'available',
      availableVersion: getDemoAvailableVersion(this.options.currentVersion),
      downloadProgress: 0,
      checkedAt: new Date().toISOString(),
      error: null,
      unavailableReason: null,
    });
  }

  private listen(
    updater: AppUpdaterClient,
    event: UpdaterEvent,
    listener: (payload?: unknown) => void,
  ): void {
    updater.on(event, listener);
    this.listeners.push({ event, listener });
  }

  private handleInvalidProviderPayload(kind: string): void {
    console.error(`Switchboard updater received invalid ${kind}.`);
    this.publish({
      status: 'error',
      checkedAt: new Date().toISOString(),
      error: 'The update feed returned invalid release information. Try again later.',
    });
  }

  private scheduleCheck(delayMs: number): void {
    if (!this.preferences.automaticChecks || !this.updater || this.disposed || this.scheduledCheck) return;
    this.scheduledCheck = setTimeout(() => {
      this.scheduledCheck = null;
      void this.checkForUpdates().finally(() => {
        this.scheduleCheck(this.options.repeatIntervalMs ?? repeatIntervalMs);
      });
    }, delayMs);
    this.scheduledCheck.unref?.();
  }

  private clearScheduledCheck(): void {
    if (this.scheduledCheck) clearTimeout(this.scheduledCheck);
    this.scheduledCheck = null;
  }

  private publish(patch: Partial<AppUpdateState>): AppUpdateState {
    this.state = appUpdateStateSchema.parse({ ...this.state, ...patch });
    const snapshot = this.getState();
    this.options.onStateChanged(snapshot);
    return snapshot;
  }
}

function getDemoAvailableVersion(currentVersion: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(currentVersion);
  if (!match) return '0.2.0';
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}

export async function loadDefaultAppUpdaterClient(): Promise<AppUpdaterClient> {
  const updaterModule = await import('electron-updater') as unknown as AppUpdaterModuleNamespace;
  return resolveAppUpdaterClient(updaterModule);
}

export function resolveAppUpdaterClient(updaterModule: AppUpdaterModuleNamespace): AppUpdaterClient {
  const autoUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
  if (!autoUpdater) {
    throw new Error('electron-updater did not expose autoUpdater.');
  }
  return autoUpdater;
}
