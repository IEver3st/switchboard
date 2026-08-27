import { devicesAsync, type Device as HidDevice } from 'node-hid';
import type { Device, DeviceControlChange, SystemSnapshot } from '../../shared/contracts';
import type { DeviceModule } from '../modules/device-module';
import { HyperXDeviceModule } from '../modules/hyperx';
import { LogitechDeviceModule } from '../modules/logitech';
import { RazerHuntsmanV2AnalogModule } from '../modules/razer';

const discoveryIntervalMs = 5_000;
const legacyFixtureIds = new Set(['logitech-g502x-plus-1', 'hyperx-quadcast2-1', 'razer-huntsman-v2-analog-1']);

type DeviceRegistryOptions = {
  modules?: DeviceModule[];
  listHidDevices?: () => Promise<HidDevice[]>;
  fixtureMode?: boolean;
};

export class DeviceRegistry {
  private readonly modules: DeviceModule[];
  private readonly listHidDevices: () => Promise<HidDevice[]>;
  private readonly fixtureMode: boolean;
  private timer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;
  private disposed = false;

  public constructor(
    private readonly getSnapshot: () => SystemSnapshot,
    private readonly applyDevices: (devices: Device[], options?: { persist?: boolean }) => void,
    options: DeviceRegistryOptions = {},
  ) {
    this.modules = options.modules ?? [
      new RazerHuntsmanV2AnalogModule(),
      new LogitechDeviceModule(),
      new HyperXDeviceModule((devices, persist) => this.applyModuleDevices('device.hyperx-quadcast', devices, persist)),
    ];
    this.listHidDevices = options.listHidDevices ?? devicesAsync;
    this.fixtureMode = options.fixtureMode ?? process.env.SWITCHBOARD_NATIVE_FIXTURES === '1';
  }

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
    if (this.fixtureMode) {
      this.setFixtureControl(deviceId, change);
      return;
    }
    const device = this.getSnapshot().devices.find((candidate) => candidate.id === deviceId);
    if (!device) throw new Error('Device not found.');
    const module = this.modules.find((candidate) => candidate.id === device.moduleId);
    if (!module?.setControl) throw new Error(`${device.displayName} does not expose writable device controls.`);
    await module.setControl(device, change);
    if (applyConfirmedLightingControl(this.getSnapshot(), deviceId, change, this.applyDevices)) return;
    // A scheduled discovery may still be publishing the state from before the
    // write. Let it finish, then perform a fresh read so the renderer observes
    // device-confirmed state instead of optimistic React state.
    if (this.refreshPromise) await this.refreshPromise;
    await this.refresh();
  }

  public dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const activeRefresh = this.refreshPromise;
    this.disposePromise = (async () => {
      if (activeRefresh) await activeRefresh;
      await Promise.all(this.modules.map((module) => module.dispose?.()));
    })();
    return this.disposePromise;
  }

  private setFixtureControl(deviceId: string, change: DeviceControlChange): void {
    if (applyConfirmedLightingControl(this.getSnapshot(), deviceId, change, this.applyDevices)) return;
    const devices = structuredClone(this.getSnapshot().devices);
    const device = devices.find((candidate) => candidate.id === deviceId);
    if (!device) throw new Error('Fixture device not found.');

    if (change.type === 'dpi' && device.capabilities.dpi) device.capabilities.dpi.activeDpi = change.value;
    if (change.type === 'dpi-stages' && device.capabilities.dpi) device.capabilities.dpi.stages = change.stages;
    if (change.type === 'dpi-shift' && device.capabilities.dpi) device.capabilities.dpi.shiftDpi = change.value;
    if (change.type === 'report-rate' && device.capabilities.reportRate) device.capabilities.reportRate.value = change.value;
    if (change.type === 'button-assignment' && device.capabilities.buttonAssignments) {
      const binding = device.capabilities.buttonAssignments.bindings.find((candidate) => candidate.buttonId === change.buttonId);
      if (binding) binding.currentActionId = change.actionId;
    }
    if (change.type === 'onboard-memory' && device.capabilities.onboardMemory) {
      device.capabilities.onboardMemory.enabled = change.enabled;
    }
    this.applyDevices(devices);
  }

  private async discover(): Promise<void> {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    const hidDevices = await this.listHidDevices();
    if (this.disposed) return;
    const enabledModuleIds = new Set(snapshot.modules.filter((module) => module.enabled).map((module) => module.id));
    const activeModules = this.modules.filter((module) => enabledModuleIds.has(module.id));
    await Promise.all(this.modules
      .filter((module) => !enabledModuleIds.has(module.id))
      .map((module) => module.deactivate?.()));
    const groups = await Promise.all(activeModules.map((module) => module.discover({
      hidDevices,
      previousDevices: snapshot.devices,
      appearanceOverrides: snapshot.settings.deviceAppearanceOverrides,
    })));
    if (this.disposed) return;
    const connected = groups.flat().map((device) => mergeDeviceSettings(device, snapshot.devices));
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

  private applyModuleDevices(moduleId: string, published: Device[], persist: boolean): void {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    const merged = published.map((device) => mergeDeviceSettings(device, snapshot.devices));
    const next = [
      ...merged,
      ...snapshot.devices.filter((device) => device.moduleId !== moduleId),
    ].sort((left, right) => {
      if (left.connected !== right.connected) return left.connected ? -1 : 1;
      return left.displayName.localeCompare(right.displayName);
    });
    if (JSON.stringify(next) !== JSON.stringify(snapshot.devices)) this.applyDevices(next, { persist });
  }
}

