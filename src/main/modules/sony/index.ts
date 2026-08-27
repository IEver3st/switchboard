import type { Device, DeviceControlChange, SonyHeadsetCapability } from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';
import { SonyMdrSession } from './common/protocol/session';
import { SonyHeadphonesHost, type SonyHostDevice } from './common/transport/host';
import {
  parseXm6Event,
  xm6Dsee,
  xm6EqualizerBands,
  xm6EqualizerFrequencies,
  xm6EqualizerPreset,
  xm6EqualizerPresets,
  xm6InitialQueries,
  xm6ListeningMode,
  xm6NoiseControl,
  xm6SpeakToChat,
  type Xm6Event,
} from './wh1000xm6/protocol';

const moduleId = 'device.sony-mdr';
const modelName = 'WH-1000XM6';

interface Xm6Runtime {
  hostDevice: SonyHostDevice;
  session: SonyMdrSession | null;
  connectPromise: Promise<void> | null;
  capability: SonyHeadsetCapability;
  battery?: Device['capabilities']['battery'];
  bgmOn: boolean;
  cinemaOn: boolean;
}

export class SonyDeviceModule implements DeviceModule {
  public readonly id = moduleId;
  private readonly host = new SonyHeadphonesHost();
  private readonly runtimes = new Map<string, Xm6Runtime>();
  private lastContext: DeviceDiscoveryContext | null = null;
  private latestDevices: Device[] = [];
  private nextIdleScanAt = 0;
  private disposed = false;
  private removeDisconnect: () => void;

