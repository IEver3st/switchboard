import { describe, expect, test } from 'bun:test';
import { resolveCaptureMicrophoneDeviceId } from '../src/main/capture-microphone-routing';

describe('capture microphone routing', () => {
  test('uses the selected physical microphone instead of the Windows default input', () => {
    expect(resolveCaptureMicrophoneDeviceId({
      microphoneDevice: 'Microphone (HyperX QuadCast 2)',
      devices: [
        {
          id: 'steelseries-sonar-default',
          name: 'SteelSeries Sonar - Microphone',
          direction: 'input',
          isDefault: true,
          available: true,
          formFactor: 'microphone',
          isVirtual: true,
          isSwitchboard: false,
        },
        {
          id: 'hyperx-quadcast-endpoint',
          name: 'Microphone (HyperX QuadCast 2)',
          direction: 'input',
          isDefault: false,
          available: true,
          formFactor: 'microphone',
          isVirtual: false,
          isSwitchboard: false,
        },
      ],
      host: null,
    })).toBe('hyperx-quadcast-endpoint');
  });

  test('prefers the input Audio.Host has confirmed active', () => {
    expect(resolveCaptureMicrophoneDeviceId({
      microphoneDevice: 'Microphone (HyperX QuadCast 2)',
      devices: [],
      host: {
        microphone: { activeInputDeviceId: 'confirmed-hyperx-endpoint' },
      },
    })).toBe('confirmed-hyperx-endpoint');
  });
});
