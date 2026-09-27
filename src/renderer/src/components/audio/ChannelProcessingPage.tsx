import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ChannelAudioBusId, SystemSnapshot } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';
import { AudioChannelHeader, AudioModule, AudioNotice } from './AudioModule';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { SpatialChannelModule } from './SpatialChannelModule';
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
  const [dynamicsAdvanced, setDynamicsAdvanced] = useState(false);
  const processing = snapshot.audio.channelProcessing.find((candidate) => candidate.busId === busId);
  const bus = snapshot.audio.buses.find((candidate) => candidate.id === busId);
  const support = snapshot.audio.capabilities.channelDsp;
  const pending = useSystemStore((state) => state.pendingAudioOperations > 0);
  const unavailable = support === 'unavailable';
  const unavailableMessage = snapshot.audio.host?.driver.state !== 'ready' ? snapshot.audio.host?.driver.message : null;

  if (!processing || !bus) return <div className="px-6 py-8 text-sm text-destructive">{labels[busId]} sound settings are unavailable.</div>;

  const device = snapshot.audio.devices.find((candidate) => candidate.id === bus.deviceId);
  const detail = `${labels[busId]} output · ${device?.name ?? 'Default output device'}`;
  const processingProps = (processorId: 'normalization' | 'compressor' | 'limiter') => ({
    disabled: unavailable,
    pending,
    onCheckedChange: (enabled: boolean) => void setAudioChannelProcessor({ busId, processorId, enabled }),
  });

  return (
    <div className="audio-channel" data-channel={busId}>
      <AudioChannelHeader channel={busId} title={labels[busId]} detail={detail}>
        <div className="audio-channel-head__preset">
          <span className="audio-eyebrow">Preset</span>
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
      </AudioChannelHeader>
      {support !== 'available' ? (
        <AudioNotice>
          {support === 'simulation'
            ? 'Sound processing is not available on this setup yet. Your settings will still be saved.'
            : unavailableMessage ?? 'Sound processing is unavailable for this output. Your settings will still be saved.'}
        </AudioNotice>
      ) : null}
      <AudioModule
        className="audio-panel--eq"
        headingId={`${busId}-equalizer-heading`}
        title="Equalizer"
        description="Hover the curve and click + to add a band. Drag to adjust, or enter exact values below."
        checked={processing.equalizer.enabled}
        disabled={unavailable}
        pending={pending}
        switchLabel={`${processing.equalizer.enabled ? 'Bypass' : 'Enable'} Equalizer`}
        onCheckedChange={(enabled) => void setAudioChannelProcessor({ busId, processorId: 'equalizer', enabled })}
      >
        <ParametricEq
          bands={processing.equalizer.bands}
          disabled={unavailable || !processing.equalizer.enabled}
          onCommit={(bands) => setAudioChannelProcessor({ busId, processorId: 'equalizer', parameters: { bands } })}
        />
      </AudioModule>
      <SpatialChannelModule audio={snapshot.audio} channel={busId} />
      <div className="audio-panel-grid" aria-label={`${labels[busId]} processing controls`}>
        <AudioModule headingId={`${busId}-normalization-heading`} title={normalizationCopy[busId].title} description={normalizationCopy[busId].description} checked={processing.normalization.enabled} switchLabel={`${processing.normalization.enabled ? 'Bypass' : 'Enable'} ${normalizationCopy[busId].title}`} {...processingProps('normalization')}>
          <ParameterControl label="Target loudness" value={processing.normalization.targetLufs} min={-30} max={-10} step={0.5} unit=" LUFS" precision={1} disabled={unavailable || !processing.normalization.enabled} onCommit={(targetLufs) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { targetLufs } })} />
          <ParameterControl label="Maximum lift" value={processing.normalization.maxGainDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.normalization.enabled} onCommit={(maxGainDb) => void setAudioChannelProcessor({ busId, processorId: 'normalization', parameters: { maxGainDb } })} />
        </AudioModule>
        <AudioModule headingId={`${busId}-compressor-heading`} title="Dynamic control" description="Keeps loud peaks closer to the rest of the mix." checked={processing.compressor.enabled} switchLabel={`${processing.compressor.enabled ? 'Bypass' : 'Enable'} Dynamic control`} {...processingProps('compressor')}>
          <ParameterControl label="Threshold" value={processing.compressor.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { thresholdDb } })} />
          <ParameterControl label="Ratio" value={processing.compressor.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={unavailable || !processing.compressor.enabled} onCommit={(ratio) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { ratio } })} />
          {dynamicsAdvanced ? <>
          <ParameterControl label="Attack" value={processing.compressor.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !processing.compressor.enabled} onCommit={(attackMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { attackMs } })} />
          <ParameterControl label="Release" value={processing.compressor.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !processing.compressor.enabled} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { releaseMs } })} />
          <ParameterControl label="Makeup gain" value={processing.compressor.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !processing.compressor.enabled} onCommit={(makeupDb) => void setAudioChannelProcessor({ busId, processorId: 'compressor', parameters: { makeupDb } })} />
          </> : null}
          <button type="button" className={cn('mic-stage__advanced-toggle', dynamicsAdvanced && 'is-open')} aria-expanded={dynamicsAdvanced}
            onClick={() => setDynamicsAdvanced((value) => !value)}>
            <ChevronDown aria-hidden="true" />Advanced
          </button>
        </AudioModule>
        <AudioModule headingId={`${busId}-limiter-heading`} title="Output safety" description="Prevents sudden clipping and excessive peaks." checked={processing.limiter.enabled} switchLabel={`${processing.limiter.enabled ? 'Bypass' : 'Enable'} Output safety`} {...processingProps('limiter')}>
          <ParameterControl label="Ceiling" value={processing.limiter.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !processing.limiter.enabled} onCommit={(thresholdDb) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { thresholdDb } })} />
          <ParameterControl label="Release" value={processing.limiter.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !processing.limiter.enabled} onCommit={(releaseMs) => void setAudioChannelProcessor({ busId, processorId: 'limiter', parameters: { releaseMs } })} />
        </AudioModule>
      </div>
    </div>
  );
}
