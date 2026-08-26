import { memo, useEffect, useRef } from 'react';
import type { AudioMeterValue } from '../../../../shared/contracts';
import { subscribeToAudioMeter } from './meter-bus';

const HISTORY_LENGTH = 48;

export const LiveWaveform = memo(function LiveWaveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef(new Float32Array(HISTORY_LENGTH));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const styles = getComputedStyle(document.documentElement);
      const activeColor = styles.getPropertyValue('--primary').trim() || '#ff658a';
      const idleColor = styles.getPropertyValue('--input').trim() || '#2a3038';
      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (HISTORY_LENGTH - 1)) / HISTORY_LENGTH);
      const history = historyRef.current;

      for (let index = 0; index < HISTORY_LENGTH; index += 1) {
        const level = active ? (history[index] ?? 0) : 0.035;
        const barHeight = Math.max(2, level * (height - 4));
        context.fillStyle = active && level > 0.06 ? activeColor : idleColor;
        context.fillRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
      }
    };

    const onMeter = (value: AudioMeterValue) => {
      const history = historyRef.current;
      history.copyWithin(0, 1);
      history[history.length - 1] = active ? value.level : 0;
      const dbValue = value.level <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(value.level));
      const db = dbValue <= -60 ? 'silent' : `${Math.round(dbValue)} decibels`;
      canvas.setAttribute('aria-valuenow', dbValue.toFixed(1));
      canvas.setAttribute('aria-valuetext', db);
      draw();
    };

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    draw();
    const unsubscribe = subscribeToAudioMeter('mic', onMeter);
    return () => {
      resizeObserver.disconnect();
      unsubscribe();
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      role="meter"
      aria-label="Recent microphone input level"
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={-60}
      className="h-10 w-full"
    />
  );
});
