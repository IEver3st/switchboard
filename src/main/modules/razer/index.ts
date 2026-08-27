import type { Device as HidDevice } from 'node-hid';
import type {
  Device,
  DeviceControlChange,
  DeviceSettingValue,
  KeyboardFeature,
  LightingEffect,
} from '../../../shared/contracts';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceControlResult, DeviceDiscoveryContext, DeviceModule } from '../device-module';
import {
  huntsmanV2AnalogProductId,
  isHuntsmanLightingEffect,
  razerVendorId,
  type HuntsmanLightingEffectId,
} from './huntsman-v2-analog-protocol';
import { HuntsmanV2AnalogTransport, type HuntsmanProbe } from './huntsman-v2-analog-transport';

const probeCacheDurationMs = 15_000;
const model = 'Huntsman V2 Analog';
const nativeUnavailableReason = 'The dedicated Razer HID control endpoint is unavailable. Reconnect the keyboard or close another utility that owns it.';
const userUnavailableReason = 'This setting is unavailable. Reconnect the keyboard and try again.';

export const huntsmanLightingEffects: readonly LightingEffect[] = [
  { id: 'static', label: 'Static', controls: ['color', 'brightness'] },
  { id: 'breathing', label: 'Breathing', controls: ['color', 'brightness'] },
  { id: 'spectrum', label: 'Spectrum', controls: ['brightness'] },
  { id: 'reactive', label: 'Reactive', controls: ['color', 'brightness'] },
  { id: 'starlight', label: 'Starlight', controls: ['color', 'brightness'] },
  { id: 'wave-left', label: 'Wave left', controls: ['brightness'] },
  { id: 'wave-right', label: 'Wave right', controls: ['brightness'] },
] as const;

export const huntsmanKeyboardFeatures: readonly KeyboardFeature[] = [
  {
    id: 'lighting',
    label: 'Quick lighting',
    summary: 'Brightness and device-firmware quick effects use the native HID control endpoint.',
    status: 'native',
  },
  {
    id: 'actuation',
    label: 'Per-key actuation',
    summary: 'Adjustable 1.5–3.6 mm actuation and two-stage inputs are supported by the keyboard.',
    status: 'synapse',
    unavailableReason: 'The actuation protocol is not safely documented or verified for direct writes yet.',
  },
  {
    id: 'analog',
    label: 'Analog input',
    summary: 'Selected keys can emulate joystick axes and controller triggers.',
    status: 'synapse',
    unavailableReason: 'Analog mapping remains owned by Synapse until its native profile format is verified.',
  },
  {
    id: 'mapping',
    label: 'Key mapping',
    summary: 'Remapping, macros, Hypershift, and analog controller bindings remain in Synapse.',
    status: 'synapse',
    unavailableReason: 'Switchboard does not write undocumented key maps or macro payloads.',
  },
  {
    id: 'rapid-input',
    label: 'Snap Tap',
    summary: 'Snap Tap is available for this keyboard through Synapse 4.',
    status: 'synapse',
    unavailableReason: 'Switchboard does not expose Snap Tap because no independent device command is verified for this model.',
  },
] as const;

interface HuntsmanSettings {
  lightingEnabled: boolean;
  lightingBrightness: number;
  lightingEffect: HuntsmanLightingEffectId;
  lightingColor: string;
}

export interface HuntsmanControlTransport {
  probe(path: string): Promise<HuntsmanProbe>;
  setBrightness(path: string, brightness: number): Promise<number>;
  setEffect(path: string, effectId: HuntsmanLightingEffectId, color: string): Promise<{ effectId: HuntsmanLightingEffectId; color?: string }>;
  setGamingMode(path: string, enabled: boolean): Promise<boolean>;
  setActiveOnboardProfile(path: string, profileId: number): Promise<number>;
}

export interface HuntsmanModuleDependencies {
  transport: HuntsmanControlTransport;
  now(): number;
}

const defaultDependencies: HuntsmanModuleDependencies = {
  transport: new HuntsmanV2AnalogTransport(),
  now: Date.now,
};

export class RazerHuntsmanV2AnalogModule implements DeviceModule {
  public readonly id = 'device.razer-huntsman';
  private path: string | null = null;
  private deviceId: string | null = null;
  private probe: HuntsmanProbe | null = null;
  private probeUpdatedAt = 0;
  private settings: HuntsmanSettings = normalizeSettings();
  private effectAcknowledged = false;
  private lastControlError: string | undefined;
  private operationQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(private readonly dependencies: HuntsmanModuleDependencies = defaultDependencies) {}

