import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

interface ColorPickerProps {
  value: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onCommit: (value: string) => void;
}

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

// Kibo UI's composable selection + hue + format pattern, adapted to the
// existing shadcn/Radix stack so Switchboard does not add a second primitive
// family or a general-purpose color dependency for one hardware control.
export function ColorPicker({ value, disabled, onChange, onCommit }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hex, setHex] = useState(value.toUpperCase());
  const latest = useRef(hsv);

  useEffect(() => {
    const next = hexToHsv(value);
    latest.current = next;
    setHsv(next);
    setHex(value.toUpperCase());
  }, [value]);

  const update = (next: HsvColor, commit = false) => {
    latest.current = next;
    setHsv(next);
    const nextHex = hsvToHex(next);
    setHex(nextHex);
    onChange?.(nextHex);
    if (commit) onCommit(nextHex);
  };

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>, commit = false) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const nextValue = clamp(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    update({ ...latest.current, saturation, value: nextValue }, commit);
  };

  const commitHex = () => {
    const normalized = normalizeHex(hex);
    if (!normalized) {
      setHex(hsvToHex(latest.current));
      return;
    }
    const next = hexToHsv(normalized);
    latest.current = next;
    setHsv(next);
    setHex(normalized);
    onChange?.(normalized);
    onCommit(normalized);
  };

  return (
    <div className="color-picker" data-disabled={disabled || undefined}>
      <div
        className="color-picker__selection"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Color saturation and brightness"
        aria-disabled={disabled}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.saturation)}
        aria-valuetext={`${Math.round(hsv.saturation)}% saturation, ${Math.round(hsv.value)}% brightness`}
        style={{ '--picker-hue': hsv.hue } as CSSProperties}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          updateFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (disabled) return;
          updateFromPointer(event, true);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => handleSelectionKey(event, latest.current, update)}
      >
        <span
          className="color-picker__selection-handle"
          style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.value}%` }}
          aria-hidden
        />
      </div>

      <div className="color-picker__hue-row">
        <span className="color-picker__preview" style={{ backgroundColor: hsvToHex(hsv) }} aria-hidden />
        <Slider
          className="color-picker__hue"
          min={0}
          max={360}
          step={1}
          value={[hsv.hue]}
          disabled={disabled}
          aria-label="Hue"
          aria-valuetext={`${Math.round(hsv.hue)} degrees`}
          onValueChange={([hue]) => typeof hue === 'number' && update({ ...latest.current, hue })}
          onValueCommit={([hue]) => typeof hue === 'number' && update({ ...latest.current, hue }, true)}
        />
      </div>

      <div className="color-picker__hex-row">
        <span>#</span>
        <Input
          value={hex.replace(/^#/, '')}
          maxLength={6}
          aria-label="HEX color"
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase();
            setHex(`#${next}`);
            if (next.length === 6) {
              const normalized = `#${next}`;
              const nextHsv = hexToHsv(normalized);
              latest.current = nextHsv;
              setHsv(nextHsv);
              onChange?.(normalized);
            }
          }}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setHex(hsvToHex(latest.current));
              event.currentTarget.blur();
            }
          }}
        />
        <span>HEX</span>
      </div>
    </div>
  );
}

function handleSelectionKey(
  event: KeyboardEvent<HTMLDivElement>,
  color: HsvColor,
  update: (next: HsvColor, commit?: boolean) => void,
) {
  const step = event.shiftKey ? 5 : 1;
  let next: HsvColor | null = null;
  if (event.key === 'ArrowLeft') next = { ...color, saturation: clamp(color.saturation - step, 0, 100) };
  if (event.key === 'ArrowRight') next = { ...color, saturation: clamp(color.saturation + step, 0, 100) };
  if (event.key === 'ArrowUp') next = { ...color, value: clamp(color.value + step, 0, 100) };
  if (event.key === 'ArrowDown') next = { ...color, value: clamp(color.value - step, 0, 100) };
  if (!next) return;
  event.preventDefault();
  update(next, true);
}

function normalizeHex(value: string): string | null {
  const normalized = `#${value.replace('#', '').toUpperCase()}`;
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

function hexToHsv(value: string): HsvColor {
  const normalized = normalizeHex(value) ?? '#FF1744';
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: maximum === 0 ? 0 : (delta / maximum) * 100,
    value: maximum * 100,
  };
}

function hsvToHex({ hue, saturation, value }: HsvColor): string {
  const chroma = (value / 100) * (saturation / 100);
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value / 100 - chroma;
  let [red, green, blue] = [0, 0, 0];
  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
