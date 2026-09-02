import type { AudioDevice } from '../shared/contracts';

type CaptureMicrophoneRoutingState = {
  microphoneDevice: string;
  devices: AudioDevice[];
  host: {
    microphone?: {
      activeInputDeviceId: string | null;
    } | null;
  } | null;
};

function matchesSelectedMicrophone(device: AudioDevice, selectedName: string): boolean {
  return device.direction === 'input' && device.available && device.name === selectedName;
}

export function resolveCaptureMicrophoneDeviceId(audio: CaptureMicrophoneRoutingState): string | null {
  const confirmedInput = audio.host?.microphone?.activeInputDeviceId;
  if (confirmedInput) return confirmedInput;
  if (!audio.microphoneDevice) return null;
  return audio.devices.find((device) => matchesSelectedMicrophone(device, audio.microphoneDevice))?.id ?? null;
}
