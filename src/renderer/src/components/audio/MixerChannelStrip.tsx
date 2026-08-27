import { memo, type ComponentType, type CSSProperties } from 'react';
import { Power, PowerOff, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import type { AudioApplication, AudioBus, AudioDevice, AudioDeviceDirection, AudioMixBus, AudioMixId, AudioSupportLevel } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { AudioDevicePicker } from './AudioDevicePicker';
import { channelColor } from './channel-identity';
import { LevelMeter } from './LevelMeter';
import { MixerApplications } from './MixerApplications';
import { MixerFader } from './MixerFader';

export const MixerChannelStrip = memo(function MixerChannelStrip({
  bus,
  control,
  mixId,
  devices,
  icon: Icon,
  engineRunning,
  pending,
  presetName,
  applications,
  routingSupport,
  routingUnavailableReason,
  onGainCommit,
  onEnabledChange,
  onChannelEnabledChange,
  onDeviceChange,
  onApplicationRoute,
  onOpen,
}: {
  bus: AudioBus;
  control: AudioMixBus;
  mixId: AudioMixId;
  devices: AudioDevice[];
  icon: ComponentType<{ className?: string; style?: CSSProperties; 'aria-hidden'?: boolean }>;
  engineRunning: boolean;
  pending: boolean;
  presetName: string | null;
  applications: AudioApplication[];
  routingSupport: AudioSupportLevel;
  routingUnavailableReason?: string | null;
  onGainCommit: (gain: number) => void;
  onEnabledChange: (enabled: boolean) => void;
  onChannelEnabledChange: (enabled: boolean) => void;
  onDeviceChange: (deviceId: string) => void;
  onApplicationRoute: (applicationId: string, destination: AudioApplication['destination']) => void;
  onOpen: () => void;
}) {
  const direction: AudioDeviceDirection = bus.id === 'mic' ? 'input' : 'output';
  const mixActive = control.enabled;
  const color = channelColor(bus.id);
  const settingsLabel = bus.id === 'mic' ? 'Voice settings' : 'Sound settings';

  if (!bus.enabled) {
    return (
      <article
        className="mixer-channel mixer-channel--disabled"
        style={{ '--channel-accent': color } as CSSProperties}
        aria-label={`${bus.label} channel disabled`}
      >
        <div className="mixer-channel__disabled-state">
          <Icon className="mixer-channel__disabled-icon" style={{ color }} aria-hidden={true} />
          <div className="mixer-channel__disabled-copy">
            <strong>{bus.label}</strong>
            <span>Channel disabled</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => onChannelEnabledChange(true)}
            aria-label={`Enable ${bus.label} channel`}
          >
            <Power className="size-3.5" aria-hidden="true" />
            Enable channel
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article className={cn('mixer-channel', !mixActive && 'is-muted')} style={{ '--channel-accent': color } as CSSProperties}>
      <header className="mixer-channel__header">
        <div className="mixer-channel__title">
          <Icon className={cn('mixer-channel__icon', !mixActive && 'mixer-channel__icon--muted')} style={mixActive ? { color } : undefined} aria-hidden={true} />
          <h3>{bus.label}</h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mixer-channel__settings"
              aria-label={`Open ${bus.label} channel menu`}
              title="Channel menu"
              disabled={pending}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="mixer-channel__menu">
            <DropdownMenuItem disabled={bus.id === 'aux'} onSelect={onOpen}>
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              {settingsLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="mixer-channel__disable-action"
              onSelect={() => onChannelEnabledChange(false)}
            >
              <PowerOff className="size-3.5" aria-hidden="true" />
              Disable channel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          <span>{direction === 'input' ? 'Input' : 'Personal output'}</span>
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

      <div className={cn('mixer-channel__fader', !mixActive && 'is-dimmed')}>
        <LevelMeter busId={bus.id} active={engineRunning && mixActive} label={bus.label} accentColor={color} />
        <MixerFader value={control.gain} disabled={!control.enabled || pending} label={`${bus.label} in ${mixId} mix`} accentColor={color} onCommit={onGainCommit} />
      </div>

      <div className="mixer-channel__mute">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`${mixActive ? 'Mute' : 'Unmute'} ${bus.label}`}
              aria-pressed={!mixActive}
              onClick={() => onEnabledChange(!control.enabled)}
              className={cn('mixer-channel__mute-button', !mixActive && 'is-active')}
            >
              {mixActive ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{mixActive ? 'Mute channel' : 'Unmute channel'}</TooltipContent>
        </Tooltip>
      </div>

      {bus.id === 'game' || bus.id === 'chat' || bus.id === 'media' ? (
        <MixerApplications
          channelLabel={bus.label}
          applications={applications}
          routingSupport={routingSupport}
          unavailableReason={routingUnavailableReason}
          pending={pending}
          onApplicationRoute={onApplicationRoute}
        />
      ) : null}
    </article>
  );
});
