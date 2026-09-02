import { memo, useEffect, useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Gamepad2, MessageCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

function snapCenter(value: number): number {
  return Math.abs(value) <= 0.035 ? 0 : value;
}

export const ChatMixSlider = memo(function ChatMixSlider({
  value,
  disabled,
  pending,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  pending?: boolean;
  onCommit: (value: number) => void;
}) {
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);

  const game = Math.round(((1 - current) / 2) * 100);
  const chat = 100 - game;
  const inactive = disabled || pending;

  const commit = (next: number) => {
    const snapped = snapCenter(next);
    setCurrent(snapped);
    onCommit(snapped);
  };

  return (
    <section aria-labelledby="chatmix-heading" className={cn('audio-chatmix chatmix-control', inactive && 'is-disabled')}>
      <div className="audio-chatmix__label">
        <h3 id="chatmix-heading">ChatMix</h3>
      </div>

      <div className="audio-chatmix__slider chatmix-control__slider">
        <Gamepad2 className="size-4 shrink-0 text-[var(--channel-game)]" aria-hidden="true" />
        <SliderPrimitive.Root
          min={-1}
          max={1}
          step={0.01}
          value={[current]}
          disabled={inactive}
          onValueChange={([next]) => typeof next === 'number' && setCurrent(snapCenter(next))}
          onValueCommit={([next]) => typeof next === 'number' && commit(next)}
          onDoubleClick={() => commit(0)}
          className="relative flex h-8 w-full min-w-0 touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-1 w-full grow rounded-[2px] bg-input">
            <span className="absolute left-1/2 top-[-5px] h-[14px] w-px -translate-x-1/2 bg-foreground/70" aria-hidden="true" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="ChatMix game and chat balance"
            aria-valuetext={`${game} percent game, ${chat} percent chat`}
            className="block size-[18px] rounded-full border border-accent-hover bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          />
        </SliderPrimitive.Root>
        <MessageCircle className="size-4 shrink-0 text-[var(--channel-chat)]" aria-hidden="true" />
      </div>

      <div className="audio-chatmix__value">
        <output>Game {game} · Chat {chat}</output>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={inactive || current === 0}
              aria-label="Reset ChatMix to center"
              onClick={() => commit(0)}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Center ChatMix</TooltipContent>
        </Tooltip>
      </div>
    </section>
  );
});
