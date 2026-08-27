import { devicesAsync, type Device as HidDevice } from 'node-hid';
import type { Device, DeviceControlChange, SystemSnapshot } from '../../shared/contracts';
import type { DeviceModule } from '../modules/device-module';
import { HyperXDeviceModule } from '../modules/hyperx';
import { LogitechDeviceModule } from '../modules/logitech';
import { RazerHuntsmanV2AnalogModule } from '../modules/razer';
import { SonyDeviceModule } from '../modules/sony';

const discoveryIntervalMs = 5_000;
const legacyFixtureIds = new Set(['logitech-g502x-plus-1', 'hyperx-quadcast2-1', 'razer-huntsman-v2-analog-1', 'sony-wh1000xm6-1']);

type DeviceRegistryOptions = {
  modules?: DeviceModule[];
  listHidDevices?: () => Promise<HidDevice[]>;
  fixtureMode?: boolean;
  enumerationTimeoutMs?: number;
};

export class DeviceRegistry {
  private readonly modules: DeviceModule[];
  private readonly listHidDevices: () => Promise<HidDevice[]>;
  private readonly fixtureMode: boolean;
  private readonly enumerationTimeoutMs: number;
  private enumerationPromise: Promise<HidDevice[]> | null = null;
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
      new SonyDeviceModule((devices, persist) => this.applyModuleDevices('device.sony-mdr', devices, persist)),
    ];
    this.listHidDevices = options.listHidDevices ?? devicesAsync;
    this.fixtureMode = options.fixtureMode ?? process.env.SWITCHBOARD_NATIVE_FIXTURES === '1';
    this.enumerationTimeoutMs = options.enumerationTimeoutMs ?? 3_000;
  }

  public async start(): Promise<void> {
    await this.refresh();
    if (this.disposed) return;
    // node-hid has no Windows hot-plug event API. Poll only while the controller
    // is alive, and stop deterministically during application shutdown.
    this.timer = setInterval(() => void this.refresh(), discoveryIntervalMs);
    this.timer.unref();
  }

  public removeLegacyFixtures(): void {
    if (this.fixtureMode) return;
    const snapshot = this.getSnapshot();
    const devices = snapshot.devices.filter((device) => !legacyFixtureIds.has(device.id));
    if (devices.length !== snapshot.devices.length) this.applyDevices(devices, { persist: false });
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
    const result = await module.setControl(device, change);
    if (result?.confirmedChanges.length) {
      for (const confirmed of result.confirmedChanges) {
        if (applyConfirmedLightingControl(this.getSnapshot(), deviceId, confirmed, this.applyDevices)) continue;
        if (applyConfirmedKeyboardControl(this.getSnapshot(), deviceId, confirmed, this.applyDevices)) continue;
        throw new Error(`${device.displayName} returned an unsupported confirmed control state.`);
      }
      return;
    }
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
      const profileMode = change.enabled ? 'onboard' : 'software';
      const unavailableReason = change.enabled
        ? 'Stored onboard profiles are active. Turn off onboard memory to edit the software profile.'
        : undefined;
      if (device.capabilities.dpi) Object.assign(device.capabilities.dpi, { profileMode, writable: !change.enabled, unavailableReason });
      if (device.capabilities.reportRate) Object.assign(device.capabilities.reportRate, { profileMode, writable: !change.enabled, unavailableReason });
      if (device.capabilities.buttonAssignments) Object.assign(device.capabilities.buttonAssignments, { profileMode, writable: !change.enabled, unavailableReason });
      if (device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
        profileMode,
        writable: !change.enabled,
        colorWritable: !change.enabled,
        brightnessWritable: !change.enabled,
        speedWritable: !change.enabled,
        directionWritable: !change.enabled && device.capabilities.lighting.directionWritable,
        zones: device.capabilities.lighting.zones?.map((zone) => ({ ...zone, colorWritable: !change.enabled })),
        unavailableReason,
      });
    }
    if (change.type === 'keyboard-gaming-mode' && device.capabilities.keyboard?.gamingMode) {
      device.capabilities.keyboard.gamingMode.enabled = change.enabled;
    }
    if (change.type === 'keyboard-onboard-profile' && device.capabilities.keyboard?.onboardProfiles) {
      const profile = device.capabilities.keyboard.onboardProfiles.profiles.find((candidate) => candidate.id === change.profileId);
      if (!profile) throw new Error('Fixture onboard profile not found.');
      device.capabilities.keyboard.onboardProfiles.activeProfileId = profile.id;
    }
    if (change.type === 'keyboard-rapid-trigger' && device.capabilities.keyboard?.rapidTrigger?.writable) {
      device.capabilities.keyboard.rapidTrigger.enabled = change.enabled;
    }
    if (change.type === 'keyboard-snap-tap' && device.capabilities.keyboard?.snapTap?.writable) {
      device.capabilities.keyboard.snapTap.enabled = change.enabled;
    }
    const headset = device.capabilities.headset;
    if (change.type === 'headset-noise-control' && headset?.noiseControl) headset.noiseControl.mode = change.mode;
    if (change.type === 'headset-ambient-level' && headset?.noiseControl) {
      headset.noiseControl.mode = 'ambient';
      headset.noiseControl.ambientLevel = change.level;
    }
    if (change.type === 'headset-focus-on-voice' && headset?.noiseControl) {
      headset.noiseControl.mode = 'ambient';
      headset.noiseControl.focusOnVoice = change.enabled;
    }
    if (change.type === 'headset-equalizer-preset' && headset?.equalizer) headset.equalizer.activePresetId = change.presetId;
    if (change.type === 'headset-equalizer-bands' && headset?.equalizer) {
      headset.equalizer.activePresetId = 'custom';
      headset.equalizer.bands.forEach((band, index) => { band.gainDb = change.gainsDb[index] ?? band.gainDb; });
    }
    if (change.type === 'headset-dsee-extreme' && headset?.dseeExtreme) headset.dseeExtreme.enabled = change.enabled;
    if (change.type === 'headset-speak-to-chat' && headset?.speakToChat) headset.speakToChat.enabled = change.enabled;
    if (change.type === 'headset-listening-mode' && headset?.listeningMode) {
      headset.listeningMode.mode = change.mode;
      if (change.backgroundRoom) headset.listeningMode.backgroundRoom = change.backgroundRoom;
    }
    this.applyDevices(devices);
  }

  private async discover(): Promise<void> {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    const hidDevices = await this.enumerateHidDevices();
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

  private enumerateHidDevices(): Promise<HidDevice[]> {
    if (!this.enumerationPromise) {
      const enumeration = this.listHidDevices();
      const trackedEnumeration = enumeration.finally(() => {
        if (this.enumerationPromise === trackedEnumeration) this.enumerationPromise = null;
      });
      this.enumerationPromise = trackedEnumeration;
    }
    return withTimeout(this.enumerationPromise, this.enumerationTimeoutMs, 'HID device enumeration timed out.');
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

function withTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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
    if (!lighting.availableEffects.find((effect) => effect.id === lighting.activeEffectId)?.controls?.includes('color')) {
      lighting.activeEffectId = lighting.availableEffects.find((effect) => effect.id === 'static' || effect.id === 'solid')?.id
        ?? lighting.activeEffectId;
    }
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

  syncLightingWritability(lighting);

  if (lighting.state !== 'maintained') {
    lighting.state = 'acknowledged';
    lighting.stateReason = 'The device acknowledged the requested lighting change.';
  }
  applyDevices(devices);
  return true;
}

function applyConfirmedKeyboardControl(
  snapshot: SystemSnapshot,
  deviceId: string,
  change: DeviceControlChange,
  applyDevices: (devices: Device[], options?: { persist?: boolean }) => void,
): boolean {
  if (![
    'keyboard-gaming-mode',
    'keyboard-onboard-profile',
    'keyboard-rapid-trigger',
    'keyboard-snap-tap',
  ].includes(change.type)) return false;

  const devices = structuredClone(snapshot.devices);
  const device = devices.find((candidate) => candidate.id === deviceId);
  if (!device?.capabilities.keyboard) throw new Error('Keyboard state is no longer available after the control write completed.');
  const keyboard = device.capabilities.keyboard;

  if (change.type === 'keyboard-gaming-mode' && keyboard.gamingMode) {
    keyboard.gamingMode.enabled = change.enabled;
  } else if (change.type === 'keyboard-onboard-profile' && keyboard.onboardProfiles) {
    if (!keyboard.onboardProfiles.profiles.some((profile) => profile.id === change.profileId)) {
      throw new Error('The confirmed onboard profile is no longer reported by this keyboard.');
    }
    keyboard.onboardProfiles.activeProfileId = change.profileId;
  } else if (change.type === 'keyboard-rapid-trigger' && keyboard.rapidTrigger?.writable) {
    keyboard.rapidTrigger.enabled = change.enabled;
  } else if (change.type === 'keyboard-snap-tap' && keyboard.snapTap?.writable) {
    keyboard.snapTap.enabled = change.enabled;
  } else {
    throw new Error('The confirmed keyboard control is no longer available.');
  }

  applyDevices(devices);
  return true;
}

function syncLightingWritability(lighting: Device['capabilities']['lighting']): void {
  if (!lighting) return;
  const effect = lighting.availableEffects.find((candidate) => candidate.id === lighting.activeEffectId);
  if (!effect?.controls) return;
  lighting.colorWritable = lighting.writable && effect.controls.includes('color');
  lighting.brightnessWritable = lighting.writable && effect.controls.includes('brightness');
  lighting.speedWritable = lighting.writable && effect.controls.includes('speed');
  lighting.directionWritable = lighting.writable && effect.controls.includes('direction');
  if (lighting.zones) {
    const writable = lighting.writable && effect.controls.includes('zones');
    lighting.zones = lighting.zones.map((zone) => ({ ...zone, colorWritable: writable }));
  }
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
