import { memo, type ComponentType, type CSSProperties } from 'react';
import { AppWindow, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import type { AudioApplication, AudioBus, AudioDevice, AudioDeviceDirection } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { AudioDevicePicker } from './AudioDevicePicker';
import { channelColor } from './channel-identity';
import { LevelMeter } from './LevelMeter';
import { MixerFader } from './MixerFader';

export const MixerChannelStrip = memo(function MixerChannelStrip({
  bus,
  devices,
  icon: Icon,
  engineRunning,
  pending,
  presetName,
  applications,
  routingAvailable,
  onGainCommit,
  onEnabledChange,
  onDeviceChange,
  onOpen,
}: {
  bus: AudioBus;
  devices: AudioDevice[];
  icon: ComponentType<{ className?: string; style?: CSSProperties; 'aria-hidden'?: boolean }>;
  engineRunning: boolean;
  pending: boolean;
  presetName: string | null;
  applications: AudioApplication[];
  routingAvailable: boolean;
  onGainCommit: (gain: number) => void;
  onEnabledChange: (enabled: boolean) => void;
  onDeviceChange: (deviceId: string) => void;
  onOpen: () => void;
}) {
  const direction: AudioDeviceDirection = bus.id === 'mic' ? 'input' : 'output';
  const channelActive = bus.enabled && !bus.muted;
  const color = channelColor(bus.id);
  const settingsLabel = bus.id === 'mic' ? 'Voice settings' : 'Sound settings';

  return (
    <article className={cn('mixer-channel', !channelActive && 'is-muted')} style={{ '--channel-accent': color } as CSSProperties}>
      <header className="mixer-channel__header">
        <div className="mixer-channel__title">
          <Icon className={cn('mixer-channel__icon', !channelActive && 'mixer-channel__icon--muted')} style={channelActive ? { color } : undefined} aria-hidden={true} />
          <h3>{bus.label}</h3>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mixer-channel__settings"
              aria-label={`Open ${bus.label} ${settingsLabel.toLowerCase()}`}
              onClick={onOpen}
            >
              <SlidersHorizontal className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{settingsLabel}</TooltipContent>
        </Tooltip>
      </header>

      <div className="mixer-channel__meta">
        <button
          type="button"
          className="mixer-channel__meta-row mixer-channel__meta-row--link"
          aria-label={`Open ${bus.label} preset and ${settingsLabel.toLowerCase()}`}
          onClick={onOpen}
        >
          <span>Preset</span>
          <strong>{presetName ?? 'Custom'}</strong>
        </button>
        <div className="mixer-channel__meta-row">
          <span>{direction === 'input' ? 'Input' : 'Output'}</span>
          <AudioDevicePicker
            value={bus.deviceId}
            devices={devices}
            direction={direction}
            label={`${bus.label} ${direction} device`}
            disabled={pending}
            onChange={onDeviceChange}
          />
        </div>
      </div>

      <div className={cn('mixer-channel__fader', !channelActive && 'is-dimmed')}>
        <LevelMeter busId={bus.id} active={engineRunning && channelActive} label={bus.label} accentColor={color} />
        <MixerFader value={bus.gain} disabled={!bus.enabled || pending} label={bus.label} accentColor={color} onCommit={onGainCommit} />
      </div>

      <div className="mixer-channel__mute">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`${channelActive ? 'Mute' : 'Unmute'} ${bus.label}`}
              aria-pressed={!channelActive}
              onClick={() => onEnabledChange(!bus.enabled)}
              className={cn('mixer-channel__mute-button', !channelActive && 'is-active')}
            >
              {channelActive ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{channelActive ? 'Mute channel' : 'Unmute channel'}</TooltipContent>
        </Tooltip>
      </div>

      {bus.id !== 'mic' && routingAvailable ? (
        <div className="mixer-channel__apps">
          <span>Apps</span>
          {applications.length === 0 ? (
            <p>No apps playing here</p>
          ) : (
            <ul>
              {applications.map((application) => (
                <li key={application.id} className={cn(!application.active && 'is-inactive')}>
                  {application.iconDataUrl ? (
                    <img src={application.iconDataUrl} alt="" className="size-3.5 object-contain" />
                  ) : (
                    <AppWindow className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="truncate">{application.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
});
