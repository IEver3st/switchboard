import type { Device as HidDevice } from 'node-hid';
import type {
  Device,
  DeviceAppearanceOverride,
  DeviceControlChange,
  DeviceSettingValue,
} from '../../shared/contracts';

export interface DeviceDiscoveryContext {
  hidDevices: HidDevice[];
  previousDevices: Device[];
  appearanceOverrides: Record<string, DeviceAppearanceOverride>;
}

export interface DeviceModule {
  id: string;
  discover(context: DeviceDiscoveryContext): Promise<Device[]>;
  setControl?(device: Device, change: DeviceControlChange): Promise<void>;
  onSettingChanged?(deviceId: string, key: string, value: DeviceSettingValue): void;
  deactivate?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