  public constructor(private readonly publish?: (devices: Device[], persist: boolean) => void) {
    this.removeDisconnect = this.host.onDisconnect((token, reason) => {
      const runtime = this.runtimes.get(token);
      if (!runtime) return;
      runtime.session?.dispose();
      runtime.session = null;
      runtime.capability.transportState = reason.includes('inuse') ? 'busy' : 'disconnected';
      runtime.capability.transportMessage = plainTransportMessage(reason);
      this.publishCurrent();
    });
  }

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    this.lastContext = context;
    if (Date.now() < this.nextIdleScanAt && ![...this.runtimes.values()].some((runtime) => runtime.hostDevice.connected)) {
      this.latestDevices = [...this.runtimes.values()].map((runtime) => this.buildDevice(runtime, context));
      return this.latestDevices;
    }
    const known = (await this.host.scan()).filter((device) => normalizeModel(device.name) === normalizeModel(modelName));
    const tokens = new Set(known.map((device) => device.token));
    for (const [token, runtime] of this.runtimes) {
      if (!tokens.has(token)) {
        runtime.session?.dispose();
        this.runtimes.delete(token);
      }
    }
    for (const hostDevice of known) {
      const runtime = this.runtimes.get(hostDevice.token) ?? createRuntime(hostDevice);
      runtime.hostDevice = hostDevice;
      this.runtimes.set(hostDevice.token, runtime);
      if (hostDevice.connected && !runtime.session && !runtime.connectPromise) {
        runtime.connectPromise = this.connect(runtime).finally(() => { runtime.connectPromise = null; });
      } else if (!hostDevice.connected && !runtime.connectPromise) {
        runtime.capability.transportState = 'disconnected';
        runtime.capability.transportMessage = 'Turn on the headphones and connect them in Windows.';
      }
    }
    await Promise.allSettled([...this.runtimes.values()].map((runtime) => runtime.connectPromise).filter(Boolean));
    this.latestDevices = [...this.runtimes.values()].map((runtime) => this.buildDevice(runtime, context));
    if (!known.some((device) => device.connected)) {
      this.nextIdleScanAt = Date.now() + 15_000;
      await this.host.dispose();
    } else {
      this.nextIdleScanAt = 0;
    }
    return this.latestDevices;
  }

  public async setControl(device: Device, change: DeviceControlChange): Promise<void> {
    const token = device.id.slice('sony:'.length);
    const runtime = this.runtimes.get(token);
    if (!runtime?.session || runtime.capability.transportState !== 'connected') throw new Error('Connect the headphones before changing this setting.');
    const commands: Uint8Array[] = [];
    const noise = runtime.capability.noiseControl;
    if (change.type === 'headset-noise-control' && noise) commands.push(xm6NoiseControl(change.mode, noise.ambientLevel ?? 10, noise.focusOnVoice ?? false), Uint8Array.from([0x66, 0x19]));
    else if (change.type === 'headset-ambient-level' && noise) commands.push(xm6NoiseControl('ambient', change.level, noise.focusOnVoice ?? false), Uint8Array.from([0x66, 0x19]));
    else if (change.type === 'headset-focus-on-voice' && noise) commands.push(xm6NoiseControl('ambient', noise.ambientLevel ?? 10, change.enabled), Uint8Array.from([0x66, 0x19]));
    else if (change.type === 'headset-equalizer-preset') commands.push(...xm6EqualizerPreset(change.presetId));
    else if (change.type === 'headset-equalizer-bands') commands.push(xm6EqualizerBands(change.gainsDb), Uint8Array.from([0x56, 0x00]));
    else if (change.type === 'headset-dsee-extreme') commands.push(xm6Dsee(change.enabled), Uint8Array.from([0xe6, 0x01]));
    else if (change.type === 'headset-speak-to-chat') commands.push(xm6SpeakToChat(change.enabled), Uint8Array.from([0xf6, 0x0c]));
    else if (change.type === 'headset-listening-mode') commands.push(...xm6ListeningMode(change.mode, change.backgroundRoom), Uint8Array.from([0xe6, 0x09]), Uint8Array.from([0xe6, 0x04]));
    else throw new Error('This control is not supported by the connected headphones.');
    try {
      for (const command of commands) await runtime.session.send(command);
    } catch (error) {
      runtime.capability.diagnostics.commandFailureCount += 1;
      runtime.capability.diagnostics.lastErrorCode = sanitizedErrorCode(error);
      this.publishCurrent();
      throw new Error('The headphones did not accept that change. Their confirmed setting has been restored.');
    }
  }

  public async deactivate(): Promise<void> { await this.stop(); }
  public async dispose(): Promise<void> { this.disposed = true; this.removeDisconnect(); await this.stop(); }

  private async connect(runtime: Xm6Runtime): Promise<void> {
    runtime.capability.transportState = 'connecting';
    runtime.capability.transportMessage = undefined;
    try {
      await this.host.connect(runtime.hostDevice.token);
      runtime.session = new SonyMdrSession(this.host, runtime.hostDevice.token, (frame) => {
        const event = parseXm6Event(frame);
        if (event) this.applyEvent(runtime, event);
        runtime.capability.diagnostics.malformedFrameCount = runtime.session?.malformedFrameCount ?? 0;
      });
      runtime.capability.transportState = 'connected';
      runtime.capability.diagnostics.reconnectCount += runtime.capability.diagnostics.lastSyncAt ? 1 : 0;
      for (const query of xm6InitialQueries) await runtime.session.send(query);
    } catch (error) {
      runtime.session?.dispose();
      runtime.session = null;
      const code = sanitizedErrorCode(error);
      runtime.capability.transportState = code.includes('addressalreadyinuse') || code.includes('accessdenied') ? 'busy' : 'error';
      runtime.capability.transportMessage = plainTransportMessage(code);
      runtime.capability.diagnostics.lastErrorCode = code;
    }
  }

  private applyEvent(runtime: Xm6Runtime, event: Xm6Event): void {
    const headset = runtime.capability;
    if (event.type === 'battery') runtime.battery = { percentage: event.percentage, charging: event.charging, fullyCharged: event.percentage === 100, updatedAt: Date.now() };
    else if (event.type === 'noise-control') headset.noiseControl = {
      writable: true, mode: event.mode, ambientLevel: event.ambientLevel,
      ambientLevelMin: 1, ambientLevelMax: 20, focusOnVoice: event.focusOnVoice,
    };
    else if (event.type === 'equalizer') {
      headset.equalizer ??= createXm6EqualizerCapability();
      headset.equalizer.activePresetId = event.presetId;
      if (event.gainsDb.length === 10) headset.equalizer.bands = xm6EqualizerFrequencies.map((frequencyHz, index) => ({ frequencyHz, gainDb: event.gainsDb[index] ?? 0 }));
    } else if (event.type === 'dsee') headset.dseeExtreme = { enabled: event.enabled, writable: true };
    else if (event.type === 'speak-to-chat') headset.speakToChat = { enabled: event.enabled, writable: true };
    else if (event.type === 'background-music') {
      runtime.bgmOn = event.enabled;
      headset.listeningMode ??= { writable: true, mode: null, backgroundRoom: 'my-room' };
      if (event.room) headset.listeningMode.backgroundRoom = event.room;
    } else if (event.type === 'cinema') {
      runtime.cinemaOn = event.enabled;
      headset.listeningMode ??= { writable: true, mode: null, backgroundRoom: 'my-room' };
    }
    if (headset.listeningMode) headset.listeningMode.mode = runtime.cinemaOn ? 'cinema' : runtime.bgmOn ? 'background-music' : 'standard';
    headset.diagnostics.lastSyncAt = new Date().toISOString();
    headset.diagnostics.lastErrorCode = null;
    this.publishCurrent();
  }

  private buildDevice(runtime: Xm6Runtime, context: DeviceDiscoveryContext): Device {
    const id = `sony:${runtime.hostDevice.token}`;
    const previous = context.previousDevices.find((device) => device.id === id);
    const resolved = resolveDeviceVariant({
      manufacturer: 'Sony', productFamily: '1000X', model: modelName, connection: 'bluetooth',
      connectionLabel: 'Bluetooth', serialNumber: runtime.hostDevice.token, productString: runtime.hostDevice.name,
    }, [], context.appearanceOverrides[id]);
    return {
      id, moduleId, displayName: modelName, kind: 'headset', connected: runtime.hostDevice.connected,
      identity: resolved.identity, variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'headset'),
      capabilities: { battery: runtime.battery ?? previous?.capabilities.battery, headset: structuredClone(runtime.capability) },
      settings: { ...defaultXm6Settings(), ...previous?.settings },
    };
  }

  private publishCurrent(): void {
    if (this.disposed || !this.lastContext || !this.publish) return;
    this.latestDevices = [...this.runtimes.values()].map((runtime) => this.buildDevice(runtime, this.lastContext!));
    this.publish(this.latestDevices, false);
  }

  private async stop(): Promise<void> {
    for (const runtime of this.runtimes.values()) runtime.session?.dispose();
    this.runtimes.clear();
    await this.host.dispose();
  }
}

