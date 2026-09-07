import { expect, spyOn, test } from 'bun:test';
import type { Device } from 'node-hid';
import { HidppLongTransport } from '../src/main/modules/logitech/hidpp-long-transport';
import { G502NativeSession } from '../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';
import { crcCcitt } from '../src/main/modules/logitech/devices/g502-x-plus/onboard-profile';

function mouseTransport() {
  let listener: ((report: Buffer) => void) | undefined;
  let dpi = 1600;
  let profileAvailable = true;
  let spyEnabled = false;
  let pressOnEnable = false;
  const writes: number[] = [];
  const sector = Buffer.alloc(255, 0xff);
  sector.set([1, 0, 1]);
  sector.writeUInt16LE(1600, 3);
  sector.writeUInt16LE(400, 5);
  sector.set([0x90, 7, 0, 0], 32 + 4 * 4);
  sector.fill(0, 219, 230);
  sector.writeUInt16BE(crcCcitt(sector.subarray(0, 253)), 253);
  const directory = Buffer.alloc(255, 0xff);
  directory.set([0, 1, 1, 0]);
  const reply = (payload: number[] | Buffer = []) => {
    const report = Buffer.alloc(20);
    report.set(payload, 4);
    return report;
  };
  const button = (held: boolean) => {
    if (spyEnabled) listener?.(Buffer.from([0x11, 1, 3, 0, 0, held ? 16 : 0]));
  };
  const transport = {
    getFeatureIndex: async (_device: number, feature: number) => (
      new Map([[0x0005, 1], [0x2201, 2], [0x8110, 3], [0x8100, 4]]).get(feature) ?? null
    ),
    subscribe: (callback: (report: Buffer) => void) => {
      listener = callback;
      return () => { listener = undefined; };
    },
    close: async () => { listener = undefined; },
    request: async (_device: number, feature: number, fn: number, params: readonly number[] = []) => {
      if (feature === 0) return reply();
      if (feature === 1) return fn === 0 ? reply([11]) : reply(Buffer.from('G502 X Plus'));
      if (feature === 2) {
        if (fn === 1) return reply([0, 1, 144, 3, 32, 6, 64, 0, 0]);
        if (fn === 2) return reply([0, dpi >>> 8, dpi & 255]);
        if (fn === 3) { dpi = (params[1]! << 8) | params[2]!; writes.push(dpi); return reply(); }
      }
      if (feature === 3) {
        if (fn === 0) return reply([11]);
        spyEnabled = fn === 1;
        if (spyEnabled && pressOnEnable) { pressOnEnable = false; button(true); }
        return reply();
      }
      if (feature === 4) {
        if (!profileAvailable) throw new Error('Mouse profile not ready');
        if (fn === 0) return reply([1, 5, 1, 5, 2, 11, 16, 0, 255, 10, 4]);
        if (fn === 2) return reply([1]);
        if (fn === 4) return reply([0, 1]);
        if (fn === 5) {
          const data = params[1] === 0 ? directory : sector;
          const offset = (params[2]! << 8) | params[3]!;
          return reply(data.subarray(offset, offset + 16));
        }
      }
      throw new Error(`Unexpected request ${feature}/${fn}`);
    },
  };
  return {
    transport, writes, button,
    setProfileAvailable: (value: boolean) => { profileAvailable = value; },
    pressOnEnable: () => { pressOnEnable = true; },
    loseSpy: () => { spyEnabled = false; },
  };
}

test('captures the first button event when startup enables reporting', async () => {
  const mouse = mouseTransport();
  mouse.pressOnEnable();
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    await session.getCapabilities();
    mouse.button(false);
    await session.close();
    expect(mouse.writes).toEqual([400, 1600]);
  } finally { await session?.close(); open.mockRestore(); }
});

test('recovers the stored shift value after the startup profile read fails', async () => {
  const mouse = mouseTransport();
  mouse.setProfileAvailable(false);
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    mouse.setProfileAvailable(true);
    expect((await session.getCapabilities()).dpi?.shiftDpi).toBe(400);
    mouse.button(true);
    mouse.button(false);
    await session.close();
    expect(mouse.writes).toEqual([400, 1600]);
  } finally { await session?.close(); open.mockRestore(); }
});

test('restores button reporting on discovery after the device loses it', async () => {
  const mouse = mouseTransport();
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    mouse.loseSpy();
    await session.getCapabilities();
    mouse.button(true);
    mouse.button(false);
    await session.close();
    expect(mouse.writes).toEqual([400, 1600]);
    mouse.button(true);
    expect(mouse.writes).toEqual([400, 1600]);
  } finally { await session?.close(); open.mockRestore(); }
});
