import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { MAX_EQ_BANDS, type EqBand } from '../../../../shared/contracts';
import { Plus, Trash2 } from 'lucide-react';
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
const FILTER_LABELS: Record<EqBand['type'], string> = {
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

export function ParametricEq({ bands, disabled: unavailable, onCommit }: { bands: EqBand[]; disabled?: boolean; onCommit: (bands: EqBand[]) => Promise<void> }) {
  const [committing, setCommitting] = useState(false);
  const disabled = unavailable || committing;
  const [draft, setDraft] = useState(bands);
  const [selectedId, setSelectedId] = useState(bands[0]?.id ?? '');
  const [geometry, setGeometry] = useState<EqGeometry>(FALLBACK_GEOMETRY);
  const [hoverFrequency, setHoverFrequency] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const focusBandRef = useRef(false);

  useEffect(() => {
    if (committing) return;
    if (dragIdRef.current && !disabled) return;
    setDraft(bands);
    dragIdRef.current = null;
    setHoverFrequency(null);
  }, [bands, disabled, committing]);
  useEffect(() => {
    if (!focusBandRef.current || disabled) return;
    focusBandRef.current = false;
    const root = stageRef.current?.parentElement;
    const target = root?.querySelector<HTMLElement>('.parametric-eq__band.is-selected')
      ?? root?.querySelector<HTMLElement>('[aria-label="Add EQ band"]');
    target?.focus({ preventScroll: true });
  }, [draft, disabled]);
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
  const selectedIndex = Math.max(0, draft.findIndex((band) => band.id === selected?.id));
  const path = useMemo(() => curvePath(draft, geometry), [draft, geometry]);
  const canAdd = !disabled && draft.length < MAX_EQ_BANDS;
  const commitBands = (next: EqBand[]) => {
    setCommitting(true);
    // The store owns error feedback. Reconcile to its confirmed bands when the
    // operation settles, including a rejection that returns the same snapshot.
    void onCommit(next).catch(() => undefined).finally(() => setCommitting(false));
  };

  const addBand = (frequency = 1_000) => {
    if (!canAdd) return;
    // A neutral filter leaves the current sound unchanged until it is adjusted.
    const band: EqBand = { id: `eq-${crypto.randomUUID()}`, enabled: true, type: 'bell', frequency: Math.round(frequency), gainDb: 0, q: 1 };
    const next = [...draft, band];
    setSelectedId(band.id);
    focusBandRef.current = true;
    setDraft(next);
    setHoverFrequency(null);
    commitBands(next);
  };

  const removeBand = (id: string) => {
    if (disabled) return;
    const index = draft.findIndex((band) => band.id === id);
    const next = draft.filter((band) => band.id !== id);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? '');
    focusBandRef.current = true;
    setDraft(next);
    commitBands(next);
  };

  const hoverCurve = (event: PointerEvent<SVGSVGElement>) => {
    if (!canAdd || dragIdRef.current || (event.target as Element).closest('[role="slider"]')) {
      setHoverFrequency(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * geometry.width / bounds.width;
    const y = (event.clientY - bounds.top) * geometry.height / bounds.height;
    const frequency = xToFrequency(x, geometry);
    const curveY = gainToY(equalizerResponseDb(frequency, draft), geometry);
    const nearNode = draft.some((band) => Math.hypot(frequencyToX(band.frequency, geometry) - x, gainToY(band.gainDb, geometry) - y) < 20);
    setHoverFrequency(x >= PLOT_LEFT && x <= geometry.width - PLOT_RIGHT && Math.abs(y - curveY) <= 14 && !nearNode ? frequency : null);
  };

  const updateBand = (id: string, update: Partial<EqBand>, commit = false) => {
    if (disabled) return;
    const next = draft.map((band) => band.id === id ? { ...band, ...update } : band);
    setDraft(next);
    if (commit) commitBands(next);
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
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeBand(band.id);
      return;
    }
    if (event.key === 'Escape') {
      dragIdRef.current = null;
      setDraft(bands);
      return;
    }
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

  return (
    <div className={cn('audio-eq parametric-eq', disabled && 'is-disabled')} aria-busy={committing}>
      <div ref={stageRef} className="parametric-eq__stage">
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="audio-eq__graph parametric-eq__graph"
          aria-label="Equalizer response. Hover the curve and click to add a band. Drag bands to adjust; arrow keys fine-tune; Delete removes a band."
          onPointerMove={hoverCurve}
          onPointerLeave={() => setHoverFrequency(null)}
          onClick={(event) => {
            if (hoverFrequency !== null && !(event.target as Element).closest('[role="slider"]')) addBand(hoverFrequency);
          }}
        >
          {FREQUENCY_TICKS.map((frequency) => {
            const x = frequencyToX(frequency, geometry);
            return (
              <g key={frequency}>
                <line x1={x} x2={x} y1={PLOT_TOP} y2={geometry.height - PLOT_BOTTOM} stroke="color-mix(in srgb, var(--border) 62%, transparent)" strokeWidth="1" />
                <text x={x} y={geometry.height - 8} fill="var(--text-muted)" opacity="0.9" fontSize="10" textAnchor="middle">{frequencyLabel(frequency)}</text>
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
                  stroke={gain === 0 ? 'var(--border-strong)' : 'var(--border)'}
                  strokeWidth={gain === 0 ? 1.5 : 1}
                />
                <text x={PLOT_LEFT - 8} y={y + 3} fill="var(--text-muted)" opacity="0.9" fontSize="10" textAnchor="end">{gain > 0 ? '+' : ''}{gain}</text>
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
                  fill="var(--text-muted)"
                  opacity="0.72"
                  fontSize="8.5"
                  fontWeight="620"
                  letterSpacing="0.09em"
                  textAnchor="middle"
                >
                  {region.label.toUpperCase()}
                </text>
              </g>
            );
          })}
          {selected ? <line
            x1={frequencyToX(selected.frequency, geometry)}
            x2={frequencyToX(selected.frequency, geometry)}
            y1={PLOT_TOP}
            y2={geometry.height - PLOT_BOTTOM}
            stroke="var(--control-accent)"
            strokeWidth="1"
            strokeDasharray="1 3"
            opacity="0.45"
          /> : null}
          <path
            d={`${path} L ${geometry.width - PLOT_RIGHT} ${geometry.height - PLOT_BOTTOM} L ${PLOT_LEFT} ${geometry.height - PLOT_BOTTOM} Z`}
            fill="color-mix(in srgb, var(--control-accent) 7%, transparent)"
            stroke="none"
          />
          <path d={path} fill="none" stroke="var(--control-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {hoverFrequency !== null && canAdd ? (
            <g className="parametric-eq__add-marker" pointerEvents="none" transform={`translate(${frequencyToX(hoverFrequency, geometry)}, ${gainToY(equalizerResponseDb(hoverFrequency, draft), geometry)})`}>
              <circle r="10" fill="var(--foreground)" />
              <path d="M -4 0 H 4 M 0 -4 V 4" stroke="var(--background)" strokeWidth="1.5" />
              <title>Add a neutral band at {frequencyReadout(Math.round(hoverFrequency))}</title>
            </g>
          ) : null}
          {draft.map((band, index) => (
            <circle
              key={band.id}
              cx={frequencyToX(band.frequency, geometry)}
              cy={gainToY(band.gainDb, geometry)}
              r={band.id === selected?.id ? 8 : 6}
              fill={band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : 'transparent'}
              stroke={band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : 'var(--text-muted)'}
              strokeWidth={band.id === selected?.id ? 2 : 1.5}
              role="slider"
              aria-disabled={disabled || undefined}
              tabIndex={disabled ? -1 : 0}
              aria-label={`EQ band ${index + 1}`}
              aria-valuemin={-12}
              aria-valuemax={12}
              aria-valuenow={band.gainDb}
              aria-valuetext={`${Math.round(band.frequency)} hertz, ${band.gainDb > 0 ? '+' : ''}${band.gainDb} decibels, width ${band.q}`}
              onFocus={() => setSelectedId(band.id)}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0) return;
                setHoverFrequency(null);
                event.currentTarget.setPointerCapture(event.pointerId);
                dragIdRef.current = band.id;
                setSelectedId(band.id);
              }}
              onPointerCancel={() => { dragIdRef.current = null; setDraft(bands); }}
              onLostPointerCapture={() => {
                if (dragIdRef.current) { dragIdRef.current = null; setDraft(bands); }
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
              className={cn('audio-eq__node parametric-eq__node', band.id === selected?.id && 'is-selected')}
            >
              <title>{`Band ${index + 1}: ${frequencyReadout(band.frequency)}, ${band.gainDb > 0 ? '+' : ''}${band.gainDb} dB`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="parametric-eq__controls">
        <div className="parametric-eq__bands" role="group" aria-label="EQ bands">
          {draft.map((band, index) => (
            <button
              key={band.id}
              type="button"
              className={cn('parametric-eq__band', band.id === selected?.id && 'is-selected', !band.enabled && 'is-off')}
              style={{ '--band-color': NODE_COLORS[index % NODE_COLORS.length] } as CSSProperties}
              aria-pressed={band.id === selected?.id}
              aria-label={`Select EQ band ${index + 1}, ${frequencyReadout(band.frequency)}, ${formatGain(band.gainDb)}${band.enabled ? '' : ', off'}`}
              onClick={() => setSelectedId(band.id)}
            >
              <span className="parametric-eq__band-dot" aria-hidden="true" />
              {index + 1}
            </button>
          ))}
        </div>
        <div className="parametric-eq__add">
          <Button variant="ghost" size="sm" disabled={!canAdd} onClick={() => addBand()} aria-label="Add EQ band"><Plus className="size-3.5" />Add band</Button>
          <span aria-live="polite">{draft.length} / {MAX_EQ_BANDS}</span>
        </div>
        {selected ? <div className="parametric-eq__inspector" aria-label={`Band ${selectedIndex + 1} values`} role="group">
          <span className="parametric-eq__inspector-title">
            <strong>Band {selectedIndex + 1}</strong>
          </span>
          <Select value={selected.type} disabled={disabled} onValueChange={(type: EqBand['type']) => updateBand(selected.id, { type }, true)}>
            <SelectTrigger className="parametric-eq__filter" aria-label="EQ band filter type"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(FILTER_LABELS).map(([type, label]) => <SelectItem key={type} value={type}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <EqNumberField key={`${selected.id}-frequency`} label="EQ band frequency" unit="Hz" value={selected.frequency} min={20} max={20_000} step={selected.frequency >= 1_000 ? 50 : 5} precision={0} disabled={disabled} onCommit={(frequency) => updateBand(selected.id, { frequency }, true)} />
          <EqNumberField key={`${selected.id}-gain`} label="EQ band gain" unit="dB" value={selected.gainDb} min={-12} max={12} step={0.5} precision={1} signed disabled={disabled} onCommit={(gainDb) => updateBand(selected.id, { gainDb }, true)} />
          <EqNumberField key={`${selected.id}-width`} label="EQ band width" unit="Q" value={selected.q} min={0.2} max={10} step={0.1} precision={2} disabled={disabled} onCommit={(q) => updateBand(selected.id, { q }, true)} />
          <label className="parametric-eq__band-toggle">
            <Switch
              checked={selected.enabled}
              disabled={disabled}
              aria-label={`Band ${selectedIndex + 1} enabled`}
              onCheckedChange={(enabled) => updateBand(selected.id, { enabled }, true)}
            />
            <span aria-hidden="true">{selected.enabled ? 'On' : 'Off'}</span>
          </label>
          <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Remove EQ band ${selectedIndex + 1}`} title="Remove band (Delete)" onClick={() => removeBand(selected.id)}><Trash2 className="size-3.5" /></Button>
        </div> : <span className="parametric-eq__empty">Flat response. Add a band to start shaping your sound.</span>}
      </div>
    </div>
  );
}

function formatGain(gainDb: number): string {
  return `${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)} dB`;
}

// Exact entry for one band value. Commits on Enter or blur, restores the
// confirmed value on Escape or invalid input, and steps with the arrow keys.
function EqNumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  precision,
  signed = false,
  disabled,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  signed?: boolean;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const format = (next: number) => `${signed && next > 0 ? '+' : ''}${next.toFixed(precision)}`;
  const [draft, setDraft] = useState(() => format(value));
  const cancelRef = useRef(false);
  useEffect(() => setDraft(format(value)), [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(/[^0-9.+-]/g, ''));
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    const next = Number(clamp(parsed, min, max).toFixed(precision));
    setDraft(format(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label className="parametric-eq__field">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (cancelRef.current) {
            cancelRef.current = false;
            setDraft(format(value));
            return;
          }
          commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          else if (event.key === 'Escape') {
            cancelRef.current = true;
            event.currentTarget.blur();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const direction = event.key === 'ArrowUp' ? 1 : -1;
            commit(String(value + direction * step * (event.shiftKey ? 10 : 1)));
          }
        }}
      />
      <span aria-hidden="true">{unit}</span>
    </label>
  );
}
