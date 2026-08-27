import { describe, expect, test } from 'bun:test';
import type { AudioHostSnapshot, AudioState } from '../src/shared/contracts';
import { createDefaultSnapshot } from '../src/shared/defaults';
import {
  microphoneDspConfigurationApplied,
  microphoneInputApplied,
  microphoneMonitoringApplied,
} from '../src/shared/microphone-runtime';

function attachRuntime(audio: AudioState): void {
  const inputId = 'physical-microphone';
  const outputId = 'physical-headphones';
  const micBus = audio.buses.find((bus) => bus.id === 'mic');
  if (!micBus) throw new Error('Missing microphone bus.');
  micBus.deviceId = inputId;
  audio.monitoringDeviceId = outputId;
  audio.host = {
    running: true,
    microphone: {
      configurationVersion: 4,
      requestedInputDeviceId: inputId,
      activeInputDeviceId: inputId,
      inputFormat: '48 kHz mono float',
      processors: audio.micProcessors.map((processor) => ({
        id: processor.id,
        enabled: processor.enabled,
        parameters: structuredClone(processor.parameters),
      })),
      monitoring: {
        requested: false,
        active: false,
        level: audio.monitoring,
        requestedDeviceId: outputId,
        activeDeviceId: null,
      },
      error: null,
    },
  } as AudioHostSnapshot;
}

describe('microphone host readback', () => {
  test('requires the active input and every configured processor parameter to match', () => {
    const audio = createDefaultSnapshot().audio;
    attachRuntime(audio);

    expect(microphoneInputApplied(audio)).toBeTrue();
    expect(microphoneDspConfigurationApplied(audio)).toBeTrue();

    audio.host!.microphone!.activeInputDeviceId = 'different-input';
    expect(microphoneInputApplied(audio)).toBeFalse();
    audio.host!.microphone!.activeInputDeviceId = 'physical-microphone';

    const configuredGain = audio.host!.microphone!.processors.find((processor) => processor.id === 'gain');
    if (!configuredGain) throw new Error('Missing configured gain processor.');
    configuredGain.parameters.gainDb = 6;
    expect(microphoneDspConfigurationApplied(audio)).toBeFalse();
  });

  test('distinguishes requested monitoring from an active monitor stream', () => {
    const audio = createDefaultSnapshot().audio;
    attachRuntime(audio);

    expect(microphoneMonitoringApplied(audio)).toBeTrue();
    audio.monitoringEnabled = true;
    audio.host!.microphone!.monitoring.requested = true;
    expect(microphoneMonitoringApplied(audio)).toBeFalse();

    audio.host!.microphone!.monitoring.active = true;
    audio.host!.microphone!.monitoring.activeDeviceId = audio.monitoringDeviceId;
    expect(microphoneMonitoringApplied(audio)).toBeTrue();

    audio.host!.microphone!.monitoring.level = 0.72;
    expect(microphoneMonitoringApplied(audio)).toBeFalse();
  });
});
