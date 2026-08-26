import type { ChannelAudioBusId, SystemSnapshot } from '../../../../shared/contracts';
import { AdvancedDisclosure, SemanticChoice, SettingToggle } from '@/components/shared/human-controls';
import { AudioDevicePicker } from './AudioDevicePicker';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { ProcessorSection } from './processors/ProcessorSection';
import { channelIcons } from './channel-identity';
import { channelLeveling, matchChannelLeveling, type SemanticStrength } from './semantic-mapping';
import { useSystemStore } from '@/stores/use-system-store';

const labels: Record<ChannelAudioBusId, string> = {
  game: 'Game',
  chat: 'Chat',
  media: 'Media',
};

const levelingCopy: Record<ChannelAudioBusId, { title: string; description: string }> = {
  game: { title: 'Volume leveling', description: 'Keeps quiet and loud moments closer together.' },
  chat: { title: 'Voice leveling', description: 'Keeps people at a more consistent volume.' },
  media: { title: 'Volume leveling', description: 'Smooths large volume changes between songs, videos, and apps.' },
};

const strengthOptions = [
  { value: 'light', label: 'Natural' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'strong', label: 'Strong' },
] satisfies Array<{ value: SemanticStrength; label: string }>;

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
  const unavailable = support === 'unavailable';

  if (!processing || !bus) {
    return <div className="px-6 py-8 text-sm text-destructive">{labels[busId]} sound settings are unavailable.</div>;
  }

  const levelingEnabled = processing.normalization.enabled || processing.compressor.enabled;
  const levelingStrength = matchChannelLeveling(processing);
  const ChannelIcon = channelIcons[busId];

  const setLevelingEnabled = async (enabled: boolean) => {
    await setAudioChannelProcessor({ busId, processorId: 'normalization', enabled });
    await setAudioChannelProcessor({ busId, processorId: 'compressor', enabled });
  };

  const setLevelingStrength = async (strength: SemanticStrength) => {
    const next = channelLeveling[strength];
    await setAudioChannelProcessor({
      busId,
      processorId: 'normalization',
      enabled: true,
      parameters: { targetLufs: next.targetLufs, maxGainDb: next.maxGainDb },
    });
    await setAudioChannelProcessor({
      busId,
      processorId: 'compressor',
      enabled: true,
      parameters: next.compressor,
    });
  };

  return (
    <div className="audio-workbench" data-channel={busId}>
      <header className="audio-workbench__header">
        <div className="audio-workbench__identity">
          <h2><ChannelIcon className="audio-workbench__channel-icon" aria-hidden={true} />{labels[busId]}</h2>
          <label className="audio-workbench__device">
            <span>Output</span>
            <AudioDevicePicker
              value={bus.deviceId}
              devices={snapshot.audio.devices}
              direction="output"
              label={`${labels[busId]} output device`}
              disabled={pendingId === `audio:${busId}:device`}
              onChange={(deviceId) => void setAudioBusDevice({ busId, deviceId })}
            />
          </label>
          {support !== 'available' ? (
            <p className="audio-workbench__availability" role="status">
              {support === 'simulation'
                ? 'Sound processing is not available on this setup yet. Your settings will still be saved.'
                : 'Sound processing is unavailable for this output.'}
            </p>
          ) : null}
        </div>

        <PresetPicker
          kind={busId}
          label="Sound"
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

      <section className="audio-primary-section" aria-labelledby={`${busId}-equalizer-heading`}>
        <SettingToggle
          title="Equalizer"
          description="Shape the sound by dragging a band, or enter an exact value below."
          checked={processing.equalizer.enabled}
          disabled={unavailable}
          pending={pending}
          onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', enabled })}
        />
        <ParametricEq
          bands={processing.equalizer.bands}
          disabled={unavailable || !processing.equalizer.enabled || pending}
          onCommit={(bands) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', parameters: { bands } })}
        />
      </section>

      <section className="audio-simple-grid">
        <div className="audio-simple-section">
          <SettingToggle
            title={levelingCopy[busId].title}
            description={levelingCopy[busId].description}
            checked={levelingEnabled}
            disabled={unavailable}
            pending={pending}
            technicalName="Normalization + compressor"
            onCheckedChange={(enabled) => void setLevelingEnabled(enabled)}
          />
          <SemanticChoice
            label={`${levelingCopy[busId].title} strength`}
            value={levelingStrength}
            options={strengthOptions}
            disabled={unavailable || !levelingEnabled || pending}
            onChange={(strength) => void setLevelingStrength(strength)}
          />
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
        </div>
      </section>

      <AdvancedDisclosure>
        <div className="advanced-processor-grid">
          <ProcessorSection
            id={`${busId}-normalization`}
            title="Volume normalization"
            enabled={processing.normalization.enabled}
            pending={pending}
            support={support}
            onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'normalization', enabled })}
          >
            <ParameterControl label="Target loudness" value={processing.normalization.targetLufs} min={-30} max={-10} step={0.5} unit=" LUFS" precision={1} disabled={unavailable || !processing.normalization.enabled || pending} onCommit={(targetLufs) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { targetLufs } })} />
            <ParameterControl label="Maximum lift" value={processing.normalization.maxGainDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.normalization.enabled || pending} onCommit={(maxGainDb) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { maxGainDb } })} />
          </ProcessorSection>

          <ProcessorSection
            id={`${busId}-compressor`}
            title="Compressor"
            enabled={processing.compressor.enabled}
            pending={pending}
            support={support}
            onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'compressor', enabled })}
          >
            <ParameterControl label="Threshold" value={processing.compressor.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { thresholdDb } })} />
            <ParameterControl label="Ratio" value={processing.compressor.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(ratio) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { ratio } })} />
            <ParameterControl label="Attack" value={processing.compressor.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(attackMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { attackMs } })} />
            <ParameterControl label="Release" value={processing.compressor.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { releaseMs } })} />
            <ParameterControl label="Makeup gain" value={processing.compressor.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled || pending} onCommit={(makeupDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { makeupDb } })} />
          </ProcessorSection>

          <ProcessorSection
            id={`${busId}-limiter`}
            title="Limiter"
            enabled={processing.limiter.enabled}
            pending={pending}
            support={support}
            onEnabledChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'limiter', enabled })}
          >
            <ParameterControl label="Ceiling" value={processing.limiter.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !processing.limiter.enabled || pending} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { thresholdDb } })} />
            <ParameterControl label="Release" value={processing.limiter.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !processing.limiter.enabled || pending} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { releaseMs } })} />
          </ProcessorSection>
        </div>
      </AdvancedDisclosure>
    </div>
  );
}
