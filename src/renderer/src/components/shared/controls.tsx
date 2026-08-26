import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  trailing,
  className,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-6 py-3', className)}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {description ? <div className="mt-0.5 text-xs leading-4 text-muted-foreground/80">{description}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {trailing}
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
      </div>
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('w-auto min-w-28', className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
