import type { AudioState, ConfiguredMicProcessor, MicProcessor } from './contracts';

function parametersMatch(configured: ConfiguredMicProcessor, expected: MicProcessor): boolean {
  return JSON.stringify(configured.parameters) === JSON.stringify(expected.parameters);
}

export function microphoneDspConfigurationApplied(audio: AudioState): boolean {
  const runtime = audio.host?.microphone;
  if (!audio.host?.running || !runtime || runtime.configurationVersion <= 0) return false;
  if (runtime.processors.length !== audio.micProcessors.length) return false;

  return audio.micProcessors.every((expected) => {
    const configured = runtime.processors.find((candidate) => candidate.id === expected.id);
    return Boolean(configured && configured.enabled === expected.enabled && parametersMatch(configured, expected));
  });
}

export function microphoneInputApplied(audio: AudioState): boolean {
  const selectedInputId = audio.buses.find((bus) => bus.id === 'mic')?.deviceId;
  return Boolean(
    audio.host?.running
    && selectedInputId
    && audio.host.microphone?.requestedInputDeviceId === selectedInputId
    && audio.host.microphone.activeInputDeviceId === selectedInputId,
  );
}

export function microphoneMonitoringApplied(audio: AudioState): boolean {
  const monitoring = audio.host?.microphone?.monitoring;
  if (!audio.host?.running || !monitoring) return false;
  if (monitoring.requested !== audio.monitoringEnabled) return false;
  if (Math.abs(monitoring.level - audio.monitoring) > 0.0001) return false;
  if (!audio.monitoringEnabled) return !monitoring.active;
  return monitoring.active
    && monitoring.requestedDeviceId === audio.monitoringDeviceId
    && monitoring.activeDeviceId === audio.monitoringDeviceId;
}
