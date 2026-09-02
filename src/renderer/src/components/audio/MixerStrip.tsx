import { memo, type CSSProperties } from 'react';
import { AppWindow, Gamepad2, MessageCircle, Mic2, MoreHorizontal, Music2, Power, SlidersHorizontal, SlidersVertical, Volume2, VolumeX } from 'lucide-react';
import type { AudioApplication, AudioBus, AudioDevice, AudioMixBus, AudioMixId, AudioMaster, AudioSupportLevel } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { AudioDevicePicker } from './AudioDevicePicker';
import { channelColor } from './channel-identity';
import { LevelMeter } from './LevelMeter';
import { MixerApplications } from './MixerApplications';
import { MixerFader } from './MixerFader';

type CommonProps = {
  mixId: AudioMixId;
  devices: AudioDevice[];
  engineRunning: boolean;
  pending: boolean;
  applications?: AudioApplication[];
  routingSupport?: AudioSupportLevel;
  routingUnavailableReason?: string | null;
  onApplicationRoute?: (applicationId: string, destination: AudioApplication['destination']) => void;
  onGainCommit: (gain: number) => void;
  onEnabledChange: (enabled: boolean) => void;
};

type MasterProps = CommonProps & {
  master: true;
  masterState: AudioMaster;
  mixLabel: string;
  bus?: never;
  control?: never;
  onChannelEnabledChange?: never;
  onDeviceChange?: never;
  onOpen?: never;
  presetName?: never;
};

type BusProps = CommonProps & {
  master?: false;
  bus: AudioBus;
  control: AudioMixBus;
  presetName: string | null;
  onChannelEnabledChange: (enabled: boolean) => void;
  onDeviceChange: (deviceId: string) => void;
  onOpen: () => void;
};

export const MixerStrip = memo(function MixerStrip(props: MasterProps | BusProps) {
  if (props.master) return <MasterStrip {...props} />;
  return <BusStrip {...props} />;
});

function MasterStrip({
  masterState,
  mixLabel,
  pending,
  onGainCommit,
  onEnabledChange,
}: MasterProps) {
  const muted = !masterState.enabled;
  return (
    <article
      className={cn('audio-strip audio-strip--master mixer-channel--master', muted && 'is-muted')}
      style={{ '--channel-color': 'var(--accent-brand)' } as CSSProperties}
    >
      <header className="audio-strip__head">
        <div className="audio-strip__identity">
          <SlidersVertical aria-hidden="true" />
          <h3>Master</h3>
        </div>
      </header>
      <div className="audio-strip__sub"><span>{mixLabel} mix</span></div>
      <div className="audio-strip__sub" aria-hidden="true" />
      <div className="audio-strip__body">
        <div className="audio-strip__meter audio-strip__meter--empty" aria-hidden="true" />
        <div className="audio-strip__fader">
          <MixerFader
            value={masterState.gain}
            disabled={!masterState.enabled || pending}
            label={`${mixLabel} master`}
            accentColor="var(--accent-brand)"
            onCommit={onGainCommit}
          />
        </div>
      </div>
      <div className="audio-strip__foot">
        <MuteButton
          label={muted ? 'Unmute master output' : 'Mute master output'}
          muted={muted}
          disabled={pending}
          onClick={() => onEnabledChange(!masterState.enabled)}
        />
      </div>
    </article>
  );
}

