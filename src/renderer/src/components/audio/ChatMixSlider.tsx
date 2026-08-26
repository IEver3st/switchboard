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
    <section
      aria-labelledby="chatmix-heading"
      className={cn('grid grid-cols-[104px_minmax(0,1fr)_86px] items-center gap-4 border-b border-border px-3 py-2.5 max-[760px]:grid-cols-1', inactive && 'opacity-55')}
    >
      <div>
        <h3 id="chatmix-heading" className="m-0 text-[10px] font-semibold text-foreground">ChatMix</h3>
        <div className="mt-0.5 text-[8px] text-muted-foreground">Game / voice balance</div>
      </div>

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between text-[8px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1"><Gamepad2 className="size-3" aria-hidden="true" /> Game</span>
          <span className="text-foreground/75">50 / 50</span>
          <span className="flex items-center gap-1">Chat <MessageCircle className="size-3" aria-hidden="true" /></span>
        </div>
        <SliderPrimitive.Root
          min={-1}
          max={1}
          step={0.01}
          value={[current]}
          disabled={inactive}
          onValueChange={([next]) => typeof next === 'number' && setCurrent(snapCenter(next))}
          onValueCommit={([next]) => typeof next === 'number' && commit(next)}
          onDoubleClick={() => commit(0)}
          className="relative flex h-5 w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-[3px] w-full grow rounded-[2px] bg-input">
            <span className="absolute left-1/2 top-[-4px] h-[11px] w-px -translate-x-1/2 bg-foreground/55" aria-hidden="true" />
            <span className="absolute left-1/4 top-[-2px] h-[7px] w-px bg-input" aria-hidden="true" />
            <span className="absolute left-3/4 top-[-2px] h-[7px] w-px bg-input" aria-hidden="true" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="ChatMix game and chat balance"
            aria-valuetext={`${game} percent game, ${chat} percent chat`}
            className="block size-[12px] rounded-full border border-[#ff9ab0] bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          />
        </SliderPrimitive.Root>
        <div className="mt-0.5 grid grid-cols-5 text-[8px] tabular-nums text-muted-foreground/55" aria-hidden="true">
          <span>100 / 0</span><span className="text-center">75 / 25</span><span className="text-center">50 / 50</span><span className="text-center">25 / 75</span><span className="text-right">0 / 100</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <output className="w-12 text-right text-[11px] font-semibold tabular-nums text-foreground">{game} / {chat}</output>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
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
