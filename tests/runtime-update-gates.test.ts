import { describe, expect, test } from 'bun:test';
import type { AudioHostSnapshot, CaptureHostSnapshot, EngineStatus } from '../src/shared/contracts';
import {
  AudioMeterDemandGate,
  AudioSnapshotUpdateGate,
  CaptureSnapshotUpdateGate,
  isMaterialEngineStatusChange,
} from '../src/main/services/runtime-update-gates';
import { createDefaultSnapshot } from '../src/shared/defaults';

function captureSnapshot(): CaptureHostSnapshot {
  const snapshot = createDefaultSnapshot();
  return {
    runtime: snapshot.capture.runtime,
    storage: snapshot.capture.storage,
    capabilities: snapshot.capture.capabilities,
    sources: snapshot.capture.sources,
  };
}

describe('runtime update gates', () => {
  test('publishes audio transitions immediately but batches changing diagnostics', () => {
    const gate = new AudioSnapshotUpdateGate(30_000);
    const audio = createDefaultSnapshot().audio;
    const first: AudioHostSnapshot = {
      capabilities: audio.capabilities,
      noiseSuppression: {
        backend: 'rnnoise', available: true, modelIdentifier: null, modelHash: null,
        nativeLibraryHash: null, state: 'active', modelInitializationMs: 4,
        inputSampleRate: 48_000, processingSampleRate: 48_000, frameLength: 480,
        algorithmicLatencyMs: 10, attenuationLimitDb: 18, localSnrDb: 12,
        p50Ms: 0.4, p95Ms: 0.8, p99Ms: 1.1, maximumMs: 1.4,
        captureCallbackP99Ms: 0.2, captureOverruns: 0, monitorOverruns: 0,
        monitorUnderruns: 0, droppedOrBypassedFrames: 0, recoveryCount: 0,
        lastError: null,
      },
      inputDeviceId: 'mic', inputFormat: '48000 Hz', monitoringDeviceId: null,
      running: true, error: null, driver: audio.host?.driver ?? {
        installed: false, ready: false, status: 'missing', packageVersion: null,
        interfaces: [], endpoints: [], missingEndpoints: [], unsignedDevelopmentBuild: false,
      },
      applications: [], buses: [], mixes: [], microphone: null,
    };
    expect(gate.shouldApply(first, 0)).toBe(true);

    const timingOnly = structuredClone(first);
    timingOnly.noiseSuppression.localSnrDb = 14;
    timingOnly.noiseSuppression.p95Ms = 0.9;
    expect(gate.shouldApply(timingOnly, 5_000)).toBe(false);
    expect(gate.shouldApply(timingOnly, 30_000)).toBe(true);

    const failure = structuredClone(timingOnly);
    failure.noiseSuppression.captureOverruns = 1;
    expect(gate.shouldApply(failure, 30_001)).toBe(true);
  });

  test('requests host meters only while the renderer and meter consumer are active', () => {
    const gate = new AudioMeterDemandGate();
    expect(gate.enabled).toBe(false);
    expect(gate.setRendererRequested(true)).toBe(true);
    expect(gate.enabled).toBe(true);
    expect(gate.setRendererActive(false)).toBe(true);
    expect(gate.enabled).toBe(false);
    expect(gate.setRendererRequested(false)).toBe(false);
    expect(gate.setRendererActive(true)).toBe(false);
  });

  test('limits numeric capture telemetry while publishing transitions immediately', () => {
    const gate = new CaptureSnapshotUpdateGate(5_000);
    const first = captureSnapshot();
    expect(gate.shouldApply(first, 0)).toBe(true);

    const progress = structuredClone(first);
    progress.runtime.bufferedSeconds = 1;
    progress.runtime.encodedFrames = 60;
    progress.runtime.replayCacheBytes = 1_000_000;
    expect(gate.shouldApply(progress, 1_000)).toBe(false);
    expect(gate.shouldApply(progress, 5_000)).toBe(true);

    const failed = structuredClone(progress);
    failed.runtime.state = 'error';
    failed.runtime.error = 'encoder exited';
    expect(gate.shouldApply(failed, 5_001)).toBe(true);
  });

  test('does not render engine updates that only refresh resource telemetry', () => {
    const previous: EngineStatus = {
      kind: 'capture', state: 'running', pid: 42, cpuPercent: 1, memoryMb: 100,
      uptimeSeconds: 10, updatedAt: new Date(0).toISOString(),
    };
    expect(isMaterialEngineStatusChange(previous, {
      ...previous, cpuPercent: 2, memoryMb: 120, uptimeSeconds: 15, updatedAt: new Date(5_000).toISOString(),
    })).toBe(false);
    expect(isMaterialEngineStatusChange(previous, { ...previous, state: 'error', message: 'capture stopped' })).toBe(true);
  });
});
