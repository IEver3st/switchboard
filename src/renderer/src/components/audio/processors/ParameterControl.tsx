import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';

export function ParameterControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  precision = 0,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  precision?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);
  const text = `${current.toFixed(precision)}${unit}`;

  return (
    <label className="audio-param parameter-control">
      <span>{label}</span>
      <Slider
        variant="fader"
        min={min}
        max={max}
        step={step}
        value={[current]}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${current.toFixed(precision)} ${unit}`.trim()}
        onValueChange={([next]) => typeof next === 'number' && setCurrent(next)}
        onValueCommit={([next]) => typeof next === 'number' && onCommit(next)}
      />
      <output>{text}</output>
    </label>
  );
}
