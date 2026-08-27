import type { ComponentPropsWithoutRef } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';

type SliderProps = ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  thumbLabels?: string[];
  thumbValueText?: string[];
  variant?: 'default' | 'fader';
};

export function Slider({ className, 'aria-label': ariaLabel, 'aria-valuetext': ariaValueText, thumbLabels, thumbValueText, variant = 'default', ...props }: SliderProps) {
  const thumbCount = props.value?.length ?? props.defaultValue?.length ?? 1;
  return (
    <SliderPrimitive.Root
      className={cn(
        'ui-slider relative flex touch-none select-none items-center',
        'data-[orientation=horizontal]:h-6 data-[orientation=horizontal]:w-full',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-5 data-[orientation=vertical]:flex-col',
        'data-[disabled]:opacity-40',
        variant === 'fader' && 'ui-slider--fader',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          'ui-slider__track relative grow overflow-hidden rounded-full bg-input',
          'data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full',
          'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1',
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            'ui-slider__range absolute bg-[var(--control-accent)]',
            'data-[orientation=horizontal]:h-full',
            'data-[orientation=vertical]:w-full',
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          aria-label={thumbLabels?.[index] ?? ariaLabel}
          aria-valuetext={thumbValueText?.[index] ?? ariaValueText}
          className="ui-slider__thumb block size-4 shrink-0 rounded-full border border-[var(--control-accent)] bg-[var(--control-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
