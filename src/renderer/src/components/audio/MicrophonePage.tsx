import type {
  MicProcessor,
  MicProcessorId,
  SetMicProcessorInput,
  SystemSnapshot,
} from '../../../../shared/contracts';
import { microphoneMonitoringApplied } from '../../../../shared/microphone-runtime';
import { useState } from 'react';
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
        <span>{pending ? 'Applying…' : checked ? 'On' : 'Off'}</span>
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
  const [microphoneTestPending, setMicrophoneTestPending] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<Record<string, number>>({});
  const micBus = snapshot.audio.buses.find((candidate) => candidate.id === 'mic');
  const gain = getProcessor(snapshot.audio.micProcessors, 'gain');
  const gate = getProcessor(snapshot.audio.micProcessors, 'noise-gate');
  const suppression = getProcessor(snapshot.audio.micProcessors, 'noise-suppression');
  const equalizer = getProcessor(snapshot.audio.micProcessors, 'equalizer');
  const compressor = getProcessor(snapshot.audio.micProcessors, 'compressor');
  const limiter = getProcessor(snapshot.audio.micProcessors, 'limiter');
  const support = snapshot.audio.capabilities.microphoneDsp;
  const suppressionSupport = snapshot.audio.capabilities.noiseSuppression;
  const suppressionError = snapshot.audio.host?.noiseSuppression.lastError
    ?? snapshot.audio.host?.capabilities.reason;
  const desktopFeatures = Boolean(window.switchboard);
  const unavailable = support !== 'available';
  const suppressionUnavailable = suppressionSupport !== 'available';
  const monitoringUnavailable = snapshot.audio.capabilities.monitoring !== 'available';
  const processorPending = Object.keys(pendingOperations).some((key) => key.startsWith('processor:'));
  const presetPending = Boolean(pendingOperations.preset);
  const monitoringPending = Boolean(pendingOperations.monitoring);
  const monitoringApplied = microphoneMonitoringApplied(snapshot.audio);
  const monitoringDescription = monitoringUnavailable
    ? snapshot.audio.host?.microphone?.error ?? 'Monitoring is not available with the current audio setup.'
    : monitoringPending
      ? 'Applying the monitoring output and volume.'
      : snapshot.audio.monitoringEnabled && !monitoringApplied
        ? snapshot.audio.host?.microphone?.error ?? 'The selected output has not accepted the monitor stream.'
        : snapshot.audio.monitoringEnabled
          ? 'Processed microphone audio is live on the selected output.'
          : 'Hear your processed microphone through the selected output.';

  const runPending = (key: string, operation: () => Promise<void>) => {
    setPendingOperations((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
    void operation().finally(() => {
      setPendingOperations((current) => {
        const next = { ...current };
        if ((next[key] ?? 0) <= 1) delete next[key];
        else next[key] = (next[key] ?? 1) - 1;
        return next;
      });
    });
  };

  const commitProcessor = (input: SetMicProcessorInput) => {
    runPending(`processor:${input.processorId}`, () => setMicProcessor(input));
  };

  if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) {
    return <div className="px-6 py-8 text-sm text-destructive">Microphone sound settings are unavailable.</div>;
  }

  return (
    <div className="audio-workbench microphone-workbench" data-channel="microphone">
      {snapshot.audio.enabled && support !== 'available' ? (
        <p className="audio-workbench__availability" role="status">
          {support === 'simulation'
            ? 'This preview does not process microphone audio. Use the desktop application and native Audio.Host.'
            : snapshot.audio.host?.microphone?.error ?? 'Voice processing is unavailable for the selected microphone.'}
        </p>
      ) : null}

      <div className="audio-main-grid microphone-main-grid">
        <section id="microphone-equalizer-section" className="mic-section mic-section--equalizer audio-primary-section" aria-labelledby="microphone-equalizer-heading">
          <EqualizerHeader
            headingId="microphone-equalizer-heading"
            checked={equalizer.enabled}
            disabled={unavailable}
            pending={Boolean(pendingOperations['processor:equalizer'])}
            onCheckedChange={(enabled) => commitProcessor({ processorId: 'equalizer', enabled })}
            tools={(
              <>
                <PresetPicker
                  kind="microphone"
                  label="Voice preset"
                  presets={snapshot.audio.pathPresets}
                  activeId={snapshot.audio.activePresetIds.microphone}
                  pending={presetPending || unavailable}
                  desktopFeatures={desktopFeatures}
                  onApply={(presetId) => runPending('preset', () => applyAudioPreset({ presetId }))}
                  onCreate={(name) => runPending('preset', () => createAudioPreset({ kind: 'microphone', name }))}
                  onRename={(presetId, name) => runPending('preset', () => renameAudioPreset({ presetId, name }))}
                  onDuplicate={(presetId) => runPending('preset', () => duplicateAudioPreset({ presetId }))}
                  onDelete={(presetId) => runPending('preset', () => deleteAudioPreset({ presetId }))}
                  onImport={() => runPending('preset', importAudioPreset)}
                  onExport={(presetId) => runPending('preset', () => exportAudioPreset({ presetId }))}
                />
                <MicrophoneTest
                  compact
                  support={snapshot.audio.capabilities.microphoneTest}
                  pending={microphoneTestPending}
                  onRecord={() => {
                    setMicrophoneTestPending(true);
                    void testMicrophone().finally(() => setMicrophoneTestPending(false));
                  }}
                />
              </>
            )}
          />
          <ParametricEq
            bands={equalizer.parameters.bands}
            disabled={unavailable || !equalizer.enabled || Boolean(pendingOperations['processor:equalizer'])}
            onCommit={(bands) => commitProcessor({ processorId: 'equalizer', parameters: { bands } })}
          />
        </section>

        <section className="audio-control-rail mic-control-rail" aria-label="Microphone processing controls" aria-busy={processorPending}>
          <section id="microphone-input-section" className="mic-rail__input">
            <MicSetting
              headingId="microphone-input-heading"
              title="Input volume"
              description="Software level after cleanup, before tone and dynamics."
              checked={gain.enabled}
              disabled={unavailable}
              pending={Boolean(pendingOperations['processor:gain'])}
              onCheckedChange={(enabled) => commitProcessor({ processorId: 'gain', enabled })}
            >
              <PrimarySlider
                label="Gain"
                value={gain.parameters.gainDb}
                min={-20}
                max={30}
                step={0.5}
                unit="dB"
                disabled={unavailable || !gain.enabled || Boolean(pendingOperations['processor:gain'])}
                onCommit={(gainDb) => commitProcessor({ processorId: 'gain', enabled: true, parameters: { gainDb } })}
              />
            </MicSetting>
          </section>

          <div className="mic-processor-column" role="group" aria-label="Gate and voice consistency">
            <div id="microphone-gate-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-gate-heading"
                title="Noise gate"
                description="Mutes the room while you are not speaking."
                checked={gate.enabled}
                disabled={unavailable}
                pending={Boolean(pendingOperations['processor:noise-gate'])}
                onCheckedChange={(enabled) => commitProcessor({ processorId: 'noise-gate', enabled })}
              >
                <div className="mic-parameter-stack">
                  <PrimarySlider
                    label="Gate threshold"
                    value={gate.parameters.thresholdDb}
                    min={-80}
                    max={-10}
                    step={0.5}
                    unit="dB"
                    disabled={unavailable || !gate.enabled || Boolean(pendingOperations['processor:noise-gate'])}
                    onCommit={(thresholdDb) => commitProcessor({ processorId: 'noise-gate', enabled: true, parameters: { thresholdDb } })}
                  />
                  <ParameterControl label="Attack" value={gate.parameters.attackMs} min={0.1} max={100} step={0.5} unit=" ms" precision={1} disabled={unavailable || !gate.enabled || Boolean(pendingOperations['processor:noise-gate'])} onCommit={(attackMs) => commitProcessor({ processorId: 'noise-gate', parameters: { attackMs } })} />
                  <ParameterControl label="Release" value={gate.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !gate.enabled || Boolean(pendingOperations['processor:noise-gate'])} onCommit={(releaseMs) => commitProcessor({ processorId: 'noise-gate', parameters: { releaseMs } })} />
                </div>
              </MicSetting>
            </div>

            <div id="microphone-consistency-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-consistency-heading"
                title="Voice consistency"
                description="Keeps quiet and loud speech at a similar level."
                checked={compressor.enabled}
                disabled={unavailable}
                pending={Boolean(pendingOperations['processor:compressor'])}
                onCheckedChange={(enabled) => commitProcessor({ processorId: 'compressor', enabled })}
              >
                <div className="mic-parameter-stack">
                  <PrimarySlider
                    label="Compression ratio"
                    value={compressor.parameters.ratio}
                    min={1}
                    max={20}
                    step={0.1}
                    unit=":1"
                    disabled={unavailable || !compressor.enabled || Boolean(pendingOperations['processor:compressor'])}
                    onCommit={(ratio) => commitProcessor({ processorId: 'compressor', enabled: true, parameters: { ratio } })}
                  />
                  <ParameterControl label="Threshold" value={compressor.parameters.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || Boolean(pendingOperations['processor:compressor'])} onCommit={(thresholdDb) => commitProcessor({ processorId: 'compressor', parameters: { thresholdDb } })} />
                  <ParameterControl label="Attack" value={compressor.parameters.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !compressor.enabled || Boolean(pendingOperations['processor:compressor'])} onCommit={(attackMs) => commitProcessor({ processorId: 'compressor', parameters: { attackMs } })} />
                  <ParameterControl label="Release" value={compressor.parameters.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !compressor.enabled || Boolean(pendingOperations['processor:compressor'])} onCommit={(releaseMs) => commitProcessor({ processorId: 'compressor', parameters: { releaseMs } })} />
                  <ParameterControl label="Makeup gain" value={compressor.parameters.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || Boolean(pendingOperations['processor:compressor'])} onCommit={(makeupDb) => commitProcessor({ processorId: 'compressor', parameters: { makeupDb } })} />
                </div>
              </MicSetting>
            </div>
          </div>

          <div className="mic-processor-column" role="group" aria-label="Noise removal, output safety, and monitoring">
            <div id="microphone-removal-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-removal-heading"
                title="Noise removal"
                description={suppressionUnavailable
                  ? suppressionError ?? 'Unavailable with the current audio setup.'
                  : 'Reduces fans, keys, and background sound.'}
                checked={suppression.enabled && !suppressionUnavailable}
                disabled={suppressionUnavailable}
                pending={Boolean(pendingOperations['processor:noise-suppression'])}
                onCheckedChange={(enabled) => commitProcessor({ processorId: 'noise-suppression', enabled })}
                className="mic-setting--compact"
              >
                <PrimarySlider
                  label="Removal strength"
                  value={suppression.parameters.amount}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  disabled={suppressionUnavailable || !suppression.enabled || Boolean(pendingOperations['processor:noise-suppression'])}
                  onCommit={(amount) => commitProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount } })}
                />
              </MicSetting>
            </div>

            <div id="microphone-safety-section" className="mic-rows__row">
              <MicSetting
                headingId="microphone-safety-heading"
                title="Output safety"
                description="Catches clipping and sudden peaks."
                checked={limiter.enabled}
                disabled={unavailable}
                pending={Boolean(pendingOperations['processor:limiter'])}
                onCheckedChange={(enabled) => commitProcessor({ processorId: 'limiter', enabled })}
                className="mic-setting--compact"
              >
                <div className="mic-parameter-stack">
                  <ParameterControl label="Ceiling" value={limiter.parameters.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !limiter.enabled || Boolean(pendingOperations['processor:limiter'])} onCommit={(thresholdDb) => commitProcessor({ processorId: 'limiter', parameters: { thresholdDb } })} />
                  <ParameterControl label="Release" value={limiter.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !limiter.enabled || Boolean(pendingOperations['processor:limiter'])} onCommit={(releaseMs) => commitProcessor({ processorId: 'limiter', parameters: { releaseMs } })} />
                </div>
              </MicSetting>
            </div>

            <section id="microphone-monitoring-section" className="mic-section mic-section--monitoring" aria-labelledby="microphone-monitoring-heading">
              <MicSetting
                headingId="microphone-monitoring-heading"
                title="Monitoring"
                description={monitoringDescription}
                checked={snapshot.audio.monitoringEnabled}
                disabled={monitoringUnavailable}
                pending={monitoringPending}
                onCheckedChange={(enabled) => runPending('monitoring', () => setAudioMonitoring({ enabled }))}
                className="mic-setting--monitoring"
              />
              <div className="mic-monitoring__controls">
                <label>
                  <span>Hear your microphone through</span>
                  <AudioDevicePicker
                    value={snapshot.audio.monitoringDeviceId}
                    devices={snapshot.audio.devices}
                    direction="output"
                    label="Microphone monitoring device"
                    disabled={monitoringUnavailable || monitoringPending}
                    onChange={(deviceId) => runPending('monitoring', () => setAudioMonitoring({ deviceId }))}
                  />
                </label>
                <PrimarySlider
                  label="Monitor volume"
                  value={snapshot.audio.monitoring * 100}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  disabled={monitoringUnavailable || monitoringPending || !snapshot.audio.monitoringEnabled}
                  onCommit={(level) => runPending('monitoring', () => setAudioMonitoring({ level: level / 100 }))}
                />
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
