import { describe, expect, mock, test } from 'bun:test';
import { manageAsyncCleanup } from '../src/renderer/src/lib/async-cleanup';

describe('async lifecycle cleanup', () => {
  test('runs cleanup when disposal happens before setup resolves', async () => {
    let finishSetup!: (cleanup: () => void) => void;
    const setup = new Promise<() => void>((resolve) => { finishSetup = resolve; });
    const cleanup = mock(() => undefined);
    const dispose = manageAsyncCleanup(setup);

    dispose();
    finishSetup(cleanup);
    await setup;
    await Promise.resolve();
    dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('runs resolved cleanup once on later disposal', async () => {
    const cleanup = mock(() => undefined);
    const setup = Promise.resolve(cleanup);
    const dispose = manageAsyncCleanup(setup);
    await setup;
    await Promise.resolve();

    dispose();
    dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
