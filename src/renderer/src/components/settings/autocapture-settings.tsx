import { ChevronDown, FlaskConical, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AutoCaptureGameSettings, AutoCaptureProvider, GameEventType, SystemSnapshot } from '../../../../shared/contracts';
import {
  defaultAutoCaptureEventEnabled,
  gameEventTypeLabel,
  providerCapabilitySummary,
} from '../../../../shared/auto-capture';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSystemStore } from '@/stores/use-system-store';
import { SettingSection, SettingSelect, SettingSwitch } from './settings-primitives';

const preRollOptions = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const postRollOptions = [0, 5, 10, 15, 20, 30, 45, 60];
const mergeOptions = [0, 5, 10, 15, 20, 30, 45, 60];

export function AutoCaptureSettings({ snapshot }: { snapshot: SystemSnapshot }) {
  const update = useSystemStore((state) => state.updateAutoCaptureSettings);
  const setupProvider = useSystemStore((state) => state.setupAutoCaptureProvider);
  const emitTestEvent = useSystemStore((state) => state.emitAutoCaptureTestEvent);
  const autoCapture = snapshot.capture.autoCapture;
  const settings = autoCapture.settings;
  const timingExceedsBuffer = settings.preRollSeconds + settings.postRollSeconds > snapshot.capture.config.replaySeconds;

  return (
    <div className="settings-autocapture">
      <SettingSection title="Auto Capture">
        <SettingSwitch
          settingId="autocapture.enabled"
          title="Automatically save gameplay highlights"
          description={snapshot.capture.config.enabled
            ? autoCaptureStateDescription(autoCapture.runtime.state, autoCapture.runtime.pendingCapture?.eventCount)
            : 'Auto Capture is ready to configure, but Instant Replay must be enabled before events can preserve footage.'}
          checked={settings.enabled}
          onCheckedChange={(enabled) => void update({ enabled })}
        />
        <SettingSelect
          settingId="autocapture.preRoll"
          title="Before event"
          description={timingExceedsBuffer
            ? `The ${snapshot.capture.config.replaySeconds}-second replay buffer limits the combined event window; Switchboard will preserve post-roll first and use the remaining history.`
            : 'Footage retained before the first event marker.'}
          value={String(settings.preRollSeconds)}
          options={secondsOptions(preRollOptions)}
          disabled={!settings.enabled}
          onValueChange={(value) => void update({ preRollSeconds: Number(value) })}
        />
        <SettingSelect
          settingId="autocapture.postRoll"
          title="After event"
          description="Switchboard waits for this footage without blocking Capture or starting another recorder."
          value={String(settings.postRollSeconds)}
          options={secondsOptions(postRollOptions)}
          disabled={!settings.enabled}
          onValueChange={(value) => void update({ postRollSeconds: Number(value) })}
        />
        <SettingSwitch
          settingId="autocapture.merge"
          title="Merge nearby events"
          description="Overlapping highlights become one clip with every event retained as a timeline marker."
          checked={settings.mergeNearbyEvents}
          disabled={!settings.enabled}
          onCheckedChange={(mergeNearbyEvents) => void update({ mergeNearbyEvents })}
        />
        <SettingSelect
          settingId="autocapture.mergeThreshold"
          title="Merge threshold"
          description="An event inside this gap extends the pending highlight instead of creating a duplicate clip."
          value={String(settings.mergeThresholdSeconds)}
          options={secondsOptions(mergeOptions)}
          disabled={!settings.enabled || !settings.mergeNearbyEvents}
          onValueChange={(value) => void update({ mergeThresholdSeconds: Number(value) })}
        />
        <SettingSwitch
          settingId="autocapture.notify"
          title="Notify when an auto clip is saved"
          description="Off by default so frequent gameplay events do not interrupt play."
          checked={settings.notifyWhenSaved}
          disabled={!settings.enabled}
          onCheckedChange={(notifyWhenSaved) => void update({ notifyWhenSaved })}
        />
      </SettingSection>

      <SettingSection title="Supported games">
        {autoCapture.providers.map((provider) => (
          <ProviderSettings
            key={provider.id}
            provider={provider}
            snapshot={snapshot}
            onUpdate={(patch) => void update({ games: { [provider.gameId]: patch } })}
            onSetup={() => void setupProvider(provider.id)}
            onEmit={(type) => void emitTestEvent({ type: type as 'kill' | 'headshot' | 'multi_kill' | 'death' | 'round_win' | 'match_win' })}
          />
        ))}
      </SettingSection>
    </div>
  );
}

