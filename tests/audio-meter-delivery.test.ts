import { describe, expect, test } from 'bun:test';
import { AudioMeterDeliveryGate } from '../src/main/services/audio-meter-delivery';

describe('AudioMeterDeliveryGate', () => {
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
