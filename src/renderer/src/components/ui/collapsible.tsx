import type { ComponentPropsWithoutRef } from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { cn } from '@/lib/cn';

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export function CollapsibleContent({ className, ...props }: ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>) {
  return <CollapsiblePrimitive.Content className={cn('overflow-hidden', className)} {...props} />;
}
