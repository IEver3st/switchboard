import { memo, type ComponentType } from 'react';
import { Route, Volume2, VolumeX } from 'lucide-react';
import type { AudioBus, AudioDevice, AudioDeviceDirection } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { AudioDevicePicker } from './AudioDevicePicker';
import { LevelMeter } from './LevelMeter';
import { MixerFader } from './MixerFader';

export const ChannelStrip = memo(function ChannelStrip({
  bus,
  devices,
  icon: Icon,
  engineRunning,
  pending,
  selected,
  onGainCommit,
  onEnabledChange,
  onDeviceChange,
  onSelect,
}: {
  bus: AudioBus;
  devices: AudioDevice[];
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  engineRunning: boolean;
  pending: boolean;
  selected: boolean;
  onGainCommit: (gain: number) => void;
  onEnabledChange: (enabled: boolean) => void;
  onDeviceChange: (deviceId: string) => void;
  onSelect: () => void;
}) {
  const direction: AudioDeviceDirection = bus.id === 'mic' ? 'input' : 'output';
  const channelActive = bus.enabled && !bus.muted;
  const assignment = bus.id === 'mic'
    ? 'Input channel'
    : `${bus.appCount} ${bus.appCount === 1 ? 'app' : 'apps'}`;

  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col bg-card px-3 pb-2.5 pt-3 transition-colors duration-150 motion-reduce:transition-none',
        selected && 'bg-[#12161c]',
        !bus.enabled && 'bg-background',
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-[2px] bg-transparent', selected && 'bg-primary')} aria-hidden="true" />

      <header className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className={cn('mt-0.5 size-3.5 shrink-0', channelActive ? 'text-foreground/80' : 'text-muted-foreground/45')} aria-hidden={true} />
          <div className="min-w-0">
            <h3 className="m-0 truncate text-[11px] font-semibold text-foreground">{bus.label}</h3>
            <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full bg-[#4e5560]', channelActive && engineRunning && 'bg-success')} aria-hidden="true" />
              <span>{channelActive ? assignment : 'Muted'}</span>
            </div>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={pending}
              aria-label={`${channelActive ? 'Mute' : 'Unmute'} ${bus.label}`}
              aria-pressed={!channelActive}
              onClick={() => onEnabledChange(!bus.enabled)}
              className={cn('size-6 shrink-0', !channelActive && 'bg-primary/10 text-primary hover:bg-primary/15')}
            >
              {channelActive ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{channelActive ? 'Mute channel' : 'Unmute channel'}</TooltipContent>
        </Tooltip>
      </header>

      <div className="mt-2 border-y border-border py-0.5">
        <AudioDevicePicker
          value={bus.deviceId}
          devices={devices}
          direction={direction}
          label={`${bus.label} ${direction} device`}
          disabled={pending}
          onChange={onDeviceChange}
        />
      </div>

      <div className={cn('mt-3 flex h-[205px] items-stretch justify-center gap-2', !bus.enabled && 'opacity-55')}>
        <LevelMeter busId={bus.id} active={engineRunning && channelActive} label={bus.label} />
        <MixerFader
          value={bus.gain}
          disabled={!bus.enabled || pending}
          label={bus.label}
          onCommit={onGainCommit}
        />
      </div>

      <footer className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-border pt-2">
        <span className="truncate text-[8px] text-muted-foreground" title={bus.endpoint}>{bus.endpoint}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-6 shrink-0', selected && 'text-primary')}
              aria-label={`Inspect ${bus.label} route`}
              aria-pressed={selected}
              onClick={onSelect}
            >
              <Route className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inspect route</TooltipContent>
        </Tooltip>
      </footer>
    </article>
  );
});
