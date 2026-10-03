import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { chooseAudioBusDevice, reconcileAudioDevices, waitingForPreferredDevice } from '../src/shared/audio-devices';
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

  test('repairs cable feedback routes even when Windows makes a transport the default', () => {
    const audio = createDefaultSnapshot().audio;
    for (const bus of audio.buses) bus.deviceId = bus.id === 'mic' ? 'mic-transport' : 'cable';
    audio.monitoringDeviceId = 'mic-send';
    const devices: AudioDevice[] = [
      { id: 'cable', name: 'CABLE Input (VB-Audio Virtual Cable)', direction: 'output', available: true, isDefault: true, isVirtual: true },
      { id: 'mic-send', name: 'Hi-Fi Cable Input (VB-Audio Hi-Fi Cable)', direction: 'output', available: true, isDefault: false, isVirtual: true },
      { id: 'mic-transport', name: 'Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)', direction: 'input', available: true, isDefault: true, isVirtual: true },
      { id: 'sony', name: 'Headphones', direction: 'output', available: true, isDefault: false, isVirtual: false, formFactor: 'headphones' },
      { id: 'hyperx', name: 'Microphone', direction: 'input', available: true, isDefault: false, isVirtual: false, formFactor: 'microphone' },
    ];
    reconcileAudioDevices(audio, devices);
    expect(audio.buses.filter(bus => bus.id !== 'mic').every(bus => bus.deviceId === 'sony')).toBeTrue();
    expect(audio.buses.find(bus => bus.id === 'mic')?.deviceId).toBe('hyperx');
    expect(audio.monitoringDeviceId).toBe('sony');
    const parsed = parseAudioEndpoints([{ id: 'hi-fi', name: 'Hi-Fi Cable Input', interfaceName: 'VB-Audio Hi-Fi Cable', flow: 'render', isDefault: false, volume: 1, muted: false }]);
    expect(parsed[0]?.isVirtual).toBeTrue();
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

  const headphones: AudioDevice = { id: 'xm6', name: 'Headphones (WH-1000XM6)', direction: 'output', isDefault: true, available: true, formFactor: 'headphones', isVirtual: false };
  const monitor: AudioDevice = { id: 'g60', name: 'Odyssey G60SD', direction: 'output', isDefault: false, available: true, formFactor: 'digital-display', isVirtual: false };
  const outputBuses = (audio: ReturnType<typeof createDefaultSnapshot>['audio']) => audio.buses.filter((bus) => bus.id !== 'mic' && bus.id !== 'aux');

  test('restores the chosen headphones after a fallback without losing the preference', () => {
    const audio = createDefaultSnapshot().audio;
    reconcileAudioDevices(audio, [headphones, monitor]);
    for (const bus of outputBuses(audio)) chooseAudioBusDevice(bus, headphones);

    // Headphones power off: Windows removes the endpoint and defaults to the display.
    reconcileAudioDevices(audio, [{ ...monitor, isDefault: true }]);
    for (const bus of outputBuses(audio)) {
      expect(bus.deviceId).toBe('g60');
      expect(bus.preferredDevices.map((entry) => entry.id)).toEqual(['xm6']);
      expect(waitingForPreferredDevice(bus)?.name).toBe('Headphones (WH-1000XM6)');
    }

    // Headphones return while the display is still valid and still the Windows default.
    reconcileAudioDevices(audio, [{ ...headphones, isDefault: false }, { ...monitor, isDefault: true }]);
    for (const bus of outputBuses(audio)) {
      expect(bus.deviceId).toBe('xm6');
      expect(waitingForPreferredDevice(bus)).toBeUndefined();
    }
    expect(audio.outputDevice).toBe('Headphones (WH-1000XM6)');
  });

  test('falls back through earlier choices before automatic selection', () => {
    const audio = createDefaultSnapshot().audio;
    const speakers: AudioDevice = { id: 'speakers', name: 'Speakers', direction: 'output', isDefault: false, available: true, formFactor: 'speakers', isVirtual: false };
    const game = audio.buses.find((bus) => bus.id === 'game')!;
    chooseAudioBusDevice(game, speakers);
    chooseAudioBusDevice(game, headphones);
    expect(game.preferredDevices.map((entry) => entry.id)).toEqual(['xm6', 'speakers']);

    reconcileAudioDevices(audio, [{ ...monitor, isDefault: true }, speakers]);
    expect(game.deviceId).toBe('speakers');
    expect(waitingForPreferredDevice(game)?.id).toBe('xm6');
  });

  test('never falls back to an excluded device', () => {
    const audio = createDefaultSnapshot().audio;
    audio.excludedDeviceIds = ['g60'];
    for (const bus of outputBuses(audio)) chooseAudioBusDevice(bus, headphones);

    reconcileAudioDevices(audio, [{ ...monitor, isDefault: true }]);
    for (const bus of outputBuses(audio)) {
      expect(bus.deviceId).toBe('');
      expect(waitingForPreferredDevice(bus)?.id).toBe('xm6');
    }

    reconcileAudioDevices(audio, [headphones, monitor]);
    for (const bus of outputBuses(audio)) expect(bus.deviceId).toBe('xm6');
  });

  test('remembers a legacy saved device unless it was an excluded fallback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-preferences-'));
    try {
      const filePath = join(directory, 'switchboard-state.json');
      const legacy = createDefaultSnapshot() as unknown as { audio: Record<string, unknown> & { buses: Record<string, unknown>[] } };
      legacy.audio.excludedDeviceIds = ['g60'];
      legacy.audio.devices = [headphones, monitor];
      for (const bus of legacy.audio.buses) {
        delete bus.preferredDevices;
        bus.deviceId = bus.id === 'media' ? 'g60' : bus.id === 'mic' ? '' : 'xm6';
      }
      await writeFile(filePath, JSON.stringify(legacy), 'utf8');

      const store = new StateStore(filePath);
      await store.load();
      const buses = store.get().audio.buses;
      expect(buses.find((bus) => bus.id === 'game')?.preferredDevices).toEqual([{ id: 'xm6', name: 'Headphones (WH-1000XM6)' }]);
      expect(buses.find((bus) => bus.id === 'media')?.preferredDevices).toEqual([]);
      expect(buses.find((bus) => bus.id === 'mic')?.preferredDevices).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
