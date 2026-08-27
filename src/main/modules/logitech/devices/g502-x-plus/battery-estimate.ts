import type { BatteryCapability } from '../../../../../shared/contracts';

// Logitech rates the G502 X Plus for 130 hours of constant motion with RGB
// off and 37 hours with RGB on. This is a nominal fallback for the direct
// HID path and for G HUB versions that omit their live mileage value.
const ratedMinutesRgbOff = 130 * 60;
const ratedMinutesRgbOn = 37 * 60;

export function withG502BatteryEstimate(
  battery: BatteryCapability | undefined,
  lightingEnabled: boolean | undefined,
): BatteryCapability | undefined {
  if (!battery || battery.estimatedMinutesRemaining !== undefined || battery.charging || battery.fullyCharged) {
    return battery;
  }
  // Unknown lighting uses the conservative RGB-on rating rather than
  // overstating runtime when capability discovery is partially unavailable.
  const ratedMinutes = lightingEnabled === false ? ratedMinutesRgbOff : ratedMinutesRgbOn;
  return {
    ...battery,
    estimatedMinutesRemaining: Math.round(ratedMinutes * battery.percentage / 100),
  };
}
