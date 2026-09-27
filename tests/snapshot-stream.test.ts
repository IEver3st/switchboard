import { expect, test } from 'bun:test';
import { StateStore } from '../src/main/services/state-store';
import { SnapshotPublisher, SnapshotReceiver } from '../src/shared/snapshot-stream';

test('transient publications preserve the library and send only validated changed branches', () => {
  const store = new StateStore('unused-state-stream.json');
  const publisher = new SnapshotPublisher();
  const receiver = new SnapshotReceiver();
  const frames: ReturnType<SnapshotPublisher['next']>[] = [];
  store.subscribe(snapshot => frames.push(publisher.next(snapshot)));
  const before = store.get();
  store.updateBranches(['setup'], draft => { draft.setup.preferences.quickControlsEnabled = true; }, { persist: false, emit: false });
  store.setPerformance(before.performance);
  const baseline = receiver.accept(frames[0]);
  store.updateBranches(['capture'], draft => { draft.capture.runtime.bufferedSeconds = 7; }, { persist: false });
  const patch = frames[1]!;
  expect(patch.type).toBe('patch');
  if (patch.type !== 'patch') throw new Error('Expected a branch patch');
  expect(Object.keys(patch.changes)).toEqual(['capture']);
  const next = receiver.accept(patch)!;
  expect(next.clips).toBe(baseline!.clips);
  expect(next.setup).toBe(baseline!.setup);
  expect(next.setup.preferences.quickControlsEnabled).toBe(true);
  expect(next.diagnostics).toBe(baseline!.diagnostics);
  expect(next.capture.runtime.bufferedSeconds).toBe(7);
  expect(store.read('capture').runtime.bufferedSeconds).toBe(7);
  expect(() => store.updateBranches(['capture'], draft => { draft.capture.runtime.bufferedSeconds = -1; }, { persist: false })).toThrow();
  expect(store.read('capture').runtime.bufferedSeconds).toBe(7);
});

test('subscriber mutations cannot corrupt canonical state and returned reads remain editable', () => {
  const store = new StateStore('unused-state-stream.json');
  store.subscribe(snapshot => {
    expect(Object.isFrozen(snapshot.clips)).toBe(true);
    expect(() => { snapshot.capture.runtime.bufferedSeconds = 999; }).toThrow();
  });
  store.setPerformance(store.read('performance'));
  const copy = store.read('capture');
  copy.runtime.bufferedSeconds = 123;
  expect(store.read('capture').runtime.bufferedSeconds).toBe(0);
});

test('missing baselines, skipped revisions and reloads request resynchronization', () => {
  const publisher = new SnapshotPublisher();
  const store = new StateStore('unused-state-stream.json');
  const receiver = new SnapshotReceiver();
  const first = publisher.next(store.get());
  const second = publisher.next(store.get());
  expect(receiver.accept(second)).toBeNull();
  expect(receiver.accept(first)).not.toBeNull();
  expect(receiver.accept(publisher.next(store.get()))).toBeNull();
  expect(receiver.accept(publisher.next(store.get(), true))).not.toBeNull();
  expect(() => receiver.accept({ type: 'patch', revision: 5, changes: { clips: 'invalid' } })).toThrow();
});
