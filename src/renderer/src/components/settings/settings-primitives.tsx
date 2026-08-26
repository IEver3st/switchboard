import { useEffect, useState, type ReactNode } from 'react';
import { FolderOpen, Keyboard, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

export function SettingsCategoryHeader({
  title,
  onReset,
}: {
  title: string;
  onReset?: () => void;
}) {
  return (
    <div className="settings-category-header">
      <h2>{title}</h2>
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
}: {
  settingId: string;
  title: string;
  path: string;
  disabled?: boolean;
  onChange: () => void;
  onOpen: () => void;
}) {
  return (
    <SettingRow
      settingId={settingId}
      title={title}
      description={<span className="settings-path" title={path}>{path}</span>}
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
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(false);
        return;
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      const key = normalizeShortcutKey(event.key, event.code);
      const modifiers = [
        event.ctrlKey ? 'Ctrl' : null,
        event.altKey ? 'Alt' : null,
        event.shiftKey ? 'Shift' : null,
        event.metaKey ? 'Win' : null,
      ].filter((candidate): candidate is string => candidate !== null);
      onValueChange([...modifiers, key].join('+'));
      setRecording(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onValueChange, recording]);

  return (
    <SettingRow
      settingId={settingId}
      title={title}
      description={recording ? 'Press the new shortcut. Escape cancels recording.' : 'Use a combination that does not conflict with a game or Windows shortcut.'}
    >
      <Button
        type="button"
        variant={recording ? 'primary' : 'secondary'}
        size="sm"
        disabled={disabled}
        aria-pressed={recording}
        onClick={() => setRecording((active) => !active)}
        className="w-full justify-start tabular-nums"
      >
        <Keyboard className="size-3.5" aria-hidden />
        {recording ? 'Recording…' : value}
      </Button>
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

function normalizeShortcutKey(key: string, code: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toLocaleUpperCase();
  if (/^F\d{1,2}$/.test(key)) return key.toLocaleUpperCase();
  if (key === 'ArrowUp') return 'Up';
  if (key === 'ArrowDown') return 'Down';
  if (key === 'ArrowLeft') return 'Left';
  if (key === 'ArrowRight') return 'Right';
  return code.startsWith('Key') ? code.slice(3) : key;
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
