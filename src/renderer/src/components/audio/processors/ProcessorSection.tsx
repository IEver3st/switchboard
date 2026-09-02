import type { ReactNode } from 'react';
import type { AudioSupportLevel } from '../../../../../shared/contracts';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

export function ProcessorSection({
  id,
  title,
  enabled,
  pending,
  support,
  compact,
  onEnabledChange,
  children,
}: {
  id: string;
  title: string;
  enabled: boolean;
  pending: boolean;
  support: AudioSupportLevel;
  compact?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: ReactNode;
}) {
  const unavailable = support === 'unavailable';
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn('audio-proc advanced-processor scroll-mt-28', (!enabled || unavailable) && 'is-disabled', compact && 'advanced-processor--compact')}>
      <header className="audio-proc__head">
        <h2 id={`${id}-heading`}>{title}</h2>
        <label className="flex shrink-0 items-center text-[11px] text-muted-foreground">
          <Switch
            checked={enabled}
            disabled={pending || unavailable}
            aria-label={`${enabled ? 'Bypass' : 'Enable'} ${title}`}
            onCheckedChange={onEnabledChange}
          />
        </label>
      </header>
      <div className="audio-proc__body">{children}</div>
    </section>
  );
}