function ProviderSettings({ provider, snapshot, onUpdate, onSetup, onEmit }: {
  provider: AutoCaptureProvider;
  snapshot: SystemSnapshot;
  onUpdate: (patch: Partial<AutoCaptureGameSettings>) => void;
  onSetup: () => void;
  onEmit: (type: GameEventType) => void;
}) {
  const settings = snapshot.capture.autoCapture.settings;
  const game = settings.games[provider.gameId] ?? { enabled: true, useGlobalTiming: true, events: {} };
  const usable = provider.availability.state !== 'unavailable';
  const active = settings.enabled && game.enabled && provider.status.state === 'listening';
  const [open, setOpen] = useState(false);

  return (
    <div className="autocapture-provider" data-state={active ? 'active' : provider.availability.state} data-open={open}>
      <div className="autocapture-provider__header">
        <button
          type="button"
          className="autocapture-provider__summary"
          aria-expanded={open}
          aria-controls={`autocapture-provider-${provider.id}`}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="autocapture-provider__identity" aria-hidden>
            {provider.developmentOnly ? <FlaskConical /> : <ShieldCheck />}
          </span>
          <span className="autocapture-provider__copy">
            <strong>{provider.displayName}</strong>
            <span>{providerCapabilitySummary(provider)}</span>
            <small>{providerStatusLabel(provider, active)}</small>
          </span>
          <ChevronDown className="autocapture-provider__chevron" aria-hidden />
        </button>
        <Switch
          className="autocapture-provider__toggle"
          checked={game.enabled}
          disabled={!usable || !settings.enabled}
          onCheckedChange={(enabled) => onUpdate({ enabled })}
          aria-label={`Auto Capture for ${provider.displayName}`}
        />
      </div>

      {open ? <div className="autocapture-provider__details" id={`autocapture-provider-${provider.id}`}>
        {provider.availability.state === 'setup-required' ? (
          <div className="autocapture-provider__setup">
            <p>{provider.availability.reason}</p>
            <Button type="button" size="sm" variant="secondary" onClick={onSetup}>Install local integration</Button>
          </div>
        ) : null}

        {provider.requiresPlayerName ? (
          <ProviderPlayerName
            provider={provider}
            value={game.playerName ?? ''}
            onCommit={(playerName) => onUpdate({ playerName: playerName || undefined })}
          />
        ) : null}

        <fieldset disabled={!settings.enabled || !game.enabled || !usable}>
          <legend>Capture events</legend>
          <div className="autocapture-events-grid">
            {provider.capabilities.events.map((type) => {
              const checked = game.events[type] ?? defaultAutoCaptureEventEnabled(type);
              return (
                <label key={type}>
                  <span>{gameEventTypeLabel(type)}</span>
                  <Switch
                    checked={checked}
                    onCheckedChange={(enabled) => onUpdate({ events: { ...game.events, [type]: enabled } })}
                    aria-label={`${gameEventTypeLabel(type)} for ${provider.displayName}`}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="autocapture-provider__timing">
          <label>
            <span>Use global timing</span>
            <Switch checked={game.useGlobalTiming} disabled={!settings.enabled || !game.enabled} onCheckedChange={(useGlobalTiming) => onUpdate({ useGlobalTiming })} aria-label={`Use global timing for ${provider.displayName}`} />
          </label>
          {!game.useGlobalTiming ? (
            <div>
              <CompactSecondsSelect label="Before event" value={game.preRollSeconds ?? settings.preRollSeconds} options={preRollOptions} onChange={(preRollSeconds) => onUpdate({ preRollSeconds })} />
              <CompactSecondsSelect label="After event" value={game.postRollSeconds ?? settings.postRollSeconds} options={postRollOptions} onChange={(postRollSeconds) => onUpdate({ postRollSeconds })} />
            </div>
          ) : null}
        </div>

        {provider.developmentOnly ? (
          <div className="autocapture-test-events">
            <div><strong>Pipeline test events</strong><span>Uses the real replay preservation path.</span></div>
            <div>
              {([
                ['kill', 'Kill'], ['headshot', 'Headshot'], ['death', 'Death'], ['multi_kill', 'Double Kill'], ['round_win', 'Round Win'], ['match_win', 'Match Win'],
              ] as const).map(([type, label]) => (
                <Button key={type} type="button" size="sm" variant="ghost" disabled={!snapshot.capture.config.enabled || !settings.enabled} onClick={() => onEmit(type)}>{label}</Button>
              ))}
            </div>
          </div>
        ) : null}
      </div> : null}
    </div>
  );
}

function ProviderPlayerName({ provider, value, onCommit }: {
  provider: AutoCaptureProvider;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const descriptionId = `autocapture-provider-${provider.id}-player-name-description`;
  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  return (
    <label className="autocapture-provider__configuration">
      <span>
        <strong>Player nickname</strong>
        <small id={descriptionId}>Used only on this PC to match your own events in {provider.displayName}’s local battle feed.</small>
      </span>
      <Input
        value={draft}
        maxLength={64}
        autoComplete="off"
        spellCheck={false}
        placeholder="Exact in-game nickname"
        aria-label={`${provider.displayName} player nickname`}
        aria-describedby={descriptionId}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function CompactSecondsSelect({ label, value, options, onChange }: { label: string; value: number; options: readonly number[]; onChange: (value: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{secondsOptions(options).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}

function secondsOptions(values: readonly number[]) {
  return values.map((value) => ({ value: String(value), label: `${value} sec` }));
}

function autoCaptureStateDescription(state: SystemSnapshot['capture']['autoCapture']['runtime']['state'], eventCount = 0): string {
  if (state === 'pending') return `Waiting for post-roll · ${eventCount} ${eventCount === 1 ? 'event' : 'events'} in the pending highlight.`;
  if (state === 'saving') return 'Preserving the completed event window from the existing replay buffer.';
  if (state === 'listening') return 'The active game provider is listening for supported gameplay events.';
  if (state === 'degraded') return 'The active provider needs attention. Manual replay capture remains available.';
  return 'Supported game providers start only while Auto Capture and Instant Replay are enabled.';
}

function providerStatusLabel(provider: AutoCaptureProvider, active: boolean): string {
  if (active) return 'Listening now';
  if (provider.availability.state === 'setup-required') return 'Local setup required';
  if (provider.availability.state === 'unavailable') return provider.availability.reason ?? 'Unavailable';
  if (provider.status.state === 'degraded' || provider.status.state === 'error') return provider.status.message ?? 'Needs attention';
  return provider.supportLevel === 'experimental' ? 'Experimental provider' : 'Supported provider';
}
