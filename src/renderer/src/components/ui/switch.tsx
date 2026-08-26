import type { ComponentPropsWithoutRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface-interactive transition-colors data-[state=checked]:border-[var(--control-accent)] data-[state=checked]:bg-[color-mix(in_srgb,var(--control-accent)_25%,transparent)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-text-secondary transition-transform data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-[var(--control-accent)]" />
    </SwitchPrimitive.Root>
  );
}
