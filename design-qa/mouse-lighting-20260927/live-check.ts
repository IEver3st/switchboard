import { devicesAsync } from 'node-hid';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HidppLongTransport } from '../../src/main/modules/logitech/hidpp-long-transport';
import { G502NativeSession } from '../../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';
import type { DeviceCapabilities } from '../../src/shared/contracts';

const endpoint = (await devicesAsync()).find(d => d.vendorId === 0x046d && d.productId === 0xc547 && d.usagePage === 0xff00 && d.usage === 2);
if (!endpoint?.path) throw new Error('G502 receiver unavailable');
const saved = JSON.parse(await readFile(join(process.env.APPDATA!, 'switchboard-prototype', 'switchboard-state.json'), 'utf8'));
const previous: DeviceCapabilities = saved.devices.find((d: {kind: string}) => d.kind === 'mouse').capabilities;
const readings: Record<string, unknown> = {};
const initial = await HidppLongTransport.open(endpoint.path);
const rgb = (await initial.getFeatureIndex(1, 0x8071))!;
const ownership = [...(await initial.request(1, rgb, 5, [0, 0, 0])).subarray(5, 7)];
const power = (await initial.request(1, rgb, 8, [0, 0, 0]))[5]!;
await initial.close();
let session: G502NativeSession | undefined;
async function measure(name: string, task: () => Promise<unknown>) {
  const start = performance.now(); await task(); readings[name] = Math.round(performance.now() - start);
}
try {
  session = await G502NativeSession.open(endpoint, previous);
  await measure('staticColorMs', () => session!.setControl({type: 'lighting-color', color: previous.lighting!.color}));
  await measure('brightnessMs', () => session!.setControl({type: 'lighting-brightness', brightness: previous.lighting!.brightness}));
  // Compare identical discovery + queued Off workloads using a forced full
  // sector refresh and an ordinary mode/selection refresh in the same session.
  for (const full of [true, false]) {
    Object.assign(session, {onboardRefreshedAt: 0, ...(full ? {onboardProfileReadAt: 0} : {})});
    await measure(full ? 'fullProfileThenOffMs' : 'cachedProfileThenOffMs', async () => {
      await Promise.all([session!.getCapabilities(), session!.setControl({type:'lighting-enabled', enabled:false})]);
    });
  }
  readings.confirmed = (await session.getCapabilities()).lighting;
  const reset = await HidppLongTransport.open(endpoint.path);
  try {
    await reset.request(1, rgb, 8, [1, 1, 0]);
    await reset.request(1, rgb, 5, [1, 0, 0]);
  } finally { await reset.close(); }
  readings.afterOwnershipRecovery = (await session.getCapabilities()).lighting?.state;
  const selected = await session.getCapabilities();
  await session.close();
  await session.close();
  session = await G502NativeSession.open(endpoint, selected);
  readings.afterReopen = (await session.getCapabilities()).lighting?.state;
  const verify = await HidppLongTransport.open(endpoint.path);
  try { readings.powerAfterReopen = (await verify.request(1, rgb, 8, [0, 0, 0]))[5]; }
  finally { await verify.close(); }
} finally {
  if (session) {
    await session.setControl({ type:'lighting-effect', effectId: previous.lighting!.activeEffectId });
    await session.setControl({ type:'lighting-enabled', enabled: previous.lighting!.enabled });
    await session.close();
  }
  const restore = await HidppLongTransport.open(endpoint.path);
  try {
    await restore.request(1, rgb, 5, [1, 3, 4]);
    await restore.request(1, rgb, 8, [1, power, 0]);
    await restore.request(1, rgb, 5, [1, ...ownership]);
    readings.restoredPower = (await restore.request(1, rgb, 8, [0, 0, 0]))[5];
  } finally { await restore.close(); }
}
await writeFile(join(import.meta.dir, process.argv[2] ?? 'live.json'), JSON.stringify(readings, null, 2));
console.log(JSON.stringify(readings, null, 2));
