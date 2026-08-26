import { useEffect, useState, type ReactNode } from 'react';
import type { MicProcessor, SetMicProcessorInput } from '../../../../shared/contracts';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/cn';
import { ParametricEq } from './ParametricEq';
import { RotaryKnob } from './RotaryKnob';

function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);

  return (
    <label className="grid grid-cols-[108px_minmax(0,1fr)_48px] items-center gap-3 text-[9px] text-muted-foreground">
      <span>{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[current]}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${current} ${unit}`}
        onValueChange={([next]) => typeof next === 'number' && setCurrent(next)}
        onValueCommit={([next]) => typeof next === 'number' && onCommit(next)}
      />
      <output className="text-right text-[9px] font-semibold tabular-nums text-foreground">{Math.round(current)}{unit}</output>
    </label>
  );
}

function KnobRow({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[92px] flex-wrap items-end gap-3">{children}</div>;
}

export function ProcessorEditor({
  processor,
  pending,
  onUpdate,
}: {
  processor: MicProcessor;
  pending: boolean;
  onUpdate: (input: SetMicProcessorInput) => void;
}) {
  const disabled = pending || !processor.enabled;

  return (
    <div className={cn('min-h-[126px] border-t border-border pt-3', !processor.enabled && 'opacity-65')}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-[11px] font-semibold text-foreground">{processor.label}</h3>
          <span className="text-[8px] text-muted-foreground">{processor.enabled ? 'Processing microphone input' : 'Bypassed — values are preserved'}</span>
        </div>
        <span className="text-[8px] tabular-nums text-muted-foreground">Shift-drag for fine adjustment · double-click resets</span>
      </div>

      {processor.id === 'gain' ? (
        <KnobRow>
          <RotaryKnob
            label="Gain"
            value={processor.parameters.gainDb}
            min={-20}
            max={30}
            step={0.5}
            defaultValue={0}
            unit="dB"
            precision={1}
            disabled={disabled}
            onCommit={(gainDb) => onUpdate({ processorId: 'gain', parameters: { gainDb } })}
          />
        </KnobRow>
      ) : null}

      {processor.id === 'noise-gate' ? (
        <KnobRow>
          <RotaryKnob label="Threshold" value={processor.parameters.thresholdDb} min={-80} max={-10} step={0.5} defaultValue={-48} unit="dB" precision={1} disabled={disabled} onCommit={(thresholdDb) => onUpdate({ processorId: 'noise-gate', parameters: { thresholdDb } })} />
          <RotaryKnob label="Attack" value={processor.parameters.attackMs} min={0.1} max={100} step={0.5} defaultValue={10} unit="ms" precision={1} disabled={disabled} onCommit={(attackMs) => onUpdate({ processorId: 'noise-gate', parameters: { attackMs } })} />
          <RotaryKnob label="Release" value={processor.parameters.releaseMs} min={10} max={1_000} step={5} defaultValue={180} unit="ms" disabled={disabled} onCommit={(releaseMs) => onUpdate({ processorId: 'noise-gate', parameters: { releaseMs } })} />
        </KnobRow>
      ) : null}

      {processor.id === 'noise-suppression' ? (
        <div className="max-w-xl py-4">
          <ParameterSlider label="Suppression amount" value={processor.parameters.amount} min={0} max={100} step={1} unit="%" disabled={disabled} onCommit={(amount) => onUpdate({ processorId: 'noise-suppression', parameters: { amount } })} />
        </div>
      ) : null}

      {processor.id === 'equalizer' ? (
        <ParametricEq
          bands={processor.parameters.bands}
          disabled={disabled}
          onCommit={(bands) => onUpdate({ processorId: 'equalizer', parameters: { bands } })}
        />
      ) : null}

      {processor.id === 'compressor' ? (
        <KnobRow>
          <RotaryKnob label="Threshold" value={processor.parameters.thresholdDb} min={-60} max={0} step={0.5} defaultValue={-18} unit="dB" precision={1} disabled={disabled} onCommit={(thresholdDb) => onUpdate({ processorId: 'compressor', parameters: { thresholdDb } })} />
          <RotaryKnob label="Ratio" value={processor.parameters.ratio} min={1} max={20} step={0.1} defaultValue={4} unit=":1" precision={1} disabled={disabled} onCommit={(ratio) => onUpdate({ processorId: 'compressor', parameters: { ratio } })} />
          <RotaryKnob label="Attack" value={processor.parameters.attackMs} min={0.1} max={200} step={0.5} defaultValue={12} unit="ms" precision={1} disabled={disabled} onCommit={(attackMs) => onUpdate({ processorId: 'compressor', parameters: { attackMs } })} />
          <RotaryKnob label="Release" value={processor.parameters.releaseMs} min={10} max={2_000} step={5} defaultValue={180} unit="ms" disabled={disabled} onCommit={(releaseMs) => onUpdate({ processorId: 'compressor', parameters: { releaseMs } })} />
          <RotaryKnob label="Makeup" value={processor.parameters.makeupDb} min={0} max={18} step={0.5} defaultValue={2} unit="dB" precision={1} disabled={disabled} onCommit={(makeupDb) => onUpdate({ processorId: 'compressor', parameters: { makeupDb } })} />
        </KnobRow>
      ) : null}

      {processor.id === 'limiter' ? (
        <KnobRow>
          <RotaryKnob label="Ceiling" value={processor.parameters.thresholdDb} min={-18} max={0} step={0.1} defaultValue={-1} unit="dB" precision={1} disabled={disabled} onCommit={(thresholdDb) => onUpdate({ processorId: 'limiter', parameters: { thresholdDb } })} />
          <RotaryKnob label="Release" value={processor.parameters.releaseMs} min={10} max={1_000} step={5} defaultValue={90} unit="ms" disabled={disabled} onCommit={(releaseMs) => onUpdate({ processorId: 'limiter', parameters: { releaseMs } })} />
        </KnobRow>
      ) : null}
    </div>
  );
}
