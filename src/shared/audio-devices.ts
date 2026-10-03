import type { AudioBus, AudioDevice, AudioDeviceDirection, AudioState } from './contracts';

export function isAudioTransport(device: AudioDevice): boolean {
  return device.isSwitchboard === true || /(?:VB-Audio.*(?:Cable|Hi-Fi)|Hi-Fi Cable|Switchboard Microphone|Switchboard Mixer)/i.test(device.name);
}

const personalOutputFormFactors = new Set(['headphones', 'headset']);

function availableDevices(devices: AudioDevice[], direction: AudioDeviceDirection): AudioDevice[] {
  return devices.filter((device) => device.available && device.direction === direction && !device.isSwitchboard
    && !isAudioTransport(device));
}

function preferredFallback(candidates: AudioDevice[], direction: AudioDeviceDirection): AudioDevice | undefined {
  const defaultDevice = candidates.find((device) => device.isDefault);
  if (defaultDevice && !defaultDevice.isVirtual) return defaultDevice;

  const preferredHardware = direction === 'output'
    ? candidates.find((device) => !device.isVirtual && device.formFactor && personalOutputFormFactors.has(device.formFactor))
    : candidates.find((device) => !device.isVirtual && device.formFactor === 'microphone');

  return preferredHardware
    ?? defaultDevice
    ?? candidates.find((device) => !device.isVirtual)
    ?? candidates[0];
}

// Excluded devices are never chosen automatically; an explicit user choice still wins.
function selectedOrFallback(
  devices: AudioDevice[],
  direction: AudioDeviceDirection,
  selectedId: string,
  excludedIds: ReadonlySet<string>,
): AudioDevice | undefined {
  const candidates = availableDevices(devices, direction).filter((device) => !excludedIds.has(device.id));
  return candidates.find((device) => device.id === selectedId) ?? preferredFallback(candidates, direction);
}

const maximumPreferredDevices = 6;

/** Records an explicit choice: it becomes the active device and the first device to restore. */
export function chooseAudioBusDevice(bus: AudioBus, device: Pick<AudioDevice, 'id' | 'name'>): void {
  bus.deviceId = device.id;
  bus.preferredDevices = [
    { id: device.id, name: device.name },
    ...bus.preferredDevices.filter((entry) => entry.id !== device.id),
  ].slice(0, maximumPreferredDevices);
}

/** The remembered choice a channel is waiting for while it runs on a fallback, if any. */
export function waitingForPreferredDevice(bus: AudioBus): AudioBus['preferredDevices'][number] | undefined {
  const preferred = bus.preferredDevices[0];
  return preferred && preferred.id !== bus.deviceId ? preferred : undefined;
}

function resolveBusDevice(bus: AudioBus, devices: AudioDevice[], excludedIds: ReadonlySet<string>): AudioDevice | undefined {
  const direction = bus.id === 'mic' ? 'input' : 'output';
  const candidates = availableDevices(devices, direction);
  for (const entry of bus.preferredDevices) {
    const device = candidates.find((candidate) => candidate.id === entry.id);
    if (!device) continue;
    entry.name = device.name;
    return device;
  }
  return selectedOrFallback(devices, direction, bus.deviceId, excludedIds);
}

export function reconcileAudioDevices(audio: AudioState, discoveredDevices: AudioDevice[]): void {
  const uniqueDevices = new Map<string, AudioDevice>();
  for (const device of discoveredDevices) {
    if (!device.available || uniqueDevices.has(device.id)) continue;
    uniqueDevices.set(device.id, structuredClone(device));
  }
  audio.devices = [...uniqueDevices.values()];
  const excludedIds = new Set(audio.excludedDeviceIds);

  // Only the active device follows availability; preferredDevices is user intent.
  for (const bus of audio.buses) bus.deviceId = resolveBusDevice(bus, audio.devices, excludedIds)?.id ?? '';

  const gameDeviceId = audio.buses.find((bus) => bus.id === 'game')?.deviceId ?? '';
  const microphoneDeviceId = audio.buses.find((bus) => bus.id === 'mic')?.deviceId ?? '';
  audio.outputDevice = audio.devices.find((device) => device.id === gameDeviceId)?.name ?? '';
  audio.microphoneDevice = audio.devices.find((device) => device.id === microphoneDeviceId)?.name ?? '';

  // The monitoring device is always an explicit choice, so exclusion affects only its fallback.
  const monitoringDevice = availableDevices(audio.devices, 'output').find((device) => device.id === audio.monitoringDeviceId)
    ?? selectedOrFallback(audio.devices, 'output', '', excludedIds);
  audio.monitoringDeviceId = monitoringDevice?.id ?? '';
  if (!monitoringDevice) audio.monitoringEnabled = false;

  const outputIds = new Set(availableDevices(audio.devices, 'output').map((device) => device.id));
  for (const preset of audio.pathPresets) {
    if (preset.kind !== 'microphone') continue;
    if (!outputIds.has(preset.monitoring.deviceId)) {
      preset.monitoring.deviceId = monitoringDevice?.id ?? '';
      if (!monitoringDevice) preset.monitoring.enabled = false;
    }
  }
}
