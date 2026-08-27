import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type WheelEvent } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';

const MAX_PERCENT = 150;
const UNITY_PERCENT = 100;

function gainToPercent(gain: number): number {
  return Math.round(Math.max(0, Math.min(1.5, gain)) * 100);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(MAX_PERCENT, Math.round(value)));
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
  const [percentage, setPercentage] = useState(() => gainToPercent(value));
  const [draft, setDraft] = useState(() => String(gainToPercent(value)));
  const [adjusting, setAdjusting] = useState(false);
  const cancelDraftRef = useRef(false);

  useEffect(() => {
    const next = gainToPercent(value);
    setPercentage(next);
    setDraft(String(next));
  }, [value]);

  const commitPercentage = useCallback((nextPercentage: number) => {
    const normalized = clampPercent(nextPercentage);
    setPercentage(normalized);
    setDraft(String(normalized));
    onCommit(normalized / 100);
  }, [onCommit]);

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = percentage + 1;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = percentage - 1;
    else if (event.key === 'PageUp') next = percentage + 10;
    else if (event.key === 'PageDown') next = percentage - 10;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MAX_PERCENT;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setAdjusting(true);
    commitPercentage(next);
  };

  const handleWheel = (event: WheelEvent<HTMLSpanElement>) => {
    if (disabled) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 5;
    commitPercentage(percentage + (event.deltaY < 0 ? step : -step));
  };

  const commitDraft = () => {
    if (cancelDraftRef.current) {
      cancelDraftRef.current = false;
      setDraft(String(percentage));
      return;
    }
    if (draft.trim() === '') {
      setDraft(String(percentage));
      return;
    }
    commitPercentage(Number(draft));
  };

  return (
    <div className={cn('mixer-fader', disabled && 'is-disabled')} style={{ '--channel-accent': accentColor } as CSSProperties}>
      <div className="mixer-fader__rail">
        <SliderPrimitive.Root
          orientation="vertical"
          min={0}
          max={MAX_PERCENT}
          step={1}
          value={[percentage]}
          disabled={disabled}
          onValueChange={([next]) => {
            if (typeof next !== 'number') return;
            const normalized = clampPercent(next);
            setAdjusting(true);
            setPercentage(normalized);
            setDraft(String(normalized));
          }}
          onValueCommit={([next]) => {
            setAdjusting(false);
            if (typeof next === 'number') commitPercentage(next);
          }}
          onDoubleClick={() => commitPercentage(UNITY_PERCENT)}
          onWheel={handleWheel}
          onKeyDownCapture={handleKeyDownCapture}
          onKeyUp={() => setAdjusting(false)}
          onBlur={() => setAdjusting(false)}
          className="mixer-fader__control"
        >
          <SliderPrimitive.Track className="mixer-fader__track">
            <span className="mixer-fader__unity" aria-hidden="true" />
            <SliderPrimitive.Range className="mixer-fader__range" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label={`${label} fader`}
            aria-valuetext={`${percentage} percent`}
            className="mixer-fader__thumb"
          >
            <output className={cn('mixer-fader__floating-value', adjusting && 'is-visible')} aria-live="polite">
              {percentage}%
            </output>
            <span className="mixer-fader__thumb-mark" aria-hidden="true" />
          </SliderPrimitive.Thumb>
        </SliderPrimitive.Root>
      </div>

      <label className="mixer-fader__exact">
        <span className="sr-only">Set {label} volume percentage</span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          aria-label={`${label} exact volume percentage`}
          onFocus={(event) => event.currentTarget.select()}
          onInput={(event) => {
            if (/^\d{0,3}$/.test(event.currentTarget.value)) setDraft(event.currentTarget.value);
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              cancelDraftRef.current = true;
              setDraft(String(percentage));
              event.currentTarget.blur();
            }
          }}
        />
        <span aria-hidden="true">%</span>
      </label>
    </div>
  );
});
