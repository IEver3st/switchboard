import type { Device, DeviceSettingValue, ModuleManifest } from './contracts';

export interface DetectionContext {
  platform: NodeJS.Platform;
  hidDevices: ReadonlyArray<{
    vendorId: number;
    productId: number;
    usagePage?: number;
    usage?: number;
    path?: string;
  }>;
}

export interface DeviceModule {
  readonly manifest: ModuleManifest;
  detect(context: DetectionContext): Promise<Device[]>;
  setSetting(deviceId: string, key: string, value: DeviceSettingValue): Promise<void>;
  dispose(): Promise<void>;
}

export interface CapabilityRendererContract {
  capability: string;
  schemaVersion: number;
  settings: Record<string, DeviceSettingValue>;
}

export interface ModulePackageManifest {
  id: string;
  version: string;
  minimumCoreVersion: string;
  entrypoint: string;
  sha256: string;
  signature: string;
  permissions: {
    hid?: string[];
    filesystem?: Array<'module-data'>;
    network?: string[];
  };
}
