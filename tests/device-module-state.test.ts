import { describe, expect, test } from 'bun:test';
import { devicesFromEnabledModules } from '../src/shared/device-module-state';
import { createDefaultSnapshot } from '../src/shared/defaults';

describe('device module visibility', () => {
  test('hides every device owned by a disabled module without deleting its saved state', () => {
    const snapshot = createDefaultSnapshot();
    const logitech = snapshot.modules.find((module) => module.id === 'device.logitech-hidpp');
    if (!logitech) throw new Error('Missing Logitech fixture module.');
    logitech.enabled = false;

    const visible = devicesFromEnabledModules(snapshot.devices, snapshot.modules);

    expect(visible.some((device) => device.moduleId === logitech.id)).toBe(false);
    expect(snapshot.devices.some((device) => device.moduleId === logitech.id)).toBe(true);
    expect(visible.some((device) => device.moduleId === 'device.hyperx-quadcast')).toBe(true);
  });
});
