import { expect, test } from 'bun:test';
import { getStartupSnapshot } from '../src/main/startup-readiness';
import { createDefaultSnapshot } from '../src/shared/defaults';

test('the initial renderer snapshot does not wait for background service startup', async () => {
  const snapshot = createDefaultSnapshot();
  let prepared = false;
  const backgroundStartup = new Promise<void>(() => undefined);
  const controller = {
    prepareSnapshot: async () => { prepared = true; },
    initialize: () => backgroundStartup,
    getSnapshot: () => snapshot,
  };

  const result = await Promise.race([
    getStartupSnapshot(controller).then(() => 'ready' as const),
    new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 25)),
  ]);

  expect(prepared).toBe(true);
  expect(result).toBe('ready');
});
