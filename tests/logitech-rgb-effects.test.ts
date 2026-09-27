import { describe, expect, test } from 'bun:test';
import { lightingCapabilitySchema, type LightingCapability } from '../src/shared/contracts';
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
    expect(zoneWrites(requests)).toEqual([[1, 64, 0, 0], [2, 64, 0, 0], [8, 64, 0, 0]]);
    expect(controller.buildCapability(true)).toEqual(original);
    requests.length = 0;
    await controller.setBatteryOverride(null);
    expect(zoneWrites(requests).find(parameters => parameters[0] === 2)).toEqual([2, 11, 31, 52]);
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
  test('packs eight zones into two bounded reports and never commits a partial frame', async () => {
    const { controller, requests, transport } = await probeController(undefined, [1, 2, 3, 4, 5, 6, 7, 8]);
    requests.length = 0;
    await controller.setColor('#123456');
    const frames = requests.filter(item => item.featureIndex === perKeyFeatureIndex && item.functionId === 1);
    expect(frames.map(item => item.parameters.length)).toEqual([16, 16]);
    expect(zoneWrites(requests).map(item => item[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const request = transport.request.bind(transport);
    transport.request = async (...args) => {
      if (args[1] === perKeyFeatureIndex && args[2] === 1 && args[3]?.[0] === 5) throw new Error('second batch failed');
      return request(...args);
    };
    requests.length = 0;
    await expect(controller.setColor('#abcdef')).rejects.toThrow('second batch failed');
    expect(requests.some(item => item.featureIndex === perKeyFeatureIndex && item.functionId === 7)).toBe(false);
    expect(controller.buildCapability(true)).toMatchObject({ color: '#123456', state: 'unknown' });
  });
  test('a partially rejected effect invalidates acknowledgement and restores the last confirmed selection', async () => {
    const { controller, transport, requests } = await probeController();
    await controller.setColor('#123456');
    const request = transport.request.bind(transport);
    let fail = true;
    transport.request = async (...args) => {
      if (fail && args[1] === perKeyFeatureIndex && args[2] === 1) throw new Error('zone write failed');
      return request(...args);
    };
    await expect(controller.setColor('#abcdef')).rejects.toThrow('zone write failed');
    expect(controller.buildCapability(true)).toMatchObject({ color: '#123456', state: 'unknown', selectionSaved: true });
    fail = false;
    requests.length = 0;
    await controller.refreshState();
    expect(controller.buildCapability(true)).toMatchObject({ color: '#123456', state: 'acknowledged' });
    expect(requests.some(item => item.featureIndex === perKeyFeatureIndex && item.functionId === 1)).toBe(true);
  });

  test('revoked live ownership automatically restores the selected Off state', async () => {
    const { controller, transport } = await probeController();
    await controller.setEnabled(false);
    await controller.refreshState();
    expect(controller.buildCapability(true).state).toBe('acknowledged');
    await transport.request(1, rgbFeatureIndex, 5, [1, 0, 0]);
    await transport.request(1, rgbFeatureIndex, 8, [1, 1, 0]);
    await controller.refreshState();
    expect(controller.buildCapability(true)).toMatchObject({ enabled: false, state: 'acknowledged' });
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(3);
  });

  test('a saved selection survives failed recovery, serialization, and reopening', async () => {
    const { controller, transport } = await probeController();
    await controller.setZoneColor('zone-1', '#123456');
    await controller.setBrightness(60);
    const selected = controller.buildCapability(true);
    const request = transport.request.bind(transport);
    transport.request = async () => { throw new Error('mouse asleep'); };
    await controller.refreshState();
    expect(controller.buildCapability(true).state).toBe('unknown');
    const saved = lightingCapabilitySchema.parse(JSON.parse(JSON.stringify(controller.buildCapability(true))));
    const reopened = await probeController(saved);
    await reopened.controller.restoreSelection();
    expect(reopened.controller.buildCapability(true)).toMatchObject({
      state: 'acknowledged', enabled: true, activeEffectId: selected.activeEffectId,
      color: selected.color, brightness: selected.brightness, zones: selected.zones,
    });
    transport.request = request;
    await controller.refreshState();
    expect(controller.buildCapability(true).state).toBe('acknowledged');
  });

  test('upgrades the legacy saved Off selection after ownership loss', async () => {
    const initial = await probeController();
    const saved = { ...initial.controller.buildCapability(true), enabled: false,
      state: 'unknown' as const, stateReason: 'The mouse changed RGB control or power state. Choose an effect or Turn off to reapply lighting.' };
    delete (saved as Partial<{ selectionSaved: boolean }>).selectionSaved;
    const { controller, transport } = await probeController(saved);
    await controller.restoreSelection();
    expect(controller.buildCapability(true)).toMatchObject({ enabled: false, state: 'acknowledged' });
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(3);
  });

  test('does not invent a selection or rewrite healthy animated lighting each discovery', async () => {
    const { controller, requests } = await probeController();
    requests.length = 0;
    await controller.refreshState();
    await controller.restoreSelection();
    expect(requests).toEqual([]);
    await controller.setEffect('wave');
    await controller.setSpeed(23);
    await controller.setDirection('left');
    const wave = requests.findLast(item => item.featureIndex === rgbFeatureIndex && item.functionId === 1);
    requests.length = 0;
    await controller.refreshState();
    expect(requests.every(item => item.parameters[0] === 0)).toBe(true);
    controller.invalidate();
    await controller.refreshState();
    expect(requests.findLast(item => item.featureIndex === rgbFeatureIndex && item.functionId === 1)).toEqual(wave);
  });

  test('recovery preserves battery cutoff and status cue priority until both clear', async () => {
    const { controller, transport, requests } = await probeController();
    await controller.setEffect('wave');
    await controller.setStatusOverride('#36d978');
    await controller.setBatteryOverride('off');
    await transport.request(1, rgbFeatureIndex, 5, [1, 0, 0]);
    await transport.request(1, rgbFeatureIndex, 8, [1, 1, 0]);
    await controller.refreshState();
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(3);
    controller.invalidate();
    await controller.restoreSelection();
    expect((await transport.request(1, rgbFeatureIndex, 8, [0, 0, 0]))[5]).toBe(3);
    await controller.setBatteryOverride(null);
    expect(zoneWrites(requests).at(-1)?.slice(1)).toEqual([14, 54, 30]);
    await controller.setStatusOverride(null);
    expect(controller.buildCapability(true)).toMatchObject({ enabled: true, activeEffectId: 'wave', state: 'acknowledged' });
    expect((await transport.request(1, rgbFeatureIndex, 5, [0, 0, 0]))[5]).toBe(3);
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
    const zones = zoneWrites(requests);
    expect(zones.map(parameters => parameters[0])).toEqual([1, 2, 8]);
    expect(zones.find(parameters => parameters[0] === 2)).toEqual([2, 18, 52, 86]);
    expect(requests.filter(request => request.featureIndex === perKeyFeatureIndex && request.functionId === 1)).toHaveLength(1);
    expect(requests.some((request) => (
      request.featureIndex === perKeyFeatureIndex
      && request.functionId === 7
      && request.parameters[0] === 0
    ))).toBe(true);
    await controller.setEnabled(false);
    const off = requests.findLast(request => request.functionId === 1 && request.featureIndex === rgbFeatureIndex);
    expect(off).toEqual({ featureIndex: rgbFeatureIndex, functionId: 1, parameters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] });
  });
});

