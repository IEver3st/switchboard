import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

interface ColorPickerProps {
  value: string;
  onChange?: (value: string) => void;
  onCommit: (value: string) => void;
}

export function ColorPicker({ value, onChange, onCommit }: ColorPickerProps) {
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => {
    setHex(value.toUpperCase());
  }, [value]);

  return (
    <div className="color-picker">
      <label
        className="color-picker__surface"
        style={{ backgroundColor: validColor(hex) ?? value }}
      >
        <span className="sr-only">Choose color</span>
        <input
          className="color-picker__native"
          type="color"
          value={validColor(hex) ?? value}
          aria-label="Choose color"
          onInput={(event) => {
            const next = event.currentTarget.value.toUpperCase();
            setHex(next);
            onChange?.(next);
          }}
          onChange={(event) => onCommit(event.currentTarget.value.toUpperCase())}
        />
      </label>
      <div className="color-picker__hex-row">
        <span className="color-picker__preview" style={{ backgroundColor: validColor(hex) ?? value }} aria-hidden />
        <Input
          value={hex}
          maxLength={7}
          aria-label="HEX color"
          spellCheck={false}
          onChange={(event) => setHex(event.target.value.toUpperCase())}
          onBlur={() => commitHex(hex, setHex, onChange, onCommit)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            commitHex(hex, setHex, onChange, onCommit);
          }}
        />
        <span>HEX</span>
      </div>
    </div>
  );
}

function commitHex(
  value: string,
  setHex: (value: string) => void,
  onChange: ((value: string) => void) | undefined,
  commit: (value: string) => void,
) {
  const normalized = /^#[0-9A-F]{6}$/.test(value) ? value : `#${value.replace('#', '')}`;
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
  setHex(normalized);
  onChange?.(normalized);
  commit(normalized);
}

function validColor(value: string): string | null {
  return /^#[0-9A-F]{6}$/i.test(value) ? value : null;
}
