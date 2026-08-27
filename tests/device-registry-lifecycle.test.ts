import { describe, expect, test } from 'bun:test';
import type { DeviceModule } from '../src/main/modules/device-module';
import { DeviceRegistry } from '../src/main/services/device-registry';
import { createDefaultSnapshot } from '../src/shared/defaults';

describe('device registry lifecycle', () => {
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
