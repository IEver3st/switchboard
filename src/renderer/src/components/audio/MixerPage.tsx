import { useState } from 'react';
import { AppWindow } from 'lucide-react';
import type { AudioBus, AudioMixId, AudioPathId, SystemSnapshot } from '../../../../shared/contracts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { AudioWorkspaceTab } from './AudioTabs';
import { AudioWorkbenchHeader } from './AudioWorkbenchHeader';
import { ChatMixSlider } from './ChatMixSlider';
import { channelIcons, mixerChannelOrder, type MixerChannelId } from './channel-identity';
import { MixerChannelStrip } from './MixerChannelStrip';
import { MixerMasterStrip } from './MixerMasterStrip';
import { useSystemStore } from '@/stores/use-system-store';

export function MixerPage({ snapshot, onNavigate }: { snapshot: SystemSnapshot; onNavigate: (tab: AudioWorkspaceTab) => void }) {
  const [selectedMixId, setSelectedMixId] = useState<AudioMixId>('personal');
  const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
  const setAudioBusEnabled = useSystemStore((state) => state.setAudioBusEnabled);
  const setAudioMasterGain = useSystemStore((state) => state.setAudioMasterGain);
  const setAudioMasterEnabled = useSystemStore((state) => state.setAudioMasterEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setAudioApplicationRoute = useSystemStore((state) => state.setAudioApplicationRoute);
  const setChatMix = useSystemStore((state) => state.setChatMix);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';
  const buses = mixerChannelOrder
    .map((id) => snapshot.audio.buses.find((bus) => bus.id === id))
    .filter((bus): bus is AudioBus => Boolean(bus));
  const selectedMix = snapshot.audio.mixes.find((mix) => mix.id === selectedMixId) ?? snapshot.audio.mixes[0]!;
  const personalMix = snapshot.audio.mixes.find((mix) => mix.id === 'personal');
  const gameEnabled = personalMix?.buses.find((bus) => bus.id === 'game')?.enabled ?? false;
  const chatEnabled = personalMix?.buses.find((bus) => bus.id === 'chat')?.enabled ?? false;
  const routingAvailable = snapshot.audio.capabilities.applicationRouting !== 'unavailable';
  const routingMessage = snapshot.audio.host?.driver.state !== 'ready'
    ? snapshot.audio.host?.driver.message
    : snapshot.audio.host?.error;

  const presetNameFor = (channel: MixerChannelId): string | null => {
    if (channel === 'aux') return null;
    const presetKind: AudioPathId = channel === 'mic' ? 'microphone' : channel;
    const activeId = snapshot.audio.activePresetIds[presetKind];
    return snapshot.audio.pathPresets.find((preset) => preset.id === activeId)?.name ?? null;
  };

  return (
    <div className="mixer-workbench">
      <AudioWorkbenchHeader
        title="Mixer"
        subtitle={engineRunning
          ? 'Channel levels, output devices, and ChatMix.'
          : 'Channel levels, output devices, and ChatMix. The audio engine is not running.'}
        tools={snapshot.audio.capabilities.realtimeMetering === 'simulation'
          ? <p className="mixer-workbench__note" role="status">Live levels are unavailable on this setup.</p>
          : undefined}
      />

      <div className="mixer-destination" aria-label="Mixer destination">
        <div>
          <span>Destination mix</span>
          <p>{selectedMixId === 'personal'
            ? 'Physical listening output and processed virtual microphone.'
            : selectedMixId === 'stream'
              ? 'Broadcast transport exposed through Switchboard Stream.'
              : 'Replay track delivered directly to Capture.Host.'}</p>
        </div>
        <ToggleGroup
          type="single"
          value={selectedMixId}
          onValueChange={(value) => value && setSelectedMixId(value as AudioMixId)}
          aria-label="Select mixer destination"
        >
          {snapshot.audio.mixes.map((mix) => (
            <ToggleGroupItem key={mix.id} value={mix.id} aria-label={`${mix.label} mix`}>{mix.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mixer-grid" data-testid="mixer-grid">
        <MixerMasterStrip
          master={selectedMix.master}
          mixLabel={selectedMix.label}
          pending={false}
          onGainCommit={(gain) => void setAudioMasterGain({ mixId: selectedMix.id, gain })}
          onEnabledChange={(enabled) => void setAudioMasterEnabled({ mixId: selectedMix.id, enabled })}
        />
        {buses.map((bus) => {
          const channel = bus.id as MixerChannelId;
          const control = selectedMix.buses.find((candidate) => candidate.id === bus.id);
          if (!control) return null;
          return (
            <MixerChannelStrip
              key={bus.id}
              bus={bus}
              control={control}
              mixId={selectedMix.id}
              devices={snapshot.audio.devices}
              icon={channelIcons[channel]}
              engineRunning={engineRunning}
              pending={false}
              presetName={presetNameFor(channel)}
              applications={snapshot.audio.applications.filter((application) => application.destination === bus.id)}
              routingAvailable={routingAvailable}
              onGainCommit={(gain) => void setAudioBusGain({ mixId: selectedMix.id, busId: bus.id, gain })}
              onEnabledChange={(enabled) => void setAudioBusEnabled({ mixId: selectedMix.id, busId: bus.id, enabled })}
              onDeviceChange={(deviceId) => void setAudioBusDevice({ busId: bus.id, deviceId })}
              onApplicationRoute={(applicationId, destination) => void setAudioApplicationRoute({ applicationId, destination })}
              onOpen={() => bus.id !== 'aux' && onNavigate(bus.id === 'mic' ? 'microphone' : (bus.id as AudioWorkspaceTab))}
            />
          );
        })}
      </div>

      <ChatMixSlider
        value={snapshot.audio.chatMix}
        disabled={!gameEnabled || !chatEnabled}
        pending={false}
        onCommit={(value) => void setChatMix(value)}
      />

      {!routingAvailable ? (
        <p className="mixer-workbench__routing-note" role="status">
          <AppWindow className="size-3.5" aria-hidden="true" />
          {routingMessage ?? 'Application routing is not available on this setup yet.'}
        </p>
      ) : null}
    </div>
  );
}
