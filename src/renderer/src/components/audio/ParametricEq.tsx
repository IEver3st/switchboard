import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Power, RotateCcw } from 'lucide-react';
import type { EqBand, EqFilterType } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { equalizerResponseDb } from '@/lib/eq-response';

const WIDTH = 960;
const HEIGHT = 320;
const PLOT_LEFT = 48;
const PLOT_RIGHT = 18;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 32;
const PLOT_WIDTH = WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const FREQUENCY_TICKS = [20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000];
const GAIN_TICKS = [-12, -6, 0, 6, 12];
const FILTER_LABELS: Record<EqFilterType, string> = {
  'low-shelf': 'Low shelf',
  bell: 'Bell',
  'high-shelf': 'High shelf',
};
const NODE_COLORS = [
  'var(--eq-band-1)',
  'var(--eq-band-2)',
  'var(--eq-band-3)',
  'var(--eq-band-4)',
  'var(--eq-band-5)',
  'var(--eq-band-6)',
  'var(--eq-band-7)',
  'var(--eq-band-8)',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function frequencyToX(frequency: number): number {
  return PLOT_LEFT + (Math.log10(frequency / 20) / 3) * PLOT_WIDTH;
}

function xToFrequency(x: number): number {
  return clamp(20 * 10 ** (((x - PLOT_LEFT) / PLOT_WIDTH) * 3), 20, 20_000);
}

function gainToY(gain: number): number {
  return PLOT_TOP + ((12 - gain) / 24) * PLOT_HEIGHT;
}

function yToGain(y: number): number {
  return clamp(12 - ((y - PLOT_TOP) / PLOT_HEIGHT) * 24, -12, 12);
}

function curvePath(bands: EqBand[]): string {
  return Array.from({ length: 240 }, (_, index) => {
    const frequency = 20 * 10 ** ((index / 239) * 3);
    return `${index === 0 ? 'M' : 'L'} ${frequencyToX(frequency).toFixed(2)} ${gainToY(equalizerResponseDb(frequency, bands)).toFixed(2)}`;
  }).join(' ');
}

function frequencyLabel(value: number): string {
  return value >= 1_000 ? `${value / 1_000}k` : String(value);
}

export function ParametricEq({ bands, disabled, onCommit }: { bands: EqBand[]; disabled?: boolean; onCommit: (bands: EqBand[]) => void }) {
  const [draft, setDraft] = useState(bands);
  const [selectedId, setSelectedId] = useState(bands[0]?.id ?? '');
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => setDraft(bands), [bands]);
  useEffect(() => {
    if (!draft.some((band) => band.id === selectedId)) setSelectedId(draft[0]?.id ?? '');
  }, [draft, selectedId]);

  const selected = draft.find((band) => band.id === selectedId) ?? draft[0];
  const path = useMemo(() => curvePath(draft), [draft]);

  const updateBand = (id: string, update: Partial<EqBand>, commit = false) => {
    const next = draft.map((band) => band.id === id ? { ...band, ...update } : band);
    setDraft(next);
    if (commit) onCommit(next);
  };

  const updateBandFromPointer = (id: string, event: PointerEvent<SVGCircleElement>, commit: boolean) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    updateBand(id, {
      frequency: Math.round(xToFrequency(x)),
      gainDb: Math.round(yToGain(y) * 10) / 10,
    }, commit);
  };

  const handleNodeKeyDown = (band: EqBand, event: KeyboardEvent<SVGCircleElement>) => {
    const frequencyStep = event.shiftKey ? 1.015 : 1.06;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const frequency = event.key === 'ArrowRight' ? band.frequency * frequencyStep : band.frequency / frequencyStep;
      updateBand(band.id, { frequency: Math.round(clamp(frequency, 20, 20_000)) }, true);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = event.shiftKey ? 0.1 : 0.5;
      updateBand(band.id, { gainDb: clamp(band.gainDb + (event.key === 'ArrowUp' ? step : -step), -12, 12) }, true);
    }
  };

  if (!selected) return null;

  return (
    <div className={cn('parametric-eq', disabled && 'is-disabled')}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="parametric-eq__graph"
        aria-label="Equalizer response. Drag a band to change frequency and gain."
      >
        {FREQUENCY_TICKS.map((frequency) => {
          const x = frequencyToX(frequency);
          return (
            <g key={frequency}>
              <line x1={x} x2={x} y1={PLOT_TOP} y2={HEIGHT - PLOT_BOTTOM} stroke="var(--border)" strokeWidth="1" />
              <text x={x} y={HEIGHT - 7} fill="var(--muted-foreground)" opacity="0.78" fontSize="9" textAnchor="middle">{frequencyLabel(frequency)}</text>
            </g>
          );
        })}
        {GAIN_TICKS.map((gain) => {
          const y = gainToY(gain);
          return (
            <g key={gain}>
              <line x1={PLOT_LEFT} x2={WIDTH - PLOT_RIGHT} y1={y} y2={y} stroke={gain === 0 ? 'var(--input)' : 'var(--border)'} strokeWidth={gain === 0 ? 1.5 : 1} />
              <text x={PLOT_LEFT - 8} y={y + 3} fill="var(--muted-foreground)" opacity="0.82" fontSize="9" textAnchor="end">{gain > 0 ? '+' : ''}{gain}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="var(--channel-accent, var(--primary))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {draft.map((band, index) => (
          <circle
            key={band.id}
            cx={frequencyToX(band.frequency)}
            cy={gainToY(band.gainDb)}
            r={band.id === selected.id ? 10 : 8}
            fill={band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : 'var(--input)'}
            stroke={band.id === selected.id ? 'var(--foreground)' : 'var(--background)'}
            strokeWidth={band.id === selected.id ? 2.5 : 2}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`EQ band ${index + 1}`}
            aria-valuemin={-12}
            aria-valuemax={12}
            aria-valuenow={band.gainDb}
            aria-valuetext={`${Math.round(band.frequency)} hertz, ${band.gainDb > 0 ? '+' : ''}${band.gainDb} decibels, width ${band.q}`}
            onFocus={() => setSelectedId(band.id)}
            onPointerDown={(event) => {
              if (disabled) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragIdRef.current = band.id;
              setSelectedId(band.id);
            }}
            onPointerMove={(event) => {
              if (dragIdRef.current === band.id) updateBandFromPointer(band.id, event, false);
            }}
            onPointerUp={(event) => {
              if (dragIdRef.current !== band.id) return;
              dragIdRef.current = null;
              updateBandFromPointer(band.id, event, true);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onDoubleClick={() => updateBand(band.id, { gainDb: 0 }, true)}
            onKeyDown={(event) => handleNodeKeyDown(band, event)}
            className="parametric-eq__node"
          />
        ))}
      </svg>

      <div className="parametric-eq__bands" role="list" aria-label="Equalizer bands">
        {draft.map((band, index) => (
          <button
            key={band.id}
            type="button"
            aria-pressed={band.id === selected.id}
            onClick={() => setSelectedId(band.id)}
            className={cn('parametric-eq__band', band.id === selected.id && 'is-selected')}
          >
            <span style={band.enabled ? { backgroundColor: NODE_COLORS[index % NODE_COLORS.length] } : undefined} aria-hidden="true" />
            Band {index + 1}
          </button>
        ))}
      </div>

      <div className="parametric-eq__inspector">
        <div className="parametric-eq__inspector-heading">
          <strong>Band {draft.indexOf(selected) + 1}</strong>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(selected.enabled && 'text-[var(--channel-accent,var(--primary))]')}
            aria-pressed={selected.enabled}
            disabled={disabled}
            onClick={() => updateBand(selected.id, { enabled: !selected.enabled }, true)}
          >
            <Power className="size-3.5" /> {selected.enabled ? 'On' : 'Off'}
          </Button>
        </div>

        <label className="eq-value-field">
          <span>Filter</span>
          <Select value={selected.type} onValueChange={(type) => updateBand(selected.id, { type: type as EqFilterType }, true)} disabled={disabled}>
            <SelectTrigger aria-label="EQ filter type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FILTER_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        <EqValueField label="Frequency" value={Math.round(selected.frequency)} min={20} max={20_000} step={1} unit="Hz" disabled={disabled} onChange={(frequency) => updateBand(selected.id, { frequency })} onCommit={() => onCommit(draft)} />
        <EqValueField label="Gain" value={selected.gainDb} min={-12} max={12} step={0.1} unit="dB" disabled={disabled} onChange={(gainDb) => updateBand(selected.id, { gainDb })} onCommit={() => onCommit(draft)} />
        <EqValueField label="Width" value={selected.q} min={0.2} max={10} step={0.1} unit="" disabled={disabled} onChange={(q) => updateBand(selected.id, { q })} onCommit={() => onCommit(draft)} />

        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => updateBand(selected.id, { enabled: true, gainDb: 0, q: 1 }, true)}>
          <RotateCcw className="size-3.5" /> Reset band
        </Button>
      </div>
    </div>
  );
}

function EqValueField({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="eq-value-field">
      <span>{label}</span>
      <span className="eq-value-field__input">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={`EQ band ${label.toLowerCase()}`}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCommit();
              event.currentTarget.blur();
            }
          }}
        />
        {unit ? <span>{unit}</span> : null}
      </span>
    </label>
  );
}
