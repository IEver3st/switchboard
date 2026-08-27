import { describe, expect, mock, test } from 'bun:test';
import type { DeviceModule } from '../src/main/modules/device-module';
import { createDefaultSnapshot } from '../src/shared/defaults';

mock.module('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

const { DeviceRegistry } = await import('../src/main/services/device-registry');

describe('device registry lifecycle', () => {
  test('bounds a stalled HID enumeration without starting overlapping native scans', async () => {
    let releaseFirst!: (devices: []) => void;
    const stalledEnumeration = new Promise<[]>((resolve) => { releaseFirst = resolve; });
    let enumerationCount = 0;
    const registry = new DeviceRegistry(
      createDefaultSnapshot,
      () => undefined,
      {
        modules: [],
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
});
