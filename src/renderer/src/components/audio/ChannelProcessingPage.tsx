import type { ChannelAudioBusId, SystemSnapshot } from '../../../../shared/contracts';
import { Switch } from '@/components/ui/switch';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { useSystemStore } from '@/stores/use-system-store';

const labels: Record<ChannelAudioBusId, string> = { game: 'Game', chat: 'Chat', media: 'Media' };
const normalizationCopy: Record<ChannelAudioBusId, { title: string; description: string }> = {
  game: { title: 'Volume leveling', description: 'Lifts quiet moments toward a consistent target.' },
  chat: { title: 'Voice leveling', description: 'Brings quieter people closer to a consistent level.' },
  media: { title: 'Volume leveling', description: 'Balances loudness changes between songs, videos, and apps.' },
};

export function ChannelProcessingPage({ snapshot, busId }: { snapshot: SystemSnapshot; busId: ChannelAudioBusId }) {
  const setAudioChannelProcessor = useSystemStore((state) => state.setAudioChannelProcessor);
  const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
  const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
  const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
  const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
  const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
  const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
  const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
  const processing = snapshot.audio.channelProcessing.find((candidate) => candidate.busId === busId);
  const bus = snapshot.audio.buses.find((candidate) => candidate.id === busId);
  const support = snapshot.audio.capabilities.channelDsp;
  const pending = false;
  const unavailable = support === 'unavailable';
  const unavailableMessage = snapshot.audio.host?.driver.state !== 'ready' ? snapshot.audio.host?.driver.message : null;

  if (!processing || !bus) return <div className="px-6 py-8 text-sm text-destructive">{labels[busId]} sound settings are unavailable.</div>;

  return (
    <div className="audio-channel" data-channel={busId}>
      {support !== 'available' ? (
        <p className="audio-status" role="status">
          {support === 'simulation'
            ? 'Sound processing is not available on this setup yet. Your settings will still be saved.'
            : unavailableMessage ?? 'Sound processing is unavailable for this output.'}
        </p>
      ) : null}
      <div className="audio-channel__head">
        <Switch
          checked={processing.equalizer.enabled}
          disabled={unavailable || pending}
          aria-label={`${processing.equalizer.enabled ? 'Bypass' : 'Enable'} Equalizer`}
          onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', enabled })}
        />
        <h3 id={`${busId}-equalizer-heading`}>Equalizer</h3>
        <span className="grow" />
        <PresetPicker
          kind={busId}
          label="Sound preset"
          presets={snapshot.audio.pathPresets}
          activeId={snapshot.audio.activePresetIds[busId]}
          pending={pending}
          desktopFeatures={Boolean(window.switchboard)}
          onApply={(presetId) => void applyAudioPreset({ presetId })}
          onCreate={(name) => void createAudioPreset({ kind: busId, name })}
          onRename={(presetId, name) => void renameAudioPreset({ presetId, name })}
          onDuplicate={(presetId) => void duplicateAudioPreset({ presetId })}
          onDelete={(presetId) => void deleteAudioPreset({ presetId })}
          onImport={() => void importAudioPreset()}
          onExport={(presetId) => void exportAudioPreset({ presetId })}
        />
      </div>
      <ParametricEq
        bands={processing.equalizer.bands}
        disabled={unavailable || !processing.equalizer.enabled || pending}
        onCommit={(bands) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', parameters: { bands } })}
      />
      <div className="audio-processing" aria-label={`${labels[busId]} processing controls`}>
        <ProcessorGroup title={normalizationCopy[busId].title} description={normalizationCopy[busId].description} enabled={processing.normalization.enabled} disabled={unavailable} onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'normalization', enabled })}>
          <ParameterControl label="Target loudness" value={processing.normalization.targetLufs} min={-30} max={-10} step={0.5} unit=" LUFS" precision={1} disabled={unavailable || !processing.normalization.enabled || pending} onCommit={(targetLufs) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { targetLufs } })} />
          <ParameterControl label="Maximum lift" value={processing.normalization.maxGainDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.normalization.enabled || pending} onCommit={(maxGainDb) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { maxGainDb } })} />
        </ProcessorGroup>
        <ProcessorGroup title="Dynamic control" description="Keeps loud peaks closer to the rest of the mix." enabled={processing.compressor.enabled} disabled={unavailable} onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'compressor', enabled })}>
          <ParameterControl label="Threshold" value={processing.compressor.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { thresholdDb } })} />
          <ParameterControl label="Ratio" value={processing.compressor.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(ratio) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { ratio } })} />
          <ParameterControl label="Attack" value={processing.compressor.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(attackMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { attackMs } })} />
          <ParameterControl label="Release" value={processing.compressor.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { releaseMs } })} />
          <ParameterControl label="Makeup gain" value={processing.compressor.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(makeupDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { makeupDb } })} />
        </ProcessorGroup>
        <ProcessorGroup title="Output safety" description="Prevents sudden clipping and excessive peaks." enabled={processing.limiter.enabled} disabled={unavailable} onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'limiter', enabled })}>
          <ParameterControl label="Ceiling" value={processing.limiter.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !processing.limiter.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { thresholdDb } })} />
          <ParameterControl label="Release" value={processing.limiter.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !processing.limiter.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { releaseMs } })} />
        </ProcessorGroup>
      </div>
    </div>
  );
}

function ProcessorGroup({ title, description, enabled, disabled, onEnabledChange, children }: { title: string; description: string; enabled: boolean; disabled: boolean; onEnabledChange: (enabled: boolean) => void; children: React.ReactNode }) {
  return (
    <section className="audio-proc" aria-label={title}>
      <div className="audio-proc__head">
        <h4>{title}</h4>
        <Switch checked={enabled} disabled={disabled} aria-label={`${enabled ? 'Bypass' : 'Enable'} ${title}`} onCheckedChange={onEnabledChange} />
      </div>
      <p className="audio-proc__description">{description}</p>
      <div className="audio-proc__body">{children}</div>
    </section>
  );
}
