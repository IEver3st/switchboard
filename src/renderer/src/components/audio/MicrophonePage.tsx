import type { MicProcessor, MicProcessorId, SystemSnapshot } from '../../../../shared/contracts';
import { PrimarySlider } from '@/components/shared/human-controls';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { AudioDevicePicker } from './AudioDevicePicker';
import { EqualizerHeader } from './EqualizerHeader';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { MicrophoneTest } from './testing/MicrophoneTest';
import { useSystemStore } from '@/stores/use-system-store';

function getProcessor<T extends MicProcessorId>(processors: MicProcessor[], id: T): Extract<MicProcessor, { id: T }> | null {
  return (processors.find((processor) => processor.id === id) as Extract<MicProcessor, { id: T }> | undefined) ?? null;
}

function MicSetting({
  headingId,
  title,
  description,
  technicalName,
  checked,
  disabled,
  pending,
  onCheckedChange,
  children,
  className,
}: {
  headingId: string;
  title: string;
  description?: string;
  technicalName?: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mic-setting', !children && 'mic-setting--bare', className)}>
      <div className="mic-setting__copy">
        <div className="mic-setting__title">
          <h3 id={headingId}>{title}</h3>
          {technicalName ? <span>{technicalName}</span> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="mic-setting__control">{children}</div> : null}
      <label className="mic-setting__state">
        <Switch
          checked={checked}
          disabled={disabled || pending}
          aria-label={title}
          onCheckedChange={onCheckedChange}
        />
      </label>
    </div>
  );
}

