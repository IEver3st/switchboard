import { useEffect, useState, type ReactNode } from 'react';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

export function SettingsCategoryHeader({
  title,
  description,
  onReset,
}: {
  title: string;
  description?: string;
  onReset?: () => void;
}) {
  return (
    <div className="settings-category-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {onReset ? (
        <Button type="button" variant="ghost" size="sm" onClick={onReset} className="h-7 px-2 text-[11px]">
          <RotateCcw className="size-3" aria-hidden />
          Reset section
        </Button>
      ) : null}
    </div>
  );
}

export function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-labelledby={`settings-section-${slug(title)}`}>
      <h3 id={`settings-section-${slug(title)}`}>{title}</h3>
      <div className="settings-section__rows">{children}</div>
    </section>
  );
}

export function SettingRow({
  settingId,
  title,
  description,
  children,
  className,
  controlClassName,
}: {
  settingId: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  controlClassName?: string;
}) {
  return (
    <div
      id={`setting-${settingId}`}
      data-setting-id={settingId}
      tabIndex={-1}
      className={cn('settings-row', className)}
    >
      <div className="settings-row__copy">
        <div className="settings-row__title">{title}</div>
        {description ? <div className="settings-row__description">{description}</div> : null}
      </div>
      <div className={cn('settings-row__control', controlClassName)}>{children}</div>
    </div>
  );
}

export function SettingSwitch({
  settingId,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  settingId: string;
  title: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SettingRow settingId={settingId} title={title} description={description}>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </SettingRow>
  );
}

export function SettingSelect({
  settingId,
  title,
  description,
  value,
  options,
  disabled,
  onValueChange,
}: {
  settingId: string;
  title: string;
  description: ReactNode;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <SettingRow settingId={settingId} title={title} description={description}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-label={title} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}

export function SettingValue({
  settingId,
  title,
  description,
  value,
  tone = 'default',
}: {
  settingId: string;
  title: string;
  description?: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <SettingRow settingId={settingId} title={title} description={description}>
      <span
        className={cn(
          'settings-row__value',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </span>
    </SettingRow>
  );
}

export function SettingFolder({
  settingId,
  title,
  path,
  disabled,
  onChange,
  onOpen,
  className,
}: {
  settingId: string;
  title: string;
  path: string;
  disabled?: boolean;
  onChange: () => void;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <SettingRow
      settingId={settingId}
      title={title}
      description={<span className="settings-path" title={path}>{path}</span>}
      className={className}
      controlClassName="settings-row__control--actions"
    >
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onOpen} aria-label={`Open ${title}`}>
        <FolderOpen className="size-3.5" aria-hidden />
        Open
      </Button>
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onChange}>Change</Button>
    </SettingRow>
  );
}

export function SettingShortcut({
  settingId,
  title,
  value,
  disabled,
  onValueChange,
}: {
  settingId: string;
  title: string;
  value: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <SettingRow
      settingId={settingId}
      title={title}
      description="Select the shortcut, then press a new key combination. Escape cancels."
    >
      <ShortcutRecorderButton
        value={value}
        disabled={disabled}
        label={title}
        onValueChange={onValueChange}
      />
    </SettingRow>
  );
}

export function SettingSlider({
  settingId,
  title,
  description,
  value,
  min,
  max,
  step,
  disabled,
  formatValue,
  onValueCommit,
}: {
  settingId: string;
  title: string;
  description: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  formatValue: (value: number) => string;
  onValueCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <SettingRow settingId={settingId} title={title} description={description}>
      <div className="settings-slider">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[draft]}
          disabled={disabled}
          aria-label={title}
          aria-valuetext={formatValue(draft)}
          onValueChange={([next]) => typeof next === 'number' && setDraft(next)}
          onValueCommit={([next]) => typeof next === 'number' && onValueCommit(next)}
        />
        <span className="settings-slider__value">{formatValue(draft)}</span>
      </div>
    </SettingRow>
  );
}

export function SettingAction({
  settingId,
  title,
  description,
  label,
  onClick,
}: {
  settingId: string;
  title: string;
  description: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SettingRow settingId={settingId} title={title} description={description}>
      <Button type="button" variant="secondary" size="sm" onClick={onClick} className="w-full">{label}</Button>
    </SettingRow>
  );
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
