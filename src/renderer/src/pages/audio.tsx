import { useEffect, useMemo, useState } from 'react';
import {
  Gamepad2,
  MessageCircle,
  Mic2,
  Music2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type {
  AudioBus,
  AudioBusId,
  MicProcessor,
  MicProcessorId,
  SetMicProcessorInput,
  SystemSnapshot,
} from '../../../shared/contracts';
import { ChannelStrip } from '@/components/audio/ChannelStrip';
import { ChatMixSlider } from '@/components/audio/ChatMixSlider';
import { LiveWaveform } from '@/components/audio/LiveWaveform';
import { clearAudioMeters, publishAudioMeterFrame } from '@/components/audio/meter-bus';
import { ProcessorChain } from '@/components/audio/ProcessorChain';
import { ProcessorEditor } from '@/components/audio/ProcessorEditor';
import { SelectField } from '@/components/shared/controls';
import { StatusDot } from '@/components/shared/surface';
import { Switch } from '@/components/ui/switch';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';

const busIcons: Record<Exclude<AudioBusId, 'aux'>, LucideIcon> = {
  game: Gamepad2,
  chat: MessageCircle,
  media: Music2,
  mic: Mic2,
};

const visibleBusIds: Array<Exclude<AudioBusId, 'aux'>> = ['game', 'chat', 'media', 'mic'];

function toggleProcessorInput(processor: MicProcessor): SetMicProcessorInput {
  switch (processor.id) {
    case 'gain': return { processorId: 'gain', enabled: !processor.enabled };
    case 'noise-gate': return { processorId: 'noise-gate', enabled: !processor.enabled };
    case 'noise-suppression': return { processorId: 'noise-suppression', enabled: !processor.enabled };
    case 'equalizer': return { processorId: 'equalizer', enabled: !processor.enabled };
    case 'compressor': return { processorId: 'compressor', enabled: !processor.enabled };
    case 'limiter': return { processorId: 'limiter', enabled: !processor.enabled };
  }
}

export function AudioPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setAudioEnabled = useSystemStore((state) => state.setAudioEnabled);
  const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
  const setAudioBusEnabled = useSystemStore((state) => state.setAudioBusEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
  const setChatMix = useSystemStore((state) => state.setChatMix);
  const setMicProcessor = useSystemStore((state) => state.setMicProcessor);
  const actionPending = useSystemStore((state) => state.actionPending);
  const [selectedBusId, setSelectedBusId] = useState<AudioBusId>('game');
  const [selectedProcessorId, setSelectedProcessorId] = useState<MicProcessorId>('gain');

  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';
  const buses = useMemo(
    () => visibleBusIds
      .map((id) => snapshot.audio.buses.find((bus) => bus.id === id))
      .filter((bus): bus is AudioBus => Boolean(bus)),
    [snapshot.audio.buses],
  );
  const selectedBus = buses.find((bus) => bus.id === selectedBusId) ?? buses[0];
  const selectedDevice = selectedBus
    ? snapshot.audio.devices.find((device) => device.id === selectedBus.deviceId)
    : undefined;
  const selectedProcessor = snapshot.audio.micProcessors.find((processor) => processor.id === selectedProcessorId)
    ?? snapshot.audio.micProcessors[0];
  const activePreset = snapshot.audio.presets.find((preset) => preset.id === snapshot.audio.activePresetId);
  const gameEnabled = buses.find((bus) => bus.id === 'game')?.enabled ?? false;
  const chatEnabled = buses.find((bus) => bus.id === 'chat')?.enabled ?? false;

  useEffect(() => {
    if (!engineRunning) {
      clearAudioMeters();
      return;
    }
    const unsubscribe = switchboardApi.subscribeAudioMeters(publishAudioMeterFrame);
    return () => {
      unsubscribe();
      clearAudioMeters();
    };
  }, [engineRunning]);

  return (
    <div className="min-h-full px-5 py-3.5" data-testid="audio-console">
      <header className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-border pb-3 max-[760px]:grid-cols-1">
        <div className="flex min-w-0 items-start gap-2.5">
          <StatusDot active={engineRunning} warning={engine?.state === 'error'} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <h2 className="m-0 text-sm font-semibold text-foreground">Audio router</h2>
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {engineRunning
                  ? `${Math.round(engine.memoryMb)} MB · ${engine.cpuPercent.toFixed(1)}% CPU · ${snapshot.audio.sampleRate / 1_000} kHz`
                  : engine?.state === 'error' ? (engine.message ?? 'Engine error') : 'Engine stopped'}
              </span>
            </div>
            <p className="m-0 mt-0.5 text-[8px] text-muted-foreground/70">
              {snapshot.prototypeMode
                ? 'Prototype · routes and processor values persist locally; live audio remains simulation-backed.'
                : 'Channel routes are applied by the isolated audio host.'}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-[9px] text-muted-foreground">
            <span>Preset</span>
            <SelectField
              value={snapshot.audio.activePresetId ?? 'custom'}
              onChange={(presetId) => presetId !== 'custom' && void applyAudioPreset({ presetId })}
              ariaLabel="Audio preset"
              disabled={actionPending === 'audio:preset'}
              className="h-7 w-32 text-[10px]"
              options={[
                ...(snapshot.audio.activePresetId === null ? [{ value: 'custom', label: 'Custom' }] : []),
                ...snapshot.audio.presets.map((preset) => ({ value: preset.id, label: preset.label })),
              ]}
            />
          </label>
          <span className="max-w-44 truncate text-[8px] text-muted-foreground/60">{activePreset?.description ?? 'Manual mix'}</span>
          <span className="h-7 w-px bg-border" aria-hidden="true" />
          <label className="flex items-center gap-2 text-[9px] font-medium text-muted-foreground">
            Engine
            <Switch
              checked={snapshot.audio.enabled}
              disabled={actionPending === 'audio:enabled'}
              aria-label="Audio engine"
              onCheckedChange={(checked) => void setAudioEnabled(checked)}
            />
          </label>
        </div>
      </header>

      <main>
        <section aria-labelledby="mixer-heading" className="pt-3">
          <div className="flex min-h-7 items-center justify-between gap-4 pb-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <h2 id="mixer-heading" className="m-0 text-[12px] font-semibold text-foreground">Mixer</h2>
            </div>
            {selectedBus ? (
              <div className="min-w-0 truncate text-right text-[8px] tabular-nums text-muted-foreground">
                <span className="text-foreground/80">{selectedBus.label}</span>
                <span className="mx-1.5 text-muted-foreground/45">→</span>
                {selectedDevice?.name ?? 'No available device'}
                <span className="mx-1.5 text-muted-foreground/45">·</span>
                {selectedBus.endpoint}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-px border-y border-border bg-border max-[900px]:grid-cols-2" data-testid="mixer-grid">
            {buses.map((bus) => (
              <ChannelStrip
                key={bus.id}
                bus={bus}
                devices={snapshot.audio.devices}
                icon={busIcons[bus.id as Exclude<AudioBusId, 'aux'>]}
                engineRunning={engineRunning}
                pending={actionPending?.startsWith(`audio:${bus.id}`) ?? false}
                selected={selectedBus?.id === bus.id}
                onGainCommit={(gain) => void setAudioBusGain({ busId: bus.id, gain })}
                onEnabledChange={(enabled) => void setAudioBusEnabled({ busId: bus.id, enabled })}
                onDeviceChange={(deviceId) => void setAudioBusDevice({ busId: bus.id, deviceId })}
                onSelect={() => setSelectedBusId(bus.id)}
              />
            ))}
          </div>

          <ChatMixSlider
            value={snapshot.audio.chatMix}
            disabled={!gameEnabled || !chatEnabled}
            pending={actionPending === 'audio:chatmix'}
            onCommit={(value) => void setChatMix(value)}
          />
        </section>

        <section aria-labelledby="microphone-chain-heading" className="mt-3 border-t border-border pt-3" data-testid="processor-workbench">
          <div className="grid grid-cols-[minmax(220px,1fr)_minmax(220px,360px)] items-center gap-4 pb-2 max-[760px]:grid-cols-1">
            <div className="flex min-w-0 items-center gap-2">
              <Mic2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h2 id="microphone-chain-heading" className="m-0 text-[12px] font-semibold text-foreground">Microphone chain</h2>
                  <span className="truncate text-[8px] text-muted-foreground">{snapshot.audio.microphoneDevice}</span>
                </div>
                <div className="mt-0.5 text-[8px] tabular-nums text-muted-foreground">
                  Monitoring {Math.round(snapshot.audio.monitoring * 100)}% · {snapshot.audio.micProcessors.filter((processor) => processor.enabled).length} of {snapshot.audio.micProcessors.length} processors active
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2 border-l border-border pl-3 max-[760px]:border-l-0 max-[760px]:border-t max-[760px]:pt-2 max-[760px]:pl-0">
              <LiveWaveform active={engineRunning && (buses.find((bus) => bus.id === 'mic')?.enabled ?? false)} />
              <span className="text-right text-[8px] tabular-nums text-muted-foreground">INPUT</span>
            </div>
          </div>

          <ProcessorChain
            processors={snapshot.audio.micProcessors}
            selectedId={selectedProcessorId}
            pendingId={actionPending}
            onSelect={setSelectedProcessorId}
            onToggle={(processor) => void setMicProcessor(toggleProcessorInput(processor))}
          />

          {selectedProcessor ? (
            <ProcessorEditor
              processor={selectedProcessor}
              pending={actionPending === `audio:processor:${selectedProcessor.id}`}
              onUpdate={(input) => void setMicProcessor(input)}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}
