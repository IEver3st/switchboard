import { describe, expect, test } from 'bun:test';
import { reconcileAudioDevices } from '../src/shared/audio-devices';
import { createDefaultSnapshot } from '../src/shared/defaults';
import type { AudioDevice } from '../src/shared/contracts';

describe('audio endpoint discovery', () => {
  test('does not advertise fabricated hardware before Windows discovery runs', () => {
    const audio = createDefaultSnapshot().audio;

    expect(audio.devices).toEqual([]);
    expect(audio.outputDevice).toBe('');
    expect(audio.microphoneDevice).toBe('');
    expect(audio.monitoringDeviceId).toBe('');
    expect(audio.buses.every((bus) => bus.deviceId === '')).toBeTrue();
  });

  test('replaces stale routes with discovered physical headphones and microphone', () => {
    const audio = createDefaultSnapshot().audio;
    for (const bus of audio.buses) bus.deviceId = 'output-nova-pro';
    audio.monitoringDeviceId = 'output-nova-pro';
    audio.outputDevice = 'Arctis Nova Pro Wireless';

    const devices: AudioDevice[] = [
      {
        id: 'sonar-game',
        name: 'SteelSeries Sonar - Gaming (SteelSeries Sonar Virtual Audio Device)',
        direction: 'output',
        isDefault: true,
        available: true,
        formFactor: 'headphones',
        isVirtual: true,
      },
      {
        id: 'sony-headphones',
        name: 'Headphones (2- WH-1000XM6)',
        direction: 'output',
        isDefault: false,
        available: true,
        formFactor: 'headphones',
        isVirtual: false,
      },
      {
        id: 'sonar-microphone',
        name: 'SteelSeries Sonar - Microphone (SteelSeries Sonar Virtual Audio Device)',
        direction: 'input',
        isDefault: true,
        available: true,
        formFactor: 'microphone',
        isVirtual: true,
      },
      {
        id: 'quadcast',
        name: 'Microphone (HyperX QuadCast 2)',
        direction: 'input',
        isDefault: false,
        available: true,
        formFactor: 'microphone',
        isVirtual: false,
      },
    ];

    reconcileAudioDevices(audio, devices);

    expect(audio.devices.map((device) => device.name)).toContain('Headphones (2- WH-1000XM6)');
    expect(audio.buses.filter((bus) => bus.id !== 'mic').every((bus) => bus.deviceId === 'sony-headphones')).toBeTrue();
    expect(audio.buses.find((bus) => bus.id === 'mic')?.deviceId).toBe('quadcast');
    expect(audio.monitoringDeviceId).toBe('sony-headphones');
    expect(audio.outputDevice).toBe('Headphones (2- WH-1000XM6)');
    expect(audio.microphoneDevice).toBe('Microphone (HyperX QuadCast 2)');
    expect(JSON.stringify(audio)).not.toContain('Arctis Nova Pro Wireless');
  });

  test('preserves a selected endpoint while it remains active', () => {
    const audio = createDefaultSnapshot().audio;
    audio.buses.find((bus) => bus.id === 'game')!.deviceId = 'display';
    const devices: AudioDevice[] = [
      { id: 'headphones', name: 'Headphones', direction: 'output', isDefault: true, available: true, formFactor: 'headphones', isVirtual: false },
      { id: 'display', name: 'Display audio', direction: 'output', isDefault: false, available: true, formFactor: 'digital-display', isVirtual: false },
    ];

    reconcileAudioDevices(audio, devices);

    expect(audio.buses.find((bus) => bus.id === 'game')?.deviceId).toBe('display');
    expect(audio.outputDevice).toBe('Display audio');
  });
});
