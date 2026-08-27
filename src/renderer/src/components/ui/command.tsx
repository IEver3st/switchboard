import type { ComponentPropsWithoutRef } from 'react';
import { Search } from 'lucide-react';
import { Command as CommandPrimitive } from 'cmdk';
import { cn } from '@/lib/cn';

export function Command({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('ui-command flex w-full flex-col overflow-hidden', className)} {...props} />;
}

export function CommandInput({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Input>) {
  return (
    <div className="ui-command__input-wrap" cmdk-input-wrapper="">
      <Search aria-hidden className="size-3.5 shrink-0" />
      <CommandPrimitive.Input
        className={cn('ui-command__input h-9 w-full bg-transparent outline-none', className)}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('ui-command__list max-h-72 overflow-y-auto overflow-x-hidden', className)} {...props} />;
}

export function CommandEmpty({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className={cn('ui-command__empty py-6 text-center text-xs', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn('ui-command__group', className)} {...props} />;
}

export function CommandItem({ className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'ui-command__item relative flex min-h-8 cursor-default select-none items-center rounded-sm px-2 text-xs outline-none',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

