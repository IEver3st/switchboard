import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[7px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-[#170a0f] hover:bg-[#ff7897]',
        secondary: 'border border-[var(--border)] bg-[var(--surface-2)] text-[#e8eaed] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]',
        ghost: 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-white',
        danger: 'border border-[#5d3035] bg-[#2b171a] text-[#ff9da4] hover:bg-[#351c20]',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        icon: 'size-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
