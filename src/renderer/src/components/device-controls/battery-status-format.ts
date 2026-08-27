import type { BatteryCapability } from '../../../../shared/contracts';

export function formatBatteryRuntime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) {
    const displayedMinutes = Math.max(1, safeMinutes);
    return `~${displayedMinutes} ${displayedMinutes === 1 ? 'minute' : 'minutes'} remaining`;
  }
  const hours = Math.max(1, Math.round(safeMinutes / 60));
  return `~${hours} ${hours === 1 ? 'hour' : 'hours'} remaining`;
}

export function batteryRuntimeLabel(battery: BatteryCapability, connected: boolean): string {
  if (!connected) return 'Remaining time unavailable';
  if (battery.fullyCharged) return 'Fully charged';
  if (battery.charging) return 'Estimating after charge';
  return battery.estimatedMinutesRemaining === undefined
    ? 'Estimate unavailable'
    : formatBatteryRuntime(battery.estimatedMinutesRemaining);
}
