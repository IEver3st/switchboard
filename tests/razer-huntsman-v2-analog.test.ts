import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Device as HidDevice } from 'node-hid';
import { RazerHuntsmanV2AnalogModule, type HuntsmanControlTransport } from '../src/main/modules/razer';
import {
  brightnessWriteCommand,
  buildRazerReport,
  effectWriteCommand,
  firmwareVersionCommand,
  parseBrightness,
  parseFirmwareVersion,
  parseRazerResponse,
  razerCrc,
  razerReportLength,
} from '../src/main/modules/razer/huntsman-v2-analog-protocol';
import { resolveProductAsset } from '../src/shared/product-assets';
import { StateStore } from '../src/main/services/state-store';

describe('Razer Huntsman V2 Analog protocol', () => {
  test('builds the 91-byte feature report and checksum used by the control collection', () => {
    const command = brightnessWriteCommand(50);
    const report = buildRazerReport(command);

    expect(report).toHaveLength(razerReportLength);
    expect([...report.subarray(0, 10)]).toEqual([0, 0, 0x1f, 0, 0, 0, 3, 0x0f, 0x04, 0x01]);
    expect([...report.subarray(9, 12)]).toEqual([0x01, 0x05, 128]);
    expect(report[89]).toBe(razerCrc(report));
  });

  test('encodes firmware quick effects without starting a frame stream', () => {
    const report = buildRazerReport(effectWriteCommand('static', '#44aaff'));
    expect([...report.subarray(9, 18)]).toEqual([0x01, 0x05, 0x01, 0, 0, 1, 0x44, 0xaa, 0xff]);
    expect(report[6]).toBe(9);
  });

  test('validates and parses device responses', () => {
    const firmwareCommand = firmwareVersionCommand();
    const firmware = responseFor(firmwareCommand, [1, 6]);
    expect(parseFirmwareVersion(parseRazerResponse(firmware, firmwareCommand))).toBe('1.06');

    const brightnessCommand = {
      transactionId: 0x1f,
      commandClass: 0x0f,
      commandId: 0x84,
      arguments: [1, 5, 0],
    };
    expect(parseBrightness(parseRazerResponse(responseFor(brightnessCommand, [1, 5, 230]), brightnessCommand))).toBe(90);

    const corrupt = Buffer.from(firmware);
    corrupt[89] ^= 0xff;
    expect(() => parseRazerResponse(corrupt, firmwareCommand)).toThrow('checksum');
  });
});

describe('Razer Huntsman V2 Analog module', () => {
  test('discovers the dedicated endpoint and publishes only verified native controls', async () => {
    const effects: Array<{ effectId: string; color: string }> = [];
    const brightnessWrites: number[] = [];
    const transport: HuntsmanControlTransport = {
      async probe(path) {
        expect(path).toBe('razer-control');
        return { firmwareVersion: '1.06', serialNumber: 'TEST-SERIAL', brightness: 90 };
      },
      async setBrightness(_path, brightness) {
        brightnessWrites.push(brightness);
        return 61;
      },
      async setEffect(_path, effectId, color) { effects.push({ effectId, color }); },
    };
    let clock = 1_000;
    const module = new RazerHuntsmanV2AnalogModule({ transport, now: () => clock });
    const [device] = await module.discover({
      hidDevices: descriptors(),
      previousDevices: [],
      appearanceOverrides: {},
    });

    expect(device).toMatchObject({
      id: 'razer:TEST-SERIAL',
      moduleId: 'device.razer-huntsman',
      kind: 'keyboard',
      capabilities: {
        keyboard: { firmwareVersion: '1.06', transport: 'native-hid', pollingRateHz: 1_000 },
        lighting: { writable: true, brightness: 90, state: 'unknown', physicalEffectVerified: false },
      },
    });
    expect(device?.capabilities.keyboard?.features.find((feature) => feature.id === 'actuation')).toMatchObject({
      status: 'synapse',
      unavailableReason: expect.any(String),
    });
    expect(resolveProductAsset(device!.identity, 'keyboard').key).toBe('razer-huntsman-v2-analog');

    await module.setControl(device!, { type: 'lighting-effect', effectId: 'static' });
    await module.setControl(device!, { type: 'lighting-color', color: '#4466aa' });
    await module.setControl(device!, { type: 'lighting-brightness', brightness: 62 });
    await module.setControl(device!, { type: 'lighting-enabled', enabled: false });
    await module.setControl(device!, { type: 'lighting-enabled', enabled: true });
    expect(effects).toEqual([
      { effectId: 'static', color: '#44aaff' },
      { effectId: 'static', color: '#4466aa' },
      { effectId: 'off', color: '#4466aa' },
      { effectId: 'static', color: '#4466aa' },
    ]);
    expect(brightnessWrites).toEqual([62]);
    clock += 1;
    const [updated] = await module.discover({ hidDevices: descriptors(), previousDevices: [device!], appearanceOverrides: {} });
    expect(updated?.capabilities.lighting).toMatchObject({
      activeEffectId: 'static',
      color: '#4466aa',
      brightness: 61,
      enabled: true,
      state: 'acknowledged',
    });
    expect(updated?.settings).toMatchObject({
      lightingEffect: 'static',
      lightingColor: '#4466aa',
      lightingBrightness: 61,
      lightingEnabled: true,
    });

    await module.deactivate();
    await module.dispose();
  });

  test('leaves controls present but unavailable when the probe fails', async () => {
    const transport: HuntsmanControlTransport = {
      async probe() { throw new Error('Access denied by HIDAPI.'); },
      async setBrightness(_path, brightness) { return brightness; },
      async setEffect() {},
    };
    const module = new RazerHuntsmanV2AnalogModule({ transport, now: () => 0 });
    const [device] = await module.discover({ hidDevices: descriptors(), previousDevices: [], appearanceOverrides: {} });
    expect(device?.capabilities).toMatchObject({
      keyboard: { transport: 'unavailable' },
      lighting: { writable: false, unavailableReason: 'Access denied by HIDAPI.' },
    });
    await module.dispose();
  });

  test('adds the installed module to an existing persisted snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-razer-state-'));
    const statePath = join(directory, 'switchboard-state.json');
    const original = new StateStore(statePath);
    await original.load();
    original.update((snapshot) => {
      snapshot.modules = snapshot.modules.filter((module) => module.id !== 'device.razer-huntsman');
    });
    await original.flush();

    const reloaded = new StateStore(statePath);
    await reloaded.load();
    expect(reloaded.get().modules.find((module) => module.id === 'device.razer-huntsman')).toMatchObject({
      installed: true,
      enabled: true,
    });
  });
});

function responseFor(
  command: { transactionId: number; commandClass: number; commandId: number; arguments: readonly number[] },
  responseArguments: readonly number[],
): Buffer {
  const report = buildRazerReport({ ...command, arguments: responseArguments });
  report[1] = 0x02;
  report[89] = razerCrc(report);
  return report;
}

function descriptors(): HidDevice[] {
  return [
    { vendorId: 0x1532, productId: 0x0266, path: 'keyboard', release: 0x106, interface: 0, usagePage: 1, usage: 6, product: 'Razer Huntsman V2 Analog' },
    { vendorId: 0x1532, productId: 0x0266, path: 'razer-control', release: 0x106, interface: 3, usagePage: 0x0c, usage: 1, product: 'Razer Huntsman V2 Analog' },
  ];
}
