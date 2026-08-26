import type { MicProcessor, MicProcessorId, SystemSnapshot } from '../../../../shared/contracts';
import { AdvancedDisclosure, PrimarySlider, SemanticChoice, SettingToggle } from '@/components/shared/human-controls';
import { AudioDevicePicker } from './AudioDevicePicker';
import { channelIcons } from './channel-identity';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { ProcessorSection } from './processors/ProcessorSection';
import {
  gateThresholds,
  matchGate,
  matchNoiseRemoval,
  matchVoiceConsistency,
  noiseRemovalAmounts,
  voiceConsistency,
  type GateStrength,
  type SemanticStrength,
  type VoiceStyle,
} from './semantic-mapping';
import { MicrophoneTest } from './testing/MicrophoneTest';
import { useSystemStore } from '@/stores/use-system-store';

function getProcessor<T extends MicProcessorId>(processors: MicProcessor[], id: T): Extract<MicProcessor, { id: T }> | null {
  return (processors.find((processor) => processor.id === id) as Extract<MicProcessor, { id: T }> | undefined) ?? null;
}

const noiseOptions = [
  { value: 'light', label: 'Light' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'strong', label: 'Strong' },
] satisfies Array<{ value: SemanticStrength; label: string }>;

const gateOptions = [
  { value: 'low', label: 'Low' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
] satisfies Array<{ value: GateStrength; label: string }>;

const voiceOptions = [
  { value: 'natural', label: 'Natural' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'broadcast', label: 'Broadcast' },
] satisfies Array<{ value: VoiceStyle; label: string }>;

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
  const micBus = snapshot.audio.buses.find((candidate) => candidate.id === 'mic');
  const gain = getProcessor(snapshot.audio.micProcessors, 'gain');
  const gate = getProcessor(snapshot.audio.micProcessors, 'noise-gate');
  const suppression = getProcessor(snapshot.audio.micProcessors, 'noise-suppression');
  const equalizer = getProcessor(snapshot.audio.micProcessors, 'equalizer');
  const compressor = getProcessor(snapshot.audio.micProcessors, 'compressor');
  const limiter = getProcessor(snapshot.audio.micProcessors, 'limiter');
  const support = snapshot.audio.capabilities.microphoneDsp;
  const processingPending = actionPending?.startsWith('audio:processor:') ?? false;
  const unavailable = support === 'unavailable';
  const monitoringUnavailable = snapshot.audio.capabilities.monitoring === 'unavailable';
  const MicIcon = channelIcons.mic;

  if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) {
    return <div className="px-6 py-8 text-sm text-destructive">Microphone sound settings are unavailable.</div>;
  }

  return (
    <div className="audio-workbench microphone-workbench" data-channel="microphone">
      <header className="audio-workbench__header microphone-workbench__header">
        <div className="audio-workbench__identity">
          <h2><MicIcon className="audio-workbench__channel-icon" aria-hidden={true} />Microphone</h2>
          <label className="audio-workbench__device">
            <span>Input</span>
            <AudioDevicePicker
              value={micBus.deviceId}
              devices={snapshot.audio.devices}
              direction="input"
              label="Microphone input device"
              disabled={actionPending === 'audio:mic:device'}
              onChange={(deviceId) => void setAudioBusDevice({ busId: 'mic', deviceId })}
            />
          </label>
          {support !== 'available' ? (
            <p className="audio-workbench__availability" role="status">
              {support === 'simulation'
                ? 'Voice processing is not available on this setup yet. Your settings will still be saved.'
                : 'Voice processing is unavailable for this microphone.'}
            </p>
          ) : null}
        </div>

        <div className="microphone-workbench__preset">
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
          <MicrophoneTest support={snapshot.audio.capabilities.microphoneTest} />
        </div>
      </header>

      <section className="audio-primary-section" aria-labelledby="microphone-equalizer-heading">
        <SettingToggle
          title="Voice EQ"
          description="Shape your voice by dragging a band, or enter an exact value below."
          checked={equalizer.enabled}
          disabled={unavailable}
          pending={processingPending}
          technicalName="Parametric equalizer"
          onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'equalizer', enabled })}
        />
        <ParametricEq
          bands={equalizer.parameters.bands}
          disabled={unavailable || !equalizer.enabled || processingPending}
          onCommit={(bands) => void setMicProcessor({ processorId: 'equalizer', parameters: { bands } })}
        />
      </section>

      <section className="audio-simple-grid microphone-controls-grid">
        <div className="audio-simple-section">
          <SettingToggle
            title="Noise removal"
            description="Reduces fans, keyboard noise, and background sound."
            checked={suppression.enabled}
            disabled={unavailable}
            pending={processingPending}
            technicalName="Noise suppression"
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'noise-suppression', enabled })}
          />
          <SemanticChoice
            label="Noise removal strength"
            value={matchNoiseRemoval(suppression.parameters.amount)}
            options={noiseOptions}
            disabled={unavailable || !suppression.enabled || processingPending}
            onChange={(strength) => void setMicProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount: noiseRemovalAmounts[strength] } })}
          />
        </div>

        <div className="audio-simple-section">
          <SettingToggle
            title="Noise gate"
            description="Stops background sound while you are not speaking."
            checked={gate.enabled}
            disabled={unavailable}
            pending={processingPending}
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'noise-gate', enabled })}
          />
          <SemanticChoice
            label="Noise gate strength"
            value={matchGate(gate.parameters.thresholdDb)}
            options={gateOptions}
            disabled={unavailable || !gate.enabled || processingPending}
            onChange={(strength) => void setMicProcessor({ processorId: 'noise-gate', enabled: true, parameters: { thresholdDb: gateThresholds[strength] } })}
          />
        </div>

        <div className="audio-simple-section">
          <SettingToggle
            title="Voice consistency"
            description="Keeps quiet and loud speech at a similar level."
            checked={compressor.enabled}
            disabled={unavailable}
            pending={processingPending}
            technicalName="Compressor"
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'compressor', enabled })}
          />
          <SemanticChoice
            label="Voice consistency style"
            value={matchVoiceConsistency(compressor.parameters)}
            options={voiceOptions}
            disabled={unavailable || !compressor.enabled || processingPending}
            onChange={(style) => void setMicProcessor({ processorId: 'compressor', enabled: true, parameters: voiceConsistency[style] })}
          />
        </div>

        <div className="audio-simple-section microphone-input-volume">
          <PrimarySlider
            label="Input volume"
            description="Adjusts your voice after the microphone's hardware level."
            value={gain.parameters.gainDb}
            min={-20}
            max={30}
            step={0.5}
            unit="dB"
            disabled={unavailable || !gain.enabled || processingPending}
            onCommit={(gainDb) => void setMicProcessor({ processorId: 'gain', enabled: true, parameters: { gainDb } })}
          />
        </div>

        <div className="audio-simple-section">
          <SettingToggle
            title="Output safety"
            description="Prevents sudden clipping and excessive peaks."
            checked={limiter.enabled}
            disabled={unavailable}
            pending={processingPending}
            technicalName="Limiter"
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'limiter', enabled })}
          />
        </div>
      </section>

      <section id="microphone-monitoring" className="monitoring-section" aria-labelledby="microphone-monitoring-heading">
        <SettingToggle
          title="Monitoring"
          description={monitoringUnavailable ? 'Monitoring is not available with the current audio setup.' : 'Hear your microphone through the selected output.'}
          checked={snapshot.audio.monitoringEnabled}
          disabled={monitoringUnavailable}
          pending={actionPending === 'audio:monitoring'}
          onCheckedChange={(enabled) => void setAudioMonitoring({ enabled })}
        />
        <div className="monitoring-section__controls">
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
          <ProcessorSection id="microphone-noise-suppression" title="Noise suppression" enabled={suppression.enabled} pending={processingPending} support={support} onEnabledChange={(enabled) => void setMicProcessor({ processorId: 'noise-suppression', enabled })}>
            <ParameterControl label="Strength" value={suppression.parameters.amount} min={0} max={100} step={1} unit="%" disabled={unavailable || !suppression.enabled || processingPending} onCommit={(amount) => void setMicProcessor({ processorId: 'noise-suppression', parameters: { amount } })} />
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
