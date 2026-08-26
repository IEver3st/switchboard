import { describe, expect, test } from 'bun:test';
import type { Device as HidDevice } from 'node-hid';
import { LogitechDeviceModule } from '../src/main/modules/logitech';
import type { Device } from '../src/shared/contracts';

const serviceUnavailableReason = 'Configuration is unavailable while the local Logitech device service is not responding.';

describe('Logitech service fallback', () => {
  test('does not retain stale service-only controls when G HUB disappears', async () => {
    const module = new LogitechDeviceModule({
      readAgentDevices: async () => [],
      readBattery: async () => undefined,
      readCapabilities: async () => ({}),
      writeControl: async () => undefined,
    });

    const [device] = await module.discover({
      hidDevices: [receiverDescriptor],
      previousDevices: [previousServiceDevice],
      appearanceOverrides: {},
    });

    expect(device).toBeDefined();
    expect(device?.capabilities).toEqual({});
    expect(JSON.stringify(device)).not.toContain(serviceUnavailableReason);
  });
});

const receiverDescriptor = {
  vendorId: 0x046d,
  productId: 0xc547,
  release: 0x0402,
  product: 'USB Receiver',
} as HidDevice;

const previousServiceDevice: Device = {
  id: 'logitech:receiver-c547',
  moduleId: 'device.logitech-hidpp',
  displayName: 'G502 X Plus',
  kind: 'mouse',
  connected: true,
  identity: {
    manufacturer: 'Logitech',
    productFamily: 'G502',
    model: 'G502 X Plus',
    connection: 'wireless',
    connectionLabel: 'LIGHTSPEED',
    vendorId: 0x046d,
    productId: 0x4099,
    transportProductId: 0xc547,
  },
  variantResolution: {
    confidence: 'fallback',
    source: 'No cosmetic SKU reported by hardware',
  },
  asset: {
    key: 'logitech-g502-x-plus-black',
    matchedBy: 'exact-model',
    source: 'bundled-official',
  },
  capabilities: {
    dpi: {
      writable: true,
      min: 100,
      max: 25_600,
      step: 50,
      stages: [800, 1_600, 3_200],
      activeDpi: 1_600,
      defaultDpi: 1_600,
      shiftDpi: 800,
      maxStages: 5,
      profileMode: 'software',
    },
    reportRate: {
      writable: true,
      value: 1_000,
      supportedRates: [125, 250, 500, 1_000],
      profileMode: 'software',
    },
    buttonAssignments: {
      writable: true,
      profileMode: 'software',
      bindings: [],
      availableActions: [],
    },
    lighting: {
      writable: true,
      enabled: true,
      activeEffectId: 'solid',
      availableEffects: [{ id: 'solid', label: 'Static' }],
      color: '#ff1744',
      colorWritable: true,
      brightness: 100,
      brightnessWritable: true,
      speedWritable: false,
      profiles: [],
      muteLinked: false,
      muteLinkedWritable: false,
      physicalEffectVerified: false,
      profileMode: 'software',
      source: 'firmware',
    },
    onboardMemory: {
      writable: true,
      enabled: false,
    },
  },
  settings: {},
};
