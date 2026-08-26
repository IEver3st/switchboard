import { Gamepad2, MessageCircle, Mic2, Music2, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { AudioBus, AudioBusId, SystemSnapshot } from '../../../../shared/contracts';
import type { AudioWorkspaceTab } from './AudioTabs';
import { ApplicationRouting } from './ApplicationRouting';
import { ChatMixSlider } from './ChatMixSlider';
import { MixerChannelStrip } from './MixerChannelStrip';
import { useSystemStore } from '@/stores/use-system-store';

const busIcons: Record<Exclude<AudioBusId, 'aux'>, LucideIcon> = {
  game: Gamepad2,
  chat: MessageCircle,
  media: Music2,
  mic: Mic2,
};

const visibleBusIds: Array<Exclude<AudioBusId, 'aux'>> = ['game', 'chat', 'media', 'mic'];

export function MixerPage({ snapshot, onNavigate }: { snapshot: SystemSnapshot; onNavigate: (tab: AudioWorkspaceTab) => void }) {
  const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
  const setAudioBusEnabled = useSystemStore((state) => state.setAudioBusEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setChatMix = useSystemStore((state) => state.setChatMix);
  const actionPending = useSystemStore((state) => state.actionPending);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';
  const buses = visibleBusIds
    .map((id) => snapshot.audio.buses.find((bus) => bus.id === id))
    .filter((bus): bus is AudioBus => Boolean(bus));
  const gameEnabled = buses.find((bus) => bus.id === 'game')?.enabled ?? false;
  const chatEnabled = buses.find((bus) => bus.id === 'chat')?.enabled ?? false;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 pb-10 pt-5">
      <div className="flex min-h-8 items-center justify-between gap-4 pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="m-0 text-sm font-semibold text-foreground">Mixer</h2>
        </div>
        <span className="text-[9px] tabular-nums text-muted-foreground">Four signal paths · {snapshot.audio.sampleRate / 1_000} kHz</span>
      </div>

      <div className="grid grid-cols-4 gap-px border border-border bg-border max-[1040px]:grid-cols-2 max-[620px]:grid-cols-1" data-testid="mixer-grid">
        {buses.map((bus) => (
          <MixerChannelStrip
            key={bus.id}
            bus={bus}
            devices={snapshot.audio.devices}
            icon={busIcons[bus.id as Exclude<AudioBusId, 'aux'>]}
            engineRunning={engineRunning}
            pending={actionPending?.startsWith(`audio:${bus.id}`) ?? false}
            onGainCommit={(gain) => void setAudioBusGain({ busId: bus.id, gain })}
            onEnabledChange={(enabled) => void setAudioBusEnabled({ busId: bus.id, enabled })}
            onDeviceChange={(deviceId) => void setAudioBusDevice({ busId: bus.id, deviceId })}
            onOpen={() => {
              if (bus.id === 'aux') return;
              onNavigate(bus.id === 'mic' ? 'microphone' : bus.id);
            }}
          />
        ))}
      </div>

      <div className="mt-5 border-y border-border bg-card">
        <ChatMixSlider
          value={snapshot.audio.chatMix}
          disabled={!gameEnabled || !chatEnabled}
          pending={actionPending === 'audio:chatmix'}
          onCommit={(value) => void setChatMix(value)}
        />
      </div>

      <div className="mt-6">
        <ApplicationRouting audio={snapshot.audio} />
      </div>
    </div>
  );
}
