import type { Device as HidDevice } from 'node-hid';
import type { Device, DeviceAppearanceOverride } from '../../shared/contracts';

export interface DeviceDiscoveryContext {
  hidDevices: HidDevice[];
  previousDevices: Device[];
  appearanceOverrides: Record<string, DeviceAppearanceOverride>;
}

export interface DeviceModule {
  id: string;
  discover(context: DeviceDiscoveryContext): Promise<Device[]>;
}
