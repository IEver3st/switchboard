import type { Device } from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from '../device-module';

const hyperXVendorId = 0x03f0;
const quadCast2BaseProductId = 0x07b4;
const quadCast2InterfaceProductId = 0x09af;

export class HyperXDeviceModule implements DeviceModule {
  public readonly id = 'device.hyperx-quadcast';

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    const descriptors = context.hidDevices.filter((device) => (
      device.vendorId === hyperXVendorId
      && [quadCast2BaseProductId, quadCast2InterfaceProductId].includes(device.productId)
    ));
    if (descriptors.length === 0) return [];

    const primary = descriptors.find((device) => device.productId === quadCast2BaseProductId) ?? descriptors[0];
    if (!primary) return [];
    const serialNumber = descriptors.find((device) => device.serialNumber)?.serialNumber;
    const id = `hyperx:${serialNumber || quadCast2BaseProductId.toString(16)}`;
    const previous = context.previousDevices.find((device) => device.id === id)
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
    const resolved = resolveDeviceVariant(identity, [], context.appearanceOverrides[id]);

    return [{
      id,
      moduleId: this.id,
      displayName: 'QuadCast 2',
      kind: 'microphone',
      connected: true,
      identity: resolved.identity,
      variantResolution: resolved.resolution,
      asset: resolveProductAsset(resolved.identity, 'microphone'),
      capabilities: {
        gain: true,
        monitoring: true,
        mute: true,
        lighting: {
          writable: false,
          enabled: Boolean(previous?.settings.lightingEnabled ?? true),
          activeEffectId: 'status-ring',
          availableEffects: [{ id: 'status-ring', label: 'Status ring' }],
          color: typeof previous?.settings.lightingColor === 'string' ? previous.settings.lightingColor : '#ff4f7d',
          colorWritable: false,
          brightnessWritable: false,
          profileMode: 'software',
          source: 'firmware',
          unavailableReason: 'QuadCast lighting writes are not implemented by the HyperX module yet.',
        },
      },
      settings: previous?.settings ?? {
        gain: 58,
        monitoring: 18,
        muteLed: true,
        lightingEnabled: true,
        lightingColor: '#ff4f7d',
      },
    }];
  }
}
