import { Battery, BatteryCharging, BatteryFull, BatteryLow, Zap } from 'lucide-react';
import type { BatteryCapability } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';

interface BatteryStatusProps {
  battery: BatteryCapability;
  connectionLabel?: string;
  variant?: 'compact' | 'header';
  connected?: boolean;
  className?: string;
}

export function BatteryStatus({
  battery,
  connectionLabel,
  variant = 'compact',
  connected = true,
  className,
}: BatteryStatusProps) {
  const roundedPercentage = Math.round(battery.percentage);
  const severity = roundedPercentage <= 5 ? 'critical' : roundedPercentage <= 15 ? 'low' : 'normal';
  const Icon = battery.charging
    ? BatteryCharging
    : battery.fullyCharged
      ? BatteryFull
      : severity === 'normal'
        ? Battery
        : BatteryLow;
  const stateLabel = battery.fullyCharged
    ? 'Fully charged'
    : battery.charging
      ? 'Charging'
      : severity === 'critical'
        ? 'Critical'
        : severity === 'low'
          ? 'Low battery'
          : connectionLabel;
  const accessible = battery.fullyCharged
    ? 'Fully charged'
    : `${stateLabel ? `${stateLabel}, ` : ''}${roundedPercentage} percent battery`;

  if (variant === 'header') {
    return (
      <div className={cn('battery-status battery-status--header', className)} data-severity={severity} aria-label={accessible}>
        <Icon aria-hidden className="battery-status__icon" />
        <div className="battery-status__header-copy">
          <div className="battery-status__value">
            {battery.fullyCharged ? 'Full' : `${roundedPercentage}%`}
            {battery.charging ? <Zap aria-hidden className="size-3.5" /> : null}
          </div>
          <div className="battery-status__detail">
            {!connected ? 'Disconnected' : stateLabel || 'Battery'}
            {connected && battery.estimatedMinutesRemaining !== undefined && !battery.charging && !battery.fullyCharged ? (
              <span>{formatRuntime(battery.estimatedMinutesRemaining)}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <span className={cn('battery-status battery-status--compact', className)} data-severity={severity} aria-label={accessible}>
      <Icon aria-hidden className="battery-status__icon" />
      <strong className="tabular-nums">{battery.fullyCharged ? 'Full' : `${roundedPercentage}%`}</strong>
      <span aria-hidden>·</span>
      <span>{!connected ? 'Disconnected' : stateLabel || 'Battery'}</span>
    </span>
  );
}

function formatRuntime(minutes: number): string {
  const hours = Math.max(1, Math.round(minutes / 60));
  return `~${hours} h remaining`;
}
