import { describe, expect, test } from 'bun:test';
import {
  LogitechRgbEffectsController,
  type LogitechRgbTransport,
} from '../src/main/modules/logitech/rgb-effects';

interface RequestRecord {
  featureIndex: number;
  functionId: number;
  parameters: readonly number[];
}

const rgbFeatureIndex = 9;
const perKeyFeatureIndex = 10;

describe('Logitech temporary battery lighting', () => {
  test('firmware-owned power is restored after a cutoff and after a warning from Off', async () => {
    const { controller, transport } = await probeController();
    await controller.setBatteryOverride('off');
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(3);
    await controller.setBatteryOverride(null);
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(1);
    await transport.request(1, rgbFeatureIndex, 8, [1, 3, 0]);
    await controller.setBatteryOverride('red');
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(1);
    await controller.setBatteryOverride(null);
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(3);
  });

  test('red paints main zones and restores exact user colors without changing canonical settings', async () => {
    const { controller, requests } = await probeController();
    await controller.setZoneColor('zone-2', '#123456');
    await controller.setBrightness(60);
    const original = controller.buildCapability(true);
    requests.length = 0;
    await controller.setBatteryOverride('red');
    expect(requests.filter(request => request.featureIndex === perKeyFeatureIndex && request.functionId === 1)
      .map(request => request.parameters)).toEqual([[1, 64, 0, 0], [2, 64, 0, 0], [8, 64, 0, 0]]);
    expect(controller.buildCapability(true)).toEqual(original);
    requests.length = 0;
    await controller.setBatteryOverride(null);
    expect(requests.find(request => request.featureIndex === perKeyFeatureIndex && request.functionId === 1 && request.parameters[0] === 2)
      ?.parameters).toEqual([2, 11, 31, 52]);
    expect(controller.buildCapability(true)).toEqual(original);
    expect(requests.every(request => [rgbFeatureIndex, perKeyFeatureIndex].includes(request.featureIndex))).toBe(true);
  });

  test('cutoff restores a live wave and unclaimed firmware lighting returns to firmware', async () => {
    const { controller, requests } = await probeController();
    await controller.setBatteryOverride('red');
    await controller.setBatteryOverride(null);
    expect(requests.at(-1)).toMatchObject({ functionId: 5, parameters: [1, 0, 0] });
    await controller.setEffect('wave');
    await controller.setDirection('left');
    const original = controller.buildCapability(true);
    await controller.setBatteryOverride('off');
    await controller.setBatteryOverride(null);
    const restoredWave = requests.findLast(request => request.functionId === 1 && request.featureIndex === rgbFeatureIndex);
    expect(restoredWave?.parameters[1]).toBe(2);
    expect(restoredWave?.parameters[11]).toBe(6);
    expect(controller.buildCapability(true)).toEqual(original);
  });

  test('manual Off after cancelling the override remains off', async () => {
    const { controller, requests } = await probeController();
    await controller.setEffect('static');
    await controller.setBatteryOverride('red');
    await controller.setBatteryOverride(null);
    await controller.setEnabled(false);
    requests.length = 0;
    await controller.setBatteryOverride(null);
    expect(requests).toEqual([]);
    expect(controller.buildCapability(true).enabled).toBe(false);
  });
});

