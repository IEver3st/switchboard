import type { Device as HidDevice } from 'node-hid';
import type { Device, DeviceIdentity, DeviceSettingValue } from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';
import { g502XPlusControlBindings, g502XPlusDefinition, resolveG502XPlusVariant } from './devices/g502-x-plus/definition';
import { readLogitechAgentDevices, type LogitechAgentDevice } from './ghub-metadata';

const logitechVendorId = 0x046d;

export class LogitechDeviceModule implements DeviceModule {
  public readonly id = 'device.logitech-hidpp';

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    const logitechHid = context.hidDevices.filter((device) => device.vendorId === logitechVendorId);
    if (logitechHid.length === 0) return [];

    const agentDevices = await readLogitechAgentDevices();
    const discovered = agentDevices
      .filter((device) => device.deviceBaseModel === 'g502x_plus')
      .map((device) => this.createG502XPlus(device, logitechHid, context));
    if (discovered.length > 0) return discovered;

    const receiver = logitechHid.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId as 0xc547));
    const wired = logitechHid.find((device) => device.productId === g502XPlusDefinition.wiredProductId);
    const transport = wired ?? receiver;
    return transport ? [this.createG502XPlusFallback(transport, context)] : [];
  }

  private createG502XPlus(
    metadata: LogitechAgentDevice,
    hidDevices: HidDevice[],
    context: DeviceDiscoveryContext,
  ): Device {
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

    return {
      id,
      moduleId: this.id,
      displayName: g502XPlusDefinition.model,
      kind: 'mouse',
      connected: true,
      batteryPercent: metadata.batteryPercent,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'mouse'),
      capabilities: [...g502XPlusDefinition.capabilities],
      controlBindings: previous?.controlBindings ?? structuredClone(g502XPlusControlBindings),
      settings: previous?.settings ?? {
        ...defaultG502Settings,
      },
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
      capabilities: [...g502XPlusDefinition.capabilities],
      controlBindings: previous?.controlBindings ?? structuredClone(g502XPlusControlBindings),
      settings: previous?.settings ?? { ...defaultG502Settings },
    };
  }
}

const defaultG502Settings: Record<string, DeviceSettingValue> = {
  dpiStages: [800, 1600, 3200],
  activeDpi: 1600,
  pollingRate: 1000,
  onboardMemory: true,
  lightingEnabled: false,
  lightingColor: '#ff658a',
};

function findTransportProductId(path: string | undefined, hidDevices: HidDevice[]): number | undefined {
  const pathProductId = path?.match(/pid_([0-9a-f]{4})/i)?.[1];
  if (pathProductId) return Number.parseInt(pathProductId, 16);
  return hidDevices.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId as 0xc547))?.productId;
}

function findPreviousDevice(previous: Device[], id: string, model: string): Device | undefined {
  return previous.find((device) => device.id === id)
    ?? previous.find((device) => device.moduleId === 'device.logitech-hidpp' && device.identity.model === model);
}