  public discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    return this.enqueue(() => this.discoverNow(context));
  }

  private async discoverNow(context: DeviceDiscoveryContext): Promise<Device[]> {
    if (this.disposed) return [];
    const descriptors = context.hidDevices.filter((descriptor) => (
      descriptor.vendorId === razerVendorId && descriptor.productId === huntsmanV2AnalogProductId
    ));
    if (descriptors.length === 0) {
      this.release();
      return [];
    }

    const endpoint = findControlEndpoint(descriptors);
    const primary = descriptors.find((descriptor) => descriptor.interface === 0) ?? descriptors[0];
    const nextPath = endpoint?.path ?? null;
    const previous = context.previousDevices.find((device) => (
      device.moduleId === this.id && device.identity.model === model
    ));
    if (nextPath !== this.path) {
      this.path = nextPath;
      this.probe = null;
      this.probeUpdatedAt = 0;
      this.effectAcknowledged = false;
      this.settings = normalizeSettings(previous?.settings);
    }

    let unavailableReason: string | undefined;
    if (this.path) {
      try {
        if (!this.probe || this.dependencies.now() - this.probeUpdatedAt >= probeCacheDurationMs) {
          this.probe = await this.dependencies.transport.probe(this.path);
          this.probeUpdatedAt = this.dependencies.now();
        }
      } catch (error) {
        unavailableReason = errorMessage(error, nativeUnavailableReason);
      }
    } else {
      unavailableReason = nativeUnavailableReason;
    }

    if (this.probe?.lightingState) {
      const { effectId, color } = this.probe.lightingState;
      this.settings.lightingEnabled = effectId !== 'off';
      if (effectId !== 'off') this.settings.lightingEffect = effectId;
      if (color) this.settings.lightingColor = color;
    }

    const serialNumber = this.probe?.serialNumber ?? previous?.identity.serialNumber;
    const id = `razer:${serialNumber || huntsmanV2AnalogProductId.toString(16).padStart(4, '0')}`;
    this.deviceId = id;
    const identity = {
      manufacturer: 'Razer',
      productFamily: 'Huntsman',
      model,
      variant: 'black',
      colorway: 'Black',
      connection: 'usb' as const,
      connectionLabel: 'USB',
      hardwareRevision: primary?.release ? primary.release.toString(16).padStart(4, '0').toUpperCase() : undefined,
      vendorId: razerVendorId,
      productId: huntsmanV2AnalogProductId,
      interfaceProductIds: [huntsmanV2AnalogProductId],
      serialNumber,
      productString: primary?.product ?? descriptors.find((descriptor) => descriptor.product)?.product,
    };
    const nativeReady = Boolean(this.path && this.probe && !unavailableReason);
    const brightness = this.probe?.brightness;
    const availableEffects = supportedLightingEffects(this.probe?.lightingEffectCodes);
    if (brightness !== undefined) this.settings.lightingBrightness = brightness;
    const effectWritable = Boolean(nativeReady && this.probe?.lightingState && this.probe?.lightingEffectCodes?.length && availableEffects.length);
    const brightnessWritable = Boolean(nativeReady && brightness !== undefined);
    const gamingModeWritable = Boolean(nativeReady && this.probe?.gamingMode !== undefined);
    const profilesWritable = Boolean(
      nativeReady
      && this.probe?.activeOnboardProfileId !== undefined
      && this.probe.onboardProfileIds?.includes(this.probe.activeOnboardProfileId),
    );

    return [{
      id,
      moduleId: this.id,
      displayName: model,
      kind: 'keyboard',
      connected: true,
      identity,
      variantResolution: {
        confidence: 'product-id',
        source: 'Razer USB product ID',
        evidence: '1532:0266',
      },
      asset: resolveProductAsset(identity, 'keyboard'),
      capabilities: {
        keyboard: {
          ...(this.probe?.firmwareVersion ? { firmwareVersion: this.probe.firmwareVersion } : {}),
          pollingRateHz: 1_000,
          transport: nativeReady ? 'native-hid' : 'unavailable',
          features: huntsmanKeyboardFeatures.map((feature) => ({ ...feature })),
          gamingMode: {
            enabled: this.probe?.gamingMode ?? null,
            writable: gamingModeWritable,
            ...(!gamingModeWritable ? { unavailableReason: userUnavailableReason } : {}),
          },
          onboardProfiles: {
            activeProfileId: this.probe?.activeOnboardProfileId !== undefined ? String(this.probe.activeOnboardProfileId) : null,
            profiles: (this.probe?.onboardProfileIds ?? []).map((profileId, index) => ({
              id: String(profileId),
              label: `Profile ${index + 1}`,
            })),
            writable: profilesWritable,
            ...(!profilesWritable ? { unavailableReason: userUnavailableReason } : {}),
          },
          diagnostics: keyboardDiagnostics(this.probe, unavailableReason, this.probeUpdatedAt, this.lastControlError),
        },
        lighting: {
          writable: effectWritable,
          enabled: this.settings.lightingEnabled,
          activeEffectId: this.settings.lightingEffect,
          availableEffects,
          color: this.settings.lightingColor,
          colorWritable: effectWritable,
          ...(brightness !== undefined ? { brightness } : {}),
          brightnessWritable,
          speedWritable: false,
          profiles: [],
          muteLinked: false,
          muteLinkedWritable: false,
          state: this.probe?.lightingState ? 'maintained' : (this.effectAcknowledged ? 'acknowledged' : 'unknown'),
          stateReason: this.probe?.lightingState
            ? 'Active effect and brightness were read back from keyboard firmware.'
            : (unavailableReason ?? 'The keyboard has not returned an effect state yet.'),
          physicalEffectVerified: false,
          profileMode: 'software',
          source: 'firmware',
          ...(!effectWritable ? { unavailableReason: userUnavailableReason } : {}),
        },
      },
      settings: serializeSettings(this.settings),
    }];
  }

  public async setControl(device: Device, change: DeviceControlChange): Promise<DeviceControlResult> {
    try {
      const result = await this.enqueue(async () => {
      if (!device.connected || device.id !== this.deviceId || !this.path) throw new Error(`${device.displayName} native controls are unavailable.`);
      if (change.type === 'lighting-brightness') {
        const confirmed = await this.dependencies.transport.setBrightness(this.path, change.brightness);
        this.settings.lightingBrightness = confirmed;
        if (this.probe) this.probe = { ...this.probe, brightness: confirmed };
        this.probeUpdatedAt = this.dependencies.now();
        return confirmedControl({ type: 'lighting-brightness', brightness: confirmed });
      }
      if (change.type === 'lighting-enabled') {
        const confirmed = await this.dependencies.transport.setEffect(
          this.path,
          change.enabled ? this.settings.lightingEffect : 'off',
          this.settings.lightingColor,
        );
        this.applyLightingReadback(confirmed);
        this.effectAcknowledged = true;
        return confirmedControl({ type: 'lighting-enabled', enabled: confirmed.effectId !== 'off' });
      }
      if (change.type === 'lighting-effect') {
        if (!isHuntsmanLightingEffect(change.effectId) || change.effectId === 'off') throw new Error('That quick effect is not supported by this keyboard module.');
        if (!this.settings.lightingEnabled) throw new Error('Turn keyboard lighting on before changing the quick effect.');
        const confirmed = await this.dependencies.transport.setEffect(this.path, change.effectId, this.settings.lightingColor);
        this.applyLightingReadback(confirmed);
        this.effectAcknowledged = true;
        return confirmed.effectId === 'off'
          ? confirmedControl({ type: 'lighting-enabled', enabled: false })
          : confirmedControl({ type: 'lighting-effect', effectId: confirmed.effectId });
      }
      if (change.type === 'lighting-color') {
        if (!this.settings.lightingEnabled || !effectUsesColor(this.settings.lightingEffect)) {
          throw new Error('The selected quick effect does not use a custom color.');
        }
        const confirmed = await this.dependencies.transport.setEffect(this.path, this.settings.lightingEffect, change.color);
        this.applyLightingReadback(confirmed);
        this.effectAcknowledged = true;
        if (!confirmed.color) throw new Error('The keyboard did not return the applied lighting color.');
        return confirmedControl({ type: 'lighting-color', color: confirmed.color });
      }
      if (change.type === 'keyboard-gaming-mode') {
        if (!this.probe) throw new Error('Gaming Mode is unavailable until the keyboard responds.');
        const enabled = await this.dependencies.transport.setGamingMode(this.path, change.enabled);
        this.probe = { ...this.probe, gamingMode: enabled };
        this.probeUpdatedAt = this.dependencies.now();
        return confirmedControl({ type: 'keyboard-gaming-mode', enabled });
      }
      if (change.type === 'keyboard-onboard-profile') {
        if (!this.probe) throw new Error('Onboard profiles are unavailable until the keyboard responds.');
        const profileId = Number.parseInt(change.profileId, 10);
        if (!this.probe.onboardProfileIds?.includes(profileId)) throw new Error('That onboard profile is not present on this keyboard.');
        const confirmed = await this.dependencies.transport.setActiveOnboardProfile(this.path, profileId);
        this.probe = { ...this.probe, activeOnboardProfileId: confirmed };
        this.probeUpdatedAt = this.dependencies.now();
        return confirmedControl({ type: 'keyboard-onboard-profile', profileId: String(confirmed) });
      }
      throw new Error(`${device.displayName} does not support the requested device control.`);
      });
      this.lastControlError = undefined;
      return result;
    } catch (error) {
      this.lastControlError = errorMessage(error, 'Unknown Razer control failure.');
      throw new Error(controlFailureMessage(change));
    }
  }

  public deactivate(): void {
    this.release();
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    this.release();
    await this.operationQueue;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private applyLightingReadback(state: { effectId: HuntsmanLightingEffectId; color?: string }): void {
    this.settings.lightingEnabled = state.effectId !== 'off';
    if (state.effectId !== 'off') this.settings.lightingEffect = state.effectId;
    if (state.color) this.settings.lightingColor = state.color.toLowerCase();
    if (this.probe) this.probe = { ...this.probe, lightingState: state };
    this.probeUpdatedAt = this.dependencies.now();
  }

  private release(): void {
    this.path = null;
    this.deviceId = null;
    this.probe = null;
    this.probeUpdatedAt = 0;
    this.effectAcknowledged = false;
    this.lastControlError = undefined;
  }
}

