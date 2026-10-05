import { describe, expect, test } from 'bun:test';
import type { CaptureHostSnapshot, EngineStatus } from '../src/shared/contracts';
import { CaptureSnapshotUpdateGate, isMaterialEngineStatusChange } from '../src/main/services/runtime-update-gates';
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
