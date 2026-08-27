import type { MicProcessor, MicProcessorId, SystemSnapshot } from '../../../../shared/contracts';
import { AdvancedDisclosure, PrimarySlider } from '@/components/shared/human-controls';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/cn';
import { AudioWorkbenchHeader } from './AudioWorkbenchHeader';
import { AudioDevicePicker } from './AudioDevicePicker';
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

interface ChainStage {
  targetId: string;
  label: string;
  enabled: boolean;
  unavailable?: boolean;
}

function MicrophoneChain({ stages }: { stages: ChainStage[] }) {
  const goTo = (targetId: string) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(targetId)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <nav className="mic-chain" aria-label="Microphone signal chain">
      <span className="mic-chain__label">Signal chain</span>
      <ol className="mic-chain__stages">
        {stages.map((stage, index) => (
          <li key={stage.targetId} className="mic-chain__stage">
            {index > 0 ? <span className="mic-chain__link" aria-hidden="true" /> : null}
            <button
              type="button"
              aria-label={`${stage.label}, ${stage.unavailable ? 'unavailable' : stage.enabled ? 'on' : 'off'}`}
              onClick={() => goTo(stage.targetId)}
            >
              <span
                className="mic-chain__dot"
                data-state={stage.unavailable ? 'unavailable' : stage.enabled ? 'on' : 'off'}
                aria-hidden="true"
              />
              {stage.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
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
        <span>{checked ? 'On' : 'Off'}</span>
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

function MicStrength<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T | 'custom';
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const custom = value === 'custom';
  return (
    <div className="mic-strength">
      <ToggleGroup
        type="single"
        value={custom ? '' : value}
        disabled={disabled}
        aria-label={label}
        onValueChange={(next) => next && onChange(next as T)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {custom ? <span className="mic-strength__custom">Custom</span> : null}
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

  const chainStages: ChainStage[] = [
    { targetId: 'microphone-input-section', label: 'Input volume', enabled: gain.enabled },
    { targetId: 'microphone-gate-section', label: 'Noise gate', enabled: gate.enabled },
    { targetId: 'microphone-removal-section', label: 'Noise removal', enabled: suppression.enabled && !suppressionUnavailable, unavailable: suppressionUnavailable },
    { targetId: 'microphone-equalizer-section', label: 'Voice EQ', enabled: equalizer.enabled },
    { targetId: 'microphone-consistency-section', label: 'Voice consistency', enabled: compressor.enabled },
    { targetId: 'microphone-safety-section', label: 'Output safety', enabled: limiter.enabled },
  ];

  return (
    <div className="audio-workbench microphone-workbench" data-channel="microphone">
      <AudioWorkbenchHeader
        title="Microphone"
        subtitle="Input volume, noise control, voice EQ, and monitoring."
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
              support={snapshot.audio.capabilities.microphoneTest}
              pending={actionPending === 'audio:microphone-test'}
              onRecord={() => void testMicrophone()}
            />
          </>
        )}
      />

      {support !== 'available' ? (
        <p className="audio-workbench__availability" role="status">
          {support === 'simulation'
            ? 'Voice processing is not available on this setup yet. Your settings will still be saved.'
            : 'Voice processing is unavailable for this microphone.'}
        </p>
      ) : null}

      <MicrophoneChain stages={chainStages} />

      <section id="microphone-equalizer-section" className="mic-section mic-section--equalizer" aria-labelledby="microphone-equalizer-heading">
        <MicSetting
          headingId="microphone-equalizer-heading"
          title="Voice EQ"
          description="Shape your voice by dragging a band, or enter an exact value below."
          technicalName="Parametric equalizer"
          checked={equalizer.enabled}
          disabled={unavailable}
          pending={processingPending}
          onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'equalizer', enabled })}
        />
        <ParametricEq
          bands={equalizer.parameters.bands}
          disabled={unavailable || !equalizer.enabled || processingPending}
          onCommit={(bands) => void setMicProcessor({ processorId: 'equalizer', parameters: { bands } })}
        />
      </section>

      <section id="microphone-input-section" className="mic-section mic-section--volume">
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
      </section>

      <section className="mic-rows" aria-label="Microphone processors">
        <div id="microphone-gate-section" className="mic-rows__row">
          <MicSetting
            headingId="microphone-gate-heading"
            title="Noise gate"
            description="Stops background sound while you are not speaking."
            checked={gate.enabled}
            disabled={unavailable}
            pending={processingPending}
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'noise-gate', enabled })}
          >
            <MicStrength
              label="Noise gate strength"
              value={matchGate(gate.parameters.thresholdDb)}
              options={gateOptions}
              disabled={unavailable || !gate.enabled || processingPending}
              onChange={(strength) => void setMicProcessor({ processorId: 'noise-gate', enabled: true, parameters: { thresholdDb: gateThresholds[strength] } })}
            />
          </MicSetting>
        </div>

        <div id="microphone-removal-section" className="mic-rows__row">
          <MicSetting
            headingId="microphone-removal-heading"
            title="Noise removal"
            description={suppressionUnavailable
              ? suppressionError ?? 'Noise removal is unavailable with the current audio setup.'
              : 'Reduces fans, keyboard noise, and background sound.'}
            technicalName="Noise suppression"
            checked={suppression.enabled && !suppressionUnavailable}
            disabled={suppressionUnavailable}
            pending={processingPending}
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'noise-suppression', enabled })}
          >
            <MicStrength
              label="Noise removal strength"
              value={matchNoiseRemoval(suppression.parameters.amount)}
              options={noiseOptions}
              disabled={suppressionUnavailable || !suppression.enabled || processingPending}
              onChange={(strength) => void setMicProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount: noiseRemovalAmounts[strength] } })}
            />
          </MicSetting>
        </div>

        <div id="microphone-consistency-section" className="mic-rows__row">
          <MicSetting
            headingId="microphone-consistency-heading"
            title="Voice consistency"
            description="Keeps quiet and loud speech at a similar level."
            technicalName="Compressor"
            checked={compressor.enabled}
            disabled={unavailable}
            pending={processingPending}
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'compressor', enabled })}
          >
            <MicStrength
              label="Voice consistency style"
              value={matchVoiceConsistency(compressor.parameters)}
              options={voiceOptions}
              disabled={unavailable || !compressor.enabled || processingPending}
              onChange={(style) => void setMicProcessor({ processorId: 'compressor', enabled: true, parameters: voiceConsistency[style] })}
            />
          </MicSetting>
        </div>

        <div id="microphone-safety-section" className="mic-rows__row">
          <MicSetting
            headingId="microphone-safety-heading"
            title="Output safety"
            description="Prevents sudden clipping and excessive peaks."
            technicalName="Limiter"
            checked={limiter.enabled}
            disabled={unavailable}
            pending={processingPending}
            onCheckedChange={(enabled) => void setMicProcessor({ processorId: 'limiter', enabled })}
          />
        </div>
      </section>

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
