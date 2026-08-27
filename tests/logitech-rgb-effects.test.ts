import { describe, expect, test } from 'bun:test';
import {
  LogitechRgbEffectsController,
  type LogitechRgbTransport,
} from '../src/main/modules/logitech/devices/g502-x-plus/rgb-effects';

interface RequestRecord {
  featureIndex: number;
  functionId: number;
  parameters: readonly number[];
}

const rgbFeatureIndex = 9;
const perKeyFeatureIndex = 10;

describe('Logitech device-reported RGB effects', () => {
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
    const off = requests.at(-1);
    expect(off).toEqual({ featureIndex: rgbFeatureIndex, functionId: 1, parameters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] });
  });
});

async function probeController(): Promise<{
  controller: LogitechRgbEffectsController;
  requests: RequestRecord[];
}> {
  const requests: RequestRecord[] = [];
  const transport: LogitechRgbTransport = {
    async request(_deviceIndex, featureIndex, functionId, parameters = []) {
      requests.push({ featureIndex, functionId, parameters: [...parameters] });
      const response = Buffer.alloc(20);
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
      if (featureIndex === perKeyFeatureIndex && functionId === 0 && parameters[2] === 0) {
        response[6] = 0b0000_0110;
        response[7] = 0b0000_0001;
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
  return { controller, requests };
}
