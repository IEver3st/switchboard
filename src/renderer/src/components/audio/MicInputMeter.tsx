import { memo, useEffect, useRef } from 'react';
import type { AudioBusId } from '../../../../shared/contracts';
import { createMeterBallistics, levelToDb, METER_FLOOR_DB, subscribeToAudioMeter } from './meter-bus';

const SEGMENTS = 32;

/**
 * Segmented live level for one bus, fed by the shared meter bus. Updates go
 * straight to the DOM once per animation frame; nothing re-renders.
 */
export const MicInputMeter = memo(function MicInputMeter({
  busId,
  active,
  inactiveLabel,
  label,
}: {
  busId: AudioBusId;
  active: boolean;
  inactiveLabel: string;
  label: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const segments = [...root.querySelectorAll<HTMLElement>('.mic-meter__segment')];
    const levelBallistics = createMeterBallistics(24);
    const peakBallistics = createMeterBallistics(8, 1);
    let frame: number | null = null;
    let level = 0;
    let peak = 0;
    let clipping = false;
    let shownLit = -1;
    let shownPeak = -1;
    let readoutAt = 0;

    const segmentFor = (db: number) => Math.round(((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * SEGMENTS);
    const render = () => {
      frame = null;
      const now = performance.now();
      const smoothed = levelBallistics(levelToDb(active ? level : 0), now);
      const held = peakBallistics(levelToDb(active ? peak : 0), now);
      const lit = segmentFor(smoothed.db);
      // A held peak shows only above live signal; at silence it would read as a stuck segment.
      const peakIndex = lit > 0 ? Math.max(lit, segmentFor(held.db) - 1) : -1;
      if (lit !== shownLit || peakIndex !== shownPeak) {
        segments.forEach((segment, index) => {
          const nextLit = String(index < lit);
          const nextPeak = String(index === peakIndex && index >= lit);
          if (segment.dataset.lit !== nextLit) segment.dataset.lit = nextLit;
          if (segment.dataset.peak !== nextPeak) segment.dataset.peak = nextPeak;
        });
        shownLit = lit;
        shownPeak = peakIndex;
      }
      root.dataset.clipping = String(active && clipping);
      // Numbers that change every frame are unreadable; refresh the text a few times a second.
      if (now - readoutAt > 150 || !active) {
        readoutAt = now;
        const text = smoothed.db <= METER_FLOOR_DB ? '-∞ dB' : `${Math.round(smoothed.db)} dB`;
        if (readoutRef.current) readoutRef.current.textContent = active ? text : inactiveLabel;
        root.setAttribute('aria-valuenow', smoothed.db.toFixed(1));
        root.setAttribute('aria-valuetext', active ? text : inactiveLabel);
      }
      if (active && (smoothed.settling || held.settling)) frame ??= requestAnimationFrame(render);
    };

    const unsubscribe = subscribeToAudioMeter(busId, (value) => {
      level = value.level;
      peak = value.peak;
      clipping = value.clipping;
      frame ??= requestAnimationFrame(render);
    });
    render();
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [active, busId, inactiveLabel]);

  return (
    <div className="mic-meter">
      <div className="mic-meter__heading">
        <span>{label}</span>
        <output ref={readoutRef}>{inactiveLabel}</output>
      </div>
      <div
        ref={rootRef}
        className="mic-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={METER_FLOOR_DB}
        aria-valuemax={0}
        aria-valuenow={METER_FLOOR_DB}
        data-active={active}
      >
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            className="mic-meter__segment"
            data-zone={index >= SEGMENTS * 0.9 ? 'danger' : index >= SEGMENTS * 0.75 ? 'warning' : 'good'}
          />
        ))}
      </div>
    </div>
  );
});
