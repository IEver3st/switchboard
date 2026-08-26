import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Input } from '@/components/ui/input';

interface ColorPickerProps {
  value: string;
  onChange?: (value: string) => void;
  onCommit: (value: string) => void;
}

export function ColorPicker({ value, onChange, onCommit }: ColorPickerProps) {
  const externalHsv = useMemo(() => hexToHsv(value), [value]);
  const [hsv, setHsv] = useState(externalHsv);
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => {
    setHsv(externalHsv);
    setHex(value.toUpperCase());
  }, [externalHsv, value]);

  const update = (next: Hsv) => {
    const nextHex = hsvToHex(next);
    setHsv(next);
    setHex(nextHex);
    onChange?.(nextHex);
  };
  const commit = (next: Hsv = hsv) => onCommit(hsvToHex(next));
  const updateSurface = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const brightness = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const next = { ...hsv, saturation, value: brightness };
    update(next);
    return next;
  };
  const onSurfaceKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const amount = event.shiftKey ? 0.1 : 0.02;
    let next = hsv;
    if (event.key === 'ArrowLeft') next = { ...hsv, saturation: clamp(hsv.saturation - amount, 0, 1) };
    else if (event.key === 'ArrowRight') next = { ...hsv, saturation: clamp(hsv.saturation + amount, 0, 1) };
    else if (event.key === 'ArrowDown') next = { ...hsv, value: clamp(hsv.value - amount, 0, 1) };
    else if (event.key === 'ArrowUp') next = { ...hsv, value: clamp(hsv.value + amount, 0, 1) };
    else return;
    event.preventDefault();
    update(next);
  };

  return (
    <div className="color-picker">
      <button
        type="button"
        className="color-picker__surface"
        aria-label="Color saturation and brightness"
        aria-valuetext={`${Math.round(hsv.saturation * 100)}% saturation, ${Math.round(hsv.value * 100)}% brightness`}
        style={{ '--picker-hue': `hsl(${hsv.hue} 100% 50%)` } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSurface(event);
        }}
        onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && updateSurface(event)}
        onPointerUp={(event) => {
          const next = updateSurface(event);
          event.currentTarget.releasePointerCapture(event.pointerId);
          commit(next);
        }}
        onKeyDown={onSurfaceKeyDown}
        onKeyUp={(event) => event.key.startsWith('Arrow') && commit()}
      >
        <span
          className="color-picker__thumb"
          style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%` }}
          aria-hidden
        />
      </button>
      <label className="color-picker__hue-row">
        <span className="sr-only">Hue</span>
        <input
          className="color-picker__hue"
          type="range"
          min={0}
          max={360}
          step={1}
          value={hsv.hue}
          onChange={(event) => update({ ...hsv, hue: Number(event.target.value) })}
          onPointerUp={() => commit()}
          onKeyUp={(event) => event.key.startsWith('Arrow') && commit()}
        />
      </label>
      <div className="color-picker__hex-row">
        <span className="color-picker__preview" style={{ backgroundColor: hsvToHex(hsv) }} aria-hidden />
        <Input
          value={hex}
          maxLength={7}
          aria-label="HEX color"
          spellCheck={false}
          onChange={(event) => setHex(event.target.value.toUpperCase())}
          onBlur={() => commitHex(hex, setHex, update, onCommit)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            commitHex(hex, setHex, update, onCommit);
          }}
        />
        <span>HEX</span>
      </div>
    </div>
  );
}

interface Hsv {
  hue: number;
  saturation: number;
  value: number;
}

function commitHex(
  value: string,
  setHex: (value: string) => void,
  update: (value: Hsv) => void,
  commit: (value: string) => void,
) {
  const normalized = /^#[0-9A-F]{6}$/.test(value) ? value : `#${value.replace('#', '')}`;
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
  setHex(normalized);
  update(hexToHsv(normalized));
  commit(normalized);
}

function hexToHsv(hex: string): Hsv {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

function hsvToHex({ hue, saturation, value }: Hsv): string {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb.map((part) => Math.round((part + m) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
