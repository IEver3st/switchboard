import { describe, expect, test } from 'bun:test';
import type { Device as HidDevice } from 'node-hid';
import {
  buildQuadCast2LightingReports,
  parseQuadCast2MuteReport,
  quadCast2StatusRed,
} from '../src/main/modules/hyperx/quadcast2-protocol';
import { QuadCast2Session, type QuadCast2HidIo } from '../src/main/modules/hyperx/quadcast2-session';

describe('QuadCast 2 hardware state', () => {
  test('decodes only absolute physical mute reports', () => {
    expect(parseQuadCast2MuteReport(Uint8Array.from([0x77, 0x06, 0x01]))).toBe(true);
    expect(parseQuadCast2MuteReport(Uint8Array.from([0x77, 0x06, 0x00]))).toBe(false);
    expect(parseQuadCast2MuteReport(Uint8Array.from([0x77, 0x05, 0x01]))).toBeNull();
    expect(parseQuadCast2MuteReport(Uint8Array.from([0x76, 0x06, 0x01]))).toBeNull();
  });

  test('builds fixed-red solid and breathing frames', () => {
    expect(quadCast2StatusRed).toBe('#f20000');
    const solid = buildQuadCast2LightingReports({
      enabled: true,
      brightness: 50,
      effectId: 'solid',
      speed: 50,
      muteLinked: true,
    }, 0, false);
    expect(solid).toHaveLength(2);
    expect(solid.every((report) => report.byteLength === 65)).toBe(true);
    expect([...solid[1]!.subarray(1, 9)]).toEqual([0x81, 0x79, 0, 0, 0x81, 0x79, 0, 0]);

    const breathingStart = buildQuadCast2LightingReports({
      enabled: true,
      brightness: 100,
      effectId: 'breathing',
      speed: 100,
      muteLinked: true,
    }, 0, false)[1]!;
    const breathingLater = buildQuadCast2LightingReports({
      enabled: true,
      brightness: 100,
      effectId: 'breathing',
      speed: 100,
      muteLinked: true,
    }, 10, false)[1]!;
    expect(breathingLater[2]).toBeGreaterThan(breathingStart[2]!);
    expect(buildQuadCast2LightingReports({
      enabled: true,
      brightness: 100,
      effectId: 'solid',
      speed: 50,
      muteLinked: true,
    }, 0, true)[1]![2]).toBe(0);
  });

  test('keeps mute monitoring and maintained lighting in one device session', async () => {
    const lightingReports: Buffer[] = [];
    let muteReadCount = 0;
    const io: QuadCast2HidIo = {
      async open(path) {
        if (path === 'mute') {
          return {
            async read() {
              muteReadCount += 1;
              if (muteReadCount === 1) return Buffer.from([0x77, 0x06, 0x01]);
              return new Promise<Buffer | undefined>(() => undefined);
            },
            async sendFeatureReport(report) { return report.byteLength; },
            async close() {},
          };
        }
        return {
          async read() { return undefined; },
          async sendFeatureReport(report) {
            lightingReports.push(Buffer.from(report));
            return report.byteLength;
          },
          async close() {},
        };
      },
    };
    const session = new QuadCast2Session(descriptors(), undefined, () => undefined, io);
    session.start();
    await flush();
    await flush();

    expect(session.getState()).toMatchObject({
      physicalMuted: true,
      lightingStatus: 'maintained',
      config: { enabled: true, muteLinked: true },
    });
    await session.applyProfile('breathe');
    expect(session.getState()).toMatchObject({
      activeProfileId: 'breathe',
      config: { effectId: 'breathing', brightness: 55, speed: 42 },
    });
    await session.applySpeed(60);
    expect(session.getState()).toMatchObject({
      activeProfileId: 'custom',
      config: { effectId: 'breathing', brightness: 55, speed: 60 },
      profiles: expect.arrayContaining([
        expect.objectContaining({ id: 'custom', effectId: 'breathing', brightness: 55, speed: 60 }),
      ]),
    });
    await session.applyProfile('broadcast');
    await session.applyProfile('custom');
    expect(session.getState()).toMatchObject({
      activeProfileId: 'custom',
      config: { effectId: 'breathing', brightness: 55, speed: 60 },
    });
    expect(lightingReports.some((report) => report[1] === 0x81 && report[2] === 0)).toBe(true);
    await session.close();
  });
});

function descriptors(): HidDevice[] {
  return [
    {
      vendorId: 0x03f0,
      productId: 0x07b4,
      path: 'mute',
      release: 1,
      interface: 2,
      usagePage: 0xffc0,
      usage: 0x01,
    },
    {
      vendorId: 0x03f0,
      productId: 0x09af,
      path: 'lighting',
      release: 1,
      interface: 0,
      usagePage: 0xff90,
      usage: 0xff00,
    },
  ];
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
