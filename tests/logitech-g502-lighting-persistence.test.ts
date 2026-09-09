import { expect, spyOn, test } from 'bun:test';
import type { Device } from 'node-hid';
import { HidppLongTransport } from '../src/main/modules/logitech/hidpp-long-transport';
import { G502NativeSession } from '../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';
import { crcCcitt } from '../src/main/modules/logitech/devices/g502-x-plus/onboard-profile';
import { deviceCapabilitiesSchema } from '../src/shared/contracts';

const infoBytes = [1, 5, 1, 5, 2, 11, 16, 0, 255, 10, 4];

function mouseFixture() {
  let mode = 2;
  let power = 1;
  let owned = false;
  let rejectRelease = false;
  let corruptReadback = false;
  let rejectRgbProbe = false;
  let commits = 0;
  let writeBytes: number[] | null = null;
  const operations: string[] = [];
  const sector = Buffer.alloc(255, 0xff);
  sector.set([1, 0, 1]);
  sector.writeUInt16LE(1600, 3);
  sector.writeUInt16LE(400, 5);
  sector.set([0x90, 7, 0, 0], 48);
  sector.fill(0, 208, 252);
  for (const offset of [208, 230, 241]) sector[offset] = 0x0f;
  sector.writeUInt16BE(crcCcitt(sector.subarray(0, 253)), 253);
  const directory = Buffer.alloc(255, 0xff);
  directory.set([0, 1, 1, 0]);
  const reply = (payload: readonly number[] | Buffer = []) => {
    const result = Buffer.alloc(20);
    result.set(payload, 4);
    return result;
  };
  const transport = {
    getFeatureIndex: async (_device: number, feature: number) => (
      new Map([[0x0005, 1], [0x2201, 2], [0x8110, 3], [0x8100, 4], [0x8071, 9]]).get(feature) ?? null
    ),
    subscribe: () => () => {},
    close: async () => {},
    request: async (_device: number, feature: number, fn: number, params: readonly number[] = []) => {
      operations.push(`${feature}/${fn}`);
      if (writeBytes && !(feature === 4 && (fn === 7 || fn === 8))) {
        throw new Error('Another operation interleaved with a profile write');
      }
      if (feature === 0) return reply();
      if (feature === 1) return fn === 0 ? reply([11]) : reply(Buffer.from('G502 X Plus'));
      if (feature === 2) {
        if (fn === 1) return reply([0, 1, 144, 3, 32, 6, 64, 0, 0]);
        if (fn === 2) return reply([0, 6, 64]);
        return reply();
      }
      if (feature === 3) return reply([11]);
      if (feature === 9) {
        if (fn === 0) {
          if (rejectRgbProbe) throw new Error('RGB not ready');
          if (params[0] === 255) return reply([0, 0, 1]);
          if (params[1] === 255) return reply([0, 0, 0, 0, 2]);
          return reply([0, 0, 0, params[1] === 0 ? 0 : 1]);
        }
        if (fn === 5) {
          if (params[0] === 0) return reply([0, owned ? 3 : 0, 4]);
          if (params[1] === 0 && rejectRelease) throw new Error('release rejected');
          owned = params[1] !== 0;
        }
        if (fn === 8) {
          if (params[0] === 1) power = params[1]!;
          return reply([0, corruptReadback ? 1 : power]);
        }
        return reply();
      }
      if (feature === 4) {
        if (fn === 0) return reply(infoBytes);
        if (fn === 1) { mode = params[0]!; power = 1; owned = false; return reply(); }
        if (fn === 2) return reply([mode]);
        if (fn === 4) return reply([0, 1]);
        if (fn === 5) {
          const data = Buffer.from(params[1] === 0 ? directory : sector);
          if (params[1] !== 0 && corruptReadback && commits > 0) data[208] = 1;
          const offset = (params[2]! << 8) | params[3]!;
          return reply(data.subarray(offset, offset + 16));
        }
        if (fn === 6) {
          if (owned) throw new Error('Flash write with live RGB ownership');
          writeBytes = [];
        }
        if (fn === 7) writeBytes!.push(...params);
        if (fn === 8) {
          expect(writeBytes).toHaveLength(255);
          sector.set(writeBytes!);
          writeBytes = null;
          commits++;
        }
        return reply();
      }
      throw new Error(`Unexpected ${feature}/${fn}`);
    },
  };
  return { transport, sector, operations, commits: () => commits,
    power: () => power,
    resetLighting: () => { power = 1; owned = false; },
    restoreReadback: () => { corruptReadback = false; },
    rejectRgbProbe: (reject: boolean) => { rejectRgbProbe = reject; },
    rejectRelease: () => { rejectRelease = true; },
    corruptReadback: () => { corruptReadback = true; } };
}