function confirmedControl(change: DeviceControlChange): DeviceControlResult {
  return { confirmedChanges: [change] };
}

function findControlEndpoint(descriptors: HidDevice[]): HidDevice | undefined {
  return descriptors.find((descriptor) => (
    descriptor.interface === 3
    && descriptor.usagePage === 0x0c
    && descriptor.usage === 0x01
    && Boolean(descriptor.path)
  ));
}

function normalizeSettings(settings?: Record<string, DeviceSettingValue>): HuntsmanSettings {
  return {
    lightingEnabled: typeof settings?.lightingEnabled === 'boolean' ? settings.lightingEnabled : true,
    lightingBrightness: numberSetting(settings?.lightingBrightness, 100),
    lightingEffect: isHuntsmanLightingEffect(settings?.lightingEffect) && settings.lightingEffect !== 'off'
      ? settings.lightingEffect
      : 'spectrum',
    lightingColor: typeof settings?.lightingColor === 'string' && /^#[0-9a-f]{6}$/i.test(settings.lightingColor)
      ? settings.lightingColor.toLowerCase()
      : '#44aaff',
  };
}

function serializeSettings(settings: HuntsmanSettings): Record<string, DeviceSettingValue> {
  return { ...settings };
}

function numberSetting(value: DeviceSettingValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : fallback;
}

