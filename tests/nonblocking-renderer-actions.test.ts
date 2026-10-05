import { expect, test } from 'bun:test';
import type { SetCaptureConfigInput, SwitchboardApi, SystemSnapshot } from '../src/shared/contracts';
import { createDefaultSnapshot } from '../src/shared/defaults';

test('routine renderer mutations do not publish a global UI lock while IPC is pending', async () => {
  const previousWindow = globalThis.window;
  let resolveMutation!: (snapshot: SystemSnapshot) => void;
  const mutation = new Promise<SystemSnapshot>((resolve) => {
    resolveMutation = resolve;
  });
  const snapshot = createDefaultSnapshot();
  const api = {
    getSnapshot: async () => snapshot,
    setCaptureConfig: (_input: SetCaptureConfigInput) => mutation,
    subscribe: () => () => undefined,
  } as unknown as SwitchboardApi;

  let pendingAction: Promise<void> | undefined;
  try {
    Object.assign(globalThis, {
      window: {
        switchboard: api,
        location: { hash: '#capture' },
        history: { replaceState: () => undefined },
        sessionStorage: { getItem: () => null, setItem: () => undefined },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });

    const { useSystemStore } = await import(`../src/renderer/src/stores/use-system-store.ts?nonblocking=${Date.now()}`);
    pendingAction = useSystemStore.getState().setCaptureConfig({ replaySeconds: 90 });

    expect(useSystemStore.getState()).not.toHaveProperty('actionPending');
  } finally {
    resolveMutation(snapshot);
    await pendingAction;

    if (previousWindow) Object.assign(globalThis, { window: previousWindow });
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
