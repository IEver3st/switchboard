import type { HTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Field({ className, orientation = 'vertical', ...props }: HTMLAttributes<HTMLDivElement> & { orientation?: 'vertical' | 'horizontal' }) {
  return <div data-slot="field" data-orientation={orientation} className={cn(orientation === 'horizontal' ? 'flex min-h-8 items-center justify-between gap-4' : 'grid gap-1.5', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[10.5px] font-medium text-text-secondary', className)} {...props} />;
}

export function FieldContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('m-0 text-[9.5px] leading-4 text-muted-foreground', className)} {...props} />;
}

export function FieldGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid divide-y divide-border', className)} {...props} />;
}
