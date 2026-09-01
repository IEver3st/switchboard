import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function AspectRatio({ ratio = 1, className, style, ...props }: HTMLAttributes<HTMLDivElement> & { ratio?: number }) {
  return <div data-slot="aspect-ratio" className={cn('relative w-full', className)} style={{ aspectRatio: String(ratio), ...style } as CSSProperties} {...props} />;
}
