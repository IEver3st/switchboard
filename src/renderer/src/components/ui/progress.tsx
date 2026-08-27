import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value?: number | null;
  max?: number;
  indicatorClassName?: string;
}

export function Progress({ value = 0, max = 100, className, indicatorClassName, ...props }: ProgressProps) {
  const normalizedMax = Number.isFinite(max) && max > 0 ? max : 100;
  const normalizedValue = Math.min(normalizedMax, Math.max(0, value ?? 0));

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={normalizedMax}
      aria-valuenow={normalizedValue}
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-primary/15', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn('h-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none', indicatorClassName)}
        style={{ width: `${normalizedValue / normalizedMax * 100}%` }}
      />
    </div>
  );
}
