import type { ChannelAudioBusId, SystemSnapshot } from '../../../../shared/contracts';
import { AudioDevicePicker } from './AudioDevicePicker';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { ProcessorSection } from './processors/ProcessorSection';
import { useSystemStore } from '@/stores/use-system-store';

const descriptions: Record<ChannelAudioBusId, string> = {
  game: 'Game',
  chat: 'Chat',
  media: 'Media',
};

export function ChannelProcessingPage({ snapshot, busId }: { snapshot: SystemSnapshot; busId: ChannelAudioBusId }) {
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setAudioChannelProcessor = useSystemStore((state) => state.setAudioChannelProcessor);
  const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
  const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
  const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
  const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
  const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
  const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
  const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
  const pendingId = useSystemStore((state) => state.actionPending);
  const processing = snapshot.audio.channelProcessing.find((candidate) => candidate.busId === busId);
  const bus = snapshot.audio.buses.find((candidate) => candidate.id === busId);
  const support = snapshot.audio.capabilities.channelDsp;
  const pending = pendingId?.startsWith(`audio:${busId}:processor`) ?? false;
  const disabled = support === 'unavailable';

  if (!processing || !bus) {
    return <div className="px-5 py-6 text-[11px] text-destructive">The {descriptions[busId]} signal path is missing from the audio contract.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1420px] px-5 pb-10 pt-5">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(280px,auto)] items-start gap-6 border-b border-border pb-5 max-[820px]:grid-cols-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">{descriptions[busId]}</h2>
            <span className="truncate text-[9px] text-muted-foreground">{bus.endpoint}</span>
          </div>
          <div className="mt-3 max-w-md border-y border-border py-1">
            <AudioDevicePicker
              value={bus.deviceId}
              devices={snapshot.audio.devices}
              direction="output"
              label={`${descriptions[busId]} output device`}
              disabled={pendingId === `audio:${busId}:device`}
              onChange={(deviceId) => void setAudioBusDevice({ busId, deviceId })}
            />
          </div>
        </div>

        <PresetPicker
          kind={busId}
          presets={snapshot.audio.pathPresets}
          activeId={snapshot.audio.activePresetIds[busId]}
          pending={pendingId?.startsWith('audio:preset') ?? false}
          desktopFeatures={Boolean(window.switchboard)}
          onApply={(presetId) => void applyAudioPreset({ presetId })}
          onCreate={(name) => void createAudioPreset({ kind: busId, name })}
          onRename={(presetId, name) => void renameAudioPreset({ presetId, name })}
          onDuplicate={(presetId) => void duplicateAudioPreset({ presetId })}
          onDelete={(presetId) => void deleteAudioPreset({ presetId })}
          onImport={() => void importAudioPreset()}
          onExport={(presetId) => void exportAudioPreset({ presetId })}
        />
      </header>

      <ProcessorSection
        id={`${busId}-equalizer`}
        title="Equalizer"
        enabled={processing.equalizer.enabled}
        pending={pending}
        support={support}
        onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', enabled })}
      >
        <ParametricEq
          bands={processing.equalizer.bands}
          disabled={disabled || !processing.equalizer.enabled || pending}
          onCommit={(bands) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', parameters: { bands } })}
        />
      </ProcessorSection>

      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 max-[900px]:grid-cols-1">
        <ProcessorSection
          id={`${busId}-normalization`}
          title="Volume normalization"
          enabled={processing.normalization.enabled}
          pending={pending}
          support={support}
          onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'normalization', enabled })}
        >
          <div className="grid gap-1">
            <ParameterControl label="Target loudness" value={processing.normalization.targetLufs} min={-30} max={-10} step={0.5} unit=" LUFS" precision={1} disabled={disabled || !processing.normalization.enabled || pending} onCommit={(targetLufs) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { targetLufs } })} />
            <ParameterControl label="Maximum lift" value={processing.normalization.maxGainDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={disabled || !processing.normalization.enabled || pending} onCommit={(maxGainDb) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { maxGainDb } })} />
          </div>
        </ProcessorSection>

        <ProcessorSection
          id={`${busId}-compressor`}
          title="Compressor"
          enabled={processing.compressor.enabled}
          pending={pending}
          support={support}
          onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'compressor', enabled })}
        >
          <div className="grid gap-1">
            <ParameterControl label="Threshold" value={processing.compressor.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={disabled || !processing.compressor.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { thresholdDb } })} />
            <ParameterControl label="Ratio" value={processing.compressor.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={disabled || !processing.compressor.enabled || pending} onCommit={(ratio) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { ratio } })} />
            <ParameterControl label="Attack" value={processing.compressor.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={disabled || !processing.compressor.enabled || pending} onCommit={(attackMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { attackMs } })} />
            <ParameterControl label="Release" value={processing.compressor.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={disabled || !processing.compressor.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { releaseMs } })} />
            <ParameterControl label="Makeup gain" value={processing.compressor.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={disabled || !processing.compressor.enabled || pending} onCommit={(makeupDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { makeupDb } })} />
          </div>
        </ProcessorSection>

        <ProcessorSection
          id={`${busId}-limiter`}
          title="Limiter"
          enabled={processing.limiter.enabled}
          pending={pending}
          support={support}
          compact
          onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'limiter', enabled })}
        >
          <div className="grid gap-1">
            <ParameterControl label="Ceiling" value={processing.limiter.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={disabled || !processing.limiter.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { thresholdDb } })} />
            <ParameterControl label="Release" value={processing.limiter.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={disabled || !processing.limiter.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { releaseMs } })} />
          </div>
        </ProcessorSection>
      </div>
    </div>
  );
}
