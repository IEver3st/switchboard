import { describe, expect, test } from 'bun:test';
import type { Device as HidDevice } from 'node-hid';
import {
  LogitechDeviceModule,
  type LogitechDeviceModuleDependencies,
} from '../src/main/modules/logitech';
import { parseUnifiedBatteryInfoPayload } from '../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';

const agentDevice = {
  id: 'agent-g502',
  pid: 0x4099,
  state: 'ACTIVE',
  connectionType: 'WIRELESS',
  displayConnectionType: 'LIGHTSPEED',
  deviceType: 'MOUSE',
  deviceModel: 'g502x_plus',
  deviceBaseModel: 'g502x_plus',
  displayName: 'G502 X Plus',
  deviceUnitId: 'unit-g502',
  activeInterfaces: [{
    type: 'DEVIO',
    id: 'devio-g502',
    pid: 0x4099,
    serialNumber: 'unit-g502',
    path: '\\\\?\\hid#vid_046d&pid_c547',
  }],
};

const receiver = {
  vendorId: 0x046d,
  productId: 0xc547,
  product: 'G502 X Plus Receiver',
} as HidDevice;

describe('Logitech battery discovery', () => {
  test('decodes the direct HID++ battery state without inventing a charge transition', () => {
    expect(parseUnifiedBatteryInfoPayload(Uint8Array.from([81, 8, 0]), 1234)).toEqual({
      percentage: 81,
      charging: false,
      fullyCharged: false,
      updatedAt: 1234,
    });
    expect(parseUnifiedBatteryInfoPayload(Uint8Array.from([81, 8, 1]), 1234).charging).toBe(true);
    expect(parseUnifiedBatteryInfoPayload(Uint8Array.from([100, 8, 3]), 1234).fullyCharged).toBe(true);
  });

  test('publishes a newly observed charging state on the next discovery cycle', async () => {
    let batteryReads = 0;
    const dependencies: LogitechDeviceModuleDependencies = {
      readAgentDevices: async () => [agentDevice],
      readCapabilities: async () => ({}),
      readBattery: async () => {
        batteryReads += 1;
        return batteryReads === 1
          ? { percentage: 64, charging: false }
          : { percentage: 64, charging: true };
      },
      writeControl: async () => undefined,
    };
    const module = new LogitechDeviceModule(dependencies);

    const first = await module.discover({
      hidDevices: [receiver],
      previousDevices: [],
      appearanceOverrides: {},
    });
    const second = await module.discover({
      hidDevices: [receiver],
      previousDevices: first,
      appearanceOverrides: {},
    });

    expect(first[0]?.capabilities.battery?.charging).toBe(false);
    expect(second[0]?.capabilities.battery?.charging).toBe(true);
    expect(batteryReads).toBe(2);
  });

  test('publishes updated remaining-time telemetry on every discovery cycle', async () => {
    let batteryReads = 0;
    const dependencies: LogitechDeviceModuleDependencies = {
      readAgentDevices: async () => [agentDevice],
      readCapabilities: async () => ({}),
      readBattery: async () => {
        batteryReads += 1;
        return {
          percentage: batteryReads === 1 ? 75 : 74,
          charging: false,
          fullyCharged: false,
          batteryMileageSupport: 'MILEAGE_SUPPORTED',
          mileage: batteryReads === 1 ? 18 : 17.5,
        };
      },
      writeControl: async () => undefined,
    };
    const module = new LogitechDeviceModule(dependencies);

    const first = await module.discover({ hidDevices: [receiver], previousDevices: [], appearanceOverrides: {} });
    const second = await module.discover({ hidDevices: [receiver], previousDevices: first, appearanceOverrides: {} });

    expect(first[0]?.capabilities.battery?.estimatedMinutesRemaining).toBe(1_080);
    expect(second[0]?.capabilities.battery?.estimatedMinutesRemaining).toBe(1_050);
    expect(second[0]?.capabilities.battery?.percentage).toBe(74);
    expect(batteryReads).toBe(2);
  });

  test('keeps the known white variant and drops stale charging state when the agent disappears', async () => {
    let agentAvailable = true;
    const dependencies: LogitechDeviceModuleDependencies = {
      readAgentDevices: async () => agentAvailable
        ? [{
            ...agentDevice,
            activeInterfaces: [{ ...agentDevice.activeInterfaces[0]!, extendedModel: 1 }],
          }]
        : [],
      readCapabilities: async () => ({}),
      readBattery: async () => ({ percentage: 61, charging: true, fullyCharged: false }),
      writeControl: async () => undefined,
    };
    const module = new LogitechDeviceModule(dependencies);

    const detected = await module.discover({
      hidDevices: [receiver],
      previousDevices: [],
      appearanceOverrides: {},
    });
    agentAvailable = false;
    const fallback = await module.discover({
      hidDevices: [receiver],
      previousDevices: detected,
      appearanceOverrides: {},
    });

    expect(detected[0]?.asset.key).toBe('logitech-g502-x-plus-white');
    expect(fallback[0]?.asset.key).toBe('logitech-g502-x-plus-white');
    expect(fallback[0]?.identity.variant).toBe('white');
    expect(fallback[0]?.capabilities.battery).toBeUndefined();
  });
});
