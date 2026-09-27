import { expect, spyOn, test } from 'bun:test';
import type { Device } from 'node-hid';
import { HidppLongTransport, HidppRequestTimeoutError } from '../src/main/modules/logitech/hidpp-long-transport';
import { G502NativeSession } from '../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';
import { crcCcitt } from '../src/main/modules/logitech/devices/g502-x-plus/onboard-profile';

function mouseTransport() {
  let listener: ((report: Buffer) => void) | undefined;
  let dpi = 1600;
  let profileAvailable = true;
  let spyEnabled = false;
  let pressOnEnable = false;
  let profileTimeouts = 0;
  let spyStarts = 0;
  const requests: string[] = [];
  const profileRequests: number[] = [];
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
      new Map([[0x0005, 1], [0x2201, 2], [0x8110, 3], [0x8100, 4], [0x1d4b, 5], [0x1004, 6], [0x8060, 7]]).get(feature) ?? null
    ),
    subscribe: (callback: (report: Buffer) => void) => {
      listener = callback;
      return () => { listener = undefined; };
    },
    close: async () => { listener = undefined; },
    request: async (_device: number, feature: number, fn: number, params: readonly number[] = []) => {
      requests.push(`${feature}/${fn}`);
      if (feature === 0) return reply();
      if (feature === 1) return fn === 0 ? reply([11]) : reply(Buffer.from('G502 X Plus'));
      if (feature === 2) {
        if (fn === 1) return reply([0, 1, 144, 3, 32, 6, 64, 0, 0]);
        if (fn === 2) {
          return reply([0, dpi >>> 8, dpi & 255]);
        }
        if (fn === 3) { dpi = (params[1]! << 8) | params[2]!; writes.push(dpi); return reply(); }
      }
      if (feature === 3) {
        if (fn === 0) return reply([11]);
        spyEnabled = fn === 1;
        if (spyEnabled) spyStarts++;
        if (spyEnabled && pressOnEnable) { pressOnEnable = false; button(true); }
        return reply();
      }
      if (feature === 4) {
        profileRequests.push(fn);
        if (profileTimeouts > 0) { profileTimeouts--; throw new HidppRequestTimeoutError(feature, fn); }
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
      if (feature === 6) return reply([52, 0, 0]);
      if (feature === 7) return reply([1]);
      throw new Error(`Unexpected request ${feature}/${fn}`);
    },
  };
  return {
    transport, writes, button, profileRequests, requests,
    notify: (report: number[]) => listener?.(Buffer.from(report)),
    profileChanged: () => listener?.(Buffer.from([0x11, 1, 4, 0, 0, 1])),
    timeoutProfileReads: (count: number) => { profileTimeouts = count; },
    setProfileAvailable: (value: boolean) => { profileAvailable = value; },
    pressOnEnable: () => { pressOnEnable = true; },
    reconnect: () => { spyEnabled = false; listener?.(Buffer.from([0x11, 1, 5, 0, 0, 1, 1])); },
    spyStarts: () => spyStarts,
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

test('retries a timed-out profile probe once and reuses geometry on subsequent live reads', async () => {
  const mouse = mouseTransport();
  mouse.timeoutProfileReads(1);
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let now = 100_000;
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    expect(mouse.profileRequests.filter(fn => fn === 0)).toHaveLength(2);
    mouse.profileRequests.length = 0;
    now += 60_000;
    mouse.timeoutProfileReads(1);
    mouse.profileChanged();
    expect((await session.getCapabilities()).dpi?.shiftDpi).toBe(400);
    expect(mouse.profileRequests.filter(fn => fn === 0)).toHaveLength(0);
    expect(mouse.profileRequests.filter(fn => fn === 2)).toHaveLength(2);
    expect(mouse.profileRequests).toContain(5);
    expect(mouse.writes).toEqual([]);
  } finally { await session?.close(); clock.mockRestore(); open.mockRestore(); }
});

test('backs off persistent profile timeouts, retains confirmed state and recovers on discovery', async () => {
  const mouse = mouseTransport();
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let now = 100_000;
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    mouse.profileRequests.length = 0;
    mouse.timeoutProfileReads(4);
    mouse.profileChanged();
    now += 5_000;
    expect((await session.getCapabilities()).dpi?.shiftDpi).toBe(400);
    expect(mouse.profileRequests).toHaveLength(2);
    now += 1_000;
    await session.getCapabilities();
    expect(mouse.profileRequests).toHaveLength(2);
    now += 4_000;
    await session.getCapabilities();
    expect(mouse.profileRequests).toHaveLength(4);
    now += 5_000;
    await session.getCapabilities();
    expect(mouse.profileRequests).toHaveLength(4);
    expect(warn).toHaveBeenCalledTimes(1);
    now += 5_000;
    expect((await session.getCapabilities()).onboardMemory?.activeProfile).toBe('Profile 1');
    expect(mouse.profileRequests.length).toBeGreaterThan(4);
    const requests = mouse.profileRequests.length;
    now += 5_000;
    await session.getCapabilities();
    expect(mouse.profileRequests.length).toBe(requests);
  } finally { await session?.close(); warn.mockRestore(); clock.mockRestore(); open.mockRestore(); }
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

test('healthy discovery sends no HID queries; reconnect rearms the button monitor once', async () => {
  const mouse = mouseTransport();
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    expect(mouse.spyStarts()).toBe(1);
    await session.getCapabilities();
    mouse.requests.length = 0;
    await session.getCapabilities();
    expect(mouse.requests).toEqual([]);
    expect(mouse.spyStarts()).toBe(1);
    mouse.reconnect();
    await session.getCapabilities();
    expect(mouse.spyStarts()).toBe(2);
    await session.getCapabilities();
    expect(mouse.spyStarts()).toBe(2);
    mouse.button(true);
    mouse.button(false);
    await session.close();
    expect(mouse.writes).toEqual([400, 1600]);
    mouse.button(true);
    expect(mouse.writes).toEqual([400, 1600]);
  } finally { await session?.close(); open.mockRestore(); }
});

test('battery notifications update confirmed values without reads and ignore other clients or malformed packets', async () => {
  const mouse = mouseTransport();
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    expect((await session.getCapabilities()).battery?.percentage).toBe(52);
    mouse.requests.length = 0;
    mouse.notify([0x11, 1, 6, 0, 51, 0, 1]);
    const confirmed = (await session.getCapabilities()).battery;
    expect(confirmed).toMatchObject({ percentage: 51, charging: true });
    mouse.notify([0x11, 1, 6, 7, 20, 0, 0]);
    mouse.notify([0x11, 2, 6, 0, 20, 0, 0]);
    mouse.notify([0x11, 1, 6, 0, 255, 0, 0]);
    expect((await session.getCapabilities()).battery).toEqual(confirmed);
    expect(mouse.requests).toEqual([]);
    mouse.notify([0x10, 1, 0x41, 1, 0x40, 0, 0]);
    expect((await session.getCapabilities()).battery).toBeUndefined();
    expect(mouse.requests).toEqual([]);
    mouse.notify([0x10, 1, 0x41, 1, 0, 0, 0]);
    expect((await session.getCapabilities()).battery?.percentage).toBe(52);
    expect(mouse.spyStarts()).toBe(2);
  } finally { await session?.close(); open.mockRestore(); }
});
