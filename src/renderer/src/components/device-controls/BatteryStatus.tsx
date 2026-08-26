import { Zap } from 'lucide-react';
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
  const isCharging = Boolean(battery.charging && !battery.fullyCharged);
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
      <div
        className={cn('battery-status battery-status--header', className)}
        data-charging={isCharging || undefined}
        data-severity={severity}
        aria-label={accessible}
      >
        <BatteryLevelIcon percentage={battery.percentage} fullyCharged={battery.fullyCharged} />
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
    <span
      className={cn('battery-status battery-status--compact', className)}
      data-charging={isCharging || undefined}
      data-severity={severity}
      aria-label={accessible}
    >
      <BatteryLevelIcon percentage={battery.percentage} fullyCharged={battery.fullyCharged} />
      <strong className="tabular-nums">{battery.fullyCharged ? 'Full' : `${roundedPercentage}%`}</strong>
      <span aria-hidden>·</span>
      <span>{!connected ? 'Disconnected' : stateLabel || 'Battery'}</span>
    </span>
  );
}

function BatteryLevelIcon({ percentage, fullyCharged }: { percentage: number; fullyCharged?: boolean }) {
  const normalizedPercentage = fullyCharged ? 100 : Math.min(100, Math.max(0, percentage));
  const fillWidth = 12 * normalizedPercentage / 100;

  return (
    <svg
      aria-hidden
      className="battery-status__icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2.25" y="6.25" width="16" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21.75 10v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {fillWidth > 0 ? (
        <rect
          className="battery-status__icon-fill"
          x="4.25"
          y="8.25"
          width={fillWidth}
          height="7.5"
          rx={Math.min(0.75, fillWidth / 2)}
        />
      ) : null}
    </svg>
  );
}

function formatRuntime(minutes: number): string {
  const hours = Math.max(1, Math.round(minutes / 60));
  return `~${hours} h remaining`;
}
