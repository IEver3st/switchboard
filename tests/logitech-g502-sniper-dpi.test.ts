import { describe, expect, test } from 'bun:test';
import {
  inferDpiStep,
  parseAdjustableReportRateListPayload,
  parseAdjustableReportRatePayload,
  parseAdjustableDpiListPayload,
  parseMouseButtonSpyNotification,
  SniperDpiRuntime,
} from '../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';

describe('G502 X Plus hold-to-shift DPI', () => {
  test('expands the device-reported DPI range encoding', () => {
    expect(parseAdjustableDpiListPayload(Uint8Array.from([
      0x00,
      0x00, 0x64,
      0xe0, 0x32,
      0x64, 0x00,
      0x00, 0x00,
    ]))).toEqual(Array.from({ length: 511 }, (_, index) => 100 + index * 50));
    expect(inferDpiStep([100, 150, 200, 250])).toBe(50);
  });

  test('decodes the device-reported polling rates and current interval', () => {
    expect(parseAdjustableReportRateListPayload(Uint8Array.from([0x8b]))).toEqual([125, 250, 500, 1_000]);
    expect(parseAdjustableReportRatePayload(Uint8Array.from([0x02]))).toBe(500);
  });

  test('accepts only unsolicited MouseButtonSpy reports from the matching mouse', () => {
    expect(parseMouseButtonSpyNotification(
      Uint8Array.from([0x11, 0x01, 0x0c, 0x00, 0x00, 0x10]),
      0x01,
      0x0c,
    )).toBe(0x0010);
    expect(parseMouseButtonSpyNotification(
      Uint8Array.from([0x11, 0x02, 0x0c, 0x00, 0x00, 0x10]),
      0x01,
      0x0c,
    )).toBeNull();
    expect(parseMouseButtonSpyNotification(
      Uint8Array.from([0x11, 0x01, 0x0c, 0x07, 0x00, 0x10]),
      0x01,
      0x0c,
    )).toBeNull();
  });

  test('writes shift on press and restores the base DPI on release', async () => {
    let hardwareDpi = 1_600;
    const writes: number[] = [];
    const runtime = new SniperDpiRuntime({
      read: async () => hardwareDpi,
      write: async (dpi) => {
        writes.push(dpi);
        hardwareDpi = dpi;
      },
    }, 1_600, 800);

    runtime.handleButtonBitmap(0x0010);
    runtime.handleButtonBitmap(0x0010);
    runtime.handleButtonBitmap(0x0000);
    await runtime.idle();

    expect(writes).toEqual([800, 1_600]);
    expect(hardwareDpi).toBe(1_600);
    expect(runtime.currentBaseDpi).toBe(1_600);
  });

  test('a quick release is serialized after the pending shift write', async () => {
    const writes: number[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    const runtime = new SniperDpiRuntime({
      read: async () => 3_200,
      write: async (dpi) => {
        writes.push(dpi);
        if (writes.length === 1) await firstWriteBlocked;
      },
    }, 3_200, 600);

    runtime.handleButtonBitmap(0x0010);
    runtime.handleButtonBitmap(0x0000);
    await Promise.resolve();
    expect(writes).toEqual([600]);
    releaseFirstWrite?.();
    await runtime.idle();

    expect(writes).toEqual([600, 3_200]);
  });

  test('dispose restores DPI when shutdown occurs during a hold', async () => {
    const writes: number[] = [];
    const runtime = new SniperDpiRuntime({
      read: async () => 2_400,
      write: async (dpi) => { writes.push(dpi); },
    }, 2_400, 700);

    runtime.handleButtonBitmap(0x0010);
    await runtime.idle();
    await runtime.dispose();

    expect(writes).toEqual([700, 2_400]);
  });

  test('uses the G502 X slot-4 bitmap instead of the older G502 slot-5 assumption', async () => {
    const writes: number[] = [];
    const runtime = new SniperDpiRuntime({
      read: async () => 3_200,
      write: async (dpi) => { writes.push(dpi); },
    }, 3_200, 400);

    runtime.handleButtonBitmap(0x0020);
    await runtime.idle();
    expect(writes).toEqual([]);

    runtime.handleButtonBitmap(0x0010);
    runtime.handleButtonBitmap(0x0000);
    await runtime.idle();
    expect(writes).toEqual([400, 3_200]);
  });
});
