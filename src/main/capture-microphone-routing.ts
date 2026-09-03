import type { AudioDevice, CaptureConfig } from '../shared/contracts';

type CaptureMicrophoneRoutingState = {
  microphoneDevice: string;
  devices: AudioDevice[];
  host: {
    microphone?: {
      activeInputDeviceId: string | null;
    } | null;
  } | null;
};

type CaptureAudioRoutingState = CaptureMicrophoneRoutingState & {
  capture?: Pick<CaptureConfig, 'microphoneDeviceId' | 'systemAudioDeviceId' | 'chatAudioDeviceId'> | null;
};

function matchesSelectedMicrophone(device: AudioDevice, selectedName: string): boolean {
  return device.direction === 'input' && device.available && device.name === selectedName;
}

function findAvailableDevice(devices: AudioDevice[], deviceId: string | null | undefined, direction: 'input' | 'output'): string | null {
  if (!deviceId) return null;
  const match = devices.find((device) => device.id === deviceId && device.direction === direction && device.available);
  return match?.id ?? null;
}

export function resolveCaptureMicrophoneDeviceId(audio: CaptureMicrophoneRoutingState | CaptureAudioRoutingState): string | null {
  const explicit = (audio as CaptureAudioRoutingState).capture?.microphoneDeviceId;
  const explicitMatch = explicit ? findAvailableDevice(audio.devices, explicit, 'input') : null;
  if (explicitMatch) return explicitMatch;
  // An explicit but currently unavailable selection must not silently fall back
  // to a different microphone. Returning null lets the host report the missing
  // device instead of recording the wrong input.
  if (explicit) return null;
  const confirmedInput = audio.host?.microphone?.activeInputDeviceId;
  if (confirmedInput) return confirmedInput;
  if (!audio.microphoneDevice) return null;
  return audio.devices.find((device) => matchesSelectedMicrophone(device, audio.microphoneDevice))?.id ?? null;
}

export function resolveCaptureSystemAudioDeviceId(audio: CaptureAudioRoutingState): string | null {
  return findAvailableDevice(audio.devices, audio.capture?.systemAudioDeviceId, 'output');
}

export function resolveCaptureChatAudioDeviceId(audio: CaptureAudioRoutingState): string | null {
  return findAvailableDevice(audio.devices, audio.capture?.chatAudioDeviceId, 'output');
}

export function describeCaptureAudioRoute(options: {
  systemDeviceName: string | null;
  chatDeviceName: string | null;
  microphoneDeviceName: string | null;
  includeSystemAudio: boolean;
  includeChatAudio: boolean;
  includeMic: boolean;
  clipMixActive: boolean;
}): string | null {
  const parts: string[] = [];
  if (options.includeSystemAudio) {
    parts.push(options.clipMixActive && !options.systemDeviceName ? 'Switchboard clip mix' : options.systemDeviceName ?? 'Default system audio');
  }
  if (options.includeChatAudio) {
    parts.push(options.chatDeviceName ?? 'Default chat audio');
  }
  if (options.includeMic) {
    parts.push(options.microphoneDeviceName ?? 'Default microphone');
  }
  if (parts.length === 0) return null;
  return `Replay audio: ${parts.join(' + ')}. Each input stays on its own track so one can be muted without losing the others.`;
}
