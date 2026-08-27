import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-8 w-full rounded-md border border-border bg-surface-interactive px-2.5 text-xs text-foreground transition-[border-color,background-color] duration-100',
        'placeholder:text-text-description hover:border-border-strong hover:bg-surface-hover focus-visible:border-border-strong focus-visible:bg-surface-hover focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
