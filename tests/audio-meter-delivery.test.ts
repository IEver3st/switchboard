import { describe, expect, test } from 'bun:test';
import { AudioMeterDeliveryGate } from '../src/main/services/audio-meter-delivery';
import { EventEmitter } from 'node:events';

describe('AudioMeterDeliveryGate', () => {
  test('repeated subscriptions release both WebContents listeners', () => {
    const sender = new EventEmitter();
    const gate = new AudioMeterDeliveryGate();
    for (let cycle = 0; cycle < 25; cycle++) {
      gate.setRequested(11, true, sender);
      gate.setRequested(11, true, sender);
      expect(sender.listenerCount('destroyed')).toBe(1);
      expect(sender.listenerCount('did-start-navigation')).toBe(1);
      gate.setRequested(11, false, sender);
      expect(sender.eventNames()).toEqual([]);
    }
  });

  test('reload, destruction, replacement and disposal release subscription ownership', () => {
    let clears = 0;
    const sender = new EventEmitter();
    const replacement = new EventEmitter();
    const gate = new AudioMeterDeliveryGate(() => clears++);
    gate.setRequested(11, true, sender);
    sender.emit('did-start-navigation', {}, 'file:///frame', false, false);
    sender.emit('did-start-navigation', {}, 'file:///app#route', true, true);
    expect(gate.shouldDeliver(11, true)).toBe(true);
    sender.emit('did-start-navigation', {}, 'file:///app', false, true);
    expect(clears).toBe(1);
    expect(sender.eventNames()).toEqual([]);
    gate.setRequested(11, true, sender);
    gate.setRequested(12, true, replacement);
    expect(sender.eventNames()).toEqual([]);
    sender.emit('destroyed');
    expect(gate.shouldDeliver(12, true)).toBe(true);
    replacement.emit('destroyed');
    expect(clears).toBe(2);
    expect(replacement.eventNames()).toEqual([]);
    gate.setRequested(11, true, sender);
    gate.dispose();
    gate.dispose();
    expect(sender.eventNames()).toEqual([]);
    expect(gate.shouldDeliver(11, true)).toBe(false);
  });

  test('delivers only to the renderer that requested visible meter updates', () => {
    const gate = new AudioMeterDeliveryGate();

    expect(gate.shouldDeliver(11, true)).toBe(false);
    expect(gate.setRequested(11, true)).toBe(true);
    expect(gate.setRequested(11, true)).toBe(false);
    expect(gate.shouldDeliver(11, false)).toBe(false);
    expect(gate.shouldDeliver(12, true)).toBe(false);
    expect(gate.shouldDeliver(11, true)).toBe(true);
  });

  test('clears demand without allowing a stale renderer to clear its replacement', () => {
    const gate = new AudioMeterDeliveryGate();

    gate.setRequested(11, true);
    gate.setRequested(12, true);
    gate.setRequested(11, false);
    expect(gate.shouldDeliver(12, true)).toBe(true);

    gate.clear(12);
    expect(gate.shouldDeliver(12, true)).toBe(false);
  });
});
