import { describe, expect, test } from 'bun:test';
import { AudioConfiguration, applyAudioPreferenceChanges } from '../src/main/services/audio-configuration';
import { defaultAudio } from '../src/shared/defaults';
import { audioHostSnapshotSchema, type AudioState, type AudioHostSnapshot } from '../src/shared/contracts';

function runtime(audio: AudioState): AudioHostSnapshot {
  return audioHostSnapshotSchema.parse({
    running: true,
    capabilities: { ...audio.capabilities, microphoneDsp: 'available' },
    mixes: structuredClone(audio.mixes),
    applications: [], buses: [],
    driver: { state: 'not-installed', interfaceName: 'Test transport', missingEndpoints: [], endpoints: [], message: 'Test fixture' },
    noiseSuppression: {
      backend: 'Bypass', available: false, state: 'not-loaded', modelInitializationMs: 0,
      inputSampleRate: 48000, processingSampleRate: 48000, frameLength: 480, algorithmicLatencyMs: 0,
      attenuationLimitDb: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maximumMs: 0, captureCallbackP99Ms: 0,
      captureOverruns: 0, monitorUnderruns: 0, droppedOrBypassedFrames: 0, recoveryCount: 0,
    },
    microphone: {
      configurationVersion: 1, requestedInputDeviceId: 'mic', activeInputDeviceId: 'mic', inputFormat: '48 kHz mono',
      processors: structuredClone(audio.micProcessors),
      monitoring: { requested: audio.monitoringEnabled, active: audio.monitoringEnabled, level: audio.monitoring,
        requestedDeviceId: audio.monitoringDeviceId, activeDeviceId: audio.monitoringEnabled ? audio.monitoringDeviceId : null },
      error: null,
    },
  });
}

function setup(configure: (audio: AudioState) => Promise<AudioHostSnapshot>) {
  const state = structuredClone(defaultAudio);
  state.enabled = true;
  const queue = new AudioConfiguration({
    read: () => structuredClone(state), configure,
    commit: (before, next) => applyAudioPreferenceChanges(state, before, next),
    publish: host => { state.host = host; },
  });
  return { state, queue };
}

describe('confirmed audio configuration', () => {
  test('keeps confirmed values while pending, serializes rapid edits, and preserves runtime updates', async () => {
    let accept!: () => void;
    const requested: AudioState[] = [];
    const { state, queue } = setup(async audio => {
      requested.push(structuredClone(audio));
      if (requested.length === 1) await new Promise<void>(resolve => { accept = resolve; });
      return runtime(audio);
    });
    const first = queue.update(audio => { audio.mixes[0]!.master.gain = 0.5; });
    const second = queue.update(audio => { audio.chatMix = 0.6; });
    await Promise.resolve();
    expect(state.mixes[0]!.master.gain).toBe(1);
    expect(requested).toHaveLength(1);
    state.capabilities.reason = 'New runtime detail';
    accept();
    await Promise.all([first, second]);
    expect(requested[1]!.mixes[0]!.master.gain).toBe(0.5);
    expect(state.chatMix).toBe(0.6);
    expect(state.capabilities.reason).toBe('New runtime detail');
  });

  test('rejects a partial monitor failure, restores confirmed settings, and accepts the next edit', async () => {
    const requested: AudioState[] = [];
    const { state, queue } = setup(async audio => {
      requested.push(structuredClone(audio));
      const host = runtime(audio);
      if (audio.monitoringEnabled) {
        host.microphone!.monitoring.active = false;
        host.microphone!.error = 'Output disconnected';
      }
      return host;
    });
    await expect(queue.update(audio => { audio.monitoringEnabled = true; })).rejects.toThrow('Output disconnected');
    expect(state.monitoringEnabled).toBeFalse();
    expect(requested[1]!.monitoringEnabled).toBeFalse();
    await queue.update(audio => { audio.chatMix = -0.3; });
    expect(state.chatMix).toBe(-0.3);
  });

  test('does not persist a lost host request or a mismatched mix response', async () => {
    const { state, queue } = setup(async audio => {
      if (audio.chatMix === 0.4) throw new Error('Host exited');
      const host = runtime(audio);
      host.mixes[0]!.master.gain = 1;
      return host;
    });
    const initial = state.chatMix;
    await expect(queue.update(audio => { audio.chatMix = 0.4; })).rejects.toThrow('Host exited');
    expect(state.chatMix).toBe(initial);
    await expect(queue.update(audio => { audio.mixes[0]!.master.gain = 0.2; })).rejects.toThrow('mix levels');
    expect(state.mixes[0]!.master.gain).toBe(1);
  });

  test('stores offline settings and preset metadata without starting or reconfiguring a host', async () => {
    let requests = 0;
    const { state, queue } = setup(async audio => { requests++; return runtime(audio); });
    state.enabled = false;
    await queue.update(audio => { audio.chatMix = 0; });
    state.enabled = true;
    await queue.update(audio => { audio.pathPresets[0]!.name = 'Renamed'; });
    expect(requests).toBe(0);
    expect(state.pathPresets[0]!.name).toBe('Renamed');
  });
});
