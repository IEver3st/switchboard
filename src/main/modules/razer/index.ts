import type { Device as HidDevice } from 'node-hid';
import type {
  Device,
  DeviceControlChange,
  DeviceSettingValue,
  KeyboardFeature,
  LightingEffect,
} from '../../../shared/contracts';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';
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

export const huntsmanLightingEffects: readonly LightingEffect[] = [
  { id: 'static', label: 'Static' },
  { id: 'breathing', label: 'Breathing' },
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'reactive', label: 'Reactive' },
  { id: 'starlight', label: 'Starlight' },
  { id: 'wave-left', label: 'Wave left' },
  { id: 'wave-right', label: 'Wave right' },
  { id: 'wheel-left', label: 'Wheel left' },
  { id: 'wheel-right', label: 'Wheel right' },
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
    label: 'Key mapping and profiles',
    summary: 'Remapping, macros, Hypershift, Gaming Mode, and profile switching are supported by Synapse.',
    status: 'synapse',
    unavailableReason: 'Switchboard does not write undocumented key maps or macro payloads.',
  },
  {
    id: 'rapid-input',
    label: 'Rapid Trigger and Snap Tap',
    summary: 'Both panels appear for this model in the supplied current Synapse interface.',
    status: 'observed',
    unavailableReason: 'Availability was observed in Synapse, but the device command path has not been independently verified.',
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
  setEffect(path: string, effectId: HuntsmanLightingEffectId, color: string): Promise<void>;
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
  private operationQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(private readonly dependencies: HuntsmanModuleDependencies = defaultDependencies) {}

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
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
    const writable = Boolean(this.path && this.probe && !unavailableReason);
    const brightness = this.probe?.brightness ?? this.settings.lightingBrightness;
    this.settings.lightingBrightness = brightness;

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
          transport: writable ? 'native-hid' : 'unavailable',
          features: huntsmanKeyboardFeatures.map((feature) => ({ ...feature })),
        },
        lighting: {
          writable,
          enabled: this.settings.lightingEnabled,
          activeEffectId: this.settings.lightingEffect,
          availableEffects: huntsmanLightingEffects.map((effect) => ({ ...effect })),
          color: this.settings.lightingColor,
          colorWritable: true,
          brightness,
          brightnessWritable: writable,
          speedWritable: false,
          profiles: [],
          muteLinked: false,
          muteLinkedWritable: false,
          state: this.effectAcknowledged ? 'acknowledged' : 'unknown',
          stateReason: this.effectAcknowledged
            ? 'The keyboard acknowledged the last effect command; this protocol has no effect-state readback.'
            : (unavailableReason ?? 'Brightness is read back from hardware; the active quick effect cannot be queried.'),
          physicalEffectVerified: false,
          profileMode: 'software',
          source: 'firmware',
          ...(unavailableReason ? { unavailableReason } : {}),
        },
      },
      settings: serializeSettings(this.settings),
    }];
  }

  public setControl(device: Device, change: DeviceControlChange): Promise<void> {
    return this.enqueue(async () => {
      if (!device.connected || device.id !== this.deviceId || !this.path) throw new Error(`${device.displayName} native controls are unavailable.`);
      if (change.type === 'lighting-brightness') {
        const confirmed = await this.dependencies.transport.setBrightness(this.path, change.brightness);
        this.settings.lightingBrightness = confirmed;
        if (this.probe) this.probe = { ...this.probe, brightness: confirmed };
        this.probeUpdatedAt = this.dependencies.now();
        return;
      }
      if (change.type === 'lighting-enabled') {
        await this.dependencies.transport.setEffect(
          this.path,
          change.enabled ? this.settings.lightingEffect : 'off',
          this.settings.lightingColor,
        );
        this.settings.lightingEnabled = change.enabled;
        this.effectAcknowledged = true;
        return;
      }
      if (change.type === 'lighting-effect') {
        if (!isHuntsmanLightingEffect(change.effectId) || change.effectId === 'off') throw new Error('That quick effect is not supported by this keyboard module.');
        if (!this.settings.lightingEnabled) throw new Error('Turn keyboard lighting on before changing the quick effect.');
        await this.dependencies.transport.setEffect(this.path, change.effectId, this.settings.lightingColor);
        this.settings.lightingEffect = change.effectId;
        this.effectAcknowledged = true;
        return;
      }
      if (change.type === 'lighting-color') {
        if (!this.settings.lightingEnabled || !effectUsesColor(this.settings.lightingEffect)) {
          throw new Error('The selected quick effect does not use a custom color.');
        }
        await this.dependencies.transport.setEffect(this.path, this.settings.lightingEffect, change.color);
        this.settings.lightingColor = change.color.toLowerCase();
        this.effectAcknowledged = true;
        return;
      }
      throw new Error(`${device.displayName} does not support the requested device control.`);
    });
  }

  public deactivate(): void {
    this.release();
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    this.release();
    await this.operationQueue;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private release(): void {
    this.path = null;
    this.deviceId = null;
    this.probe = null;
    this.probeUpdatedAt = 0;
    this.effectAcknowledged = false;
  }
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
