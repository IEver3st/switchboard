import type { Device, DeviceControlChange } from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';
import { quadCast2StatusRed } from './quadcast2-protocol';
import { QuadCast2Session } from './quadcast2-session';

const hyperXVendorId = 0x03f0;
const quadCast2BaseProductId = 0x07b4;
const quadCast2InterfaceProductId = 0x09af;

type DeviceBase = Omit<Device, 'capabilities' | 'settings'>;
type DeviceUpdateListener = (devices: Device[], persist: boolean) => void;

export class HyperXDeviceModule implements DeviceModule {
  public readonly id = 'device.hyperx-quadcast';
  private session: QuadCast2Session | null = null;
  private sessionDeviceId: string | null = null;
  private currentBase: DeviceBase | null = null;

  public constructor(private readonly onStateChanged: DeviceUpdateListener = () => undefined) {}

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    const descriptors = context.hidDevices.filter((device) => (
      device.vendorId === hyperXVendorId
      && [quadCast2BaseProductId, quadCast2InterfaceProductId].includes(device.productId)
    ));
    if (descriptors.length === 0) {
      await this.releaseSession();
      return [];
    }

    const primary = descriptors.find((device) => device.productId === quadCast2BaseProductId) ?? descriptors[0];
    if (!primary) return [];
    const serialNumber = descriptors.find((device) => device.serialNumber)?.serialNumber;
    const deviceId = `hyperx:${serialNumber || quadCast2BaseProductId.toString(16)}`;
    const previous = context.previousDevices.find((device) => device.id === deviceId)
      ?? context.previousDevices.find((device) => device.moduleId === this.id && device.identity.model === 'QuadCast 2');
    const identity = {
      manufacturer: 'HyperX',
      productFamily: 'QuadCast',
      model: 'QuadCast 2',
      connection: 'usb' as const,
      hardwareRevision: primary.release ? primary.release.toString(16).padStart(4, '0').toUpperCase() : undefined,
      vendorId: hyperXVendorId,
      productId: quadCast2BaseProductId,
      interfaceProductIds: [...new Set(descriptors.map((device) => device.productId))].sort((left, right) => left - right),
      serialNumber,
      productString: primary.product || descriptors.find((device) => device.product)?.product,
    };
    const resolved = resolveDeviceVariant(identity, [], context.appearanceOverrides[deviceId]);
    const nextBase: DeviceBase = {
      id: deviceId,
      moduleId: this.id,
      displayName: 'QuadCast 2',
      kind: 'microphone',
      connected: true,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'microphone'),
    };

    if (!this.session || this.sessionDeviceId !== deviceId) {
      await this.releaseSession();
      this.currentBase = nextBase;
      this.sessionDeviceId = deviceId;
      this.session = new QuadCast2Session(descriptors, previous?.settings, (persist) => this.publish(persist));
      this.session.start();
    } else {
      this.currentBase = nextBase;
      this.session.updateDescriptors(descriptors);
    }

    return [this.buildDevice()];
  }

  public async setControl(device: Device, change: DeviceControlChange): Promise<void> {
    if (!this.session || device.id !== this.sessionDeviceId) throw new Error('The QuadCast 2 hardware session is unavailable.');
    if (change.type === 'lighting-enabled') return this.session.applyEnabled(change.enabled);
    if (change.type === 'lighting-brightness') return this.session.applyBrightness(change.brightness);
    if (change.type === 'lighting-effect') return this.session.applyEffect(change.effectId);
    if (change.type === 'lighting-speed') return this.session.applySpeed(change.speed);
    if (change.type === 'lighting-profile') return this.session.applyProfile(change.profileId);
    if (change.type === 'microphone-mute-lighting') return this.session.applyMuteLinked(change.enabled);
    if (change.type === 'lighting-color') {
      throw new Error('QuadCast 2 lighting is fixed red and does not support color writes.');
    }
    throw new Error(`${device.displayName} does not support the requested device control.`);
  }

  public async deactivate(): Promise<void> {
    await this.releaseSession();
  }

  public async dispose(): Promise<void> {
    await this.releaseSession();
  }

  private buildDevice(): Device {
    if (!this.currentBase || !this.session) throw new Error('The QuadCast 2 session has not been initialized.');
    const state = this.session.getState();
    return {
      ...this.currentBase,
      capabilities: {
        gain: true,
        monitoring: true,
        mute: true,
        muteState: {
          muted: state.physicalMuted,
          source: 'hardware',
          ...(state.muteStateUpdatedAt ? { updatedAt: state.muteStateUpdatedAt } : {}),
          ...(state.muteStateUnavailableReason ? { unavailableReason: state.muteStateUnavailableReason } : {}),
        },
        lighting: {
          writable: true,
          enabled: state.config.enabled,
          activeEffectId: state.config.effectId,
          availableEffects: [
            { id: 'solid', label: 'Solid' },
            { id: 'breathing', label: 'Breathing' },
            { id: 'pulse', label: 'Pulse' },
          ],
          color: quadCast2StatusRed,
          colorWritable: false,
          brightness: state.config.brightness,
          brightnessWritable: true,
          speed: state.config.speed,
          speedWritable: true,
          profiles: state.profiles,
          activeProfileId: state.activeProfileId,
          muteLinked: state.config.muteLinked,
          muteLinkedWritable: true,
          state: state.lightingStatus,
          ...(state.lightingStateReason ? { stateReason: state.lightingStateReason } : {}),
          physicalEffectVerified: false,
          profileMode: 'software',
          source: 'software',
        },
      },
      settings: state.settings,
    };
  }

  private publish(persist: boolean): void {
    if (!this.currentBase || !this.session) return;
    this.onStateChanged([this.buildDevice()], persist);
  }

  private async releaseSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    this.sessionDeviceId = null;
    this.currentBase = null;
    await session?.close();
  }
}
