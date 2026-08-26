import { describe, expect, test } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';

describe('audio endpoint discovery', () => {
  test('does not advertise fabricated hardware before Windows discovery runs', () => {
    const audio = createDefaultSnapshot().audio;

    expect(audio.devices).toEqual([]);
    expect(audio.outputDevice).toBe('');
    expect(audio.microphoneDevice).toBe('');
    expect(audio.monitoringDeviceId).toBe('');
    expect(audio.buses.every((bus) => bus.deviceId === '')).toBeTrue();
  });
});