test('Off stays live across both profile modes without writing onboard lighting records', async () => {
  const mouse = mouseFixture();
  const before = Buffer.from(mouse.sector);
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    await session.setControl({ type: 'lighting-enabled', enabled: true });
    await Promise.all([
      session.setControl({ type: 'lighting-enabled', enabled: false }),
      session.getCapabilities(),
    ]);
    expect(mouse.sector).toEqual(before);
    expect(mouse.power()).toBe(3);
    expect((await session.getCapabilities()).onboardMemory?.enabled).toBe(false);
    expect((await session.getCapabilities()).lighting).toMatchObject({ enabled: false, state: 'acknowledged' });
    await session.setControl({ type: 'lighting-enabled', enabled: false });
    expect(mouse.commits()).toBe(0);
    for (const enabled of [true, false, true, false]) {
      await session.setControl({ type: 'onboard-memory', enabled });
      expect((await session.getCapabilities()).onboardMemory?.enabled).toBe(enabled);
      expect((await session.getCapabilities()).lighting)
        .toMatchObject({ enabled: false, source: 'software', writable: true, state: 'acknowledged' });
      expect(mouse.power()).toBe(3);
    }
    expect(mouse.sector).toEqual(before);
    await session.setControl({ type: 'dpi', value: 800 });
    expect(mouse.commits()).toBe(1);
    expect(mouse.sector.subarray(208, 252)).toEqual(before.subarray(208, 252));
    expect(mouse.power()).toBe(3);
  } finally { await session?.close(); open.mockRestore(); }
});

test('startup and receiver recovery retain Off through a failed readback and repeated session restarts', async () => {
  const mouse = mouseFixture();
  const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
  let session: G502NativeSession | undefined;
  try {
    session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
    await session.setControl({ type: 'lighting-enabled', enabled: false });
    mouse.resetLighting();
    mouse.corruptReadback();
    const unknown = await session.getCapabilities();
    expect(unknown.lighting).toMatchObject({ enabled: false, state: 'unknown', selectionSaved: true });
    let saved = deviceCapabilitiesSchema.parse(JSON.parse(JSON.stringify(unknown)));
    await session.close();
    await session.close();
    mouse.restoreReadback();
    mouse.rejectRgbProbe(true);
    await expect(G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, saved))
      .rejects.toThrow('RGB not ready');
    mouse.rejectRgbProbe(false);
    for (let restart = 0; restart < 2; restart++) {
      mouse.resetLighting();
      session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, saved);
      expect(mouse.power()).toBe(3);
      mouse.resetLighting();
      saved = await session.getCapabilities();
      expect(saved.lighting).toMatchObject({ enabled: false, state: 'acknowledged', selectionSaved: true });
      expect(mouse.power()).toBe(3);
      await session.close();
    }
    expect(mouse.commits()).toBe(0);
  } finally { await session?.close(); open.mockRestore(); }
});

test('failed power readback leaves lighting unknown after a mode change', async () => {
    const mouse = mouseFixture();
    const open = spyOn(HidppLongTransport, 'open').mockResolvedValue(mouse.transport as unknown as HidppLongTransport);
    let session: G502NativeSession | undefined;
    try {
      session = await G502NativeSession.open({ path: 'fixture', productId: 0xc547 } as Device, undefined);
      await session.setControl({ type: 'lighting-enabled', enabled: false });
      mouse.corruptReadback();
      await session.setControl({ type: 'onboard-memory', enabled: true });
      expect((await session.getCapabilities()).onboardMemory?.enabled).toBe(true);
      expect((await session.getCapabilities()).lighting?.state).toBe('unknown');
      await expect(session.setControl({ type: 'lighting-enabled', enabled: false }))
        .rejects.toThrow('confirm');
      expect(mouse.commits()).toBe(0);
      expect((await session.getCapabilities()).lighting?.state).toBe('unknown');
    } finally { await session?.close(); open.mockRestore(); }
});
