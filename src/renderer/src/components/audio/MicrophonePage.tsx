import { useState } from 'react';
import type { MicProcessor, MicProcessorId, SetMicProcessorInput, SystemSnapshot } from '../../../../shared/contracts';
import { AudioDevicePicker } from './AudioDevicePicker';
import { LiveWaveform } from './LiveWaveform';
import { ParametricEq } from './ParametricEq';
import { ProcessorChain } from './ProcessorChain';
import { RotaryKnob } from './RotaryKnob';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { ProcessorSection } from './processors/ProcessorSection';
import { MicrophoneTest } from './testing/MicrophoneTest';
import { Switch } from '@/components/ui/switch';
import { useSystemStore } from '@/stores/use-system-store';

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

function getProcessor<T extends MicProcessorId>(processors: MicProcessor[], id: T): Extract<MicProcessor, { id: T }> | null {
  return (processors.find((processor) => processor.id === id) as Extract<MicProcessor, { id: T }> | undefined) ?? null;
}

export function MicrophonePage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setMicProcessor = useSystemStore((state) => state.setMicProcessor);
  const setAudioMonitoring = useSystemStore((state) => state.setAudioMonitoring);
  const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
  const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
  const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
  const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
  const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
  const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
  const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
  const actionPending = useSystemStore((state) => state.actionPending);
  const [selectedProcessorId, setSelectedProcessorId] = useState<MicProcessorId>('equalizer');
  const engineRunning = snapshot.engines.find((candidate) => candidate.kind === 'audio')?.state === 'running';
  const micBus = snapshot.audio.buses.find((candidate) => candidate.id === 'mic');
  const gain = getProcessor(snapshot.audio.micProcessors, 'gain');
  const gate = getProcessor(snapshot.audio.micProcessors, 'noise-gate');
  const suppression = getProcessor(snapshot.audio.micProcessors, 'noise-suppression');
  const equalizer = getProcessor(snapshot.audio.micProcessors, 'equalizer');
  const compressor = getProcessor(snapshot.audio.micProcessors, 'compressor');
  const limiter = getProcessor(snapshot.audio.micProcessors, 'limiter');
  const support = snapshot.audio.capabilities.microphoneDsp;
  const processingPending = actionPending?.startsWith('audio:processor:') ?? false;
  const monitoringUnavailable = snapshot.audio.capabilities.monitoring === 'unavailable';

  if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) {
    return <div className="px-5 py-6 text-[11px] text-destructive">The microphone processor graph is incomplete.</div>;
  }

  const scrollToProcessor = (id: MicProcessorId) => {
    setSelectedProcessorId(id);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`microphone-${id}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto w-full max-w-[1420px] px-5 pb-12 pt-5">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(330px,auto)] items-start gap-6 border-b border-border pb-5 max-[900px]:grid-cols-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">Microphone</h2>
            <span className="truncate text-[9px] text-muted-foreground">{snapshot.audio.microphoneDevice}</span>
          </div>
          <div className="mt-3 max-w-md border-y border-border py-1">
            <AudioDevicePicker
              value={micBus.deviceId}
              devices={snapshot.audio.devices}
              direction="input"
              label="Microphone input device"
              disabled={actionPending === 'audio:mic:device'}
              onChange={(deviceId) => void setAudioBusDevice({ busId: 'mic', deviceId })}
            />
          </div>
        </div>

        <div className="grid justify-items-end gap-3 max-[900px]:justify-items-start">
          <PresetPicker
            kind="microphone"
            presets={snapshot.audio.pathPresets}
            activeId={snapshot.audio.activePresetIds.microphone}
            pending={actionPending?.startsWith('audio:preset') ?? false}
            desktopFeatures={Boolean(window.switchboard)}
            onApply={(presetId) => void applyAudioPreset({ presetId })}
            onCreate={(name) => void createAudioPreset({ kind: 'microphone', name })}
            onRename={(presetId, name) => void renameAudioPreset({ presetId, name })}
            onDuplicate={(presetId) => void duplicateAudioPreset({ presetId })}
            onDelete={(presetId) => void deleteAudioPreset({ presetId })}
            onImport={() => void importAudioPreset()}
            onExport={(presetId) => void exportAudioPreset({ presetId })}
          />
          <MicrophoneTest support={snapshot.audio.capabilities.microphoneTest} />
        </div>
      </header>

      <div className="border-b border-border py-3">
        <ProcessorChain
          processors={snapshot.audio.micProcessors}
          selectedId={selectedProcessorId}
          pendingId={actionPending}
          onSelect={scrollToProcessor}
          onToggle={(processor) => void setMicProcessor(toggleProcessorInput(processor))}
        />
      </div>

      <ProcessorSection id="microphone-equalizer" title="Parametric EQ" enabled={equalizer.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'equalizer', enabled })}>
        <ParametricEq bands={equalizer.parameters.bands} disabled={!equalizer.enabled || processingPending} onCommit={(bands) => void setMicProcessor({ processorId: 'equalizer', parameters: { bands } })} />
      </ProcessorSection>

      <ProcessorSection id="microphone-noise-suppression" title="Noise suppression" enabled={suppression.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'noise-suppression', enabled })}>
        <div className="grid grid-cols-[minmax(220px,1fr)_minmax(300px,0.9fr)] items-center gap-6 max-[820px]:grid-cols-1">
          <div className="border-y border-border py-2">
            <LiveWaveform active={engineRunning && micBus.enabled && suppression.enabled} />
          </div>
          <ParameterControl label="Strength" value={suppression.parameters.amount} min={0} max={100} step={1} unit="%" disabled={!suppression.enabled || processingPending} onCommit={(amount) => void setMicProcessor({ processorId: 'noise-suppression', parameters: { amount } })} />
        </div>
      </ProcessorSection>

      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 max-[900px]:grid-cols-1">
        <ProcessorSection id="microphone-noise-gate" title="Noise gate" enabled={gate.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'noise-gate', enabled })}>
          <div className="grid gap-1">
            <ParameterControl label="Threshold" value={gate.parameters.thresholdDb} min={-80} max={-10} step={0.5} unit=" dB" precision={1} disabled={!gate.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'noise-gate', parameters: { thresholdDb } })} />
            <ParameterControl label="Attack" value={gate.parameters.attackMs} min={0.1} max={100} step={0.5} unit=" ms" precision={1} disabled={!gate.enabled || processingPending} onCommit={(attackMs) => void setMicProcessor({ processorId: 'noise-gate', parameters: { attackMs } })} />
            <ParameterControl label="Release" value={gate.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={!gate.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'noise-gate', parameters: { releaseMs } })} />
          </div>
        </ProcessorSection>

        <ProcessorSection id="microphone-compressor" title="Compressor" enabled={compressor.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'compressor', enabled })}>
          <div className="grid gap-1">
            <ParameterControl label="Threshold" value={compressor.parameters.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={!compressor.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'compressor', parameters: { thresholdDb } })} />
            <ParameterControl label="Ratio" value={compressor.parameters.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={!compressor.enabled || processingPending} onCommit={(ratio) => void setMicProcessor({ processorId: 'compressor', parameters: { ratio } })} />
            <ParameterControl label="Attack" value={compressor.parameters.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={!compressor.enabled || processingPending} onCommit={(attackMs) => void setMicProcessor({ processorId: 'compressor', parameters: { attackMs } })} />
            <ParameterControl label="Release" value={compressor.parameters.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={!compressor.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'compressor', parameters: { releaseMs } })} />
            <ParameterControl label="Makeup gain" value={compressor.parameters.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={!compressor.enabled || processingPending} onCommit={(makeupDb) => void setMicProcessor({ processorId: 'compressor', parameters: { makeupDb } })} />
          </div>
        </ProcessorSection>

        <ProcessorSection id="microphone-gain" title="Input gain" enabled={gain.enabled} pending={processingPending} support={support} compact onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'gain', enabled })}>
          <div className="flex min-h-28 items-center gap-6">
            <RotaryKnob label="Software preamp" value={gain.parameters.gainDb} min={-20} max={30} step={0.5} defaultValue={0} unit="dB" precision={1} disabled={!gain.enabled || processingPending} onCommit={(gainDb) => void setMicProcessor({ processorId: 'gain', parameters: { gainDb } })} />
            <p className="m-0 max-w-xs text-[9px] leading-4 text-muted-foreground">Software gain in the processor graph. Hardware microphone gain remains a separate device control.</p>
          </div>
        </ProcessorSection>

        <ProcessorSection id="microphone-limiter" title="Limiter" enabled={limiter.enabled} pending={processingPending} support={support} compact onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'limiter', enabled })}>
          <div className="grid gap-1">
            <ParameterControl label="Ceiling" value={limiter.parameters.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={!limiter.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'limiter', parameters: { thresholdDb } })} />
            <ParameterControl label="Release" value={limiter.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={!limiter.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'limiter', parameters: { releaseMs } })} />
          </div>
        </ProcessorSection>
      </div>

      <section id="microphone-monitoring" aria-labelledby="microphone-monitoring-heading" className="mt-5 border-t border-border pt-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="microphone-monitoring-heading" className="m-0 text-[12px] font-semibold text-foreground">Monitoring</h2>
            {monitoringUnavailable ? <p className="m-0 mt-0.5 text-[8px] text-muted-foreground">Low-latency monitor transport is not connected in this build.</p> : null}
          </div>
          <label className="flex items-center gap-2 text-[9px] text-muted-foreground">
            {snapshot.audio.monitoringEnabled ? 'On' : 'Off'}
            <Switch checked={snapshot.audio.monitoringEnabled} disabled={monitoringUnavailable || actionPending === 'audio:monitoring'} aria-label="Microphone monitoring" onCheckedChange={(enabled) => void setAudioMonitoring({ enabled })} />
          </label>
        </header>
        <div className="grid max-w-4xl grid-cols-2 gap-6 max-[760px]:grid-cols-1">
          <div className="border-y border-border py-1">
            <AudioDevicePicker value={snapshot.audio.monitoringDeviceId} devices={snapshot.audio.devices} direction="output" label="Microphone monitoring device" disabled={monitoringUnavailable || actionPending === 'audio:monitoring'} onChange={(deviceId) => void setAudioMonitoring({ deviceId })} />
          </div>
          <ParameterControl label="Monitor level" value={snapshot.audio.monitoring * 100} min={0} max={100} step={1} unit="%" disabled={monitoringUnavailable || !snapshot.audio.monitoringEnabled || actionPending === 'audio:monitoring'} onCommit={(level) => void setAudioMonitoring({ level: level / 100 })} />
        </div>
      </section>
    </div>
  );
}