const lightingControlTypes = new Set<DeviceControlChange['type']>([
  'lighting-enabled',
  'lighting-color',
  'lighting-brightness',
  'lighting-effect',
  'lighting-speed',
  'lighting-direction',
  'lighting-zone-color',
  'lighting-profile',
  'microphone-mute-lighting',
]);

function applyConfirmedLightingControl(
  snapshot: SystemSnapshot,
  deviceId: string,
  change: DeviceControlChange,
  applyDevices: (devices: Device[], options?: { persist?: boolean }) => void,
): boolean {
  if (!lightingControlTypes.has(change.type)) return false;
  const devices = structuredClone(snapshot.devices);
  const device = devices.find((candidate) => candidate.id === deviceId);
  if (!device) throw new Error('Device not found after the control write completed.');
  const lighting = device.capabilities.lighting;
  if (!lighting) throw new Error(`${device.displayName} no longer exposes lighting controls.`);

  if (change.type === 'lighting-enabled') {
    lighting.enabled = change.enabled;
    setExistingSetting(device, 'lightingEnabled', change.enabled);
  } else if (change.type === 'lighting-color') {
    lighting.color = change.color.toLowerCase();
    lighting.enabled = true;
    lighting.activeProfileId = 'custom';
    setExistingSetting(device, 'lightingColor', lighting.color);
  } else if (change.type === 'lighting-brightness') {
    lighting.brightness = Math.round(change.brightness);
    lighting.activeProfileId = 'custom';
    setExistingSetting(device, 'lightingBrightness', lighting.brightness);
  } else if (change.type === 'lighting-effect') {
    lighting.activeEffectId = change.effectId;
    lighting.enabled = true;
    lighting.activeProfileId = 'custom';
    setExistingSetting(device, 'lightingEffect', change.effectId);
  } else if (change.type === 'lighting-speed') {
    lighting.speed = Math.round(change.speed);
    lighting.activeProfileId = 'custom';
    setExistingSetting(device, 'lightingSpeed', lighting.speed);
  } else if (change.type === 'lighting-direction') {
    lighting.direction = change.direction;
    lighting.enabled = true;
  } else if (change.type === 'lighting-zone-color') {
    const zone = lighting.zones?.find((candidate) => candidate.id === change.zoneId);
    if (!zone) throw new Error('The confirmed lighting zone is no longer available.');
    zone.color = change.color.toLowerCase();
    lighting.activeEffectId = lighting.availableEffects.some((effect) => effect.id === 'static')
      ? 'static'
      : lighting.activeEffectId;
    lighting.enabled = true;
  } else if (change.type === 'lighting-profile') {
    const profile = lighting.profiles.find((candidate) => candidate.id === change.profileId);
    if (!profile) throw new Error('The confirmed lighting profile is no longer available.');
    Object.assign(lighting, {
      activeProfileId: profile.id,
      activeEffectId: profile.effectId,
      brightness: profile.brightness,
      speed: profile.speed,
    });
    setExistingSetting(device, 'lightingProfileId', profile.id);
    setExistingSetting(device, 'lightingEffect', profile.effectId);
    setExistingSetting(device, 'lightingBrightness', profile.brightness);
    setExistingSetting(device, 'lightingSpeed', profile.speed);
  } else if (change.type === 'microphone-mute-lighting') {
    lighting.muteLinked = change.enabled;
    setExistingSetting(device, 'muteLed', change.enabled);
  }

  if (lighting.state !== 'maintained') {
    lighting.state = 'acknowledged';
    lighting.stateReason = 'The device acknowledged the requested lighting change.';
  }
  applyDevices(devices);
  return true;
}

function setExistingSetting(device: Device, key: string, value: Device['settings'][string]): void {
  if (Object.hasOwn(device.settings, key)) device.settings[key] = value;
}

function mergeDeviceSettings(device: Device, previousDevices: Device[]): Device {
  const previous = previousDevices.find((candidate) => candidate.id === device.id)
    ?? previousDevices.find((candidate) => (
      candidate.moduleId === device.moduleId
      && candidate.identity.model === device.identity.model
    ));
  return previous
    ? { ...device, settings: { ...previous.settings, ...device.settings } }
    : device;
}
