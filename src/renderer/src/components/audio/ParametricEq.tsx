import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import type { EqBand, EqFilterType } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { equalizerResponseDb } from '@/lib/eq-response';

interface EqGeometry {
  width: number;
  height: number;
}

const FALLBACK_GEOMETRY: EqGeometry = { width: 960, height: 344 };
const PLOT_LEFT = 48;
const PLOT_RIGHT = 18;
const PLOT_TOP = 46;
const PLOT_BOTTOM = 34;
const REGION_STRIP_BOTTOM = 34;
const FREQUENCY_TICKS = [20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000];
const GAIN_TICKS = [-12, -6, 0, 6, 12];
const FREQUENCY_REGIONS = [
  { label: 'Sub bass', from: 20, to: 60 },
  { label: 'Bass', from: 60, to: 250 },
  { label: 'Low mids', from: 250, to: 500 },
  { label: 'Mid range', from: 500, to: 2_000 },
  { label: 'Upper mids', from: 2_000, to: 6_000 },
  { label: 'Highs', from: 6_000, to: 20_000 },
];
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

function plotWidth(geometry: EqGeometry): number {
  return geometry.width - PLOT_LEFT - PLOT_RIGHT;
}

function plotHeight(geometry: EqGeometry): number {
  return geometry.height - PLOT_TOP - PLOT_BOTTOM;
}

function frequencyToX(frequency: number, geometry: EqGeometry): number {
  return PLOT_LEFT + (Math.log10(frequency / 20) / 3) * plotWidth(geometry);
}

function xToFrequency(x: number, geometry: EqGeometry): number {
  return clamp(20 * 10 ** (((x - PLOT_LEFT) / plotWidth(geometry)) * 3), 20, 20_000);
}

function gainToY(gain: number, geometry: EqGeometry): number {
  return PLOT_TOP + ((12 - gain) / 24) * plotHeight(geometry);
}

function yToGain(y: number, geometry: EqGeometry): number {
  return clamp(12 - ((y - PLOT_TOP) / plotHeight(geometry)) * 24, -12, 12);
}

function curvePath(bands: EqBand[], geometry: EqGeometry): string {
  return Array.from({ length: 240 }, (_, index) => {
    const frequency = 20 * 10 ** ((index / 239) * 3);
    return `${index === 0 ? 'M' : 'L'} ${frequencyToX(frequency, geometry).toFixed(2)} ${gainToY(equalizerResponseDb(frequency, bands), geometry).toFixed(2)}`;
  }).join(' ');
}

function frequencyLabel(value: number): string {
  return value >= 1_000 ? `${value / 1_000} kHz` : `${value} Hz`;
}

function frequencyReadout(frequency: number): string {
  if (frequency >= 1_000) {
    const kHz = frequency / 1_000;
    return `${Number.isInteger(kHz) ? kHz : kHz.toFixed(1)} kHz`;
  }
  return `${frequency} Hz`;
}

