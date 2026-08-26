import { AppWindow } from 'lucide-react';
import type { AudioBus, AudioPathId, SystemSnapshot } from '../../../../shared/contracts';
import type { AudioWorkspaceTab } from './AudioTabs';
import { ChatMixSlider } from './ChatMixSlider';
import { channelIcons, mixerChannelOrder, type MixerChannelId } from './channel-identity';
import { MixerChannelStrip } from './MixerChannelStrip';
import { useSystemStore } from '@/stores/use-system-store';

export function MixerPage({ snapshot, onNavigate }: { snapshot: SystemSnapshot; onNavigate: (tab: AudioWorkspaceTab) => void }) {
  const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
  const setAudioBusEnabled = useSystemStore((state) => state.setAudioBusEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setChatMix = useSystemStore((state) => state.setChatMix);
  const actionPending = useSystemStore((state) => state.actionPending);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';
  const buses = mixerChannelOrder
    .map((id) => snapshot.audio.buses.find((bus) => bus.id === id))
    .filter((bus): bus is AudioBus => Boolean(bus));
  const gameEnabled = buses.find((bus) => bus.id === 'game')?.enabled ?? false;
  const chatEnabled = buses.find((bus) => bus.id === 'chat')?.enabled ?? false;
  const routingAvailable = snapshot.audio.capabilities.applicationRouting !== 'unavailable';

  const presetNameFor = (channel: MixerChannelId): string | null => {
    const presetKind: AudioPathId = channel === 'mic' ? 'microphone' : channel;
    const activeId = snapshot.audio.activePresetIds[presetKind];
    return snapshot.audio.pathPresets.find((preset) => preset.id === activeId)?.name ?? null;
  };

  return (
    <div className="mixer-workbench">
      {snapshot.audio.capabilities.realtimeMetering === 'simulation' ? (
        <p className="mixer-workbench__note" role="status">Live levels are unavailable on this setup.</p>
      ) : null}

      <div className="mixer-grid" data-testid="mixer-grid">
        {buses.map((bus) => {
          const channel = bus.id as MixerChannelId;
          return (
            <MixerChannelStrip
              key={bus.id}
              bus={bus}
              devices={snapshot.audio.devices}
              icon={channelIcons[channel]}
              engineRunning={engineRunning}
              pending={actionPending?.startsWith(`audio:${bus.id}`) ?? false}
              presetName={presetNameFor(channel)}
              applications={snapshot.audio.applications.filter((application) => application.destination === bus.id)}
              routingAvailable={routingAvailable}
              onGainCommit={(gain) => void setAudioBusGain({ busId: bus.id, gain })}
              onEnabledChange={(enabled) => void setAudioBusEnabled({ busId: bus.id, enabled })}
              onDeviceChange={(deviceId) => void setAudioBusDevice({ busId: bus.id, deviceId })}
              onOpen={() => onNavigate(bus.id === 'mic' ? 'microphone' : (bus.id as AudioWorkspaceTab))}
            />
          );
        })}
      </div>

      <ChatMixSlider
        value={snapshot.audio.chatMix}
        disabled={!gameEnabled || !chatEnabled}
        pending={actionPending === 'audio:chatmix'}
        onCommit={(value) => void setChatMix(value)}
      />

      {!routingAvailable ? (
        <p className="mixer-workbench__routing-note" role="status">
          <AppWindow className="size-3.5" aria-hidden="true" />
          Application routing is not available on this setup yet.
        </p>
      ) : null}
    </div>
  );
}
