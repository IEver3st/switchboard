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

export function resolveCaptureMicrophoneDeviceId(audio: CaptureMicrophoneRoutingState | CaptureAudioRoutingState): string | null {
  const explicit = (audio as CaptureAudioRoutingState).capture?.microphoneDeviceId;
  // null means Windows default to the host. Keep disconnected IDs so a missing
  // endpoint reports unavailable instead of recording another microphone.
  if (explicit) return explicit;
  const confirmedInput = audio.host?.microphone?.activeInputDeviceId;
  if (confirmedInput) return confirmedInput;
  if (!audio.microphoneDevice) return null;
  return audio.devices.find((device) => matchesSelectedMicrophone(device, audio.microphoneDevice))?.id ?? null;
}

export function resolveCaptureSystemAudioDeviceId(audio: CaptureAudioRoutingState): string | null {
  return audio.capture?.systemAudioDeviceId ?? null;
}

export function resolveCaptureChatAudioDeviceId(audio: CaptureAudioRoutingState): string | null {
  return audio.capture?.chatAudioDeviceId ?? null;
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
