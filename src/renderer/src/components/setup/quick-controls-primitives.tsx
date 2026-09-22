import { useEffect, useId, useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function QuickSection({ title, className = '', action, children }: { title: string; className?: string; action?: ReactNode; children: ReactNode }) {
  return <section className={`quick-section ${className}`} aria-label={title}><div className="quick-section-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function QuickToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange(value: boolean): void }) {
  return <label className="quick-row quick-toggle"><span>{label}</span><Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>;
}
export function QuickSelect({ label, value, disabled, onChange, children }: { label: string; value: string; disabled: boolean; onChange(value: string): void; children: ReactNode }) {
  const id = useId();
  // Prefix values because Radix reserves the empty string for a placeholder.
  return <div className="quick-field"><label htmlFor={id}>{label}</label>
    <Select value={`choice:${value}`} disabled={disabled} onValueChange={next => onChange(next.slice(7))}>
      <SelectTrigger id={id} className="quick-select-trigger" aria-label={label} data-value={value}><SelectValue /></SelectTrigger>
      <SelectContent className="quick-select-menu" align="end" collisionPadding={10} onEscapeKeyDown={event => event.stopPropagation()}>{children}</SelectContent>
    </Select>
  </div>;
}
export function QuickOption({ value, disabled, children }: { value: string | number; disabled?: boolean; children: ReactNode }) {
  return <SelectItem className="quick-select-option" value={`choice:${value}`} data-value={String(value)} disabled={disabled}>{children}</SelectItem>;
}
export function QuickRange({ label, value, min, max, step, disabled, format, onCommit }: { label: string; value: number; min: number; max: number; step: number; disabled: boolean; format(value: number): string; onCommit(value: number): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!disabled) setDraft(value); }, [value, disabled]);
  const commit = (next: number) => { if (!disabled && next !== value) onCommit(next); };
  return <label className="quick-range"><output>{format(draft)}</output><input type="range" aria-label={label} aria-valuetext={format(draft)} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={event => setDraft(Number(event.target.value))} onPointerUp={event => commit(Number(event.currentTarget.value))} onKeyUp={event => commit(Number(event.currentTarget.value))} onBlur={event => commit(Number(event.currentTarget.value))} onPointerCancel={() => setDraft(value)} /></label>;
}
