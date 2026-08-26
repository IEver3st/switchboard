import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/cn';

export interface SemanticOption<T extends string> {
  value: T;
  label: string;
}

export function SettingToggle({
  title,
  description,
  checked,
  disabled,
  pending,
  technicalName,
  onCheckedChange,
  className,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  technicalName?: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('human-setting', className)}>
      <div className="human-setting__copy">
        <div className="human-setting__title">
          <span>{title}</span>
          {technicalName ? <span className="human-setting__technical">{technicalName}</span> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      <label className="human-setting__state">
        <span>{checked ? 'On' : 'Off'}</span>
        <Switch
          checked={checked}
          disabled={disabled || pending}
          aria-label={title}
          onCheckedChange={onCheckedChange}
        />
      </label>
    </div>
  );
}

export function SemanticChoice<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
  className,
}: {
  label: string;
  value: T | 'custom';
  options: Array<SemanticOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('semantic-choice', className)}>
      <span className="sr-only">{label}</span>
      <ToggleGroup
        type="single"
        value={value === 'custom' ? '' : value}
        disabled={disabled}
        aria-label={label}
        onValueChange={(next) => next && onChange(next as T)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value === 'custom' ? <span className="semantic-choice__custom">Custom</span> : null}
    </div>
  );
}

export function PrimarySlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  description,
  onChange,
  onCommit,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  description?: string;
  onChange?: (value: number) => void;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);

  return (
    <div className={cn('primary-slider', className)}>
      <div className="primary-slider__heading">
        <div>
          <span>{label}</span>
          {description ? <p>{description}</p> : null}
        </div>
        <output>{formatValue(current, step)}<small>{unit}</small></output>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[current]}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${formatValue(current, step)} ${unit}`.trim()}
        onValueChange={([next]) => {
          if (typeof next === 'number') {
            setCurrent(next);
            onChange?.(next);
          }
        }}
        onValueCommit={([next]) => {
          if (typeof next === 'number') onCommit(next);
        }}
      />
    </div>
  );
}

export function AdvancedDisclosure({
  children,
  label = 'Advanced controls',
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={cn('advanced-disclosure', className)}>
      <button
        type="button"
        className="advanced-disclosure__trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <ChevronDown aria-hidden className={cn('size-4', open && 'rotate-180')} />
      </button>
      {open ? <div className="advanced-disclosure__content">{children}</div> : null}
    </section>
  );
}

function formatValue(value: number, step: number): string {
  if (step >= 1) return Math.round(value).toString();
  return value.toFixed(step < 0.1 ? 2 : 1);
}
