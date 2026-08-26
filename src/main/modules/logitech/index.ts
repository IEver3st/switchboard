import type { Device as HidDevice } from 'node-hid';
import type {
  BatteryCapability,
  Device,
  DeviceCapabilities,
  DeviceIdentity,
  DeviceControlChange,
} from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';
import { readG502Capabilities, writeG502Control } from './devices/g502-x-plus/agent';
import { g502XPlusDefinition, resolveG502XPlusVariant } from './devices/g502-x-plus/definition';
import {
  readLogitechAgentDevices,
  readLogitechBattery,
  type LogitechAgentDevice,
} from './ghub-metadata';

const logitechVendorId = 0x046d;
const capabilityCacheDurationMs = 12_000;
const batteryCacheDurationMs = 60_000;

interface TimedValue<T> {
  value: T;
  updatedAt: number;
}

export class LogitechDeviceModule implements DeviceModule {
  public readonly id = 'device.logitech-hidpp';
  private readonly agentIds = new Map<string, string>();
  private readonly capabilityCache = new Map<string, TimedValue<DeviceCapabilities>>();
  private readonly batteryCache = new Map<string, TimedValue<BatteryCapability | undefined>>();

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    const logitechHid = context.hidDevices.filter((device) => device.vendorId === logitechVendorId);
    if (logitechHid.length === 0) return [];

    const agentDevices = await readLogitechAgentDevices();
    const discovered = await Promise.all(agentDevices
      .filter((device) => device.deviceBaseModel === g502XPlusDefinition.deviceBaseModel)
      .map((device) => this.createG502XPlus(device, logitechHid, context)));
    if (discovered.length > 0) return discovered;

