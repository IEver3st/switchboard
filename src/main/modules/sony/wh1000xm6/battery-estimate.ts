import type { BatteryCapability } from '../../../../shared/contracts';

// Sony rates WH-1000XM6 Bluetooth music playback at up to 30 hours with
// noise cancelling or Ambient Sound enabled. The protocol reports charge
// percentage, not remaining minutes, so use that common operating profile as
// a nominal fallback. Actual runtime still varies with codec and features.
const ratedMinutes = 30 * 60;

export function xm6BatteryCapability(
  percentage: number,
  charging: boolean,
  updatedAt = Date.now(),
): BatteryCapability {
  const fullyCharged = percentage === 100;
  return {
    percentage,
    charging,
    fullyCharged,
    estimatedMinutesRemaining: charging || fullyCharged
      ? undefined
      : Math.round(ratedMinutes * percentage / 100),
    updatedAt,
  };
}
