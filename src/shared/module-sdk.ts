import type {
  AddonProjectManifest,
  DeviceConnection,
  DeviceKind,
} from './contracts';

/**
 * Public contract for local add-ons executed by Switchboard's sandboxed
 * Module Host. The host deliberately exposes data, not Electron or Node APIs.
 */
export interface AddonHidDevice {
  deviceKey: string;
  vendorId: number;
  productId: number;
  usagePage?: number;
  usage?: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
}

export interface AddonDiscoveryContext {
  apiVersion: 1;
  platform: 'win32' | 'darwin' | 'linux';
  hidDevices: ReadonlyArray<AddonHidDevice>;
}

export interface AddonDetectedDevice {
  /** Must be a deviceKey supplied in this discovery call. */
  deviceKey: string;
  displayName: string;
  kind: DeviceKind;
  identity: {
    manufacturer?: string;
    productFamily?: string;
    model?: string;
    variant?: string;
    colorway?: string;
    connection?: DeviceConnection;
    connectionLabel?: string;
    hardwareRevision?: string;
  };
}

export interface SwitchboardDeviceAddon {
  readonly manifest?: AddonProjectManifest;
  detect(context: AddonDiscoveryContext): Promise<AddonDetectedDevice[]> | AddonDetectedDevice[];
}

export type SwitchboardAddon = SwitchboardDeviceAddon;
