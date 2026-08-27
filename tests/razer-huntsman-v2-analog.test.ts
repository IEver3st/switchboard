import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Device as HidDevice } from 'node-hid';
import {
  huntsmanLightingEffects,
  RazerHuntsmanV2AnalogModule,
  type HuntsmanControlTransport,
} from '../src/main/modules/razer';
import {
  activeOnboardProfileReadCommand,
  activeOnboardProfileWriteCommand,
  brightnessWriteCommand,
  buildRazerReport,
  effectReadCommand,
  effectWriteCommand,
  firmwareVersionCommand,
  gamingModeReadCommand,
  gamingModeWriteCommand,
  onboardProfileListCommand,
  parseActiveOnboardProfile,
  parseBrightness,
  parseFirmwareVersion,
  parseGamingMode,
  parseLightingState,
  parseOnboardProfileIds,
  parseRazerResponse,
  razerCrc,
  razerReportLength,
} from '../src/main/modules/razer/huntsman-v2-analog-protocol';
import { HuntsmanV2AnalogTransport } from '../src/main/modules/razer/huntsman-v2-analog-transport';
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

  test('encodes and parses firmware-backed keyboard controls', () => {
    const gameRead = gamingModeReadCommand();
    expect(gameRead).toMatchObject({ transactionId: 0xff, commandClass: 0x03, commandId: 0x80, arguments: [1, 8, 0] });
    expect(gamingModeWriteCommand(true).arguments).toEqual([1, 8, 1]);
    expect(parseGamingMode(parseRazerResponse(responseFor(gameRead, [1, 8, 1]), gameRead))).toBe(true);

    const profileList = onboardProfileListCommand();
    expect(parseOnboardProfileIds(parseRazerResponse(responseFor(profileList, [2, 1, 2]), profileList))).toEqual([1, 2]);
    const profileRead = activeOnboardProfileReadCommand();
    expect(parseActiveOnboardProfile(parseRazerResponse(responseFor(profileRead, [2]), profileRead))).toBe(2);
    expect(activeOnboardProfileWriteCommand(2).arguments).toEqual([2]);

    const effectRead = effectReadCommand();
    expect(parseLightingState(parseRazerResponse(
      responseFor(effectRead, [1, 5, 7, 0, 2, 1, 0x44, 0xaa, 0xff]),
      effectRead,
    ))).toEqual({ effectId: 'starlight', color: '#44aaff' });
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

describe('Razer Huntsman V2 Analog transport', () => {
  test('keeps independent controls available when one diagnostic read fails', async () => {
    let pending = Buffer.alloc(razerReportLength);
    let closed = false;
    const transport = new HuntsmanV2AnalogTransport({
      async open() {
        return {
          async sendFeatureReport(report) {
            pending = Buffer.from(report);
            return report.byteLength;
          },
          async getFeatureReport() {
            const commandClass = pending[7];
            const commandId = pending[8];
            if (commandClass === 0x00 && commandId === 0x81) return responseFromReport(pending, [], 0x05);
            if (commandClass === 0x00 && commandId === 0x82) return responseFromReport(pending, [...Buffer.from('TEST-SERIAL')]);
            if (commandClass === 0x0f && commandId === 0x84) return responseFromReport(pending, [1, 5, 230]);
            if (commandClass === 0x0f && commandId === 0x82) return responseFromReport(pending, [1, 5, 1, 0, 0, 1, 0x44, 0xaa, 0xff]);
            if (commandClass === 0x0f && commandId === 0x81) return responseFromReport(pending, [7, 0, 1, 2, 3, 4, 5, 7]);
            if (commandClass === 0x03 && commandId === 0x80) return responseFromReport(pending, [1, 8, 0]);
            if (commandClass === 0x05 && commandId === 0x81) return responseFromReport(pending, [2, 1, 2]);
            if (commandClass === 0x05 && commandId === 0x84) return responseFromReport(pending, [1]);
            throw new Error('Unexpected command in transport test.');
          },
          async close() { closed = true; },
        };
      },
    });

    const probe = await transport.probe('razer-control');

    expect(probe.firmwareVersion).toBeUndefined();
    expect(probe.readFailures.firmware).toContain('unsupported command');
    expect(probe).toMatchObject({
      serialNumber: 'TEST-SERIAL',
      brightness: 90,
      lightingState: { effectId: 'static', color: '#44aaff' },
      gamingMode: false,
      onboardProfileIds: [1, 2],
      activeOnboardProfileId: 1,
    });
    expect(closed).toBe(true);
  });
});

describe('Razer Huntsman V2 Analog module', () => {
  test('publishes only the firmware effects implemented by this model', () => {
    expect(huntsmanLightingEffects.map((effect) => effect.id)).toEqual([
      'static',
      'breathing',
      'spectrum',
      'reactive',
      'starlight',
      'wave-left',
      'wave-right',
    ]);
  });

  test('discovers the dedicated endpoint and publishes only verified native controls', async () => {
    const effects: Array<{ effectId: string; color: string }> = [];
    const brightnessWrites: number[] = [];
    const transport: HuntsmanControlTransport = {
      async probe(path) {
        expect(path).toBe('razer-control');
        return {
          firmwareVersion: '1.06',
          serialNumber: 'TEST-SERIAL',
          brightness: 90,
          lightingState: { effectId: 'spectrum' },
          lightingEffectCodes: [0, 1, 2, 3, 4, 5, 7],
          gamingMode: false,
          onboardProfileIds: [1, 2],
          activeOnboardProfileId: 1,
          readFailures: {},
        };
      },
      async setBrightness(_path, brightness) {
        brightnessWrites.push(brightness);
        return 61;
      },
      async setEffect(_path, effectId, color) {
        effects.push({ effectId, color });
        return { effectId, ...(effectId !== 'off' && ['static', 'breathing', 'reactive', 'starlight'].includes(effectId) ? { color } : {}) };
      },
      async setGamingMode(_path, enabled) { return enabled; },
      async setActiveOnboardProfile(_path, profileId) { return profileId; },
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
        lighting: { writable: true, brightness: 90, state: 'maintained', physicalEffectVerified: false },
      },
    });
    expect(device?.capabilities.keyboard?.features.find((feature) => feature.id === 'actuation')).toMatchObject({
      status: 'synapse',
      unavailableReason: expect.any(String),
    });
    expect(device?.capabilities.keyboard).toMatchObject({
      gamingMode: { enabled: false, writable: true },
      onboardProfiles: { activeProfileId: '1', writable: true, profiles: [{ id: '1' }, { id: '2' }] },
    });
    expect(device?.capabilities.keyboard?.rapidTrigger).toBeUndefined();
    expect(device?.capabilities.keyboard?.snapTap).toBeUndefined();
    expect(resolveProductAsset(device!.identity, 'keyboard').key).toBe('razer-huntsman-v2-analog');

    await module.setControl(device!, { type: 'lighting-effect', effectId: 'static' });
    await module.setControl(device!, { type: 'lighting-color', color: '#4466aa' });
    const brightnessResult = await module.setControl(device!, { type: 'lighting-brightness', brightness: 62 });
    expect(brightnessResult).toEqual({
      confirmedChanges: [{ type: 'lighting-brightness', brightness: 61 }],
    });
    await module.setControl(device!, { type: 'lighting-enabled', enabled: false });
    await module.setControl(device!, { type: 'lighting-enabled', enabled: true });
    await module.setControl(device!, { type: 'keyboard-gaming-mode', enabled: true });
    await module.setControl(device!, { type: 'keyboard-onboard-profile', profileId: '2' });
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
      state: 'maintained',
    });
    expect(updated?.capabilities.keyboard).toMatchObject({
      gamingMode: { enabled: true, writable: true },
      onboardProfiles: { activeProfileId: '2' },
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
      async setEffect(_path, effectId) { return { effectId }; },
      async setGamingMode(_path, enabled) { return enabled; },
      async setActiveOnboardProfile(_path, profileId) { return profileId; },
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

function responseFromReport(request: Buffer, responseArguments: readonly number[], status = 0x02): Buffer {
  const response = Buffer.alloc(razerReportLength);
  response[1] = status;
  response[2] = request[2] ?? 0;
  response[6] = responseArguments.length;
  response[7] = request[7] ?? 0;
  response[8] = request[8] ?? 0;
  response.set(responseArguments, 9);
  response[89] = razerCrc(response);
  return response;
}

function descriptors(): HidDevice[] {
  return [
    { vendorId: 0x1532, productId: 0x0266, path: 'keyboard', release: 0x106, interface: 0, usagePage: 1, usage: 6, product: 'Razer Huntsman V2 Analog' },
    { vendorId: 0x1532, productId: 0x0266, path: 'razer-control', release: 0x106, interface: 3, usagePage: 0x0c, usage: 1, product: 'Razer Huntsman V2 Analog' },
  ];
}
