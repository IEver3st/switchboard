import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const ClipIndicator = forwardRef<HTMLSpanElement, { className?: string; label?: string }>(
  function ClipIndicator({ className, label = 'Clipping' }, ref) {
    return (
      <span
        ref={ref}
        className={cn('audio-clip', className)}
        data-clipping="false"
        role="img"
        aria-label={label}
      />
    );
  },
);
