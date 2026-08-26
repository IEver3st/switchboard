import { memo, type CSSProperties } from 'react';
import { SlidersVertical, Volume2, VolumeX } from 'lucide-react';
import type { AudioMaster } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { MixerFader } from './MixerFader';

export const MixerMasterStrip = memo(function MixerMasterStrip({
  master,
  pending,
  onGainCommit,
  onEnabledChange,
}: {
  master: AudioMaster;
  pending: boolean;
  onGainCommit: (gain: number) => void;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <article
      className={cn('mixer-channel mixer-channel--master', !master.enabled && 'is-muted')}
      style={{ '--channel-accent': 'var(--primary)' } as CSSProperties}
    >
      <header className="mixer-channel__header">
        <div className="mixer-channel__title">
          <SlidersVertical className="mixer-channel__icon" aria-hidden="true" />
          <h3>Master</h3>
        </div>
        <span className="mixer-channel__settings" aria-hidden="true" />
      </header>

      <div className="mixer-channel__meta">
        <div className="mixer-channel__meta-row">
          <span>Scope</span>
          <strong>All outputs</strong>
        </div>
        <div className="mixer-channel__meta-row">
          <span>Unity</span>
          <strong>100%</strong>
        </div>
      </div>

      <div className={cn('mixer-channel__fader mixer-channel__fader--master', !master.enabled && 'is-dimmed')}>
        <MixerFader
          value={master.gain}
          disabled={!master.enabled || pending}
          label="Master"
          accentColor="var(--primary)"
          onCommit={onGainCommit}
        />
      </div>

      <div className="mixer-channel__mute">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={master.enabled ? 'Mute master output' : 'Unmute master output'}
              aria-pressed={!master.enabled}
              onClick={() => onEnabledChange(!master.enabled)}
              className={cn('mixer-channel__mute-button', !master.enabled && 'is-active')}
            >
              {master.enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{master.enabled ? 'Mute master output' : 'Unmute master output'}</TooltipContent>
        </Tooltip>
      </div>

      <div className="mixer-channel__apps mixer-channel__apps--master">
        <span>Output stage</span>
        <p>Controls the complete mix.</p>
      </div>
    </article>
  );
});
