import type { ComponentPropsWithoutRef } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';

type SliderProps = ComponentPropsWithoutRef<typeof SliderPrimitive.Root>;

export function Slider({ className, 'aria-label': ariaLabel, 'aria-valuetext': ariaValueText, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex touch-none select-none items-center',
        'data-[orientation=horizontal]:h-5 data-[orientation=horizontal]:w-full',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-5 data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          'relative grow overflow-hidden rounded-full bg-input',
          'data-[orientation=horizontal]:h-[3px] data-[orientation=horizontal]:w-full',
          'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-[3px]',
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            'absolute bg-primary',
            'data-[orientation=horizontal]:h-full',
            'data-[orientation=vertical]:w-full',
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
        className="block size-[13px] shrink-0 rounded-full border border-[#ff9ab0] bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </SliderPrimitive.Root>
  );
}
