import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('inline-flex min-w-5 items-center justify-center rounded-[3px] border border-border-strong bg-surface-2 px-1.5 py-0.5 font-sans text-[9px] font-semibold leading-4 text-text-secondary shadow-[0_1px_0_rgb(0_0_0_/_30%)]', className)} {...props} />;
}