function BusStrip({
  bus,
  control,
  mixId,
  devices,
  engineRunning,
  pending,
  presetName,
  applications = [],
  routingSupport = 'unavailable',
  routingUnavailableReason,
  onGainCommit,
  onEnabledChange,
  onChannelEnabledChange,
  onDeviceChange,
  onApplicationRoute,
  onOpen,
}: BusProps) {
  const direction = bus.id === 'mic' ? 'input' : 'output';
  const muted = !control.enabled;
  const color = channelColor(bus.id);
  const Icon = bus.id === 'game' ? Gamepad2 : bus.id === 'chat' ? MessageCircle : bus.id === 'media' ? Music2 : bus.id === 'mic' ? Mic2 : AppWindow;
  const settingsLabel = bus.id === 'mic' ? 'Voice settings' : 'Sound settings';
  const hasSettings = bus.id !== 'aux';
  const shortLabel = bus.id === 'mic' ? 'Mic' : bus.label;
  const canShowApps = bus.id === 'game' || bus.id === 'chat' || bus.id === 'media';

  if (!bus.enabled) {
    return (
      <article
        className="audio-strip audio-strip--disabled mixer-channel mixer-channel--disabled"
        style={{ '--channel-color': color } as CSSProperties}
        aria-label={`${bus.label} channel disabled`}
      >
        <div className="audio-strip__disabled">
          <Icon aria-hidden="true" />
          <strong>{bus.label}</strong>
          <span>Off</span>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onChannelEnabledChange(true)} aria-label={`Enable ${bus.label} channel`}>
            <Power className="size-3.5" aria-hidden="true" /> Turn on
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn('audio-strip mixer-channel', muted && 'is-muted')}
      style={{ '--channel-color': color } as CSSProperties}
      aria-busy={pending || undefined}
    >
      <header className="audio-strip__head">
        {hasSettings ? (
          <button type="button" className="audio-strip__identity audio-strip__identity--button" onClick={onOpen} aria-label={`Open ${bus.label} settings`}>
            <Icon aria-hidden="true" />
            <h3>{shortLabel}</h3>
          </button>
        ) : (
          <div className="audio-strip__identity">
            <Icon aria-hidden="true" />
            <h3>{shortLabel}</h3>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="audio-strip__menu" aria-label={`Open ${bus.label} channel menu`} disabled={pending}>
              <MoreHorizontal className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasSettings ? (
              <>
                <DropdownMenuItem onSelect={onOpen}><SlidersHorizontal className="size-3.5" />{settingsLabel}</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onSelect={() => onChannelEnabledChange(false)}><Power className="size-3.5" />Turn channel off</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {hasSettings ? (
        <button type="button" className="audio-strip__sub audio-strip__sub--link" onClick={onOpen} aria-label={`Open ${bus.label} preset and ${settingsLabel.toLowerCase()}`}>
          <span>{presetName ?? 'Flat'}</span>
        </button>
      ) : (
        <div className="audio-strip__sub"><span>Line input</span></div>
      )}
      <div className="audio-strip__sub audio-strip__sub--picker">
        <AudioDevicePicker
          value={bus.deviceId}
          devices={devices}
          direction={direction}
          label={`${bus.label} ${direction} device`}
          disabled={pending}
          onChange={onDeviceChange}
        />
      </div>
      <div className="audio-strip__body">
        <div className="audio-strip__meter">
          <LevelMeter busId={bus.id} active={engineRunning && !muted} label={bus.label} accentColor={color} />
        </div>
        <div className="audio-strip__fader">
          <MixerFader value={control.gain} disabled={muted || pending} label={`${bus.label} in ${mixId} mix`} accentColor={color} onCommit={onGainCommit} />
        </div>
      </div>
      <div className="audio-strip__foot">
        <MuteButton
          label={`${muted ? 'Unmute' : 'Mute'} ${bus.label}`}
          muted={muted}
          disabled={pending}
          onClick={() => onEnabledChange(!control.enabled)}
        />
        {canShowApps && routingSupport !== 'unavailable' ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="audio-strip__apps" aria-label={`Show ${bus.label} applications`}>
                {applications.length} {applications.length === 1 ? 'app' : 'apps'}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="audio-strip__apps-popover">
              <MixerApplications
                channelLabel={bus.label}
                applications={applications}
                routingSupport={routingSupport}
                unavailableReason={routingUnavailableReason}
                pending={pending}
                onApplicationRoute={onApplicationRoute ?? (() => undefined)}
              />
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </article>
  );
}

function MuteButton({ label, muted, disabled, onClick }: { label: string; muted: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn('audio-strip__button', muted && 'is-muted')} disabled={disabled} aria-label={label} aria-pressed={muted} onClick={onClick}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
