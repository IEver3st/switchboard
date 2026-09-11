import { describe, expect, test } from 'bun:test';
import { devicesFromEnabledModules } from '../src/shared/device-module-state';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { StateStore } from '../src/main/services/state-store';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('device module visibility', () => {
  test('starts brands disabled and preserves existing enablement when names are refreshed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-module-defaults-'));
    try {
      const path = join(directory, 'state.json');
      const store = new StateStore(path);
      await store.load();
      const brands = store.get().modules.filter((module) => module.kind === 'device');
      expect(brands.map((module) => [module.name, module.enabled])).toEqual([
        ['Razer', false], ['HyperX', false], ['Logitech', false], ['SteelSeries Devices', false],
      ]);
      store.update((draft) => {
        const logitech = draft.modules.find((module) => module.id === 'device.logitech-hidpp')!;
        logitech.enabled = true;
        logitech.name = 'Logitech HID++';
      });
      await store.flush();
      const restarted = new StateStore(path);
      await restarted.load();
      expect(restarted.get().modules.filter((module) => module.kind === 'device').map((module) => [module.name, module.enabled])).toEqual([
        ['Razer', false], ['HyperX', false], ['Logitech', true], ['SteelSeries Devices', false],
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('hides every device owned by a disabled module without deleting its saved state', () => {
    const snapshot = createDefaultSnapshot();
    for (const module of snapshot.modules) module.enabled = module.kind === 'device';
    const logitech = snapshot.modules.find((module) => module.id === 'device.logitech-hidpp');
    if (!logitech) throw new Error('Missing Logitech fixture module.');
    logitech.enabled = false;

    const visible = devicesFromEnabledModules(snapshot.devices, snapshot.modules);

    expect(visible.some((device) => device.moduleId === logitech.id)).toBe(false);
    expect(snapshot.devices.some((device) => device.moduleId === logitech.id)).toBe(true);
    expect(visible.some((device) => device.moduleId === 'device.hyperx-quadcast')).toBe(true);
  });
});
