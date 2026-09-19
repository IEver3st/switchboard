import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioSyncCalibration } from '../src/main/services/audio-sync-calibration';
import { StateStore } from '../src/main/services/state-store';
import { audioSyncMeasurementSchema, setCaptureConfigInputSchema, type AudioCalibrationState } from '../src/shared/contracts';

const result = { profile: { advanceMs: 185, microphoneDeviceId: 'mic', outputDeviceId: 'output', measuredAt: '2026-09-18T12:00:00Z' }, spreadMs: 3, matchedPulses: 5 };
const route = { microphoneDeviceId: 'mic', outputDeviceId: 'output' };
const idle: AudioCalibrationState = { status: 'idle', measurement: null, error: null };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('audio sync calibration ownership', () => {
  test('only a valid candidate for the same route can be applied', async () => {
    let state = idle;
    const service = new AudioSyncCalibration({ measure: async () => result, publish: value => { state = value; } });
    service.start(route, 'route-a', () => 'route-a');
    await tick();
    expect(state.status).toBe('ready');
    expect(() => service.take('route-b')).toThrow();
    expect(service.take('route-a')).toEqual(result);
    expect(() => service.take('route-a')).toThrow();
    await service.dispose();
  });

  test('cancellation ignores a late result and waits for the helper to finish', async () => {
    let state = idle; let finish!: (value: typeof result) => void; let aborted = false;
    const service = new AudioSyncCalibration({
      measure: (_, signal) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise(resolve => { finish = resolve; }); },
      publish: value => { state = value; },
    });
    service.start(route, 'same', () => 'same');
    expect(() => service.start(route, 'same', () => 'same')).toThrow();
    const cancelling = service.cancel();
    expect(aborted).toBe(true);
    finish(result); await cancelling;
    expect(state.status).toBe('idle');
    expect(() => service.take('same')).toThrow();
    // Repeated use and disposal cannot leave a candidate or a running helper.
    service.start(route, 'same', () => 'same');
    const disposing = service.dispose(); finish(result); await disposing;
    expect(() => service.start(route, 'same', () => 'same')).toThrow();
  });

  test('device changes, weak measurements and mismatched endpoints cannot produce a candidate', async () => {
    for (const [measurement, current] of [
      [result, 'changed'],
      [{ ...result, matchedPulses: 1 }, 'same'],
      [{ ...result, profile: { ...result.profile, microphoneDeviceId: 'wrong' } }, 'same'],
    ] as const) {
      let state = idle;
      const service = new AudioSyncCalibration({ measure: async () => measurement, publish: value => { state = value; } });
      service.start(route, 'same', () => current); await tick();
      expect(state.status).toBe('error'); expect(() => service.take('same')).toThrow(); await service.dispose();
    }
  });

  test('partial config patches preserve correction; input bounds reject invalid offsets', () => {
    expect(setCaptureConfigInputSchema.parse({ includeMic: true })).not.toHaveProperty('microphoneSync');
    expect(setCaptureConfigInputSchema.parse({ microphoneSync: null }).microphoneSync).toBeNull();
    for (const advanceMs of [-1, 1201, NaN, 3.5])
      expect(audioSyncMeasurementSchema.safeParse({ ...result, profile: { ...result.profile, advanceMs } }).success).toBe(false);
  });

  test('saved correction survives restart while transient calibration does not persist', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-sync-state-'));
    const path = join(directory, 'state.json');
    const store = new StateStore(path); await store.load();
    store.update(draft => {
      draft.capture.config.microphoneSync = result.profile;
      draft.capture.audioCalibration = { status: 'ready', measurement: result, error: null };
    });
    await store.flush();
    expect(JSON.parse(await readFile(path, 'utf8')).capture.audioCalibration).toBeUndefined();
    const restored = new StateStore(path); await restored.load();
    expect(restored.get().capture.config.microphoneSync).toEqual(result.profile);
    expect(restored.get().capture.audioCalibration).toEqual(idle);
  });
});
