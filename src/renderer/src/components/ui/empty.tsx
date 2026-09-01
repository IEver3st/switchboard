import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Empty({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="empty" className={cn('grid min-h-64 place-items-center py-12 text-center', className)} {...props} />;
}

export function EmptyHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto grid max-w-sm justify-items-center gap-1.5', className)} {...props} />;
}

export function EmptyMedia({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-1 grid size-8 place-items-center text-muted-foreground [&_svg]:size-6', className)} {...props} />;
}

export function EmptyTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('m-0 text-[14px] font-semibold tracking-[-0.01em] text-foreground', className)} {...props} />;
}

export function EmptyDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('m-0 max-w-[38ch] text-[11px] leading-[18px] text-muted-foreground', className)} {...props} />;
}

export function EmptyContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-2 flex items-center justify-center gap-2', className)} {...props} />;
}
