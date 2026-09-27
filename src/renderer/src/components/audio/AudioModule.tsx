import type { CSSProperties, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { channelColor, channelIcons, type MixerChannelId } from './channel-identity';

// Identity row for a channel workspace: which signal this is, where it goes,
// and the channel-wide actions (preset, test) beside it.
export function AudioChannelHeader({
  channel,
  title,
  detail,
  children,
}: {
  channel: MixerChannelId;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  const Icon = channelIcons[channel];
  return (
    <div className="audio-channel-head" style={{ '--channel-color': channelColor(channel) } as CSSProperties}>
      <div className="audio-channel-head__identity">
        <Icon aria-hidden="true" />
        <div>
          <h3>{title}</h3>
          <p title={detail}>{detail}</p>
        </div>
      </div>
      {children ? <div className="audio-channel-head__actions">{children}</div> : null}
    </div>
  );
}

export function AudioNotice({ children }: { children: ReactNode }) {
  return (
    <p className="audio-notice" role="status">
      <Info aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// One processing stage. The switch bypasses the whole stage; its controls stay
// visible but inactive so the chain is readable before it is turned on.
export function AudioModule({
  id,
  headingId,
  title,
  description,
  checked,
  disabled,
  pending,
  switchLabel,
  onCheckedChange,
  className,
  children,
}: {
  id?: string;
  headingId: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  switchLabel?: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  children?: ReactNode;
}) {
  const inactive = !checked || disabled;
  return (
    <section
      id={id}
      className={cn('audio-panel audio-module', inactive && 'is-disabled', className)}
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      data-state={disabled ? 'unavailable' : checked ? 'on' : 'off'}
    >
      <header className="audio-panel__head audio-module__head">
        <div className="audio-module__title">
          <h3 id={headingId}>{title}</h3>
          {description ? <p className="audio-panel__note">{description}</p> : null}
        </div>
        <span className="audio-module__state" aria-hidden="true">{disabled ? 'Unavailable' : checked ? 'On' : 'Off'}</span>
        <Switch
          checked={checked}
          disabled={disabled || pending}
          aria-label={switchLabel ?? title}
          onCheckedChange={onCheckedChange}
        />
      </header>
      {children ? <div className="audio-panel__body">{children}</div> : null}
    </section>
  );
}