describe('Logitech device-reported RGB effects', () => {
  test('revoked live ownership becomes Unknown even when cached lighting was Off', async () => {
    const { controller, transport } = await probeController();
    await controller.setEnabled(false);
    await controller.refreshState();
    expect(controller.buildCapability(true).state).toBe('acknowledged');
    await transport.request(1, rgbFeatureIndex, 5, [1, 0, 0]);
    await controller.refreshState();
    expect(controller.buildCapability(true)).toMatchObject({ enabled: false, state: 'unknown' });
  });

  test('reclaims and reapplies an explicit Off after firmware may have lost live ownership', async () => {
    const { controller, requests } = await probeController();
    await controller.setEnabled(false);
    requests.length = 0;
    await controller.setEnabled(false);
    expect(requests[0]).toMatchObject({ functionId: 5, parameters: [1, 3, 4] });
    expect(requests.at(-1)).toMatchObject({ functionId: 8, parameters: [0, 0, 0] });
  });

  test('release failure remains retryable and cannot silently allow an onboard write', async () => {
    const { controller, transport } = await probeController();
    await controller.setEnabled(false);
    const request = transport.request.bind(transport);
    let rejectRelease = true;
    transport.request = async (...args) => {
      if (rejectRelease && args[2] === 5 && args[3]?.[1] === 0) throw new Error('release failed');
      return request(...args);
    };
    await expect(controller.release()).rejects.toThrow('release failed');
    rejectRelease = false;
    await controller.release();
    expect(controller.buildCapability(true).state).toBe('unknown');
  });

  test('publishes only probed effects and addressable zones', async () => {
    const { controller } = await probeController();
    const capability = controller.buildCapability(true);

    expect(capability.availableEffects.map(({ id }) => id)).toEqual(['static', 'wave', 'breathing']);
    expect(capability.zones?.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'zone-1', label: 'Zone 1' },
      { id: 'zone-2', label: 'Zone 2' },
      { id: 'zone-8', label: 'Zone 3' },
    ]);
    expect(capability).toMatchObject({
      profileMode: 'software',
      source: 'software',
      physicalEffectVerified: false,
      state: 'unknown',
    });
  });

  test('claims software control, maps effect parameters, and releases firmware ownership', async () => {
    const { controller, requests } = await probeController();
    requests.length = 0;

    await controller.setEffect('wave');
    await controller.setDirection('left');
    await controller.release();

    expect(requests[0]).toEqual({
      featureIndex: rgbFeatureIndex,
      functionId: 5,
      parameters: [1, 3, 4],
    });
    const waveWrites = requests.filter((request) => request.featureIndex === rgbFeatureIndex && request.functionId === 1);
    expect(waveWrites).toHaveLength(2);
    expect(waveWrites[0]?.parameters[1]).toBe(2);
    expect(waveWrites[0]?.parameters[11]).toBe(1);
    expect(waveWrites[1]?.parameters[11]).toBe(6);
    expect(requests.at(-1)).toEqual({
      featureIndex: rgbFeatureIndex,
      functionId: 5,
      parameters: [1, 0, 0],
    });
  });

  test('writes every reported zone as one frame and uses the probed off effect', async () => {
    const { controller, requests } = await probeController();
    requests.length = 0;

    await controller.setZoneColor('zone-2', '#123456');
    await controller.setEnabled(false);

    const zoneWrites = requests.filter((request) => request.featureIndex === perKeyFeatureIndex && request.functionId === 1);
    expect(zoneWrites.map((request) => request.parameters[0])).toEqual([1, 2, 8]);
    expect(zoneWrites.find((request) => request.parameters[0] === 2)?.parameters).toEqual([2, 18, 52, 86]);
    expect(requests.some((request) => (
      request.featureIndex === perKeyFeatureIndex
      && request.functionId === 7
      && request.parameters[0] === 0
    ))).toBe(true);
    const off = requests.findLast(request => request.functionId === 1 && request.featureIndex === rgbFeatureIndex);
    expect(off).toEqual({ featureIndex: rgbFeatureIndex, functionId: 1, parameters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] });
  });
});

async function probeController(): Promise<{
  controller: LogitechRgbEffectsController;
  requests: RequestRecord[];
  transport: LogitechRgbTransport;
}> {
  const requests: RequestRecord[] = [];
  let power = 1;
  let ownership = 0;
  const transport: LogitechRgbTransport = {
    async request(_deviceIndex, featureIndex, functionId, parameters = []) {
      requests.push({ featureIndex, functionId, parameters: [...parameters] });
      const response = Buffer.alloc(20);
      if (featureIndex === rgbFeatureIndex && functionId === 5) {
        if (parameters[0] === 1) ownership = parameters[1]!;
        response[5] = ownership;
      }
      if (featureIndex === rgbFeatureIndex && functionId === 8) {
        if (parameters[0] === 1) power = parameters[1]!;
        response[5] = power;
      }
      if (featureIndex === rgbFeatureIndex && functionId === 0) {
        if (parameters[0] === 0xff) {
          response[6] = 1;
        } else if (parameters[1] === 0xff) {
          response[8] = 4;
        } else {
          const effects = [0x00, 0x01, 0x16, 0x0a];
          const wireId = effects[parameters[1] ?? -1];
          if (wireId !== undefined) {
            response[6] = wireId >>> 8;
            response[7] = wireId & 0xff;
            response[10] = 0x07;
            response[11] = 0xd0;
          }
        }
      }
      if (featureIndex === perKeyFeatureIndex && functionId === 0 && parameters[1] === 0) {
        response[6] = 0b0000_0110;
        response[7] = 0b0000_0001;
      }
      if (featureIndex === perKeyFeatureIndex && functionId === 1 && ![1, 2, 8].includes(parameters[0]!)) {
        throw new Error('HID++ rejected the request: out of range.');
      }
      return response;
    },
  };
  const controller = await LogitechRgbEffectsController.probe(
    transport,
    1,
    rgbFeatureIndex,
    perKeyFeatureIndex,
  );
  if (!controller) throw new Error('The RGB test controller was not discovered.');
  return { controller, requests, transport };
}
