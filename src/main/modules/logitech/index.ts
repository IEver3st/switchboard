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
import { g502XPlusDefinition, resolveG502XPlusVariant } from './devices/g502-x-plus/definition';
import { G502SniperDpiSession } from './devices/g502-x-plus/sniper-dpi';
import {
  readLogitechAgentDevices,
  readLogitechBattery,
  type LogitechAgentDevice,
  type LogitechBatteryState,
} from './ghub-metadata';

const logitechVendorId = 0x046d;
const capabilityCacheDurationMs = 12_000;

interface TimedValue<T> {
  value: T;
  updatedAt: number;
}

export interface LogitechDeviceModuleDependencies {
  readAgentDevices(): Promise<LogitechAgentDevice[]>;
  readBattery(deviceId: string): Promise<LogitechBatteryState | undefined>;
  readCapabilities: typeof readG502Capabilities;
  writeControl: typeof writeG502Control;
}

const defaultDependencies: LogitechDeviceModuleDependencies = {
  readAgentDevices: readLogitechAgentDevices,
  readBattery: readLogitechBattery,
  readCapabilities: readG502Capabilities,
  writeControl: writeG502Control,
};

export class LogitechDeviceModule implements DeviceModule {
  public readonly id = 'device.logitech-hidpp';
  private readonly agentIds = new Map<string, string>();
  private readonly capabilityCache = new Map<string, TimedValue<DeviceCapabilities>>();
  private directDpiSession: G502SniperDpiSession | null = null;
  private directDpiPath: string | null = null;
  private directDeviceId: string | null = null;

  public constructor(private readonly dependencies: LogitechDeviceModuleDependencies = defaultDependencies) {}

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    const logitechHid = context.hidDevices.filter((device) => device.vendorId === logitechVendorId);
    this.agentIds.clear();
    if (logitechHid.length === 0) {
      await this.stopDirectDpiSession();
      return [];
    }

    const agentDevices = await this.dependencies.readAgentDevices();
    const matchingAgentDevices = agentDevices
      .filter((device) => device.deviceBaseModel === g502XPlusDefinition.deviceBaseModel);
    if (matchingAgentDevices.length > 0) {
      await this.stopDirectDpiSession();
      return Promise.all(matchingAgentDevices.map((device) => this.createG502XPlus(device, logitechHid, context)));
    }

    const receiver = logitechHid.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId as 0xc547));
    const wired = logitechHid.find((device) => device.productId === g502XPlusDefinition.wiredProductId);
    const transport = wired ?? receiver;
    const directEndpoint = findLongHidppEndpoint(logitechHid, transport?.productId);
    return transport ? [await this.createG502XPlusFallback(transport, directEndpoint, context)] : [];
  }

  public async setControl(device: Device, change: DeviceControlChange): Promise<void> {
    if (!device.connected) throw new Error(`${device.displayName} is disconnected.`);
    if (this.directDpiSession && device.id === this.directDeviceId) {
      if (change.type === 'dpi') {
        await this.directDpiSession.setBaseDpi(change.value);
        return;
      }
      if (change.type === 'dpi-shift') {
        await this.directDpiSession.setShiftDpi(change.value);
        return;
      }
      if (change.type === 'dpi-stages') {
        this.directDpiSession.setStages(change.stages);
        return;
      }
      if (change.type === 'report-rate') {
        throw new Error('Switchboard can read the live polling rate, but this mouse rejected direct polling-rate writes.');
      }
      throw new Error('This control still requires the local Logitech device service. Live DPI, hold-to-shift, polling-rate status, and battery remain available.');
    }
    const agentDeviceId = this.agentIds.get(device.id);
    if (!agentDeviceId) throw new Error('Logitech configuration requires the local G HUB device service.');
    await this.dependencies.writeControl(agentDeviceId, device, change);
    for (const key of this.capabilityCache.keys()) {
      if (key.startsWith(`${agentDeviceId}:`)) this.capabilityCache.delete(key);
    }
  }

  public deactivate(): Promise<void> {
    return this.stopDirectDpiSession();
  }

  public dispose(): Promise<void> {
    return this.stopDirectDpiSession();
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
    let capabilities = disableControls(previous?.capabilities);
    delete capabilities.battery;
    delete capabilities.reportRate;
    if (directEndpoint?.path) {
      try {
        const session = await this.ensureDirectDpiSession(directEndpoint, previous);
        capabilities = { ...capabilities, dpi: await session.getCapability() };
        try {
          const reportRate = await session.getReportRateCapability();
          if (reportRate) capabilities.reportRate = reportRate;
        } catch (error) {
          console.warn('Direct G502 X Plus polling rate is temporarily unavailable.', error);
        }
        try {
          const battery = await session.getBatteryCapability();
          if (battery) capabilities.battery = battery;
        } catch (error) {
          console.warn('Direct G502 X Plus battery state is temporarily unavailable.', error);
        }
        this.directDeviceId = id;
      } catch (error) {
        console.warn('Direct G502 X Plus DPI Shift is temporarily unavailable.', error);
        await this.stopDirectDpiSession();
      }
    } else {
      await this.stopDirectDpiSession();
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

  private async ensureDirectDpiSession(
    endpoint: HidDevice,
    previous: Device | undefined,
  ): Promise<G502SniperDpiSession> {
    if (this.directDpiSession && !this.directDpiSession.isClosed && this.directDpiPath === endpoint.path) {
      return this.directDpiSession;
    }
    await this.stopDirectDpiSession();
    const session = await G502SniperDpiSession.open(endpoint, previous?.capabilities.dpi);
    this.directDpiSession = session;
    this.directDpiPath = endpoint.path ?? null;
    return session;
  }

  private async stopDirectDpiSession(): Promise<void> {
    const session = this.directDpiSession;
    this.directDpiSession = null;
    this.directDpiPath = null;
    this.directDeviceId = null;
    if (session) await session.close();
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
        const value = await this.dependencies.readCapabilities(agentDeviceId, connection);
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
    source: `Previously observed ${previous.variantResolution.source}`,
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
