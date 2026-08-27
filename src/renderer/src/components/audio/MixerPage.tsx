import type { AudioBus, AudioMixId, AudioPathId, SystemSnapshot } from '../../../../shared/contracts';
import type { AudioWorkspaceTab } from './AudioTabs';
import { ChatMixSlider } from './ChatMixSlider';
import { channelIcons, mixerChannelOrder, type MixerChannelId } from './channel-identity';
import { MixerChannelStrip } from './MixerChannelStrip';
import { MixerMasterStrip } from './MixerMasterStrip';
import { useSystemStore } from '@/stores/use-system-store';

export function MixerPage({ snapshot, selectedMixId, onNavigate }: { snapshot: SystemSnapshot; selectedMixId: AudioMixId; onNavigate: (tab: AudioWorkspaceTab) => void }) {
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

  const presetNameFor = (channel: MixerChannelId): string | null => {
    if (channel === 'aux') return null;
    const presetKind: AudioPathId = channel === 'mic' ? 'microphone' : channel;
    const activeId = snapshot.audio.activePresetIds[presetKind];
    return snapshot.audio.pathPresets.find((preset) => preset.id === activeId)?.name ?? null;
  };

  return (
    <div className="mixer-workbench">
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

    </div>
  );
}
