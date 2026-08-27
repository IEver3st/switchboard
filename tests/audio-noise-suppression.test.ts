import { describe, expect, test } from 'bun:test';
import { audioHostSnapshotSchema, systemSnapshotSchema } from '../src/shared/contracts';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { noiseRemovalAmounts } from '../src/renderer/src/components/audio/semantic-mapping';

const capabilities = {
  virtualChannels: 'unavailable',
  applicationRouting: 'unavailable',
  channelDsp: 'unavailable',
  microphoneDsp: 'available',
  noiseSuppression: 'available',
  realtimeMetering: 'available',
  monitoring: 'available',
  microphoneTest: 'available',
  spatialAudio: 'unavailable',
} as const;

describe('native microphone noise suppression contract', () => {
  test('keeps semantic presets on the calibrated canonical amounts', () => {
    expect(noiseRemovalAmounts).toEqual({ light: 25, balanced: 55, strong: 80 });
  });

  test('accepts a native host snapshot when nullable JSON properties are omitted', () => {
    const parsed = audioHostSnapshotSchema.parse({
      capabilities,
      noiseSuppression: {
        backend: 'RNNoise',
        available: true,
        modelIdentifier: 'nnnoiseless-v0.5.2-default',
        state: 'ready',
        modelInitializationMs: 4.2,
        inputSampleRate: 48000,
        processingSampleRate: 48000,
        frameLength: 480,
        algorithmicLatencyMs: 20,
        attenuationLimitDb: 21,
        p50Ms: 0.05,
        p95Ms: 0.09,
        p99Ms: 0.11,
        maximumMs: 2.5,
        captureCallbackP99Ms: 0.03,
        captureOverruns: 0,
        monitorUnderruns: 0,
        droppedOrBypassedFrames: 0,
        recoveryCount: 0,
      },
      running: true,
      driver: {
        state: 'not-installed',
        interfaceName: 'Switchboard Virtual Audio Device',
        missingEndpoints: ['Switchboard Audio - Gaming (render)'],
        endpoints: [],
        message: 'The virtual driver is not installed.',
      },
      applications: [],
      buses: [{ id: 'mic', gain: 0.92, muted: false, applicationCount: 0 }],
      microphone: {
        configurationVersion: 7,
        requestedInputDeviceId: 'physical-mic',
        activeInputDeviceId: 'physical-mic',
        inputFormat: '48 kHz mono float',
        processors: [{ id: 'gain', enabled: true, parameters: { gainDb: 2.5 } }],
        monitoring: {
          requested: true,
          active: true,
          level: 0.18,
          requestedDeviceId: 'headphones',
          activeDeviceId: 'headphones',
        },
      },
    });

    expect(parsed.noiseSuppression.modelHash).toBeNull();
    expect(parsed.noiseSuppression.lastError).toBeNull();
    expect(parsed.inputDeviceId).toBeNull();
    expect(parsed.error).toBeNull();
    expect(parsed.microphone?.processors[0]?.parameters.gainDb).toBe(2.5);
    expect(parsed.microphone?.monitoring.active).toBeTrue();
  });

  test('migrates persisted audio capabilities created before noise suppression existed', () => {
    const snapshot = createDefaultSnapshot();
    const legacyCapabilities = { ...snapshot.audio.capabilities } as Record<string, unknown>;
    delete legacyCapabilities.noiseSuppression;
    const parsed = systemSnapshotSchema.parse({
      ...snapshot,
      audio: { ...snapshot.audio, capabilities: legacyCapabilities },
    });
    expect(parsed.audio.capabilities.noiseSuppression).toBe('unavailable');
  });
});
