import { expect, test } from 'bun:test';
import { applyG502LightingEnabled } from '../src/main/modules/logitech/devices/g502-x-plus/sniper-dpi';

test('G502 lighting changes power mode before the slower onboard profile persistence finishes', async () => {
  const requests: Array<{ featureIndex: number; functionId: number; parameters: readonly number[] }> = [];
  const transport = {
    async request(_deviceIndex: number, featureIndex: number, functionId: number, parameters: readonly number[] = []) {
      requests.push({ featureIndex, functionId, parameters });
      const response = Buffer.alloc(20);
      if (functionId === 8 && parameters[0] === 0) response[5] = 3;
      return response;
    },
  };
  let releasePersistence!: () => void;
  const persistenceGate = new Promise<void>((resolve) => { releasePersistence = resolve; });
  let persistenceStarted = false;

  const operation = applyG502LightingEnabled(transport, 1, 9, false, async () => {
    persistenceStarted = true;
    await persistenceGate;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(requests).toEqual([
    { featureIndex: 9, functionId: 5, parameters: [1, 2, 0] },
    { featureIndex: 9, functionId: 8, parameters: [1, 3, 0] },
    { featureIndex: 9, functionId: 8, parameters: [0, 0, 0] },
    { featureIndex: 9, functionId: 5, parameters: [1, 0, 0] },
  ]);
  expect(persistenceStarted).toBe(true);

  releasePersistence();
  await operation;
});

test('G502 skips profile persistence if RGB software ownership cannot be released', async () => {
  let persistenceStarted = false;
  const transport = {
    async request(_deviceIndex: number, _featureIndex: number, functionId: number, parameters: readonly number[] = []) {
      if (functionId === 5 && parameters[1] === 0) throw new Error('receiver rejected release');
      const response = Buffer.alloc(20);
      if (functionId === 8 && parameters[0] === 0) response[5] = 3;
      return response;
    },
  };

  await expect(applyG502LightingEnabled(transport, 1, 9, false, async () => {
    persistenceStarted = true;
  })).rejects.toThrow('profile integrity');
  expect(persistenceStarted).toBe(false);
});
