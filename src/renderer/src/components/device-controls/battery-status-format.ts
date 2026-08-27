import type { BatteryCapability } from '../../../../shared/contracts';

export function formatBatteryRuntime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) {
    const displayedMinutes = Math.max(1, safeMinutes);
    return `~${displayedMinutes}m remaining`;
  }
  const hours = Math.max(1, Math.round(safeMinutes / 60));
  return `~${hours}h remaining`;
}

export function batteryRuntimeLabel(battery: BatteryCapability, connected: boolean): string {
  if (!connected) return 'Estimate unavailable';
  if (battery.fullyCharged) return 'Fully charged';
  // The current contract reports discharge runtime, not time until full.
  if (battery.charging) return 'Estimate unavailable';
  return battery.estimatedMinutesRemaining === undefined
    ? 'Estimate unavailable'
    : formatBatteryRuntime(battery.estimatedMinutesRemaining);
}
