import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quantize(value: number, min: number, step: number): number {
  return Math.round((value - min) / step) * step + min;
}

function formatValue(value: number, precision: number): string {
  return value.toFixed(precision);
}

export const RotaryKnob = memo(function RotaryKnob({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  unit,
  precision = 0,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  precision?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [current, setCurrent] = useState(value);
  const currentRef = useRef(value);
  const dragRef = useRef<{ pointerId: number; startY: number; startValue: number } | null>(null);

  useEffect(() => {
    currentRef.current = value;
    setCurrent(value);
  }, [value]);

  const update = (next: number, commit = false) => {
    const normalized = clamp(quantize(next, min, step), min, max);
    currentRef.current = normalized;
    setCurrent(normalized);
    onChange?.(normalized);
    if (commit) onCommit(normalized);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startValue: current };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const fine = event.shiftKey ? 0.18 : 1;
    update(drag.startValue + ((drag.startY - event.clientY) / 120) * (max - min) * fine);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onCommit(currentRef.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const multiplier = event.shiftKey ? 0.2 : 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      update(current + step * multiplier, true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      update(current - step * multiplier, true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      update(min, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      update(max, true);
    }
  };

  const normalized = (current - min) / (max - min);
  const angle = -135 + normalized * 270;
  const arc = normalized * 84.82;

  return (
    <div className={cn('flex w-[72px] flex-col items-center', disabled && 'opacity-45')}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={`${formatValue(current, precision)} ${unit}`.trim()}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
        onDoubleClick={() => update(defaultValue, true)}
        onKeyDown={onKeyDown}
        className="relative grid size-[52px] touch-none select-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-[225deg]" aria-hidden="true">
          <circle cx="18" cy="18" r="13.5" fill="none" stroke="var(--input)" strokeWidth="2" strokeDasharray="84.82 100" strokeLinecap="round" />
          <circle cx="18" cy="18" r="13.5" fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray={`${arc} 100`} strokeLinecap="round" />
        </svg>
        <span className="relative size-8 rounded-full border border-input bg-secondary">
          <span
            className="absolute left-1/2 top-[4px] h-[9px] w-px origin-[50%_12px] bg-foreground"
            style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
          />
        </span>
      </div>
      <span className="mt-1 text-[10px] font-semibold tabular-nums text-foreground">
        {formatValue(current, precision)}<span className="ml-0.5 text-[8px] font-medium text-muted-foreground">{unit}</span>
      </span>
      <span className="mt-0.5 text-center text-[8px] leading-3 text-muted-foreground">{label}</span>
    </div>
  );
});
