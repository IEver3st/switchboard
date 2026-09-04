import { describe, expect, mock, spyOn, test } from 'bun:test';
import type { DeviceModule } from '../src/main/modules/device-module';
import { createDefaultSnapshot } from '../src/shared/defaults';

mock.module('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

const { DeviceRegistry, selectHidDeviceEnumerator } = await import('../src/main/services/device-registry');

describe('device registry lifecycle', () => {
  test('does not enumerate HID when every device module is disabled, and resumes on enable', async () => {
    let snapshot = createDefaultSnapshot();
    snapshot.modules = snapshot.modules.map(module => ({ ...module, enabled: false }));
    let enumerations = 0;
    const registry = new DeviceRegistry(
      () => snapshot,
      devices => { snapshot = { ...snapshot, devices }; },
      {
        modules: [{ id: 'device.logitech-hidpp', discover: async () => [] }],
        listHidDevices: async () => { enumerations++; return []; },
      },
    );
    try {
      await registry.start();
      await registry.refresh();
      expect(enumerations).toBe(0);
      snapshot.modules.find(module => module.id === 'device.logitech-hidpp')!.enabled = true;
      await registry.reconcileModuleState('device.logitech-hidpp', true);
      expect(enumerations).toBe(1);
      snapshot.modules.find(module => module.id === 'device.logitech-hidpp')!.enabled = false;
      await registry.reconcileModuleState('device.logitech-hidpp', false);
      await registry.refresh();
      expect(enumerations).toBe(1);
    } finally { await registry.dispose(); }
  });

  test('arms one discovery timer on enable and clears it on disable and repeated disposal', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.modules.forEach(module => { module.enabled = false; });
    const setTimer = spyOn(globalThis, 'setInterval');
    const clearTimer = spyOn(globalThis, 'clearInterval');
    const registry = new DeviceRegistry(() => snapshot, () => {}, {
      modules: [{ id: 'device.logitech-hidpp', discover: async () => [] }],
      listHidDevices: async () => [],
    });
    try {
      await registry.start();
      expect(setTimer).not.toHaveBeenCalled();
      snapshot.modules.find(module => module.id === 'device.logitech-hidpp')!.enabled = true;
      await registry.reconcileModuleState('device.logitech-hidpp', true);
      await registry.start();
      expect(setTimer).toHaveBeenCalledTimes(1);
      const timer = setTimer.mock.results[0]!.value;
      snapshot.modules.find(module => module.id === 'device.logitech-hidpp')!.enabled = false;
      await registry.reconcileModuleState('device.logitech-hidpp', false);
      expect(clearTimer).toHaveBeenCalledWith(timer);
      snapshot.modules.find(module => module.id === 'device.logitech-hidpp')!.enabled = true;
      await registry.reconcileModuleState('device.logitech-hidpp', true);
      expect(setTimer).toHaveBeenCalledTimes(2);
      const rearmed = setTimer.mock.results[1]!.value;
      await registry.dispose();
      await registry.dispose();
      expect(clearTimer).toHaveBeenCalledWith(rearmed);
      expect(clearTimer).toHaveBeenCalledTimes(2);
    } finally {
      await registry.dispose();
      setTimer.mockRestore();
      clearTimer.mockRestore();
    }
  });

  test('uses Windows PnP discovery instead of whole-bus HIDAPI enumeration', () => {
    const windowsEnumerator = async () => [];
    const portableEnumerator = async () => [];

    expect(selectHidDeviceEnumerator('win32', windowsEnumerator, portableEnumerator)).toBe(windowsEnumerator);
    expect(selectHidDeviceEnumerator('linux', windowsEnumerator, portableEnumerator)).toBe(portableEnumerator);
  });

  test('removes preview fixture devices before real discovery starts', async () => {
    let snapshot = createDefaultSnapshot();
    const registry = new DeviceRegistry(
      () => snapshot,
      (devices) => { snapshot = { ...snapshot, devices }; },
      { modules: [], listHidDevices: async () => [] },
    );

    registry.removeLegacyFixtures();

    expect(snapshot.devices).toHaveLength(0);
    await registry.dispose();
  });

  test('bounds a stalled HID enumeration without starting overlapping native scans', async () => {
    let releaseFirst!: (devices: []) => void;
    const stalledEnumeration = new Promise<[]>((resolve) => { releaseFirst = resolve; });
    let enumerationCount = 0;
    const registry = new DeviceRegistry(
      createDefaultSnapshot,
      () => undefined,
      {
        modules: [{ id: 'device.logitech-hidpp', discover: async () => [] }],
        enumerationTimeoutMs: 5,
        listHidDevices: async () => {
          enumerationCount += 1;
          return enumerationCount === 1 ? stalledEnumeration : [];
        },
      },
    );

    await registry.refresh();
    await registry.refresh();
    expect(enumerationCount).toBe(1);

    releaseFirst([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await registry.refresh();
    expect(enumerationCount).toBe(2);
    await registry.dispose();
  });

  test('publishes device-confirmed lighting readback instead of the requested value', async () => {
    let confirmedBrightness = 90;
    const fakeModule: DeviceModule = {
      id: 'device.razer-huntsman',
      async discover({ previousDevices }) {
        const keyboard = structuredClone(previousDevices.find((device) => device.id === 'razer-huntsman-v2-analog-1'));
        if (!keyboard?.capabilities.lighting) return [];
        keyboard.capabilities.lighting.brightness = confirmedBrightness;
        keyboard.settings.lightingBrightness = confirmedBrightness;
        return [keyboard];
      },
      async setControl(_device, change) {
        if (change.type !== 'lighting-brightness') throw new Error('Unexpected control in test.');
        confirmedBrightness = 61;
        return {
          confirmedChanges: [{ type: 'lighting-brightness', brightness: confirmedBrightness }],
        };
      },
    };
    let snapshot = createDefaultSnapshot();
    const registry = new DeviceRegistry(
      () => snapshot,
      (devices) => { snapshot = { ...snapshot, devices }; },
      { modules: [fakeModule], listHidDevices: async () => [] },
    );

    await registry.setControl('razer-huntsman-v2-analog-1', { type: 'lighting-brightness', brightness: 62 });

    const keyboard = snapshot.devices.find((device) => device.id === 'razer-huntsman-v2-analog-1');
    expect(keyboard?.capabilities.lighting?.brightness).toBe(61);
    expect(keyboard?.settings.lightingBrightness).toBe(61);
    await registry.dispose();
  });

  test('does not make a confirmed control write wait for a second device discovery', async () => {
    let releaseDiscovery!: () => void;
    const discoveryGate = new Promise<void>((resolve) => { releaseDiscovery = resolve; });
    let discoveryCount = 0;
    const fakeModule: DeviceModule = {
      id: 'device.logitech-hidpp',
      async discover() {
        discoveryCount += 1;
        await discoveryGate;
        return [];
      },
      async setControl() {
        // The device write and its protocol-level acknowledgement already finished.
      },
    };
    let snapshot = createDefaultSnapshot();
    const registry = new DeviceRegistry(
      () => snapshot,
      (devices) => { snapshot = { ...snapshot, devices }; },
      { modules: [fakeModule], listHidDevices: async () => [] },
    );

    const control = registry.setControl('logitech-g502x-plus-1', { type: 'lighting-enabled', enabled: false });
    const result = await Promise.race([
      control.then(() => 'resolved' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 25)),
    ]);

    releaseDiscovery();
    await control;

    expect(result).toBe('resolved');
    expect(discoveryCount).toBe(0);
    expect(snapshot.devices.find((device) => device.id === 'logitech-g502x-plus-1')?.capabilities.lighting?.enabled)
      .toBe(false);
    await registry.dispose();
  });

  test('waits for in-flight discovery and suppresses late publication before disposing modules', async () => {
    let announceDiscovery!: () => void;
    let releaseDiscovery!: () => void;
    const discoveryStarted = new Promise<void>((resolve) => { announceDiscovery = resolve; });
    const discoveryGate = new Promise<void>((resolve) => { releaseDiscovery = resolve; });
    let moduleDisposed = false;
    const fakeModule: DeviceModule = {
      id: 'device.logitech-hidpp',
      async discover() {
        announceDiscovery();
        await discoveryGate;
        return [];
      },
      async dispose() {
        moduleDisposed = true;
      },
    };
    const snapshot = createDefaultSnapshot();
    const publications: unknown[] = [];
    const registry = new DeviceRegistry(
      () => snapshot,
      (devices) => publications.push(devices),
      { modules: [fakeModule], listHidDevices: async () => [] },
    );

    const refresh = registry.refresh();
    await discoveryStarted;
    const disposal = registry.dispose();
    await Promise.resolve();
    expect(moduleDisposed).toBe(false);

    releaseDiscovery();
    await Promise.all([refresh, disposal]);

    expect(moduleDisposed).toBe(true);
    expect(publications).toHaveLength(0);
  });

  test('waits for in-flight discovery, deactivates a disabled module, and blocks device writes', async () => {
    let announceDiscovery!: () => void;
    let releaseDiscovery!: () => void;
    const discoveryStarted = new Promise<void>((resolve) => { announceDiscovery = resolve; });
    const discoveryGate = new Promise<void>((resolve) => { releaseDiscovery = resolve; });
    let deactivated = false;
    let controlWrites = 0;
    const moduleId = 'device.logitech-hidpp';
    const fakeModule: DeviceModule = {
      id: moduleId,
      async discover({ previousDevices }) {
        announceDiscovery();
        await discoveryGate;
        return previousDevices.filter((device) => device.moduleId === moduleId);
      },
      async setControl() {
        controlWrites += 1;
      },
      async deactivate() {
        deactivated = true;
      },
    };
    let snapshot = createDefaultSnapshot();
    const registry = new DeviceRegistry(
      () => snapshot,
      (devices) => { snapshot = { ...snapshot, devices }; },
      { modules: [fakeModule], listHidDevices: async () => [] },
    );

    const refresh = registry.refresh();
    await discoveryStarted;
    snapshot.modules.find((module) => module.id === fakeModule.id)!.enabled = false;
    const disable = registry.reconcileModuleState(fakeModule.id, false);
    await Promise.resolve();
    expect(deactivated).toBe(false);

    releaseDiscovery();
    await Promise.all([refresh, disable]);

    expect(deactivated).toBe(true);
    expect(snapshot.devices.find((device) => device.moduleId === fakeModule.id)?.connected).toBe(false);
    await expect(registry.setControl('logitech-g502x-plus-1', { type: 'lighting-enabled', enabled: false }))
      .rejects.toThrow('module is disabled');
    expect(controlWrites).toBe(0);
    await registry.dispose();
  });

  test('keeps fixture mute-lighting capability and persisted setting in sync', async () => {
    const snapshot = createDefaultSnapshot();
    const microphone = snapshot.devices.find((device) => device.id === 'hyperx-quadcast2-1');
    expect(microphone).toBeDefined();
    let current = snapshot;
    const registry = new DeviceRegistry(
      () => current,
      (devices) => { current = { ...current, devices }; },
      { modules: [], listHidDevices: async () => [], fixtureMode: true },
    );

    await registry.setControl('hyperx-quadcast2-1', { type: 'microphone-mute-lighting', enabled: false });

    const updated = current.devices.find((device) => device.id === 'hyperx-quadcast2-1');
    expect(updated?.capabilities.lighting?.muteLinked).toBe(false);
    expect(updated?.settings.muteLed).toBe(false);
    await registry.dispose();
  });

  test('restores fixture connection state after a module is re-enabled without scanning physical hardware', async () => {
    let current = createDefaultSnapshot();
    let enumerations = 0;
    const registry = new DeviceRegistry(
      () => current,
      (devices) => { current = { ...current, devices }; },
      {
        modules: [],
        listHidDevices: async () => {
          enumerations += 1;
          return [];
        },
        fixtureMode: true,
      },
    );
    const moduleId = 'device.logitech-hidpp';

    current.modules.find((module) => module.id === moduleId)!.enabled = false;
    await registry.reconcileModuleState(moduleId, false);
    expect(current.devices.find((device) => device.moduleId === moduleId)?.connected).toBe(false);

    current.modules.find((module) => module.id === moduleId)!.enabled = true;
    await registry.reconcileModuleState(moduleId, true);
    expect(current.devices.find((device) => device.moduleId === moduleId)?.connected).toBe(true);
    expect(enumerations).toBe(0);
    await registry.dispose();
  });
});
