import { expect, test } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { reconcileSnapshot } from '../src/renderer/src/stores/reconcile-snapshot';

test('a telemetry-only IPC snapshot preserves every unchanged product branch', () => {
  const before = createDefaultSnapshot();
  const incoming = structuredClone(before);
  incoming.performance.totalMemoryMb += 1;
  const next = reconcileSnapshot(before, incoming);
  expect(next).toEqual(incoming);
  expect(next).not.toBe(before);
  expect(next.performance).not.toBe(before.performance);
  for (const key of Object.keys(before) as Array<keyof typeof before>) {
    if (key !== 'performance') expect(next[key]).toBe(before[key]);
  }
  expect(reconcileSnapshot(next, structuredClone(next))).toBe(next);
});

test('device acknowledgements replace the changed branch and retain other devices through reordering', () => {
  const before = createDefaultSnapshot();
  expect(before.devices.length).toBeGreaterThan(1);
  const incoming = structuredClone(before);
  incoming.devices.reverse();
  incoming.devices[0]!.connected = !incoming.devices[0]!.connected;
  const received = structuredClone(incoming);
  const original = structuredClone(before);
  const next = reconcileSnapshot(before, incoming);
  expect(next).toEqual(incoming);
  for (const device of next.devices.slice(1)) {
    expect(device).toBe(before.devices.find(item => item.id === device.id));
  }
  expect(next.devices[0]).not.toBe(before.devices.find(item => item.id === next.devices[0]!.id));
  expect(before).toEqual(original);
  expect(incoming).toEqual(received);
});

test('removing optional data does not resurrect the last value', () => {
  const before = createDefaultSnapshot();
  before.capture.runtime.error = 'Host disconnected';
  const incoming = structuredClone(before);
  delete incoming.capture.runtime.error;
  const next = reconcileSnapshot(before, incoming);
  expect(next).toEqual(incoming);
  expect(Object.hasOwn(next.capture.runtime, 'error')).toBe(false);
  expect(next.capture.config).toBe(before.capture.config);
  expect(reconcileSnapshot(null, incoming)).toBe(incoming);
});
