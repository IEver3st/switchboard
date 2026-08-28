import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { AddonProjectManifest } from '../src/shared/contracts';
import { SandboxedDeviceAddon } from '../src/main/modules/sandboxed-device-addon';

const projectPath = await mkdtemp(join(tmpdir(), 'switchboard-module-sandbox-'));
app.setName('switchboard-module-sandbox-review');
app.setAppPath(process.cwd());
app.setPath('userData', join(projectPath, 'user-data'));
const watchdog = setTimeout(() => {
  console.error('Module sandbox review exceeded the 10-second lifecycle limit.');
  app.exit(2);
}, 10_000);
const entrypointPath = join(projectPath, 'index.js');
const manifest: AddonProjectManifest = {
  schemaVersion: 1,
  id: 'device.switchboard.sandbox-review',
  name: 'Sandbox Review Device',
  description: 'Exercises the isolated local device discovery module host.',
  author: 'Switchboard',
  version: '0.1.0',
  minimumCoreVersion: '0.5.0',
  kind: 'device',
  entrypoint: 'index.js',
  capabilities: ['device-discovery'],
  permissions: { hid: [{ vendorId: '1234', productIds: ['abcd'] }] },
};

await writeFile(entrypointPath, `
    export default {
      async detect(context) {
        let network = 'open';
        try { await fetch('https://example.com/module-host-probe'); }
        catch { network = 'blocked'; }
        return context.hidDevices.map((device) => ({
          deviceKey: device.deviceKey,
          displayName: ['Sandbox Review', typeof process, typeof require, typeof globalThis.switchboard, network].join(' · '),
          kind: 'keyboard',
          identity: { manufacturer: 'Switchboard', model: 'Sandbox Fixture', connection: 'usb' },
        }));
      },
    };
  `, 'utf8');

void app.whenReady().then(runReview).catch(async (error) => {
  console.error(error);
  await cleanup();
  app.exit(1);
});

async function runReview(): Promise<void> {
  const states: Array<{ status: string; message?: string }> = [];
  const addon = new SandboxedDeviceAddon(manifest, entrypointPath, (_moduleId, status, message) => {
    states.push({ status, message });
  });
  const discoveryContext = {
    hidDevices: [{
      path: '\\\\?\\hid#sandbox-review',
      vendorId: 0x1234,
      productId: 0xabcd,
      manufacturer: 'Fixture Manufacturer',
      product: 'Fixture Product',
      serialNumber: 'fixture-serial',
      usagePage: 1,
      usage: 6,
    }],
    previousDevices: [],
    appearanceOverrides: {},
  };

  const devices = await addon.discover(discoveryContext);
  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.displayName, 'Sandbox Review · undefined · undefined · undefined · blocked');
  assert.deepEqual(devices[0]?.capabilities, {});
  assert.equal(devices[0]?.identity.vendorId, 0x1234);
  assert.equal(devices[0]?.identity.productId, 0xabcd);
  assert.equal(states.at(-1)?.status, 'active');
  assert.equal(BrowserWindow.getAllWindows().length, 1);

  await addon.deactivate();
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  const unpermitted = await addon.discover({
    ...discoveryContext,
    hidDevices: [{ ...discoveryContext.hidDevices[0]!, productId: 0xffff }],
  });
  assert.deepEqual(unpermitted, []);
  assert.equal(states.at(-1)?.status, 'ready');
  assert.equal(BrowserWindow.getAllWindows().length, 0);

  await addon.dispose();
  console.log(JSON.stringify({
    sandbox: 'passed',
    resultCount: devices.length,
    finalWindows: BrowserWindow.getAllWindows().length,
    states,
  }, null, 2));
  await cleanup();
  app.quit();
}

async function cleanup(): Promise<void> {
  clearTimeout(watchdog);
  await rm(projectPath, { recursive: true, force: true });
}
