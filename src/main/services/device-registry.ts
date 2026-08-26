import { devicesAsync } from 'node-hid';
import type { Device, DeviceControlChange, SystemSnapshot } from '../../shared/contracts';
import type { DeviceModule } from '../modules/device-module';
import { HyperXDeviceModule } from '../modules/hyperx';
import { LogitechDeviceModule } from '../modules/logitech';

const discoveryIntervalMs = 5_000;
const legacyFixtureIds = new Set(['logitech-g502x-plus-1', 'hyperx-quadcast2-1']);

export class DeviceRegistry {
  private readonly modules: DeviceModule[] = [new LogitechDeviceModule(), new HyperXDeviceModule()];
  private timer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;
  private disposed = false;

  public constructor(
    private readonly getSnapshot: () => SystemSnapshot,
    private readonly applyDevices: (devices: Device[]) => void,
  ) {}

  public async start(): Promise<void> {
    await this.refresh();
    if (this.disposed) return;
    // node-hid has no Windows hot-plug event API. Poll only while the controller
    // is alive, and stop deterministically during application shutdown.
    this.timer = setInterval(() => void this.refresh(), discoveryIntervalMs);
    this.timer.unref();
  }

  public refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.discover()
      .catch((error) => console.warn('Device discovery failed.', error))
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  public async setControl(deviceId: string, change: DeviceControlChange): Promise<void> {
    const device = this.getSnapshot().devices.find((candidate) => candidate.id === deviceId);
    if (!device) throw new Error('Device not found.');
    const module = this.modules.find((candidate) => candidate.id === device.moduleId);
    if (!module?.setControl) throw new Error(`${device.displayName} does not expose writable device controls.`);
    await module.setControl(device, change);
    // A scheduled discovery may still be publishing the state from before the
    // write. Let it finish, then perform a fresh read so the renderer observes
    // device-confirmed state instead of optimistic React state.
    if (this.refreshPromise) await this.refreshPromise;
    await this.refresh();
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async discover(): Promise<void> {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    const hidDevices = await devicesAsync();
    const enabledModuleIds = new Set(snapshot.modules.filter((module) => module.enabled).map((module) => module.id));
    const activeModules = this.modules.filter((module) => enabledModuleIds.has(module.id));
    const groups = await Promise.all(activeModules.map((module) => module.discover({
      hidDevices,
      previousDevices: snapshot.devices,
      appearanceOverrides: snapshot.settings.deviceAppearanceOverrides,
    })));
    const connected = groups.flat();
    const connectedIds = new Set(connected.map((device) => device.id));
    const moduleIds = new Set(this.modules.map((module) => module.id));
    const disconnected = snapshot.devices
      .filter((device) => (
        moduleIds.has(device.moduleId)
        && !legacyFixtureIds.has(device.id)
        && !connectedIds.has(device.id)
        && !connected.some((candidate) => (
          candidate.moduleId === device.moduleId
          && candidate.identity.model === device.identity.model
        ))
      ))
      .map((device) => ({ ...device, connected: false }));
    const unmanaged = snapshot.devices.filter((device) => !moduleIds.has(device.moduleId));
    const next = [...connected, ...disconnected, ...unmanaged].sort((left, right) => {
      if (left.connected !== right.connected) return left.connected ? -1 : 1;
      return left.displayName.localeCompare(right.displayName);
    });

    if (JSON.stringify(next) !== JSON.stringify(snapshot.devices)) this.applyDevices(next);
  }
}
