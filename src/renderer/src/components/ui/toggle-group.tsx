import type { ComponentPropsWithoutRef } from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/cn';

export function ToggleGroup({ className, ...props }: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn('inline-flex overflow-hidden rounded-md border border-border bg-muted', className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({ className, ...props }: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex h-9 min-w-16 items-center justify-center border-l border-border px-3 text-xs font-semibold tabular-nums text-muted-foreground outline-none transition-colors first:border-l-0',
        'hover:bg-accent hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/45',
        'data-[state=on]:bg-[color-mix(in_srgb,var(--control-accent)_12%,transparent)] data-[state=on]:text-[var(--control-accent)] disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
