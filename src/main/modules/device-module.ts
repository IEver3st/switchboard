import type { Device as HidDevice } from 'node-hid';
import type {
  Device,
  DeviceAppearanceOverride,
  DeviceControlChange,
  MouseBatteryLightingPolicy,
} from '../../shared/contracts';

export interface DeviceDiscoveryContext {
  hidDevices: HidDevice[];
  previousDevices: Device[];
  appearanceOverrides: Record<string, DeviceAppearanceOverride>;
  mouseBatteryLighting?: Record<string, MouseBatteryLightingPolicy>;
}

export interface DeviceControlResult {
  confirmedChanges: DeviceControlChange[];
}

export interface DeviceModule {
  setStatusLighting?(device: Device, color: string | null): Promise<void>;
  id: string;
  discover(context: DeviceDiscoveryContext): Promise<Device[]>;
  setControl?(device: Device, change: DeviceControlChange): Promise<DeviceControlResult | void>;
  deactivate?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
