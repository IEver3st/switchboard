import type { Device as HidDevice } from 'node-hid';
import type {
  BatteryCapability,
  Device,
  DeviceCapabilities,
  DeviceIdentity,
  DeviceControlChange,
} from '../../../shared/contracts';
import { resolveDeviceVariant, type DeviceVariantCandidate } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';
import { readG502Capabilities, writeG502Control } from './devices/g502-x-plus/agent';
import { withG502BatteryEstimate } from './devices/g502-x-plus/battery-estimate';
import { g502XPlusDefinition, resolveG502XPlusVariant } from './devices/g502-x-plus/definition';
import { G502NativeSession, type G502DirectSession } from './devices/g502-x-plus/sniper-dpi';
import {
  readLogitechAgentDevices,
  readLogitechBattery,
  type LogitechAgentDevice,
  type LogitechBatteryState,
} from './ghub-metadata';

const logitechVendorId = 0x046d;
const directSessionRetryDelayMs = 30_000;
export interface LogitechDeviceModuleDependencies {
  readAgentDevices(): Promise<LogitechAgentDevice[]>;
  readBattery(deviceId: string): Promise<LogitechBatteryState | undefined>;
  readCapabilities: typeof readG502Capabilities;
  writeControl: typeof writeG502Control;
  openDirectSession?(endpoint: HidDevice, previous: DeviceCapabilities | undefined): Promise<G502DirectSession>;
}

const defaultDependencies: LogitechDeviceModuleDependencies = {
  readAgentDevices: readLogitechAgentDevices,
  readBattery: readLogitechBattery,
  readCapabilities: readG502Capabilities,
  writeControl: writeG502Control,
  openDirectSession: G502NativeSession.open,
};

export class LogitechDeviceModule implements DeviceModule {
  public readonly id = 'device.logitech-hidpp';
  private readonly agentIds = new Map<string, string>();
  private directSession: G502DirectSession | null = null;
  private directPath: string | null = null;
  private directDeviceId: string | null = null;
  private failedDirectPath: string | null = null;
  private directRetryAfter = 0;

  public constructor(private readonly dependencies: LogitechDeviceModuleDependencies = defaultDependencies) {}

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    const logitechHid = context.hidDevices.filter((device) => device.vendorId === logitechVendorId);
    this.agentIds.clear();
    if (logitechHid.length === 0) {
      this.clearDirectRetry();
      await this.stopDirectSession();
      return [];
    }

