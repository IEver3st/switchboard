// Isolated Bun controller regression. Fake host and clock; no hardware or UI.
import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { CaptureSnapshotUpdateGate } from '../src/main/services/runtime-update-gates';

mock.module('electron', () => ({
  app: { isPackaged: false }, BrowserWindow: class {}, ipcMain: {}, protocol: {},
  clipboard: {}, desktopCapturer: {}, dialog: {}, globalShortcut: {},
  powerMonitor: {}, screen: { getPrimaryDisplay: () => ({ id: 1 }), getAllDisplays: () => [] }, shell: {}, nativeImage: {}, session: {},
}));
const { AppController } = await import('../src/main/controller');
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const timers = new Map<object, { callback: () => void; ms: number }>();
globalThis.setTimeout = ((callback: () => void, ms: number) => {
  const handle = { unref() {} };
  timers.set(handle, { callback, ms });
  return handle;
}) as unknown as typeof setTimeout;
globalThis.clearTimeout = ((handle: object) => { timers.delete(handle); }) as unknown as typeof clearTimeout;

function setup() {
  timers.clear();
  const state = createDefaultSnapshot();
  state.capture.config.enabled = true;
  state.capture.runtime.state = 'buffering';
  state.capture.runtime.error = undefined;
  state.capture.runtime.warning = undefined;
  const controller = Object.create(AppController.prototype) as any;
  const commands: Array<{ command: string; payload: any }> = [];
  let failures = 0;
  let live = true;
  let hold: Promise<void> | null = null;
  const host = (runtime = 'buffering') => ({
    runtime: { ...structuredClone(state.capture.runtime), state: runtime, error: undefined, warning: undefined },
    storage: state.capture.storage, capabilities: state.capture.capabilities, sources: [],
  });
  Object.assign(controller, {
    disposed: false, captureRestartTimer: null, captureRestartAttempts: 0,
    captureConfigurationQueue: Promise.resolve(), captureConfigurationPending: 0,
    captureRetryConfig: null, captureAudioIntegrationUpdate: null,
    appliedEngineStatuses: new Map(),
    captureSnapshotUpdateGate: new CaptureSnapshotUpdateGate(), validatedCaptureWindowSourceIds: new Set(),
    store: { get: () => structuredClone(state), update: (fn: (draft: typeof state) => void) => { fn(state); return structuredClone(state); } },
    autoCaptureCoordinator: { reconcile: async () => {}, flushBeforeCaptureStops: async () => {} },
    cancelDiagnostics: async () => {}, refreshCaptureSources: async () => {},
    captureStorage: { validate: async () => ({}), getStorageStatus: async () => state.capture.storage },
    toHostSettings: (config: unknown) => config, getCaptureAudioIntegrationSignature: () => 'fixture',
    engines: {
      hasLiveProcess: () => live,
      getStatus: () => ({ state: live ? 'running' : 'error' }),
      start: async () => { live = true; },
      stop: async () => { live = false; controller.applyEngineStatus({ kind: 'capture', state: 'stopped' }); },
      request: async (_kind: string, command: string, payload: any) => {
        commands.push({ command, payload });
        if (hold) await hold;
        if (failures-- > 0) throw Error('Source not ready');
        return host();
      },
    },
  });
  return { controller, state, commands, host, fail: (count: number) => { failures = count; }, kill: () => { live = false; }, hold: (promise: Promise<void>) => { hold = promise; } };
}
async function tick(controller: any) {
  assert.equal(timers.size, 1, 'Only one retry timer');
  const [handle, timer] = [...timers][0]!;
  timers.delete(handle);
  timer.callback();
  await controller.captureConfigurationQueue;
  for (let index = 0; index < 12; index++) await Promise.resolve();
  return timer.ms;
}

try {
  const repeated = setup();
  repeated.fail(7);
  repeated.controller.applyEngineEvent('capture', 'fatalCaptureError', { message: 'Source not ready' });
  const delays = [];
  for (let index = 0; index < 8; index++) delays.push(await tick(repeated.controller));
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(repeated.state.capture.runtime.state, 'buffering', repeated.state.capture.runtime.error);
  assert.equal(timers.size, 0, 'Success removes recovery work');
  assert.equal(repeated.commands.length, 8, 'Recovery continues past three failures');

  const source = setup();
  source.fail(2);
  await assert.rejects(source.controller.setCaptureConfig({ source: 'display', sourceId: 'display:1', displayIndex: 1 }), /not ready/);
  assert.equal(source.state.capture.config.source, 'automatic-game', 'Rejected settings stay unconfirmed');
  await tick(source.controller);
  await tick(source.controller);
  assert(source.commands.every(call => call.payload.sourceId === 'display:1'), 'Retries preserve requested source');
  assert.equal(source.state.capture.config.sourceId, 'display:1', 'Successful retry commits requested source');

  const manual = setup();
  manual.fail(1);
  await assert.rejects(manual.controller.setCaptureConfig({ source: 'display', sourceId: 'display:1', displayIndex: 1 }));
  await manual.controller.setCaptureConfig({});
  assert.equal(manual.state.capture.config.sourceId, 'display:1', 'Retry now preserves the rejected target');
  assert.equal(timers.size, 0);

  const exited = setup();
  exited.kill();
  exited.controller.applyEngineStatus({ kind: 'capture', state: 'error', message: 'Host exited' });
  await tick(exited.controller);
  assert.equal(exited.commands[0]?.command, 'start', 'A dead host is restarted');
  exited.controller.applyCaptureSnapshot(exited.host('error'));
  assert.equal(timers.size, 1, 'Runtime-only errors also recover');
  exited.controller.applyCaptureSnapshot(exited.host('waiting'));
  assert.equal(timers.size, 0, 'Normal source waiting cancels a stale retry');

  const disabled = setup();
  disabled.controller.applyCaptureSnapshot(disabled.host('error'));
  await disabled.controller.setCaptureConfig({ enabled: false });
  assert.equal(timers.size, 0, 'Disable cancels recovery');
  assert.equal(disabled.state.capture.runtime.state, 'stopped');
  disabled.controller.applyEngineEvent('capture', 'fatalCaptureError', { message: 'Late event' });
  assert.equal(timers.size, 0, 'Disabled capture ignores late recovery requests');

  const overlap = setup();
  let release!: () => void;
  overlap.hold(new Promise<void>(resolve => { release = resolve; }));
  const edit = overlap.controller.setCaptureConfig({ fps: 30 });
  for (let index = 0; index < 12; index++) await Promise.resolve();
  overlap.controller.applyCaptureSnapshot(overlap.host('error'));
  assert.equal(timers.size, 0, 'No automatic attempt overlaps a pending configuration');
  const stop = overlap.controller.setCaptureConfig({ enabled: false });
  release();
  await Promise.all([edit, stop]);
  assert.equal(overlap.state.capture.config.enabled, false, 'Queued disable wins over an in-flight retry/edit');
  assert.equal(timers.size, 0);

  const disposed = setup();
  disposed.controller.applyCaptureSnapshot(disposed.host('error'));
  disposed.controller.disposed = true;
  await tick(disposed.controller);
  assert.equal(disposed.commands.length, 0, 'Shutdown cannot resurrect capture');
  assert.equal(timers.size, 0);
  console.log('Capture recovery passed: persistent backoff, live errors, host exits, source intent, manual retry, waiting, serialization, disable, and shutdown.');
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}
