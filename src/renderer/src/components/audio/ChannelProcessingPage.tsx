import type { ChannelAudioBusId, SystemSnapshot } from '../../../../shared/contracts';
import { SettingToggle } from '@/components/shared/human-controls';
import { EqualizerHeader } from './EqualizerHeader';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { useSystemStore } from '@/stores/use-system-store';

const labels: Record<ChannelAudioBusId, string> = {
  game: 'Game',
  chat: 'Chat',
  media: 'Media',
};

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

  if (!processing || !bus) {
    return <div className="px-6 py-8 text-sm text-destructive">{labels[busId]} sound settings are unavailable.</div>;
  }

  return (
    <div className="audio-workbench" data-channel={busId}>
      {support !== 'available' ? (
        <p className="audio-workbench__availability" role="status">
          {support === 'simulation'
            ? 'Sound processing is not available on this setup yet. Your settings will still be saved.'
            : 'Sound processing is unavailable for this output.'}
        </p>
      ) : null}

      <div className="audio-main-grid">
        <section className="audio-primary-section" aria-labelledby={`${busId}-equalizer-heading`}>
          <EqualizerHeader
            headingId={`${busId}-equalizer-heading`}
            checked={processing.equalizer.enabled}
            disabled={unavailable}
            pending={pending}
            onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', enabled })}
            tools={(
              <PresetPicker
                kind={busId}
                label="Sound preset"
                presets={snapshot.audio.pathPresets}
                activeId={snapshot.audio.activePresetIds[busId]}
                pending={false}
                desktopFeatures={Boolean(window.switchboard)}
                onApply={(presetId) => void applyAudioPreset({ presetId })}
                onCreate={(name) => void createAudioPreset({ kind: busId, name })}
                onRename={(presetId, name) => void renameAudioPreset({ presetId, name })}
                onDuplicate={(presetId) => void duplicateAudioPreset({ presetId })}
                onDelete={(presetId) => void deleteAudioPreset({ presetId })}
                onImport={() => void importAudioPreset()}
                onExport={(presetId) => void exportAudioPreset({ presetId })}
              />
            )}
          />
          <ParametricEq
            bands={processing.equalizer.bands}
            disabled={unavailable || !processing.equalizer.enabled || pending}
            onCommit={(bands) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', parameters: { bands } })}
          />
        </section>

        <section className="audio-control-rail" aria-label={`${labels[busId]} processing controls`}>
          <header className="audio-control-rail__header">
            <h3>Processing</h3>
            <p>Keep volume steady and peaks under control.</p>
          </header>

          <div className="audio-simple-section">
            <SettingToggle
              title={normalizationCopy[busId].title}
              description={normalizationCopy[busId].description}
              checked={processing.normalization.enabled}
              disabled={unavailable}
              pending={pending}
              technicalName="Normalization"
              onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'normalization', enabled })}
            />
            <div className="audio-processor-parameters">
              <ParameterControl label="Target loudness" value={processing.normalization.targetLufs} min={-30} max={-10} step={0.5} unit=" LUFS" precision={1} disabled={unavailable || !processing.normalization.enabled || pending} onCommit={(targetLufs) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { targetLufs } })} />
              <ParameterControl label="Maximum lift" value={processing.normalization.maxGainDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.normalization.enabled || pending} onCommit={(maxGainDb) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { maxGainDb } })} />
            </div>
          </div>

          <div className="audio-simple-section">
            <SettingToggle
              title="Dynamic control"
              description="Keeps loud peaks closer to the rest of the mix."
              checked={processing.compressor.enabled}
              disabled={unavailable}
              pending={pending}
              technicalName="Compressor"
              onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'compressor', enabled })}
            />
            <div className="audio-processor-parameters">
              <ParameterControl label="Threshold" value={processing.compressor.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { thresholdDb } })} />
              <ParameterControl label="Ratio" value={processing.compressor.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(ratio) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { ratio } })} />
              <ParameterControl label="Attack" value={processing.compressor.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(attackMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { attackMs } })} />
              <ParameterControl label="Release" value={processing.compressor.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { releaseMs } })} />
              <ParameterControl label="Makeup gain" value={processing.compressor.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(makeupDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { makeupDb } })} />
            </div>
          </div>

          <div className="audio-simple-section">
            <SettingToggle
              title="Output safety"
              description="Prevents sudden clipping and excessive peaks."
              checked={processing.limiter.enabled}
              disabled={unavailable}
              pending={pending}
              technicalName="Limiter"
              onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'limiter', enabled })}
            />
            <div className="audio-processor-parameters">
              <ParameterControl label="Ceiling" value={processing.limiter.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !processing.limiter.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { thresholdDb } })} />
              <ParameterControl label="Release" value={processing.limiter.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !processing.limiter.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { releaseMs } })} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
