import { memo, useCallback, useEffect, useState, type CSSProperties, type KeyboardEvent, type WheelEvent } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';
import { DbReadout, formatDb } from './DbReadout';

const UNITY_POSITION = 75;
const MAX_DB = 20 * Math.log10(1.5);

function gainToDb(gain: number): number {
  return gain <= 0.001 ? -60 : Math.max(-60, Math.min(MAX_DB, 20 * Math.log10(gain)));
}

function dbToGain(db: number): number {
  return db <= -59.5 ? 0 : Math.min(1.5, 10 ** (db / 20));
}

function dbToPosition(db: number): number {
  if (db <= 0) return ((db + 60) / 60) * UNITY_POSITION;
  return UNITY_POSITION + (db / MAX_DB) * (100 - UNITY_POSITION);
}

function positionToDb(position: number): number {
  if (position <= UNITY_POSITION) return -60 + (position / UNITY_POSITION) * 60;
  return ((position - UNITY_POSITION) / (100 - UNITY_POSITION)) * MAX_DB;
}

function snapPosition(position: number): number {
  return Math.abs(position - UNITY_POSITION) <= 1.8 ? UNITY_POSITION : position;
}

export const MixerFader = memo(function MixerFader({
  value,
  disabled,
  label,
  accentColor,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  label: string;
  accentColor: string;
  onCommit: (gain: number) => void;
}) {
  const [position, setPosition] = useState(() => dbToPosition(gainToDb(value)));

  useEffect(() => setPosition(dbToPosition(gainToDb(value))), [value]);

  const commitPosition = useCallback((nextPosition: number, shouldSnap = true) => {
    const normalized = shouldSnap ? snapPosition(nextPosition) : nextPosition;
    setPosition(normalized);
    onCommit(dbToGain(positionToDb(normalized)));
  }, [onCommit]);

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = position + 0.25;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = position - 0.25;
    else if (event.key === 'PageUp') next = position + 2.5;
    else if (event.key === 'PageDown') next = position - 2.5;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    commitPosition(Math.max(0, Math.min(100, next)), false);
  };

  const handleWheel = (event: WheelEvent<HTMLSpanElement>) => {
    if (disabled) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.25 : 1;
    commitPosition(Math.max(0, Math.min(100, position + (event.deltaY < 0 ? step : -step))));
  };

  const db = positionToDb(position);

  return (
    <div className={cn('flex min-w-20 flex-col items-center gap-2', disabled && 'opacity-45')}>
      <div className="relative flex min-h-0 flex-1 items-stretch gap-2">
        <div className="relative h-full w-7 text-[10px] tabular-nums text-muted-foreground/70" aria-hidden="true">
          <span className="absolute -top-0.5 right-0">+3</span>
          <span className="absolute top-[24%] right-0 font-semibold text-foreground/70">0</span>
          <span className="absolute top-[39%] right-0">−12</span>
          <span className="absolute top-[59%] right-0">−24</span>
          <span className="absolute top-[89%] right-0">−48</span>
        </div>
        <SliderPrimitive.Root
          orientation="vertical"
          min={0}
          max={100}
          step={0.25}
          value={[position]}
          disabled={disabled}
          onValueChange={([next]) => typeof next === 'number' && setPosition(snapPosition(next))}
          onValueCommit={([next]) => typeof next === 'number' && commitPosition(next)}
          onDoubleClick={() => commitPosition(UNITY_POSITION)}
          onWheel={handleWheel}
          onKeyDownCapture={handleKeyDownCapture}
          className="relative flex h-full w-10 touch-none select-none flex-col items-center"
        >
          <SliderPrimitive.Track className="relative h-full w-1 grow rounded-[2px] bg-input">
            <span className="pointer-events-none absolute inset-x-[-8px] top-1/4 h-px bg-foreground/45" aria-hidden="true" />
            <SliderPrimitive.Range className="absolute w-full bg-[var(--channel-accent)]" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label={`${label} fader`}
            aria-valuetext={formatDb(db)}
            style={{ '--channel-accent': accentColor } as CSSProperties}
            className="block h-[10px] w-9 rounded-[2px] border border-[var(--channel-accent)] bg-[var(--channel-accent)] shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          />
        </SliderPrimitive.Root>
      </div>
      <DbReadout db={db} className="w-full text-center" />
    </div>
  );
});
