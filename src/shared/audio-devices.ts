import type { AudioDevice, AudioDeviceDirection, AudioState } from './contracts';

const personalOutputFormFactors = new Set(['headphones', 'headset']);

function availableDevices(devices: AudioDevice[], direction: AudioDeviceDirection): AudioDevice[] {
  return devices.filter((device) => device.available && device.direction === direction && !device.isSwitchboard);
}

function preferredFallback(devices: AudioDevice[], direction: AudioDeviceDirection): AudioDevice | undefined {
  const candidates = availableDevices(devices, direction);
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

function selectedOrFallback(
  devices: AudioDevice[],
  direction: AudioDeviceDirection,
  selectedId: string,
): AudioDevice | undefined {
  return availableDevices(devices, direction).find((device) => device.id === selectedId)
    ?? preferredFallback(devices, direction);
}

export function reconcileAudioDevices(audio: AudioState, discoveredDevices: AudioDevice[]): void {
  const uniqueDevices = new Map<string, AudioDevice>();
  for (const device of discoveredDevices) {
    if (!device.available || uniqueDevices.has(device.id)) continue;
    uniqueDevices.set(device.id, structuredClone(device));
  }
  audio.devices = [...uniqueDevices.values()];

  for (const bus of audio.buses) {
    const direction = bus.id === 'mic' ? 'input' : 'output';
    bus.deviceId = selectedOrFallback(audio.devices, direction, bus.deviceId)?.id ?? '';
  }

  const gameDeviceId = audio.buses.find((bus) => bus.id === 'game')?.deviceId ?? '';
  const microphoneDeviceId = audio.buses.find((bus) => bus.id === 'mic')?.deviceId ?? '';
  audio.outputDevice = audio.devices.find((device) => device.id === gameDeviceId)?.name ?? '';
  audio.microphoneDevice = audio.devices.find((device) => device.id === microphoneDeviceId)?.name ?? '';

  const monitoringDevice = selectedOrFallback(audio.devices, 'output', audio.monitoringDeviceId);
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
