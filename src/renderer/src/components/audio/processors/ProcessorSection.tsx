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
    <section id={id} aria-labelledby={`${id}-heading`} className={cn('scroll-mt-28 border-t border-border pt-4', compact && 'pt-3')}>
      <header className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="m-0 text-[12px] font-semibold text-foreground">{title}</h2>
          {support === 'simulation' ? (
            <p className="m-0 mt-0.5 text-[8px] text-muted-foreground">Saved to the canonical graph; live audio remains simulation-backed.</p>
          ) : null}
          {unavailable ? (
            <p className="m-0 mt-0.5 text-[8px] text-muted-foreground">Unavailable until the native audio path is connected.</p>
          ) : null}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[9px] text-muted-foreground">
          {enabled ? 'Enabled' : 'Bypassed'}
          <Switch
            checked={enabled}
            disabled={pending || unavailable}
            aria-label={`${enabled ? 'Bypass' : 'Enable'} ${title}`}
            onCheckedChange={onEnabledChange}
          />
        </label>
      </header>
      <div className={cn((!enabled || unavailable) && 'opacity-50')}>{children}</div>
    </section>
  );
}
