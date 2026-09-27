import { memo, useState } from 'react';
import type { AudioBus, AudioBusId, AudioDeviceDirection, AudioMixId, AudioPathId, AudioState } from '../../../../shared/contracts';
import type { AudioWorkspaceTab } from './AudioHeader';
import { AudioDeviceManager } from './AudioDeviceManager';
import { ChatMixSlider } from './ChatMixSlider';
import { mixerChannelOrder, type MixerChannelId } from './channel-identity';
import { AppRoutingWell, applicationChannel, type AppDestination } from './MixerApplications';
import { MixerStrip } from './MixerStrip';
import { useSystemStore } from '@/stores/use-system-store';

const routableChannels = new Set<AudioBusId>(['game', 'chat', 'media']);

// Takes only the audio branch so engine telemetry ticks do not re-render the desk.
export const MixerPage = memo(function MixerPage({ audio, engineRunning, selectedMixId, onNavigate }: { audio: AudioState; engineRunning: boolean; selectedMixId: AudioMixId; onNavigate: (tab: AudioWorkspaceTab) => void }) {
  const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
  const setAudioBusEnabled = useSystemStore((state) => state.setAudioBusEnabled);
  const setAudioChannelEnabled = useSystemStore((state) => state.setAudioChannelEnabled);
  const setAudioMasterGain = useSystemStore((state) => state.setAudioMasterGain);
  const setAudioMasterEnabled = useSystemStore((state) => state.setAudioMasterEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setAudioApplicationRoute = useSystemStore((state) => state.setAudioApplicationRoute);
  const setAudioDeviceExcluded = useSystemStore((state) => state.setAudioDeviceExcluded);
  const setChatMix = useSystemStore((state) => state.setChatMix);
  const pending = useSystemStore((state) => state.pendingAudioOperations > 0);
  const [deviceManager, setDeviceManager] = useState<AudioDeviceDirection | null>(null);
  const cableRouting = audio.capabilities.routingBackend === 'vb-cable';
  const outputDevices = cableRouting
    ? audio.devices.filter((device) => device.direction !== 'output' || !device.isVirtual)
    : audio.devices;
  const buses = mixerChannelOrder
    .filter((id) => !cableRouting || (id !== 'aux' && id !== 'mic'))
    .map((id) => audio.buses.find((bus) => bus.id === id))
    .filter((bus): bus is AudioBus => Boolean(bus));
  const selectedMix = audio.mixes.find((mix) => mix.id === selectedMixId) ?? audio.mixes[0]!;
  const personalMix = audio.mixes.find((mix) => mix.id === 'personal');
  const gameEnabled = (audio.buses.find((bus) => bus.id === 'game')?.enabled ?? false)
    && (personalMix?.buses.find((bus) => bus.id === 'game')?.enabled ?? false);
  const chatEnabled = (audio.buses.find((bus) => bus.id === 'chat')?.enabled ?? false)
    && (personalMix?.buses.find((bus) => bus.id === 'chat')?.enabled ?? false);
  const routingSupport = audio.capabilities.applicationRouting;
  const showApps = routingSupport !== 'unavailable';
  const routingDisabled = routingSupport === 'unavailable';
  const excludedDeviceIds = audio.excludedDeviceIds;
  const masterMeterBusIds = buses
    .filter((bus) => bus.id !== 'mic' && bus.enabled && selectedMix.buses.find((control) => control.id === bus.id)?.enabled)
    .map((bus) => bus.id);

  const routeApplication = (applicationId: string, destination: AppDestination) => {
    void setAudioApplicationRoute({ applicationId, destination });
  };

  const appWellFor = (channel: AudioBusId | null) => {
    if (!showApps) return null;
    if (channel !== null && !routableChannels.has(channel)) return <div className="app-well app-well--placeholder" aria-hidden="true" />;
    const destination = channel as AppDestination | null;
    return (
      <AppRoutingWell
        title={destination === null ? 'Apps to be routed' : 'Apps'}
        destination={destination}
        applications={audio.applications.filter((application) => applicationChannel(application) === destination)}
        disabled={routingDisabled}
        onApplicationRoute={routeApplication}
      />
    );
  };

  const presetNameFor = (channel: MixerChannelId): string | null => {
    if (channel === 'aux') return null;
    const presetKind: AudioPathId = channel === 'mic' ? 'microphone' : channel;
    const activeId = audio.activePresetIds[presetKind];
    return audio.pathPresets.find((preset) => preset.id === activeId)?.name ?? null;
  };

  return (
    <div className="audio-desk">
      <div className="audio-desk__surface">
        <div className="audio-desk__strips" data-testid="mixer-grid" data-free-mixing={cableRouting || undefined} data-apps={showApps || undefined}>
        <MixerStrip
          master
          masterState={selectedMix.master}
          mixId={selectedMix.id}
          mixLabel={selectedMix.label}
          meterBusIds={masterMeterBusIds}
          devices={audio.devices}
          engineRunning={engineRunning}
          pending={pending}
          appWell={appWellFor(null)}
          onGainCommit={(gain) => void setAudioMasterGain({ mixId: selectedMix.id, gain })}
          onEnabledChange={(enabled) => void setAudioMasterEnabled({ mixId: selectedMix.id, enabled })}
        />
        {buses.map((bus) => {
          const channel = bus.id as MixerChannelId;
          const control = selectedMix.buses.find((candidate) => candidate.id === bus.id);
          if (!control) return null;
          return (
            <MixerStrip
              key={bus.id}
              bus={bus}
              control={control}
              mixId={selectedMix.id}
              devices={outputDevices}
              engineRunning={engineRunning}
              pending={pending}
              presetName={presetNameFor(channel)}
              excludedDeviceIds={excludedDeviceIds}
              appWell={appWellFor(bus.id)}
              onGainCommit={(gain) => void setAudioBusGain({ mixId: selectedMix.id, busId: bus.id, gain })}
              onEnabledChange={(enabled) => void setAudioBusEnabled({ mixId: selectedMix.id, busId: bus.id, enabled })}
              onChannelEnabledChange={(enabled) => void setAudioChannelEnabled({ busId: bus.id, enabled })}
              onDeviceChange={(deviceId) => void setAudioBusDevice({ busId: bus.id, deviceId })}
              onManageDevices={() => setDeviceManager(bus.id === 'mic' ? 'input' : 'output')}
              onOpen={() => bus.id !== 'aux' && onNavigate(bus.id === 'mic' ? 'microphone' : (bus.id as AudioWorkspaceTab))}
            />
          );
        })}
        </div>
      </div>

      <ChatMixSlider
        value={audio.chatMix}
        disabled={!gameEnabled || !chatEnabled}
        pending={pending}
        onCommit={(value) => void setChatMix(value)}
      />

      <AudioDeviceManager
        open={deviceManager !== null}
        onOpenChange={(open) => { if (!open) setDeviceManager(null); }}
        initialDirection={deviceManager ?? 'output'}
        devices={audio.devices}
        excludedIds={excludedDeviceIds}
        inUseIds={audio.buses.map((bus) => bus.deviceId)}
        pending={pending}
        onExcludedChange={(deviceId, excluded) => void setAudioDeviceExcluded({ deviceId, excluded })}
      />
    </div>
  );
});
