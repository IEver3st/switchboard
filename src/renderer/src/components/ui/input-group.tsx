import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function InputGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        'group/input relative flex h-8 min-w-0 items-center rounded-md border border-input bg-surface-interactive transition-[border-color,background-color,box-shadow] duration-100',
        'hover:border-border-strong hover:bg-surface-hover focus-within:border-primary focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
      {...props}
    />
  );
}

export const InputGroupInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function InputGroupInput(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input-group-control"
      className={cn('h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 text-xs text-foreground outline-none placeholder:text-text-description disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
});

export function InputGroupAddon({ className, align = 'inline-start', ...props }: HTMLAttributes<HTMLDivElement> & { align?: 'inline-start' | 'inline-end' }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        'flex h-full shrink-0 items-center gap-1.5 px-2.5 text-text-description [&_svg]:size-3.5',
        align === 'inline-start' ? 'order-first pr-0' : 'order-last pl-0',
        className,
      )}
      {...props}
    />
  );
}

export function InputGroupButton({ className, asChild, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      data-slot="input-group-button"
      className={cn('grid size-6 place-items-center rounded-sm text-text-description transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-45', className)}
      {...props}
    />
  );
}