function createRuntime(hostDevice: SonyHostDevice): Xm6Runtime {
  return {
    hostDevice, session: null, connectPromise: null, bgmOn: false, cinemaOn: false,
    capability: {
      platform: 'sony-mdr', model: 'wh-1000xm6', transportState: 'disconnected',
      diagnostics: { protocol: 'sony-mdr-v2', lastSyncAt: null, reconnectCount: 0, malformedFrameCount: 0, commandFailureCount: 0, lastErrorCode: null },
    },
  };
}

function createXm6EqualizerCapability(): NonNullable<SonyHeadsetCapability['equalizer']> {
  return {
    writable: true, activePresetId: null,
    bands: xm6EqualizerFrequencies.map((frequencyHz) => ({ frequencyHz, gainDb: 0 })),
    presets: xm6EqualizerPresets.map(([id, , label]) => ({ id, label, writable: true, storedOnHeadphones: true })),
    gainMinDb: -6, gainMaxDb: 6,
  };
}

function defaultXm6Settings(): Device['settings'] {
  return {
    sonyPresetName1: 'Local 1', sonyPresetBands1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sonyPresetName2: 'Local 2', sonyPresetBands2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sonyPresetName3: 'Local 3', sonyPresetBands3: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}
function normalizeModel(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sanitizedErrorCode(error: unknown): string { return error instanceof Error ? error.message.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80) : 'unknown'; }
function plainTransportMessage(code: string): string {
  if (code.includes('inuse') || code.includes('access')) return 'Sony Sound Connect or another device may be using the control connection.';
  if (code.includes('timeout')) return 'The headphones did not respond. Reconnect them in Windows and try again.';
  return 'The Bluetooth control connection is unavailable. Audio can remain connected.';
}
