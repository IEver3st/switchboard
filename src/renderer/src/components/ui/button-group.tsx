import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function ButtonGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        'inline-flex items-stretch [&>*]:relative [&>*]:z-0 [&>*:focus-visible]:z-10 [&>*:not(:first-child)]:-ml-px',
        '[&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none',
        className,
      )}
      {...props}
    />
  );
}

export function ButtonGroupSeparator({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={cn('z-10 w-px self-stretch bg-border', className)} {...props} />;
}
