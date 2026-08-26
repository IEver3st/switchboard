import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
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
        <div className="text-[13px] font-medium text-[#e8eaed]">{label}</div>
        {description ? <div className="mt-0.5 text-[12px] leading-4 text-[var(--muted-2)]">{description}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {trailing}
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  children,
  className,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-8 rounded-[7px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[12px] font-medium text-[#dfe2e6] outline-none hover:border-[var(--border-strong)]',
        className,
      )}
    >
      {children}
    </select>
  );
}
