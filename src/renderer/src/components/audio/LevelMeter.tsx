import { memo, useEffect, useRef } from 'react';
import type { AudioBusId, AudioMeterValue } from '../../../../shared/contracts';
import { ClipIndicator } from './ClipIndicator';
import { subscribeToAudioMeter } from './meter-bus';

function levelToDb(level: number): number {
  return level <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(level));
}

export const LevelMeter = memo(function LevelMeter({
  busId,
  active,
  label,
  accentColor,
}: {
  busId: AudioBusId;
  active: boolean;
  label: string;
  accentColor: string;
}) {
  const meterRef = useRef<HTMLDivElement>(null);
  const goodRef = useRef<HTMLDivElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const dangerRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let heldPeak = 0;
    let heldAt = 0;
    let animationFrame: number | null = null;
    let latest: AudioMeterValue = { busId, level: 0, peak: 0, clipping: false };

    const render = () => {
      animationFrame = null;
      const value = latest;
      const normalized = active ? value.level : 0;
      const incomingPeak = active ? value.peak : 0;
      const now = performance.now();
      if (incomingPeak >= heldPeak) {
        heldPeak = incomingPeak;
        heldAt = now;
      } else if (now - heldAt > 1_100) {
        heldPeak = Math.max(incomingPeak, heldPeak - 0.035);
      }

      const amount = normalized * 100;
      if (goodRef.current) goodRef.current.style.height = `${Math.min(amount, 72)}%`;
      if (warningRef.current) warningRef.current.style.height = `${Math.min(Math.max(amount - 72, 0), 20)}%`;
      if (dangerRef.current) dangerRef.current.style.height = `${Math.min(Math.max(amount - 92, 0), 8)}%`;
      if (peakRef.current) peakRef.current.style.bottom = `${Math.min(100, heldPeak * 100)}%`;
      if (clipRef.current) clipRef.current.dataset.clipping = String(active && (value.clipping || heldPeak >= 0.985));

      const db = levelToDb(normalized);
      const text = db <= -60 ? '-∞' : `${Math.round(db)}`;
      if (readoutRef.current) readoutRef.current.textContent = `${text} dB`;
      meterRef.current?.setAttribute('aria-valuenow', db.toFixed(1));
      meterRef.current?.setAttribute('aria-valuetext', `${text} decibels`);
    };

    const onMeter = (value: AudioMeterValue) => {
      latest = value;
      if (animationFrame === null) animationFrame = requestAnimationFrame(render);
    };

    render();
    const unsubscribe = subscribeToAudioMeter(busId, onMeter);
    return () => {
      unsubscribe();
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, [active, busId]);

  return (
    <div className="flex min-w-14 flex-col items-center gap-2">
      <ClipIndicator ref={clipRef} label={`${label} clipping indicator`} />
      <div className="flex min-h-0 flex-1 items-stretch gap-1.5">
        <div
          ref={meterRef}
          role="meter"
          aria-label={`${label} input level`}
          aria-valuemin={-60}
          aria-valuemax={0}
          aria-valuenow={-60}
          className="relative h-full w-[10px] overflow-hidden rounded-[2px] bg-input"
        >
          <div ref={goodRef} className="absolute inset-x-0 bottom-0" style={{ backgroundColor: accentColor }} />
          <div ref={warningRef} className="absolute inset-x-0 bottom-[72%] bg-warning" />
          <div ref={dangerRef} className="absolute inset-x-0 bottom-[92%] bg-destructive" />
          <div ref={peakRef} className="absolute inset-x-[-1px] h-px bg-foreground" />
        </div>
        <div className="relative h-full w-6 text-[10px] tabular-nums text-muted-foreground/70" aria-hidden="true">
          <span className="absolute -top-0.5 left-0">0</span>
          <span className="absolute top-[10%] left-0">−6</span>
          <span className="absolute top-[22%] left-0">−12</span>
          <span className="absolute top-[42%] left-0">−24</span>
          <span className="absolute top-[78%] left-0">−48</span>
        </div>
      </div>
      <span ref={readoutRef} className="w-full text-center text-[10px] tabular-nums text-muted-foreground">−∞ dB</span>
    </div>
  );
});