    const agentDevices = await this.dependencies.readAgentDevices();
    const matchingAgentDevices = agentDevices
      .filter((device) => device.deviceBaseModel === g502XPlusDefinition.deviceBaseModel);
    const receiver = logitechHid.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId as 0xc547));
    const wired = logitechHid.find((device) => device.productId === g502XPlusDefinition.wiredProductId);
    const transport = wired ?? receiver;
    const directEndpoint = findLongHidppEndpoint(logitechHid, transport?.productId);
    if (this.failedDirectPath && directEndpoint?.path !== this.failedDirectPath) this.clearDirectRetry();
    if (matchingAgentDevices.length > 0) {
      return Promise.all(matchingAgentDevices.map((device) => (
        this.createG502XPlus(device, logitechHid, directEndpoint, context)
      )));
    }

    return transport ? [await this.createG502XPlusFallback(transport, directEndpoint, context)] : [];
  }

  public async setControl(device: Device, change: DeviceControlChange): Promise<void> {
    if (!device.connected) throw new Error(`${device.displayName} is disconnected.`);
    if (this.directSession && device.id === this.directDeviceId) {
      await this.directSession.setControl(change);
      return;
    }
    const agentDeviceId = this.agentIds.get(device.id);
    if (!agentDeviceId) throw new Error('Logitech configuration requires the local G HUB device service.');
    await this.dependencies.writeControl(agentDeviceId, device, change);
  }

  public deactivate(): Promise<void> {
    this.clearDirectRetry();
    return this.stopDirectSession();
  }

  public dispose(): Promise<void> {
    this.clearDirectRetry();
    return this.stopDirectSession();
  }

  private async createG502XPlus(
    metadata: LogitechAgentDevice,
    hidDevices: HidDevice[],
    directEndpoint: HidDevice | undefined,
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
    let capabilities: DeviceCapabilities;
    if (directEndpoint?.path) {
      capabilities = await this.readDirectCapabilities(directEndpoint, previous, id);
      capabilities.battery = withG502BatteryEstimate(capabilities.battery, capabilities.lighting?.enabled);
    } else {
      await this.stopDirectSession();
      this.agentIds.set(id, metadata.id);
      const [agentCapabilities, batteryReading] = await Promise.all([
        this.readCapabilities(metadata.id, previous, identity.connection),
        this.readBattery(metadata.id, previous?.capabilities.battery),
      ]);
      capabilities = {
        ...agentCapabilities,
        battery: withG502BatteryEstimate(batteryReading, agentCapabilities.lighting?.enabled),
      };
    }

    return {
      id,
      moduleId: this.id,
      displayName: g502XPlusDefinition.model,
      kind: 'mouse',
      connected: true,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'mouse'),
      capabilities,
      settings: withoutLegacyMouseSettings(previous?.settings),
    };
  }

  private async createG502XPlusFallback(
    transport: HidDevice,
    directEndpoint: HidDevice | undefined,
    context: DeviceDiscoveryContext,
  ): Promise<Device> {
    const wireless = g502XPlusDefinition.receiverProductIds.includes(transport.productId as 0xc547);
    const id = `logitech:${wireless ? `receiver-${transport.productId.toString(16)}` : `wired-${transport.productId.toString(16)}`}`;
    const previous = findPreviousDevice(context.previousDevices, id, g502XPlusDefinition.model);
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
    const previousOverride = previous?.variantResolution.confidence === 'user-override'
      && previous.identity.variant && previous.identity.variant !== 'default'
      ? { variant: previous.identity.variant, colorway: previous.identity.colorway }
      : undefined;
    const resolved = resolveDeviceVariant(
      identity,
      previousVariantCandidates(previous),
      context.appearanceOverrides[id]
        ?? (previous ? context.appearanceOverrides[previous.id] : undefined)
        ?? previousOverride,
    );
    // Direct HID++ replaces the G HUB control backend. A successful session
    // reports only capabilities proven by the mouse; a failed open keeps the
    // last known controls visible but disabled with an ownership hint.
    let capabilities: DeviceCapabilities = {};
    if (directEndpoint?.path) {
      capabilities = await this.readDirectCapabilities(directEndpoint, previous, id);
    } else {
      capabilities = disableControls(
        previous?.capabilities,
        'The Logitech HID++ control interface is unavailable. Reconnect the mouse or receiver.',
      );
      delete capabilities.battery;
      await this.stopDirectSession();
    }
    return {
      id,
      moduleId: this.id,
      displayName: g502XPlusDefinition.model,
      kind: 'mouse',
      connected: true,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'mouse'),
      capabilities,
      settings: withoutLegacyMouseSettings(previous?.settings),
    };
  }

  private async ensureDirectSession(
    endpoint: HidDevice,
    previous: Device | undefined,
  ): Promise<G502DirectSession> {
    if (this.directSession && !this.directSession.isClosed && this.directPath === endpoint.path) {
      return this.directSession;
    }
    await this.stopDirectSession();
    const openDirectSession = this.dependencies.openDirectSession ?? G502NativeSession.open;
    const session = await openDirectSession(endpoint, previous?.capabilities);
    this.directSession = session;
    this.directPath = endpoint.path ?? null;
    return session;
  }

  private async readDirectCapabilities(
    endpoint: HidDevice,
    previous: Device | undefined,
    deviceId: string,
  ): Promise<DeviceCapabilities> {
    if (
      endpoint.path
      && endpoint.path === this.failedDirectPath
      && Date.now() < this.directRetryAfter
    ) {
      return unavailableDirectCapabilities(previous);
    }
    try {
      const session = await this.ensureDirectSession(endpoint, previous);
      const capabilities = await session.getCapabilities();
      this.directDeviceId = deviceId;
      this.clearDirectRetry();
      return capabilities;
    } catch (error) {
      console.warn('Native G502 X Plus controls are temporarily unavailable.', error);
      this.failedDirectPath = endpoint.path ?? null;
      this.directRetryAfter = Date.now() + directSessionRetryDelayMs;
      const capabilities = unavailableDirectCapabilities(previous);
      await this.stopDirectSession();
      return capabilities;
    }
  }

  private async stopDirectSession(): Promise<void> {
    const session = this.directSession;
    this.directSession = null;
    this.directPath = null;
    this.directDeviceId = null;
    if (session) await session.close();
  }

  private clearDirectRetry(): void {
    this.failedDirectPath = null;
    this.directRetryAfter = 0;
  }

  private async readCapabilities(
    agentDeviceId: string,
    previous: Device | undefined,
    connection: DeviceIdentity['connection'],
  ): Promise<DeviceCapabilities> {
    // Discovery already runs on the registry's five-second cycle. Reread the
    // active profile so G HUB or an onboard profile switch cannot leave stale
    // DPI, assignments, or lighting in the canonical device snapshot.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const value = await this.dependencies.readCapabilities(agentDeviceId, connection);
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
    // Charging is a user-visible cable transition, so read it on every existing
    // five-second discovery cycle instead of serving the former minute-old cache.
    const state = await this.dependencies.readBattery(agentDeviceId);
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
    return structuredClone(value);
  }
}

