import { memo, useEffect, useRef } from 'react';
import type { AudioBusId, AudioMeterValue } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';

function levelToDb(level: number): number {
  return level <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(level));
}

export const HorizontalLevelMeter = memo(function HorizontalLevelMeter({
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
  const meterRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    let frame: number | null = null;
    let heldPeak = 0;
    let heldAt = 0;
    let latest: AudioMeterValue = { busId, level: 0, peak: 0, clipping: false };

    const render = () => {
      frame = null;
      const now = performance.now();
      const level = active ? latest.level : 0;
      const incomingPeak = active ? latest.peak : 0;
      if (incomingPeak >= heldPeak) {
        heldPeak = incomingPeak;
        heldAt = now;
      } else if (now - heldAt > 1_100) {
        heldPeak = Math.max(incomingPeak, heldPeak - 0.035);
      }
      if (fillRef.current) fillRef.current.style.width = `${Math.min(100, Math.max(0, level * 100))}%`;
      if (peakRef.current) peakRef.current.style.left = `${Math.min(100, Math.max(0, heldPeak * 100))}%`;
      const db = levelToDb(level);
      const text = db <= -60 ? '−∞ dB' : `${Math.round(db)} dB`;
      if (readoutRef.current) readoutRef.current.textContent = active ? text : inactiveLabel;
      meterRef.current?.setAttribute('aria-valuenow', db.toFixed(1));
      meterRef.current?.setAttribute('aria-valuetext', active ? text : inactiveLabel);
    };

    const onMeter = (value: AudioMeterValue) => {
      latest = value;
      if (frame === null) frame = requestAnimationFrame(render);
    };

    render();
    const unsubscribe = active
      ? switchboardApi.subscribeAudioMeters((frame) => {
          const value = frame.values.find((candidate) => candidate.busId === busId);
          if (value) onMeter(value);
        })
      : () => undefined;
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [active, busId, inactiveLabel]);

  return (
    <div className="horizontal-meter">
      <div className="horizontal-meter__heading">
        <span>{label}</span>
        <output ref={readoutRef}>{inactiveLabel}</output>
      </div>
      <div ref={meterRef} className="horizontal-meter__track" role="meter" aria-label={label} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={-60}>
        <div ref={fillRef} className="horizontal-meter__fill" />
        <div ref={peakRef} className="horizontal-meter__peak" />
      </div>
    </div>
  );
});
