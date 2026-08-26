import type { ComponentPropsWithoutRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full border border-input bg-input transition-colors data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[14px] translate-x-[2px] rounded-full bg-[#9ca3ad] shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-primary" />
    </SwitchPrimitive.Root>
  );
}
