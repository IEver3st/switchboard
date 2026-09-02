import { describe, expect, test } from 'bun:test';
import type { Device as HidDevice } from 'node-hid';
import { LogitechDeviceModule } from '../src/main/modules/logitech';
import type { LogitechAgentDevice } from '../src/main/modules/logitech/ghub-metadata';
import type { Device, DeviceCapabilities } from '../src/shared/contracts';

describe('Logitech service fallback', () => {
  test('uses G HUB metadata for identity but routes controls through direct HID++', async () => {
    const directWrites: string[] = [];
    const agentWrites: string[] = [];
    const module = new LogitechDeviceModule({
      readAgentDevices: async () => [agentDevice],
      readBattery: async () => ({ percentage: 72, charging: false }),
      readCapabilities: async () => previousServiceDevice.capabilities,
      writeControl: async (_agentDeviceId, _device, change) => { agentWrites.push(change.type); },
      openDirectSession: async () => ({
        isClosed: false,
        getCapabilities: async () => structuredClone(directCapabilities),
        setControl: async (change) => { directWrites.push(change.type); },
        close: async () => undefined,
      }),
    });

    const [device] = await module.discover({
      hidDevices: [receiverDescriptor, longEndpointDescriptor],
      previousDevices: [previousServiceDevice],
      appearanceOverrides: {},
    });

    expect(device?.identity.variant).toBe('white');
    expect(device?.capabilities.dpi?.shiftMode).toBe('host-button-spy');
    await module.setControl(device!, { type: 'dpi-shift', value: 400 });
    expect(directWrites).toEqual(['dpi-shift']);
    expect(agentWrites).toEqual([]);
    await module.dispose();
  });

  test('keeps native G502 controls and DPI Shift active without G HUB', async () => {
    const writes: Array<{ type: string; value?: number }> = [];
    let openedPath: string | undefined;
    const directCapabilities: DeviceCapabilities = {
      dpi: {
        writable: true,
        min: 100,
        max: 25_600,
        step: 50,
        stages: [800, 1_600, 3_200],
        activeDpi: 3_200,
        defaultDpi: 3_200,
        shiftDpi: 400,
        shiftMode: 'host-button-spy',
        maxStages: 5,
        profileMode: 'onboard',
      },
      reportRate: {
        writable: true,
        value: 500,
        supportedRates: [125, 250, 500, 1_000],
        profileMode: 'onboard',
      },
      buttonAssignments: previousServiceDevice.capabilities.buttonAssignments,
      lighting: previousServiceDevice.capabilities.lighting,
      onboardMemory: { writable: true, enabled: true, activeProfile: '1' },
    };
    const module = new LogitechDeviceModule({
      readAgentDevices: async () => [],
      readBattery: async () => undefined,
      readCapabilities: async () => ({}),
      writeControl: async () => undefined,
      openDirectSession: async (endpoint) => {
        openedPath = endpoint.path;
        return {
          isClosed: false,
          getCapabilities: async () => structuredClone(directCapabilities),
          setControl: async (change) => { writes.push(change); },
          close: async () => undefined,
        };
      },
    });

    const [device] = await module.discover({
      hidDevices: [receiverDescriptor, longEndpointDescriptor],
      previousDevices: [previousServiceDevice],
      appearanceOverrides: {},
    });

    expect(device).toBeDefined();
    expect(openedPath).toBe(longEndpointDescriptor.path);
    expect(device?.capabilities).toEqual(directCapabilities);
    expect(device?.capabilities).toMatchObject({
      dpi: { writable: true, shiftDpi: 400, shiftMode: 'host-button-spy' },
      reportRate: { writable: true },
      buttonAssignments: { writable: true },
      lighting: { writable: true },
      onboardMemory: { writable: true },
    });

    await module.setControl(device!, { type: 'dpi-shift', value: 400 });
    expect(writes).toEqual([{ type: 'dpi-shift', value: 400 }]);
    await module.dispose();
  });

  test('keeps last-known controls visible and unavailable when another app owns HID++', async () => {
    const module = new LogitechDeviceModule({
      readAgentDevices: async () => [],
      readBattery: async () => undefined,
      readCapabilities: async () => ({}),
      writeControl: async () => undefined,
      openDirectSession: async () => { throw new Error('cannot open device with path'); },
    });

    const [device] = await module.discover({
      hidDevices: [receiverDescriptor, longEndpointDescriptor],
      previousDevices: [previousServiceDevice],
      appearanceOverrides: {},
    });

    expect(device?.capabilities.battery).toBeUndefined();
    expect(device?.capabilities).toMatchObject({
      dpi: {
        writable: false,
        unavailableReason: expect.stringContaining('Close G HUB, OpenLogi'),
      },
      reportRate: { writable: false },
      buttonAssignments: { writable: false },
      lighting: {
        writable: false,
        colorWritable: false,
        brightnessWritable: false,
      },
      onboardMemory: { writable: false },
    });
  });
});

const directCapabilities: DeviceCapabilities = {
  dpi: {
    writable: true,
    min: 100,
    max: 25_600,
    step: 50,
    stages: [400, 800, 1_600, 3_200],
    activeDpi: 3_200,
    defaultDpi: 3_200,
    shiftDpi: 400,
    shiftMode: 'host-button-spy',
    maxStages: 5,
    profileMode: 'onboard',
  },
};

const agentDevice: LogitechAgentDevice = {
  id: 'g502-agent-device',
  pid: 0x4099,
  state: 'ACTIVE',
  connectionType: 'WIRELESS',
  displayConnectionType: 'LIGHTSPEED',
  deviceType: 'MOUSE',
  deviceModel: 'g502x_plus',
  deviceBaseModel: 'g502x_plus',
  displayName: 'G502 X Plus',
  deviceExt: 1,
  deviceUnitId: 'switchboard-test-unit',
  activeInterfaces: [{
    type: 'DEVIO',
    id: 'g502-devio',
    pid: 0x4099,
    extendedModel: 1,
    serialNumber: 'switchboard-test-unit',
    path: '\\\\?\\hid#vid_046d&pid_c547&mi_02#switchboard-test',
    connectionType: 'WIRELESS',
  }],
};

const receiverDescriptor = {
  vendorId: 0x046d,
  productId: 0xc547,
  release: 0x0402,
  product: 'USB Receiver',
} as HidDevice;

const longEndpointDescriptor = {
  ...receiverDescriptor,
  path: '\\\\?\\hid#vid_046d&pid_c547&mi_02#switchboard-test',
  usagePage: 0xff00,
  usage: 2,
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
