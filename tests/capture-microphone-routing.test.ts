import { describe, expect, test } from 'bun:test';
import { resolveCaptureChatAudioDeviceId, resolveCaptureMicrophoneDeviceId, resolveCaptureSystemAudioDeviceId } from '../src/main/capture-microphone-routing';

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

  test('uses the explicit capture microphone instead of the Audio bus selection', () => {
    expect(resolveCaptureMicrophoneDeviceId({
      microphoneDevice: 'Microphone (HyperX QuadCast 2)',
      devices: [
        { id: 'sonar-mic', name: 'SteelSeries Sonar - Microphone', direction: 'input', isDefault: true, available: true, isVirtual: true, isSwitchboard: false },
        { id: 'hyperx-quadcast-endpoint', name: 'Microphone (HyperX QuadCast 2)', direction: 'input', isDefault: false, available: true, isVirtual: false, isSwitchboard: false },
      ],
      host: null,
      capture: { microphoneDeviceId: 'sonar-mic', systemAudioDeviceId: null, chatAudioDeviceId: null },
    })).toBe('sonar-mic');
  });

  test('never falls back to another microphone when the explicit selection is unavailable', () => {
    expect(resolveCaptureMicrophoneDeviceId({
      microphoneDevice: 'Microphone (HyperX QuadCast 2)',
      devices: [
        { id: 'hyperx-quadcast-endpoint', name: 'Microphone (HyperX QuadCast 2)', direction: 'input', isDefault: false, available: true, isVirtual: false, isSwitchboard: false },
      ],
      host: { microphone: { activeInputDeviceId: 'confirmed-hyperx-endpoint' } },
      capture: { microphoneDeviceId: 'disconnected-usb-mic', systemAudioDeviceId: null, chatAudioDeviceId: null },
    })).toBeNull();
  });

  test('resolves Sonar game and chat outputs as separate capture inputs', () => {
    const state = {
      microphoneDevice: '',
      devices: [
        { id: 'sonar-game', name: 'SteelSeries Sonar - Game', direction: 'output' as const, isDefault: true, available: true, isVirtual: true, isSwitchboard: false },
        { id: 'sonar-chat', name: 'SteelSeries Sonar - Chat', direction: 'output' as const, isDefault: false, available: true, isVirtual: true, isSwitchboard: false },
        { id: 'speakers', name: 'Speakers', direction: 'output' as const, isDefault: false, available: true, isVirtual: false, isSwitchboard: false },
      ],
      host: null,
      capture: { microphoneDeviceId: null, systemAudioDeviceId: 'sonar-game', chatAudioDeviceId: 'sonar-chat' },
    };
    expect(resolveCaptureSystemAudioDeviceId(state)).toBe('sonar-game');
    expect(resolveCaptureChatAudioDeviceId(state)).toBe('sonar-chat');
  });

  test('returns null for automatic device routing', () => {
    const state = {
      microphoneDevice: '',
      devices: [],
      host: null,
      capture: { microphoneDeviceId: null, systemAudioDeviceId: null, chatAudioDeviceId: null },
    };
    expect(resolveCaptureSystemAudioDeviceId(state)).toBeNull();
    expect(resolveCaptureChatAudioDeviceId(state)).toBeNull();
  });
});
