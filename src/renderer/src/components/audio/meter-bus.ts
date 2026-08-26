import type { AudioBusId, AudioMeterFrame, AudioMeterValue } from '../../../../shared/contracts';

type MeterListener = (value: AudioMeterValue) => void;

const listeners = new Map<AudioBusId, Set<MeterListener>>();
const latestValues = new Map<AudioBusId, AudioMeterValue>();

export function publishAudioMeterFrame(frame: AudioMeterFrame): void {
  for (const value of frame.values) {
    latestValues.set(value.busId, value);
    for (const listener of listeners.get(value.busId) ?? []) listener(value);
  }
}

export function subscribeToAudioMeter(busId: AudioBusId, listener: MeterListener): () => void {
  const busListeners = listeners.get(busId) ?? new Set<MeterListener>();
  busListeners.add(listener);
  listeners.set(busId, busListeners);

  const latest = latestValues.get(busId);
  if (latest) listener(latest);

  return () => {
    busListeners.delete(listener);
    if (busListeners.size === 0) listeners.delete(busId);
  };
}

export function clearAudioMeters(): void {
  for (const busId of ['game', 'chat', 'media', 'mic', 'aux'] as const) {
    const value = { busId, level: 0, peak: 0, clipping: false };
    latestValues.set(busId, value);
    for (const listener of listeners.get(busId) ?? []) listener(value);
  }
}
