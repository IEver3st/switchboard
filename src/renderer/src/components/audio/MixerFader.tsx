import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject, type WheelEvent } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import type { AudioBusId, AudioMeterValue } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';
import { createMeterBallistics, levelToDb, METER_FLOOR_DB, subscribeToAudioMeter } from './meter-bus';

const MAX_PERCENT = 150;
const UNITY_PERCENT = 100;
const SCALE_TICKS = [0, 25, 50, 75, 100, 125, 150];

function gainToPercent(gain: number): number {
  return Math.round(Math.max(0, Math.min(1.5, gain)) * 100);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(MAX_PERCENT, Math.round(value)));
}

/**
 * Drives the fader's lit range from the meter bus without React renders. The
 * brightest listed bus wins, so the master fader follows the loudest channel.
 */
function useFaderSignal(ref: RefObject<HTMLDivElement | null>, busIds: readonly AudioBusId[], active: boolean, label: string) {
  const busKey = busIds.join(',');
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const readout = element.querySelector<HTMLElement>('[data-fader-readout]');
    const values = new Map<AudioBusId, AudioMeterValue>();
    const levelBallistics = createMeterBallistics(24);
    const peakBallistics = createMeterBallistics(8, 1);
    let frame: number | null = null;
    let readoutAt = 0;
    const toMeter = (db: number) => (db - METER_FLOOR_DB) / -METER_FLOOR_DB;

    const render = () => {
      frame = null;
      let level = 0;
      let peak = 0;
      let clipping = false;
      if (active) {
        for (const value of values.values()) {
          level = Math.max(level, value.level);
          peak = Math.max(peak, value.peak);
          clipping ||= value.clipping;
        }
      }
      const now = performance.now();
      const smoothed = levelBallistics(levelToDb(level), now);
      const held = peakBallistics(levelToDb(peak), now);
      const meter = toMeter(smoothed.db);
      element.style.setProperty('--signal', meter.toFixed(3));
      element.style.setProperty('--signal-peak', toMeter(Math.max(held.db, smoothed.db)).toFixed(3));
      element.dataset.clipping = String(active && clipping);
      element.dataset.live = String(meter > 0);
      if (readout && (now - readoutAt > 150 || !active)) {
        readoutAt = now;
        const text = smoothed.db <= METER_FLOOR_DB ? '-∞' : `${Math.round(smoothed.db)}`;
        readout.textContent = `${text} dB`;
        readout.setAttribute('aria-valuenow', smoothed.db.toFixed(1));
        readout.setAttribute('aria-valuetext', `${label} level ${text} decibels`);
      }
      if (active && (smoothed.settling || held.settling)) frame ??= requestAnimationFrame(render);
    };

    const unsubscribers = busIds.map((busId) => subscribeToAudioMeter(busId, (value) => {
      values.set(busId, value);
      frame ??= requestAnimationFrame(render);
    }));
    render();
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // busKey stands in for busIds so a new array identity does not resubscribe.
  }, [ref, busKey, active, label]);
}

export const MixerFader = memo(function MixerFader({
  value,
  disabled,
  label,
  accentColor,
  meterBusIds,
  meterActive = false,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  label: string;
  accentColor: string;
  /** Buses whose live level lights this fader. Omit for a plain fader. */
  meterBusIds?: readonly AudioBusId[];
  meterActive?: boolean;
  onCommit: (gain: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useFaderSignal(rootRef, meterBusIds ?? [], meterActive && Boolean(meterBusIds?.length), label);
  const [percentage, setPercentage] = useState(() => gainToPercent(value));
  const [draft, setDraft] = useState(() => String(gainToPercent(value)));
  const [adjusting, setAdjusting] = useState(false);
  const cancelDraftRef = useRef(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (draggingRef.current) return;
    const next = gainToPercent(value);
    setPercentage(next);
    setDraft(String(next));
  }, [value, disabled]);

  const commitPercentage = useCallback((nextPercentage: number) => {
    if (disabled || !Number.isFinite(nextPercentage)) return;
    const normalized = clampPercent(nextPercentage);
    setPercentage(normalized);
    setDraft(String(normalized));
    onCommit(normalized / 100);
  }, [onCommit, disabled]);

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
    <div
      ref={rootRef}
      className={cn('mixer-fader', disabled && 'is-disabled', meterBusIds?.length && 'mixer-fader--signal')}
      style={{ '--channel-accent': accentColor, '--fill': percentage / MAX_PERCENT } as CSSProperties}
    >
      <div className="mixer-fader__rail">
        <span className="mixer-fader__scale" aria-hidden="true">
          {SCALE_TICKS.map((tick) => (
            <span
              key={tick}
              className={cn('mixer-fader__tick', tick === UNITY_PERCENT && 'is-unity')}
              style={{ bottom: `${(tick / MAX_PERCENT) * 100}%` }}
            />
          ))}
        </span>
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
            draggingRef.current = true;
            setAdjusting(true);
            setPercentage(normalized);
            setDraft(String(normalized));
          }}
          onValueCommit={([next]) => {
            draggingRef.current = false;
            setAdjusting(false);
            if (typeof next === 'number') commitPercentage(next);
          }}
          onDoubleClick={() => commitPercentage(UNITY_PERCENT)}
          onWheel={handleWheel}
          onKeyDownCapture={handleKeyDownCapture}
          onKeyUp={() => setAdjusting(false)}
          onBlur={() => { draggingRef.current = false; setAdjusting(false); }}
          className="mixer-fader__control"
        >
          <SliderPrimitive.Track className="mixer-fader__track">
            <span className="mixer-fader__unity" aria-hidden="true" />
            <SliderPrimitive.Range className="mixer-fader__range" />
            {meterBusIds?.length ? (
              <span className="mixer-fader__signal" aria-hidden="true">
                <span className="mixer-fader__signal-fill" />
                <span className="mixer-fader__signal-peak" />
              </span>
            ) : null}
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
            <span className="mixer-fader__thumb-mark" aria-hidden="true" />
          </SliderPrimitive.Thumb>
        </SliderPrimitive.Root>
      </div>

      <div className="mixer-fader__footer">
      {meterBusIds?.length ? (
        <span
          data-fader-readout
          role="meter"
          aria-label={`${label} level`}
          aria-valuemin={METER_FLOOR_DB}
          aria-valuemax={0}
          aria-valuenow={METER_FLOOR_DB}
          className="mixer-fader__readout"
        >-∞ dB</span>
      ) : null}
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
    </div>
  );
});