export function MicrophonePage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setMicProcessor = useSystemStore((state) => state.setMicProcessor);
  const setAudioMonitoring = useSystemStore((state) => state.setAudioMonitoring);
  const testMicrophone = useSystemStore((state) => state.testMicrophone);
  const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
  const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
  const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
  const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
  const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
  const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
  const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
  const actionPending = useSystemStore((state) => state.actionPending);
  const micBus = snapshot.audio.buses.find((candidate) => candidate.id === 'mic');
  const gain = getProcessor(snapshot.audio.micProcessors, 'gain');
  const gate = getProcessor(snapshot.audio.micProcessors, 'noise-gate');
  const suppression = getProcessor(snapshot.audio.micProcessors, 'noise-suppression');
  const equalizer = getProcessor(snapshot.audio.micProcessors, 'equalizer');
  const compressor = getProcessor(snapshot.audio.micProcessors, 'compressor');
  const limiter = getProcessor(snapshot.audio.micProcessors, 'limiter');
  const support = snapshot.audio.capabilities.microphoneDsp;
  const suppressionSupport = snapshot.audio.capabilities.noiseSuppression;
  const processingPending = actionPending?.startsWith('audio:processor:') ?? false;
  const unavailable = support === 'unavailable';
  const suppressionUnavailable = suppressionSupport === 'unavailable';
  const suppressionError = snapshot.audio.host?.noiseSuppression.lastError
    ?? snapshot.audio.host?.capabilities.reason;
  const monitoringUnavailable = snapshot.audio.capabilities.monitoring === 'unavailable';

  if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) {
    return <div className="px-6 py-8 text-sm text-destructive">Microphone sound settings are unavailable.</div>;
  }

  return (
    <div className="audio-workbench microphone-workbench" data-channel="microphone">
      {support !== 'available' ? (
        <p className="audio-workbench__availability" role="status">
          {support === 'simulation'
            ? 'Voice processing is not available on this setup yet. Your settings will still be saved.'
            : 'Voice processing is unavailable for this microphone.'}
        </p>
      ) : null}

      <div className="audio-main-grid microphone-main-grid">
        <section id="microphone-equalizer-section" className="mic-section mic-section--equalizer audio-primary-section" aria-labelledby="microphone-equalizer-heading">
          <EqualizerHeader
            headingId="microphone-equalizer-heading"
            checked={equalizer.enabled}
            disabled={unavailable}
            pending={processingPending}
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'equalizer', enabled })}
            tools={(
              <>
                <PresetPicker
                  kind="microphone"
                  label="Voice preset"
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
                <MicrophoneTest
                  compact
                  support={snapshot.audio.capabilities.microphoneTest}
                  pending={actionPending === 'audio:microphone-test'}
                  onRecord={() => void testMicrophone()}
                />
              </>
            )}
          />
          <ParametricEq
            bands={equalizer.parameters.bands}
            disabled={unavailable || !equalizer.enabled || processingPending}
            onCommit={(bands) => void setMicProcessor({ processorId: 'equalizer', parameters: { bands } })}
          />
        </section>

        <section className="audio-control-rail mic-control-rail" aria-label="Microphone processing controls">
          <header className="audio-control-rail__header">
            <h3>Voice chain</h3>
            <p>Clean, balance, and protect your microphone.</p>
          </header>

          <section id="microphone-input-section" className="mic-rail__input">
            <PrimarySlider
              label="Input volume"
              description="Software level"
              value={gain.parameters.gainDb}
              min={-20}
              max={30}
              step={0.5}
              unit="dB"
              disabled={unavailable || !gain.enabled || processingPending}
              onCommit={(gainDb) => void setMicProcessor({ processorId: 'gain', enabled: true, parameters: { gainDb } })}
            />
          </section>

          <section className="mic-rows" aria-label="Microphone processors">
            <div id="microphone-gate-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-gate-heading"
                title="Noise gate"
                description="Mutes the room while you are not speaking."
                checked={gate.enabled}
                disabled={unavailable}
                pending={processingPending}
                onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'noise-gate', enabled })}
              >
                <div className="mic-parameter-stack">
                  <PrimarySlider
                    label="Gate threshold"
                    value={gate.parameters.thresholdDb}
                    min={-80}
                    max={-10}
                    step={0.5}
                    unit="dB"
                    disabled={unavailable || !gate.enabled || processingPending}
                    onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'noise-gate', enabled: true, parameters: { thresholdDb } })}
                  />
                  <ParameterControl label="Attack" value={gate.parameters.attackMs} min={0.1} max={100} step={0.5} unit=" ms" precision={1} disabled={unavailable || !gate.enabled || processingPending} onCommit={(attackMs) => void setMicProcessor({ processorId: 'noise-gate', parameters: { attackMs } })} />
                  <ParameterControl label="Release" value={gate.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !gate.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'noise-gate', parameters: { releaseMs } })} />
                </div>
              </MicSetting>
            </div>

            <div id="microphone-removal-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-removal-heading"
                title="Noise removal"
                description={suppressionUnavailable
                  ? suppressionError ?? 'Unavailable with the current audio setup.'
                  : 'Reduces fans, keys, and background sound.'}
                checked={suppression.enabled && !suppressionUnavailable}
                disabled={suppressionUnavailable}
                pending={processingPending}
                onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'noise-suppression', enabled })}
              >
                <PrimarySlider
                  label="Removal strength"
                  value={suppression.parameters.amount}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  disabled={suppressionUnavailable || !suppression.enabled || processingPending}
                  onCommit={(amount) => void setMicProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount } })}
                />
              </MicSetting>
            </div>

            <div id="microphone-consistency-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-consistency-heading"
                title="Voice consistency"
                description="Keeps quiet and loud speech at a similar level."
                checked={compressor.enabled}
                disabled={unavailable}
                pending={processingPending}
                onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'compressor', enabled })}
              >
                <div className="mic-parameter-stack">
                  <PrimarySlider
                    label="Compression ratio"
                    value={compressor.parameters.ratio}
                    min={1}
                    max={20}
                    step={0.1}
                    unit=":1"
                    disabled={unavailable || !compressor.enabled || processingPending}
                    onCommit={(ratio) => void setMicProcessor({ processorId: 'compressor', enabled: true, parameters: { ratio } })}
                  />
                  <ParameterControl label="Threshold" value={compressor.parameters.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'compressor', parameters: { thresholdDb } })} />
                  <ParameterControl label="Attack" value={compressor.parameters.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(attackMs) => void setMicProcessor({ processorId: 'compressor', parameters: { attackMs } })} />
                  <ParameterControl label="Release" value={compressor.parameters.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !compressor.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'compressor', parameters: { releaseMs } })} />
                  <ParameterControl label="Makeup gain" value={compressor.parameters.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(makeupDb) => void setMicProcessor({ processorId: 'compressor', parameters: { makeupDb } })} />
                </div>
              </MicSetting>
            </div>

            <div id="microphone-safety-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-safety-heading"
                title="Output safety"
                description="Catches clipping and sudden peaks."
                checked={limiter.enabled}
                disabled={unavailable}
                pending={processingPending}
                onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'limiter', enabled })}
              >
                <div className="mic-parameter-stack">
                  <ParameterControl label="Ceiling" value={limiter.parameters.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !limiter.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'limiter', parameters: { thresholdDb } })} />
                  <ParameterControl label="Release" value={limiter.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !limiter.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'limiter', parameters: { releaseMs } })} />
                </div>
              </MicSetting>
            </div>
          </section>
        </section>
      </div>

      <section id="microphone-monitoring-section" className="mic-section mic-section--monitoring" aria-labelledby="microphone-monitoring-heading">
        <MicSetting
          headingId="microphone-monitoring-heading"
          title="Monitoring"
          description={monitoringUnavailable ? 'Monitoring is not available with the current audio setup.' : 'Hear your microphone through the selected output.'}
          checked={snapshot.audio.monitoringEnabled}
          disabled={monitoringUnavailable}
          pending={actionPending === 'audio:monitoring'}
          onCheckedChange={(enabled) => void setAudioMonitoring({ enabled })}
        />
        <div className="mic-monitoring__controls">
          <label>
            <span>Hear your microphone through</span>
            <AudioDevicePicker
              value={snapshot.audio.monitoringDeviceId}
              devices={snapshot.audio.devices}
              direction="output"
              label="Microphone monitoring device"
              disabled={monitoringUnavailable || actionPending === 'audio:monitoring'}
              onChange={(deviceId) => void setAudioMonitoring({ deviceId })}
            />
          </label>
          <PrimarySlider
            label="Monitor volume"
            value={snapshot.audio.monitoring * 100}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={monitoringUnavailable || !snapshot.audio.monitoringEnabled || actionPending === 'audio:monitoring'}
            onCommit={(level) => void setAudioMonitoring({ level: level / 100 })}
          />
        </div>
      </section>

      <AdvancedDisclosure>
        <div className="advanced-processor-grid advanced-processor-grid--microphone">
          <ProcessorSection id="microphone-noise-suppression" title="Noise suppression" enabled={suppression.enabled && !suppressionUnavailable} pending={processingPending} support={suppressionSupport} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'noise-suppression', enabled })}>
            <ParameterControl label="Strength" value={suppression.parameters.amount} min={0} max={100} step={1} unit="%" disabled={suppressionUnavailable || !suppression.enabled || processingPending} onCommit={(amount) => void setMicProcessor({ processorId: 'noise-suppression', parameters: { amount } })} />
          </ProcessorSection>

          <ProcessorSection id="microphone-noise-gate" title="Noise gate" enabled={gate.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'noise-gate', enabled })}>
            <ParameterControl label="Threshold" value={gate.parameters.thresholdDb} min={-80} max={-10} step={0.5} unit=" dB" precision={1} disabled={unavailable || !gate.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'noise-gate', parameters: { thresholdDb } })} />
            <ParameterControl label="Attack" value={gate.parameters.attackMs} min={0.1} max={100} step={0.5} unit=" ms" precision={1} disabled={unavailable || !gate.enabled || processingPending} onCommit={(attackMs) => void setMicProcessor({ processorId: 'noise-gate', parameters: { attackMs } })} />
            <ParameterControl label="Release" value={gate.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !gate.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'noise-gate', parameters: { releaseMs } })} />
          </ProcessorSection>

          <ProcessorSection id="microphone-compressor" title="Compressor" enabled={compressor.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'compressor', enabled })}>
            <ParameterControl label="Threshold" value={compressor.parameters.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'compressor', parameters: { thresholdDb } })} />
            <ParameterControl label="Ratio" value={compressor.parameters.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(ratio) => void setMicProcessor({ processorId: 'compressor', parameters: { ratio } })} />
            <ParameterControl label="Attack" value={compressor.parameters.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(attackMs) => void setMicProcessor({ processorId: 'compressor', parameters: { attackMs } })} />
            <ParameterControl label="Release" value={compressor.parameters.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !compressor.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'compressor', parameters: { releaseMs } })} />
            <ParameterControl label="Makeup gain" value={compressor.parameters.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || processingPending} onCommit={(makeupDb) => void setMicProcessor({ processorId: 'compressor', parameters: { makeupDb } })} />
          </ProcessorSection>

          <ProcessorSection id="microphone-gain" title="Software input gain" enabled={gain.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'gain', enabled })}>
            <ParameterControl label="Gain" value={gain.parameters.gainDb} min={-20} max={30} step={0.5} unit=" dB" precision={1} disabled={unavailable || !gain.enabled || processingPending} onCommit={(gainDb) => void setMicProcessor({ processorId: 'gain', parameters: { gainDb } })} />
          </ProcessorSection>

          <ProcessorSection id="microphone-limiter" title="Limiter" enabled={limiter.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'limiter', enabled })}>
            <ParameterControl label="Ceiling" value={limiter.parameters.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !limiter.enabled || processingPending} onCommit={(thresholdDb) => void setMicProcessor({ processorId: 'limiter', parameters: { thresholdDb } })} />
            <ParameterControl label="Release" value={limiter.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !limiter.enabled || processingPending} onCommit={(releaseMs) => void setMicProcessor({ processorId: 'limiter', parameters: { releaseMs } })} />
          </ProcessorSection>
        </div>
      </AdvancedDisclosure>
    </div>
  );
}