    const receiver = logitechHid.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId as 0xc547));
    const wired = logitechHid.find((device) => device.productId === g502XPlusDefinition.wiredProductId);
    const transport = wired ?? receiver;
    return transport ? [this.createG502XPlusFallback(transport, context)] : [];
  }

  public async setControl(device: Device, change: DeviceControlChange): Promise<void> {
    if (!device.connected) throw new Error(`${device.displayName} is disconnected.`);
    const agentDeviceId = this.agentIds.get(device.id);
    if (!agentDeviceId) throw new Error('Logitech configuration requires the local G HUB device service.');
    await writeG502Control(agentDeviceId, device, change);
    for (const key of this.capabilityCache.keys()) {
      if (key.startsWith(`${agentDeviceId}:`)) this.capabilityCache.delete(key);
    }
  }

  private async createG502XPlus(
    metadata: LogitechAgentDevice,
    hidDevices: HidDevice[],
    context: DeviceDiscoveryContext,
  ): Promise<Device> {
    const activeInterface = metadata.activeInterfaces.find((entry) => entry.type === 'DEVIO')
      ?? metadata.activeInterfaces[0];
    const stableUnitId = activeInterface?.serialNumber || metadata.deviceUnitId;
    const id = `logitech:${stableUnitId || metadata.pid.toString(16).padStart(4, '0')}`;
    const transportProductId = findTransportProductId(activeInterface?.path, hidDevices);
    const hardwareRevision = activeInterface?.firmwareVersion
      || (activeInterface?.hardwareRevision !== undefined ? String(activeInterface.hardwareRevision) : undefined);
    const identity: DeviceIdentity = {
      manufacturer: g502XPlusDefinition.manufacturer,
      productFamily: g502XPlusDefinition.productFamily,
      model: g502XPlusDefinition.model,
      connection: metadata.connectionType === 'WIRELESS' ? 'wireless' : 'usb',
      connectionLabel: metadata.displayConnectionType || (metadata.connectionType === 'WIRELESS' ? 'LIGHTSPEED' : 'USB'),
      hardwareRevision,
      vendorId: logitechVendorId,
      productId: activeInterface?.pid || metadata.pid,
      transportProductId,
      serialNumber: stableUnitId,
      productString: metadata.displayName,
    };
    const resolved = resolveDeviceVariant(
      identity,
      resolveG502XPlusVariant(activeInterface?.extendedModel ?? metadata.deviceExt),
      context.appearanceOverrides[id],
    );
    const previous = findPreviousDevice(context.previousDevices, id, g502XPlusDefinition.model);
    this.agentIds.set(id, metadata.id);

    const [capabilities, battery] = await Promise.all([
      this.readCapabilities(metadata.id, previous, identity.connection),
      this.readBattery(metadata.id, previous?.capabilities.battery),
    ]);

    return {
      id,
      moduleId: this.id,
      displayName: g502XPlusDefinition.model,
      kind: 'mouse',
      connected: true,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'mouse'),
      capabilities: { ...capabilities, battery },
      settings: previous?.settings ?? {},
    };
  }

  private createG502XPlusFallback(transport: HidDevice, context: DeviceDiscoveryContext): Device {
    const wireless = g502XPlusDefinition.receiverProductIds.includes(transport.productId as 0xc547);
    const id = `logitech:${wireless ? `receiver-${transport.productId.toString(16)}` : `wired-${transport.productId.toString(16)}`}`;
    const identity: DeviceIdentity = {
      manufacturer: g502XPlusDefinition.manufacturer,
      productFamily: g502XPlusDefinition.productFamily,
      model: g502XPlusDefinition.model,
      connection: wireless ? 'wireless' : 'usb',
      connectionLabel: wireless ? 'LIGHTSPEED' : 'USB',
      hardwareRevision: transport.release ? transport.release.toString(16).padStart(4, '0').toUpperCase() : undefined,
      vendorId: logitechVendorId,
      productId: wireless ? g502XPlusDefinition.wirelessProductId : transport.productId,
      transportProductId: transport.productId,
      productString: transport.product,
    };
    const resolved = resolveDeviceVariant(identity, [], context.appearanceOverrides[id]);
    const previous = findPreviousDevice(context.previousDevices, id, g502XPlusDefinition.model);
    return {
      id,
      moduleId: this.id,
      displayName: g502XPlusDefinition.model,
      kind: 'mouse',
      connected: true,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'mouse'),
      capabilities: disableControls(previous?.capabilities),
      settings: previous?.settings ?? {},
    };
  }

  private async readCapabilities(
    agentDeviceId: string,
    previous: Device | undefined,
    connection: DeviceIdentity['connection'],
  ): Promise<DeviceCapabilities> {
    const cacheKey = `${agentDeviceId}:${connection ?? 'unknown'}`;
    const cached = this.capabilityCache.get(cacheKey);
    if (cached && Date.now() - cached.updatedAt < capabilityCacheDurationMs) return structuredClone(cached.value);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const value = await readG502Capabilities(agentDeviceId, previous, connection);
        this.capabilityCache.set(cacheKey, { value, updatedAt: Date.now() });
        return structuredClone(value);
      } catch (error) {
        if (attempt < 2 && isTransientAgentError(error)) {
          await delay(250 * (attempt + 1));
          continue;
        }
        console.warn('Logitech controls are temporarily unavailable.', error);
        return disableControls(previous?.capabilities);
      }
    }
    return disableControls(previous?.capabilities);
  }

  private async readBattery(
    agentDeviceId: string,
    previous: BatteryCapability | undefined,
  ): Promise<BatteryCapability | undefined> {
    const cached = this.batteryCache.get(agentDeviceId);
    if (cached && Date.now() - cached.updatedAt < batteryCacheDurationMs) return structuredClone(cached.value);
    const state = await readLogitechBattery(agentDeviceId);
    const updatedAt = Date.now();
    const value = typeof state?.percentage === 'number'
      ? {
          percentage: state.percentage,
          charging: state.charging,
          fullyCharged: state.fullyCharged,
          estimatedMinutesRemaining: state.batteryMileageSupport === 'MILEAGE_SUPPORTED' && typeof state.mileage === 'number'
            ? Math.round(state.mileage * 60)
            : undefined,
          updatedAt,
        }
      : previous;
    this.batteryCache.set(agentDeviceId, { value, updatedAt });
    return structuredClone(value);
  }
}

function disableControls(previous: DeviceCapabilities | undefined): DeviceCapabilities {
  if (!previous) return {};
  const reason = 'Configuration is unavailable while the local Logitech device service is not responding.';
  const next = structuredClone(previous);
  if (next.dpi) Object.assign(next.dpi, { writable: false, unavailableReason: reason });
  if (next.reportRate) Object.assign(next.reportRate, { writable: false, unavailableReason: reason });
  if (next.buttonAssignments) Object.assign(next.buttonAssignments, { writable: false, unavailableReason: reason });
  if (next.lighting) Object.assign(next.lighting, {
    writable: false,
    colorWritable: false,
    brightnessWritable: false,
    unavailableReason: reason,
  });
  if (next.onboardMemory) next.onboardMemory.writable = false;
  return next;
}

function findTransportProductId(path: string | undefined, hidDevices: HidDevice[]): number | undefined {
  const pathProductId = path?.match(/pid_([0-9a-f]{4})/i)?.[1];
  if (pathProductId) return Number.parseInt(pathProductId, 16);
  return hidDevices.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId as 0xc547))?.productId;
}

function findPreviousDevice(previous: Device[], id: string, model: string): Device | undefined {
  return previous.find((device) => device.id === id)
    ?? previous.find((device) => device.moduleId === 'device.logitech-hidpp' && device.identity.model === model);
}

function isTransientAgentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('message path')
    || message.includes('invalid device')
    || message.includes('timed out')
    || message.includes('socket closed');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