function unavailableDirectCapabilities(previous: Device | undefined): DeviceCapabilities {
  const capabilities = disableControls(
    previous?.capabilities,
    'Native control is unavailable. Close G HUB, OpenLogi, or another app using the Logitech receiver, then reconnect the mouse.',
  );
  delete capabilities.battery;
  return capabilities;
}

function disableControls(
  previous: DeviceCapabilities | undefined,
  reason = 'Configuration is unavailable while the local Logitech device service is not responding.',
): DeviceCapabilities {
  if (!previous) return {};
  const next = structuredClone(previous);
  if (next.dpi) Object.assign(next.dpi, { writable: false, unavailableReason: reason });
  if (next.reportRate) Object.assign(next.reportRate, { writable: false, unavailableReason: reason });
  if (next.buttonAssignments) Object.assign(next.buttonAssignments, { writable: false, unavailableReason: reason });
  if (next.lighting) Object.assign(next.lighting, {
    writable: false,
    colorWritable: false,
    brightnessWritable: false,
    speedWritable: false,
    directionWritable: false,
    zones: next.lighting.zones?.map((zone) => ({ ...zone, colorWritable: false })),
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

function findLongHidppEndpoint(hidDevices: HidDevice[], productId: number | undefined): HidDevice | undefined {
  if (productId === undefined) return undefined;
  return hidDevices.find((device) => (
    device.productId === productId
    && device.usagePage === 0xff00
    && device.usage === 2
    && Boolean(device.path)
  ));
}

function findPreviousDevice(previous: Device[], id: string, model: string): Device | undefined {
  return previous.find((device) => device.id === id)
    ?? previous.find((device) => device.moduleId === 'device.logitech-hidpp' && device.identity.model === model);
}

function previousVariantCandidates(previous: Device | undefined): DeviceVariantCandidate[] {
  if (!previous || previous.identity.variant === undefined || previous.identity.variant === 'default') return [];
  const { confidence } = previous.variantResolution;
  if (confidence !== 'hardware' && confidence !== 'product-id' && confidence !== 'module-metadata') return [];
  return [{
    variant: previous.identity.variant,
    colorway: previous.identity.colorway,
    confidence,
    source: `Previously observed ${previous.variantResolution.source.replace(/^(?:Previously observed )+/, '')}`,
    evidence: previous.variantResolution.evidence,
  }];
}

const legacyMouseSettingKeys = new Set([
  'activeDpi',
  'dpiStages',
  'lightingColor',
  'lightingEnabled',
  'onboardMemory',
  'pollingRate',
]);

function withoutLegacyMouseSettings(settings: Device['settings'] | undefined): Device['settings'] {
  return Object.fromEntries(
    Object.entries(settings ?? {}).filter(([key]) => !legacyMouseSettingKeys.has(key)),
  );
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
