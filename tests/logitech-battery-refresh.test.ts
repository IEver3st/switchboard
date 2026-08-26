import { describe, expect, test } from 'bun:test';
import type { Device as HidDevice } from 'node-hid';
import {
  LogitechDeviceModule,
  type LogitechDeviceModuleDependencies,
} from '../src/main/modules/logitech';

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
});
