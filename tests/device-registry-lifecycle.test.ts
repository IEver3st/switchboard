import { describe, expect, test } from 'bun:test';
import type { DeviceModule } from '../src/main/modules/device-module';
import { DeviceRegistry } from '../src/main/services/device-registry';
import { createDefaultSnapshot } from '../src/shared/defaults';

describe('device registry lifecycle', () => {
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