function effectUsesColor(effectId: HuntsmanLightingEffectId): boolean {
  return ['static', 'breathing', 'reactive', 'starlight'].includes(effectId);
}

function supportedLightingEffects(effectCodes?: number[]): LightingEffect[] {
  if (!effectCodes) return huntsmanLightingEffects.map((effect) => ({ ...effect }));
  const codeByEffect: Partial<Record<HuntsmanLightingEffectId, number>> = {
    static: 0x01,
    breathing: 0x02,
    spectrum: 0x03,
    'wave-left': 0x04,
    'wave-right': 0x04,
    reactive: 0x05,
    starlight: 0x07,
  };
  return huntsmanLightingEffects
    .filter((effect) => effectCodes.includes(codeByEffect[effect.id as HuntsmanLightingEffectId] ?? -1))
    .map((effect) => ({ ...effect }));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const huntsmanDiagnosticReads = [
  'firmware',
  'serial-number',
  'brightness',
  'lighting-effect',
  'lighting-effects',
  'gaming-mode',
  'onboard-profiles',
  'active-profile',
] as const;

function keyboardDiagnostics(
  probe: HuntsmanProbe | null,
  unavailableReason: string | undefined,
  updatedAt: number,
  lastControlError?: string,
) {
  const failures = probe?.readFailures ?? {};
  return {
    protocol: 'Razer feature reports',
    endpoint: !probe ? 'unavailable' as const : Object.keys(failures).length ? 'partial' as const : 'ready' as const,
    ...(updatedAt > 0 ? { lastSyncAt: new Date(updatedAt).toISOString() } : {}),
    ...(lastControlError ? { lastControlError } : {}),
    reads: huntsmanDiagnosticReads.map((id) => ({
      id,
      ok: Boolean(probe) && !failures[id],
      ...(failures[id] ? { error: failures[id] } : unavailableReason ? { error: unavailableReason } : {}),
    })),
  };
}

function controlFailureMessage(change: DeviceControlChange): string {
  if (change.type.startsWith('lighting-')) {
    return 'Keyboard lighting could not be updated. Reconnect the keyboard and try again.';
  }
  return 'The keyboard setting could not be updated. Reconnect the keyboard and try again.';
}