test('status cues yield to battery cutoff and restore the exact selected effect after both clear', async () => {
  const { controller, requests } = await probeController();
  await controller.setEffect('wave');
  const before = controller.buildCapability(true);
  await controller.setStatusOverride('#36d978');
  expect(zoneWrites(requests).at(-1)?.slice(1)).toEqual([14, 54, 30]);
  await controller.setBatteryOverride('off');
  await controller.setStatusOverride('#ffb347');
  expect(requests.findLast(item => item.featureIndex === rgbFeatureIndex && item.functionId === 8 && item.parameters[0] === 1)?.parameters).toEqual([1, 3, 0]);
  await controller.setBatteryOverride(null);
  expect(zoneWrites(requests).at(-1)?.slice(1)).toEqual([64, 45, 18]);
  await controller.setStatusOverride(null);
  expect(controller.buildCapability(true)).toEqual(before);
  expect(requests.every(item => item.featureIndex === rgbFeatureIndex || item.featureIndex === perKeyFeatureIndex)).toBe(true);
});

function zoneWrites(requests: RequestRecord[]): number[][] {
  return requests.filter(item => item.featureIndex === perKeyFeatureIndex && item.functionId === 1)
    .flatMap(item => Array.from({ length: item.parameters.length / 4 }, (_, index) => [...item.parameters.slice(index * 4, index * 4 + 4)]));
}

async function probeController(previous?: LightingCapability, zoneIds = [1, 2, 8]): Promise<{
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
        for (const zone of zoneIds) response[6 + Math.floor(zone / 8)]! |= 1 << (zone % 8);
      }
      if (featureIndex === perKeyFeatureIndex && functionId === 1) {
        if (parameters.length > 16 || parameters.length % 4 !== 0) throw new Error('Invalid zone report size');
        for (let offset = 0; offset < parameters.length; offset += 4) {
          if (!zoneIds.includes(parameters[offset]!)) throw new Error('HID++ rejected the request: out of range.');
        }
      }
      return response;
    },
  };
  const controller = await LogitechRgbEffectsController.probe(
    transport,
    1,
    rgbFeatureIndex,
    perKeyFeatureIndex,
    previous,
  );
  if (!controller) throw new Error('The RGB test controller was not discovered.');
  return { controller, requests, transport };
}
