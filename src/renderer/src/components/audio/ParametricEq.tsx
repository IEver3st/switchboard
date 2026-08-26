import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Power } from 'lucide-react';
import type { EqBand, EqFilterType } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { equalizerResponseDb } from '@/lib/eq-response';
import { RotaryKnob } from './RotaryKnob';

const WIDTH = 960;
const HEIGHT = 286;
const PLOT_LEFT = 42;
const PLOT_RIGHT = 16;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 28;
const PLOT_WIDTH = WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const FREQUENCY_TICKS = [20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000];
const GAIN_TICKS = [-12, -6, 0, 6, 12];
const FILTER_LABELS: Record<EqFilterType, string> = {
  'low-shelf': 'Low shelf',
  bell: 'Bell',
  'high-shelf': 'High shelf',
};
const NODE_COLORS = ['#ff658a', '#e6b85c', '#58c49a', '#78a8d8', '#a892d8', '#d889a1', '#8e96a3', '#d5a56f'];

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
  const points = Array.from({ length: 240 }, (_, index) => {
    const frequency = 20 * 10 ** ((index / 239) * 3);
    const gain = equalizerResponseDb(frequency, bands);
    return `${index === 0 ? 'M' : 'L'} ${frequencyToX(frequency).toFixed(2)} ${gainToY(gain).toFixed(2)}`;
  });
  return points.join(' ');
}

function frequencyLabel(value: number): string {
  return value >= 1_000 ? `${value / 1_000}k` : String(value);
}

export function ParametricEq({
  bands,
  disabled,
  onCommit,
}: {
  bands: EqBand[];
  disabled?: boolean;
  onCommit: (bands: EqBand[]) => void;
}) {
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
    const fine = event.shiftKey ? 1.015 : 1.06;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const frequency = event.key === 'ArrowRight' ? band.frequency * fine : band.frequency / fine;
      updateBand(band.id, { frequency: Math.round(clamp(frequency, 20, 20_000)) }, true);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = event.shiftKey ? 0.1 : 0.5;
      updateBand(band.id, { gainDb: clamp(band.gainDb + (event.key === 'ArrowUp' ? step : -step), -12, 12) }, true);
    }
  };

  if (!selected) return null;

  return (
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)_220px] gap-4 max-[980px]:grid-cols-1', disabled && 'opacity-55')}>
      <div className="min-w-0">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-[286px] w-full touch-none border border-border bg-[#0d1014]"
          aria-label="Parametric equalizer response"
        >
          {FREQUENCY_TICKS.map((frequency) => {
            const x = frequencyToX(frequency);
            return (
              <g key={frequency}>
                <line x1={x} x2={x} y1={PLOT_TOP} y2={HEIGHT - PLOT_BOTTOM} stroke="var(--border)" strokeWidth="1" />
                <text x={x} y={HEIGHT - 5} fill="var(--muted-foreground)" opacity="0.6" fontSize="7" textAnchor="middle">{frequencyLabel(frequency)}</text>
              </g>
            );
          })}
          {GAIN_TICKS.map((gain) => {
            const y = gainToY(gain);
            return (
              <g key={gain}>
                <line x1={PLOT_LEFT} x2={WIDTH - PLOT_RIGHT} y1={y} y2={y} stroke={gain === 0 ? 'var(--input)' : 'var(--border)'} strokeWidth={gain === 0 ? 1.5 : 1} />
                <text x={PLOT_LEFT - 6} y={y + 2.5} fill="var(--muted-foreground)" opacity="0.65" fontSize="7" textAnchor="end">{gain > 0 ? '+' : ''}{gain}</text>
              </g>
            );
          })}
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {draft.map((band, index) => (
            <circle
              key={band.id}
              cx={frequencyToX(band.frequency)}
              cy={gainToY(band.gainDb)}
              r={band.id === selected.id ? 6 : 5}
              fill={band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : 'var(--input)'}
              stroke={band.id === selected.id ? 'var(--foreground)' : 'var(--background)'}
              strokeWidth="1.5"
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`EQ band ${index + 1}`}
              aria-valuemin={-12}
              aria-valuemax={12}
              aria-valuenow={band.gainDb}
              aria-valuetext={`${Math.round(band.frequency)} hertz, ${band.gainDb > 0 ? '+' : ''}${band.gainDb} decibels, Q ${band.q}`}
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
              className="cursor-crosshair outline-none focus-visible:stroke-ring focus-visible:stroke-[3]"
            />
          ))}
        </svg>

        <div className="mt-2 flex min-w-0 items-center gap-px border-y border-border bg-border">
          {draft.map((band, index) => (
            <button
              key={band.id}
              type="button"
              aria-pressed={band.id === selected.id}
              onClick={() => setSelectedId(band.id)}
              className={cn(
                'flex h-7 min-w-0 flex-1 items-center justify-center gap-1 bg-background px-2 text-[8px] font-semibold text-muted-foreground outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50',
                band.id === selected.id && 'bg-accent text-foreground',
              )}
            >
              <span
                className="size-1.5 rounded-full bg-[#4e5560]"
                style={band.enabled ? { backgroundColor: NODE_COLORS[index % NODE_COLORS.length] } : undefined}
                aria-hidden="true"
              />
              {index + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col border-l border-border pl-3 max-[900px]:border-l-0 max-[900px]:border-t max-[900px]:pt-3 max-[900px]:pl-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold text-foreground">Band {draft.indexOf(selected) + 1}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-6 gap-1 px-1.5 text-[8px]', selected.enabled && 'text-primary')}
            aria-pressed={selected.enabled}
            onClick={() => updateBand(selected.id, { enabled: !selected.enabled }, true)}
          >
            <Power className="size-3" /> {selected.enabled ? 'On' : 'Bypassed'}
          </Button>
        </div>

        <Select
          value={selected.type}
          onValueChange={(type) => updateBand(selected.id, { type: type as EqFilterType }, true)}
          disabled={disabled}
        >
          <SelectTrigger className="mt-2 h-7 w-full text-[9px]" aria-label="EQ filter type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FILTER_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>

        <label className="mt-2 text-[8px] text-muted-foreground">
          Frequency
          <span className="mt-1 flex h-7 items-center border border-input bg-secondary px-2 focus-within:border-ring">
            <input
              type="number"
              min={20}
              max={20_000}
              value={Math.round(selected.frequency)}
              disabled={disabled}
              aria-label="EQ band frequency"
              onChange={(event) => updateBand(selected.id, { frequency: clamp(Number(event.target.value), 20, 20_000) })}
              onBlur={() => onCommit(draft)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[10px] font-semibold tabular-nums text-foreground outline-none"
            />
            <span className="text-[8px] text-muted-foreground">Hz</span>
          </span>
        </label>

        <div className="mt-auto flex items-end justify-around gap-2 pt-2">
          <RotaryKnob
            label="Gain"
            value={selected.gainDb}
            min={-12}
            max={12}
            step={0.1}
            defaultValue={0}
            unit="dB"
            precision={1}
            disabled={disabled}
            onChange={(gainDb) => updateBand(selected.id, { gainDb })}
            onCommit={(gainDb) => updateBand(selected.id, { gainDb }, true)}
          />
          <RotaryKnob
            label="Q"
            value={selected.q}
            min={0.2}
            max={10}
            step={0.1}
            defaultValue={1}
            unit=""
            precision={1}
            disabled={disabled}
            onChange={(q) => updateBand(selected.id, { q })}
            onCommit={(q) => updateBand(selected.id, { q }, true)}
          />
        </div>
      </div>
    </div>
  );
}
