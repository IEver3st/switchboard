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

export const METER_FLOOR_DB = -60;

export function levelToDb(level: number): number {
  return level <= 0.001 ? METER_FLOOR_DB : Math.max(METER_FLOOR_DB, 20 * Math.log10(level));
}

/**
 * Display ballistics for meter readings. The host reports the RMS of its most
 * recent 10 ms buffer, which jumps between frames; drawn raw it flickers.
 * Rises follow the signal almost at once, falls decay at a steady rate, like a
 * hardware PPM. Returns the smoothed level in dB and whether it is still moving.
 */
export function createMeterBallistics(releaseDbPerSecond = 24, attack = 0.6) {
  let displayDb = METER_FLOOR_DB;
  let lastAt = 0;
  return (targetDb: number, now: number): { db: number; settling: boolean } => {
    const seconds = lastAt ? Math.min(0.1, (now - lastAt) / 1_000) : 0;
    lastAt = now;
    if (targetDb > displayDb) displayDb += (targetDb - displayDb) * attack;
    else displayDb = Math.max(targetDb, displayDb - releaseDbPerSecond * seconds);
    if (Math.abs(targetDb - displayDb) < 0.05) displayDb = targetDb;
    return { db: displayDb, settling: displayDb !== targetDb || displayDb > METER_FLOOR_DB };
  };
}