export function ParametricEq({ bands, disabled, onCommit }: { bands: EqBand[]; disabled?: boolean; onCommit: (bands: EqBand[]) => void }) {
  const [draft, setDraft] = useState(bands);
  const [selectedId, setSelectedId] = useState(bands[0]?.id ?? '');
  const [geometry, setGeometry] = useState<EqGeometry>(FALLBACK_GEOMETRY);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => setDraft(bands), [bands]);
  useEffect(() => {
    if (!draft.some((band) => band.id === selectedId)) setSelectedId(draft[0]?.id ?? '');
  }, [draft, selectedId]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setGeometry({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const selected = draft.find((band) => band.id === selectedId) ?? draft[0];
  const path = useMemo(() => curvePath(draft, geometry), [draft, geometry]);

  const updateBand = (id: string, update: Partial<EqBand>, commit = false) => {
    const next = draft.map((band) => band.id === id ? { ...band, ...update } : band);
    setDraft(next);
    if (commit) onCommit(next);
  };

  const updateBandFromPointer = (id: string, event: PointerEvent<SVGCircleElement>, commit: boolean) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * geometry.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * geometry.height;
    updateBand(id, {
      frequency: Math.round(xToFrequency(x, geometry)),
      gainDb: Math.round(yToGain(y, geometry) * 10) / 10,
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
      <div ref={stageRef} className="parametric-eq__stage">
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="parametric-eq__graph"
          aria-label="Equalizer response. Drag a band to change frequency and gain."
        >
          {FREQUENCY_TICKS.map((frequency) => {
            const x = frequencyToX(frequency, geometry);
            return (
              <g key={frequency}>
                <line x1={x} x2={x} y1={PLOT_TOP} y2={geometry.height - PLOT_BOTTOM} stroke="color-mix(in srgb, var(--border) 62%, transparent)" strokeWidth="1" />
                <text x={x} y={geometry.height - 8} fill="var(--muted-foreground)" opacity="0.78" fontSize="9" textAnchor="middle">{frequencyLabel(frequency)}</text>
              </g>
            );
          })}
          {GAIN_TICKS.map((gain) => {
            const y = gainToY(gain, geometry);
            return (
              <g key={gain}>
                <line
                  x1={PLOT_LEFT}
                  x2={geometry.width - PLOT_RIGHT}
                  y1={y}
                  y2={y}
                  stroke={gain === 0 ? 'var(--input)' : 'color-mix(in srgb, var(--border) 62%, transparent)'}
                  strokeWidth={gain === 0 ? 1.5 : 1}
                />
                <text x={PLOT_LEFT - 8} y={y + 3} fill="var(--muted-foreground)" opacity="0.82" fontSize="9" textAnchor="end">{gain > 0 ? '+' : ''}{gain} dB</text>
              </g>
            );
          })}
          {FREQUENCY_REGIONS.map((region) => {
            const from = frequencyToX(region.from, geometry);
            const to = frequencyToX(region.to, geometry);
            return (
              <g key={region.label}>
                <text
                  x={(from + to) / 2}
                  y={22}
                  fill="var(--muted-foreground)"
                  opacity="0.72"
                  fontSize="8.5"
                  fontWeight="620"
                  letterSpacing="0.09em"
                  textAnchor="middle"
                >
                  {region.label.toUpperCase()}
                </text>
                {region.from > 20 ? <line x1={from} x2={from} y1={10} y2={REGION_STRIP_BOTTOM} stroke="var(--border)" strokeWidth="1" /> : null}
              </g>
            );
          })}
          <line x1={PLOT_LEFT} x2={geometry.width - PLOT_RIGHT} y1={REGION_STRIP_BOTTOM} y2={REGION_STRIP_BOTTOM} stroke="var(--border)" strokeWidth="1" />
          <line
            x1={frequencyToX(selected.frequency, geometry)}
            x2={frequencyToX(selected.frequency, geometry)}
            y1={PLOT_TOP}
            y2={geometry.height - PLOT_BOTTOM}
            stroke="var(--control-accent)"
            strokeWidth="1"
            strokeDasharray="1 3"
            opacity="0.45"
          />
          <path
            d={`${path} L ${geometry.width - PLOT_RIGHT} ${geometry.height - PLOT_BOTTOM} L ${PLOT_LEFT} ${geometry.height - PLOT_BOTTOM} Z`}
            fill="color-mix(in srgb, var(--control-accent) 7%, transparent)"
            stroke="none"
          />
          <path d={path} fill="none" stroke="var(--control-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {draft.map((band, index) => (
            <circle
              key={band.id}
              cx={frequencyToX(band.frequency, geometry)}
              cy={gainToY(band.gainDb, geometry)}
              r={band.id === selected.id ? 10 : 8}
              fill={band.enabled && band.id === selected.id ? NODE_COLORS[index % NODE_COLORS.length] : 'var(--surface-interactive)'}
              stroke={band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : 'var(--input)'}
              strokeWidth={band.id === selected.id ? 3 : 2}
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
              className={cn('parametric-eq__node', band.id === selected.id && 'is-selected')}
            >
              <title>{`Band ${index + 1}: ${frequencyReadout(band.frequency)}, ${band.gainDb > 0 ? '+' : ''}${band.gainDb} dB`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="parametric-eq__bands" role="list" aria-label="Equalizer bands">
        {draft.map((band, index) => (
          <button
            key={band.id}
            type="button"
            aria-pressed={band.id === selected.id}
            onClick={() => setSelectedId(band.id)}
            style={{ '--band-color': NODE_COLORS[index % NODE_COLORS.length] } as CSSProperties}
            className={cn('parametric-eq__band', band.id === selected.id && 'is-selected')}
          >
            <span className="parametric-eq__band-dot" data-enabled={band.enabled} aria-hidden="true" />
            <span className="parametric-eq__band-name">{index + 1}</span>
            <span className="parametric-eq__band-freq">{frequencyReadout(band.frequency)}</span>
          </button>
        ))}
      </div>

      <div className="parametric-eq__inspector">
        <div className="parametric-eq__inspector-heading">
          <span className="parametric-eq__selected-dot" style={{ backgroundColor: NODE_COLORS[draft.indexOf(selected) % NODE_COLORS.length] }} aria-hidden="true" />
          <strong>Band {draft.indexOf(selected) + 1}</strong>
          <label className="parametric-eq__band-state">
            <Switch
              checked={selected.enabled}
              disabled={disabled}
              aria-label={`Band ${draft.indexOf(selected) + 1} enabled`}
              onCheckedChange={(enabled) => updateBand(selected.id, { enabled }, true)}
            />
            <span className="sr-only">{selected.enabled ? 'On' : 'Off'}</span>
          </label>
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
