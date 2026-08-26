import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const ClipIndicator = forwardRef<HTMLSpanElement, { className?: string; label?: string }>(
  function ClipIndicator({ className, label = 'Clipping' }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex h-3 min-w-6 items-center justify-center rounded-[2px] border border-border px-1 text-[7px] font-bold tracking-[0.04em] text-muted-foreground/55',
          'data-[clipping=true]:border-destructive/70 data-[clipping=true]:bg-destructive data-[clipping=true]:text-destructive-foreground',
          className,
        )}
        data-clipping="false"
        aria-label={label}
      >
        CLIP
      </span>
    );
  },
);
