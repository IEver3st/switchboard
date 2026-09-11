import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { reconcileAudioDevices } from '../src/shared/audio-devices';
import { createDefaultSnapshot } from '../src/shared/defaults';
import type { AudioDevice } from '../src/shared/contracts';
import { parseAudioEndpoints } from '../src/main/services/audio-endpoint-discovery';

describe('audio endpoint discovery', () => {
  test('accepts physical Windows devices whose optional metadata is omitted by the host', () => {
    const devices = parseAudioEndpoints([
      { id: 'speakers', name: 'Speakers (USB Audio)', flow: 'render', isDefault: true, volume: 1, muted: false },
      { id: 'headset', name: 'Headset earpiece', flow: 'render', isDefault: false, formFactor: 'headset', interfaceName: null, volume: 1, muted: false },
      { id: 'mic', name: 'Microphone (USB Audio)', flow: 'capture', isDefault: true, formFactor: null, volume: 1, muted: false },
    ]);
    expect(devices.map((device) => device.id)).toEqual(['speakers', 'headset', 'mic']);
    expect(devices.every((device) => device.available && !device.isSwitchboard && !device.isVirtual)).toBeTrue();
    const audio = createDefaultSnapshot().audio;
    reconcileAudioDevices(audio, devices);
    expect(audio.buses.find((bus) => bus.id === 'game')?.deviceId).toBe('speakers');
    expect(audio.buses.find((bus) => bus.id === 'mic')?.deviceId).toBe('mic');
    expect(() => parseAudioEndpoints([{ id: 'bad', name: 'Invalid', flow: 'wrong' }])).toThrow();
  });
  test('does not advertise fabricated hardware before Windows discovery runs', () => {
    const audio = createDefaultSnapshot().audio;

    expect(audio.devices).toEqual([]);
    expect(audio.outputDevice).toBe('');
    expect(audio.microphoneDevice).toBe('');
    expect(audio.monitoringDeviceId).toBe('');
    expect(audio.buses.every((bus) => bus.deviceId === '')).toBeTrue();
  });

  test('drops persisted endpoint inventory and labels before rediscovery', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-devices-'));
    try {
      const filePath = join(directory, 'switchboard-state.json');
      const first = new StateStore(filePath);
      await first.load();
      first.update((draft) => {
        draft.audio.outputDevice = 'Arctis Nova Pro Wireless';
        draft.audio.devices = [{
          id: 'output-nova-pro',
          name: 'Arctis Nova Pro Wireless',
          direction: 'output',
          isDefault: true,
          available: true,
          isVirtual: false,
        }];
      });
      await first.flush();

      const restarted = new StateStore(filePath);
      await restarted.load();

      expect(restarted.get().audio.devices).toEqual([]);
      expect(restarted.get().audio.outputDevice).toBe('');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
        id: 'usb-headphones',
        name: 'Headphones (USB Audio Device)',
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

    expect(audio.devices.map((device) => device.name)).toContain('Headphones (USB Audio Device)');
    expect(audio.buses.filter((bus) => bus.id !== 'mic').every((bus) => bus.deviceId === 'usb-headphones')).toBeTrue();
    expect(audio.buses.find((bus) => bus.id === 'mic')?.deviceId).toBe('quadcast');
    expect(audio.monitoringDeviceId).toBe('usb-headphones');
    expect(audio.outputDevice).toBe('Headphones (USB Audio Device)');
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
