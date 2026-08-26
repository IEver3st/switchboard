import { memo, type ComponentType } from 'react';
import { Route, Volume2, VolumeX } from 'lucide-react';
import type { AudioBus, AudioDevice, AudioDeviceDirection } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { AudioDevicePicker } from './AudioDevicePicker';
import { LevelMeter } from './LevelMeter';
import { MixerFader } from './MixerFader';

export const MixerChannelStrip = memo(function MixerChannelStrip({
  bus,
  devices,
  icon: Icon,
  engineRunning,
  pending,
  onGainCommit,
  onEnabledChange,
  onDeviceChange,
  onOpen,
}: {
  bus: AudioBus;
  devices: AudioDevice[];
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  engineRunning: boolean;
  pending: boolean;
  onGainCommit: (gain: number) => void;
  onEnabledChange: (enabled: boolean) => void;
  onDeviceChange: (deviceId: string) => void;
  onOpen: () => void;
}) {
  const direction: AudioDeviceDirection = bus.id === 'mic' ? 'input' : 'output';
  const channelActive = bus.enabled && !bus.muted;
  const assignment = bus.id === 'mic'
    ? 'Input path'
    : bus.appCount === 0 ? 'No routed applications' : `${bus.appCount} ${bus.appCount === 1 ? 'application' : 'applications'}`;

  return (
    <article className={cn('relative flex min-w-0 flex-col bg-card px-4 pb-3 pt-4', !channelActive && 'bg-background')}>
      <header className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className={cn('mt-0.5 size-4 shrink-0', channelActive ? 'text-foreground/85' : 'text-muted-foreground/45')} aria-hidden={true} />
          <div className="min-w-0">
            <h3 className="m-0 truncate text-[12px] font-semibold text-foreground">{bus.label}</h3>
            <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full bg-[#4e5560]', channelActive && engineRunning && 'bg-success')} aria-hidden="true" />
              <span className="truncate">{channelActive ? assignment : 'Muted'}</span>
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
              className={cn('size-7 shrink-0', !channelActive && 'bg-primary/10 text-primary hover:bg-primary/15')}
            >
              {channelActive ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{channelActive ? 'Mute channel' : 'Unmute channel'}</TooltipContent>
        </Tooltip>
      </header>

      <div className={cn('mt-4 flex h-[clamp(270px,40vh,390px)] min-h-[270px] items-stretch justify-center gap-3', !channelActive && 'opacity-55')}>
        <LevelMeter busId={bus.id} active={engineRunning && channelActive} label={bus.label} />
        <MixerFader value={bus.gain} disabled={!bus.enabled || pending} label={bus.label} onCommit={onGainCommit} />
      </div>

      <div className="mt-3 border-y border-border py-1">
        <AudioDevicePicker
          value={bus.deviceId}
          devices={devices}
          direction={direction}
          label={`${bus.label} ${direction} device`}
          disabled={pending}
          onChange={onDeviceChange}
        />
      </div>

      <footer className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-[8px] text-muted-foreground" title={bus.endpoint}>{bus.endpoint}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Open ${bus.label} processing`} onClick={onOpen}>
              <Route className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open processing page</TooltipContent>
        </Tooltip>
      </footer>
    </article>
  );
});
