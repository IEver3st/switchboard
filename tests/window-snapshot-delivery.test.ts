import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { WindowSnapshotDelivery } from '../src/main/services/window-snapshot-delivery';
import { StateStore } from '../src/main/services/state-store';
import { SnapshotReceiver, type SnapshotFrame } from '../src/shared/snapshot-stream';

class Window extends EventEmitter {
  visible = true;
  minimized = false;
  isVisible() { return this.visible; }
  isMinimized() { return this.minimized; }
}

test('hidden updates coalesce into one contiguous patch and keep the latest state on reopen', () => {
  const window = new Window();
  const frames: SnapshotFrame[] = [];
  const receiver = new SnapshotReceiver();
  const store = new StateStore('unused-window-stream.json');
  const delivery = new WindowSnapshotDelivery(window, frame => frames.push(frame));
  store.subscribe(snapshot => delivery.publish(snapshot));
  delivery.publish(store.get(), true);
  receiver.accept(frames[0]);
  window.visible = false; window.emit('hide');
  for (let i = 1; i <= 100; i++) {
    store.updateBranches(['capture'], draft => { draft.capture.runtime.bufferedSeconds = i; }, { persist: false });
  }
  store.updateBranches(['settings'], draft => { draft.settings.uiScalePercent = 125; }, { persist: false });
  expect(frames).toHaveLength(1);
  window.visible = true; window.emit('show');
  expect(frames).toHaveLength(2);
  expect(frames[1].revision).toBe(2);
  const restored = receiver.accept(frames[1])!;
  expect(restored.capture.runtime.bufferedSeconds).toBe(100);
  expect(restored.settings.uiScalePercent).toBe(125);
  window.emit('show'); window.emit('restore');
  expect(frames).toHaveLength(2);
  delivery.dispose();
});

test('minimize, hidden reload, restore and disposal do not leak listeners or lose a baseline', () => {
  const window = new Window();
  const frames: SnapshotFrame[] = [];
  const store = new StateStore('unused-window-stream.json');
  // Main already has a listener that may publish performance on this transition.
  const transition = () => delivery.publish(store.get());
  window.on('minimize', transition);
  const delivery = new WindowSnapshotDelivery(window, frame => frames.push(frame));
  delivery.publish(store.get(), true);
  window.minimized = true; window.emit('minimize');
  delivery.publish(store.get());
  window.emit('show');
  expect(frames).toHaveLength(1);
  delivery.publish(store.get(), true);
  const receiver = new SnapshotReceiver();
  expect(receiver.accept(frames[1])).not.toBeNull();
  delivery.publish(store.get());
  window.minimized = false; window.emit('restore');
  expect(receiver.accept(frames[2])).not.toBeNull();
  delivery.dispose(); delivery.dispose();
  expect(window.listeners('minimize')).toEqual([transition]);
  window.removeListener('minimize', transition);
  expect(window.eventNames()).toEqual([]);
  delivery.publish(store.get()); window.emit('show');
  expect(frames).toHaveLength(3);
});

test('a new hidden window receives a baseline and catches up when first shown', () => {
  const window = new Window(); window.visible = false;
  const frames: SnapshotFrame[] = [];
  const store = new StateStore('unused-window-stream.json');
  const delivery = new WindowSnapshotDelivery(window, frame => frames.push(frame));
  delivery.publish(store.get(), true);
  delivery.publish(store.get());
  expect(frames).toHaveLength(1);
  window.visible = true; window.emit('show');
  expect(frames).toHaveLength(2);
  delivery.dispose();
});
