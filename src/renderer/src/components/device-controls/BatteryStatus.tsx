import { Zap } from 'lucide-react';
import type { BatteryCapability } from '../../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { batteryRuntimeLabel } from './battery-status-format';

interface BatteryStatusProps {
  battery?: BatteryCapability;
  connectionLabel?: string;
  variant?: 'compact' | 'header';
  connected?: boolean;
  loading?: boolean;
  className?: string;
}

export function BatteryStatus({
  battery,
  connectionLabel,
  variant = 'compact',
  connected = true,
  loading = false,
  className,
}: BatteryStatusProps) {
  if (loading) return <BatteryStatusSkeleton variant={variant} className={className} />;
  if (!battery) return null;

  const roundedPercentage = Math.round(battery.percentage);
  const severity = roundedPercentage <= 5 ? 'critical' : roundedPercentage <= 15 ? 'low' : 'normal';
  const isCharging = Boolean(battery.charging && !battery.fullyCharged);
  const state = !connected
    ? 'disconnected'
    : battery.fullyCharged
      ? 'full'
      : isCharging
        ? 'charging'
        : severity;
  const statusLabel = state === 'charging'
    ? 'Charging'
    : state === 'critical'
      ? 'Critical'
      : state === 'low'
        ? 'Low'
        : null;
  const runtimeLabel = batteryRuntimeLabel(battery, connected);
  const accessible = `${roundedPercentage} percent battery, ${runtimeLabel.toLocaleLowerCase()}${statusLabel ? `, ${statusLabel.toLocaleLowerCase()}` : ''}`;
  const tooltipState = state === 'full'
    ? 'Fully charged'
    : state === 'charging'
      ? 'Charging'
      : state === 'disconnected'
        ? 'Disconnected'
        : 'On battery';

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('battery-status battery-status--compact text-muted-foreground', className)}
            data-charging={isCharging || undefined}
            data-severity={severity}
            data-state={state}
            role="group"
            aria-label={accessible}
          >
            <BatteryLevelIcon percentage={battery.percentage} fullyCharged={battery.fullyCharged} charging={isCharging} />
            <strong className="battery-status__value tabular-nums">{roundedPercentage}%</strong>
            <span className="battery-status__separator" aria-hidden>·</span>
            <span className="battery-status__runtime text-muted-foreground">{runtimeLabel}</span>
          </div>
        </TooltipTrigger>
        <BatteryStatusTooltip
          percentage={roundedPercentage}
          state={tooltipState}
          runtime={runtimeLabel}
          updatedAt={battery.updatedAt}
          connectionLabel={connectionLabel}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn('battery-status', `battery-status--${variant}`, className)}
          data-charging={isCharging || undefined}
          data-severity={severity}
          data-state={state}
          role="group"
          tabIndex={variant === 'header' ? 0 : undefined}
          aria-label={accessible}
        >
          <BatteryLevelIcon percentage={battery.percentage} fullyCharged={battery.fullyCharged} charging={isCharging} />
          <div className="battery-status__copy">
            <div className="battery-status__topline">
              <strong className="battery-status__value tabular-nums">{roundedPercentage}%</strong>
              {statusLabel ? (
                <Badge variant={badgeVariant(state)} className="battery-status__badge">
                  {state === 'charging' ? <Zap aria-hidden className="size-2.5" /> : null}
                  {statusLabel}
                </Badge>
              ) : null}
            </div>
            <span className="battery-status__label">Battery</span>
            <span className="battery-status__runtime">{runtimeLabel}</span>
            <Progress
              value={roundedPercentage}
              aria-label={`${roundedPercentage} percent charge`}
              className="battery-status__progress"
              indicatorClassName="battery-status__progress-indicator"
            />
          </div>
        </div>
      </TooltipTrigger>
      <BatteryStatusTooltip
        percentage={roundedPercentage}
        state={tooltipState}
        runtime={runtimeLabel}
        updatedAt={battery.updatedAt}
        connectionLabel={connectionLabel}
        align="end"
      />
    </Tooltip>
  );
}

function BatteryStatusTooltip({
  percentage,
  state,
  runtime,
  updatedAt,
  connectionLabel,
  align = 'center',
}: {
  percentage: number;
  state: string;
  runtime: string;
  updatedAt: number;
  connectionLabel?: string;
  align?: 'center' | 'end';
}) {
  return (
    <TooltipContent side="bottom" align={align} className="battery-status__tooltip">
      <strong>{percentage}% · {state}</strong>
      <span>{runtime}</span>
      <span>Updated {formatUpdatedTime(updatedAt)}</span>
      {connectionLabel && connectionLabel !== 'Battery' ? <span>{connectionLabel}</span> : null}
    </TooltipContent>
  );
}

function BatteryLevelIcon({
  percentage,
  fullyCharged,
  charging,
}: {
  percentage: number;
  fullyCharged?: boolean;
  charging?: boolean;
}) {
  const normalizedPercentage = fullyCharged ? 100 : Math.min(100, Math.max(0, percentage));
  const fillWidth = 12.5 * normalizedPercentage / 100;

  return (
    <span className="battery-status__icon-wrap" aria-hidden>
      <svg className="battery-status__icon" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2.25" y="6.75" width="17.5" height="12.5" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M22.5 10.25v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {fillWidth > 0 ? (
          <rect
            className="battery-status__icon-fill"
            x="4.75"
            y="9.25"
            width={fillWidth}
            height="7.5"
            rx={Math.min(1, fillWidth / 2)}
          />
        ) : null}
      </svg>
      {charging ? <Zap className="battery-status__icon-bolt" /> : null}
    </span>
  );
}

function BatteryStatusSkeleton({ variant, className }: { variant: 'compact' | 'header'; className?: string }) {
  if (variant === 'compact') {
    return (
      <div className={cn('battery-status battery-status--compact battery-status--loading', className)} role="status" aria-label="Loading battery information">
        <Skeleton className="battery-status__icon-skeleton" />
        <Skeleton className="battery-status__summary-skeleton" />
      </div>
    );
  }

  return (
    <div className={cn('battery-status battery-status--loading', `battery-status--${variant}`, className)} role="status" aria-label="Loading battery information">
      <Skeleton className="battery-status__icon-skeleton" />
      <div className="battery-status__copy">
        <Skeleton className="battery-status__value-skeleton" />
        <Skeleton className="battery-status__label-skeleton" />
        <Skeleton className="battery-status__runtime-skeleton" />
        <Skeleton className="battery-status__progress-skeleton" />
      </div>
    </div>
  );
}

function badgeVariant(state: string): 'success' | 'warning' | 'destructive' {
  if (state === 'charging') return 'success';
  if (state === 'critical') return 'destructive';
  return 'warning';
}

function formatUpdatedTime(updatedAt: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(updatedAt);
}
