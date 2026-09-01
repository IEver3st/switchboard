import type { Device, ModuleManifest } from './contracts';

export function devicesFromEnabledModules(
  devices: Device[],
  modules: ModuleManifest[],
): Device[] {
  const enabledModuleIds = new Set(
    modules.filter((module) => module.enabled).map((module) => module.id),
  );
  return devices.filter((device) => enabledModuleIds.has(device.moduleId));
}
