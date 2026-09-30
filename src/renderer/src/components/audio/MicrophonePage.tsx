import { memo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AudioDeviceDirection, AudioState, MicProcessor, MicProcessorId, SetMicProcessorInput } from '../../../../shared/contracts';
import { microphoneMonitoringApplied } from '../../../../shared/microphone-runtime';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { AudioChannelHeader, AudioNotice } from './AudioModule';
import { AudioDeviceManager } from './AudioDeviceManager';
import { AudioDevicePicker } from './AudioDevicePicker';
import { MicInputMeter } from './MicInputMeter';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { MicrophoneTest } from './testing/MicrophoneTest';
import { noiseRemovalAmounts } from './semantic-mapping';
import { useSystemStore } from '@/stores/use-system-store';

function getProcessor<T extends MicProcessorId>(processors: MicProcessor[], id: T): Extract<MicProcessor, { id: T }> | null {
  return (processors.find((processor) => processor.id === id) as Extract<MicProcessor, { id: T }> | undefined) ?? null;
}

/**
 * Microphone workspace: one reading column. The source (device, live level,
 * input volume) sits on top; processing follows in groups by what it does to
 * the voice. A stage that is off collapses to its header, and timing controls
 * wait behind Advanced so the page reads as a short list of decisions.
 * Takes only the audio branch so engine telemetry ticks do not re-render it.
 */
export const MicrophonePage = memo(function MicrophonePage({ audio, engineRunning }: { audio: AudioState; engineRunning: boolean }) {
  const setMicProcessor = useSystemStore((state) => state.setMicProcessor);
  const setAudioMonitoring = useSystemStore((state) => state.setAudioMonitoring);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const setAudioDeviceExcluded = useSystemStore((state) => state.setAudioDeviceExcluded);
  const testMicrophone = useSystemStore((state) => state.testMicrophone);
  const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
  const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
  const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
  const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
  const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
  const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
  const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
  const audioPending = useSystemStore((state) => state.pendingAudioOperations > 0);
  const [microphoneTestPending, setMicrophoneTestPending] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<Record<string, number>>({});
  const [deviceManager, setDeviceManager] = useState<AudioDeviceDirection | null>(null);

  const micBus = audio.buses.find((candidate) => candidate.id === 'mic');
  const gain = getProcessor(audio.micProcessors, 'gain');
  const gate = getProcessor(audio.micProcessors, 'noise-gate');
  const suppression = getProcessor(audio.micProcessors, 'noise-suppression');
  const equalizer = getProcessor(audio.micProcessors, 'equalizer');
  const compressor = getProcessor(audio.micProcessors, 'compressor');
  const limiter = getProcessor(audio.micProcessors, 'limiter');
  const support = audio.capabilities.microphoneDsp;
  const unavailable = support !== 'available';
  const suppressionUnavailable = audio.capabilities.noiseSuppression !== 'available';
  const suppressionError = audio.host?.noiseSuppression.lastError ?? audio.host?.capabilities.reason;
  const monitoringUnavailable = audio.capabilities.monitoring !== 'available';
  const presetPending = Boolean(pendingOperations.preset);
  const monitoringPending = Boolean(pendingOperations.monitoring);
  const devicePending = Boolean(pendingOperations.device);
  const monitoringApplied = microphoneMonitoringApplied(audio);
  const metering = audio.capabilities.realtimeMetering;
  const excludedIds = audio.excludedDeviceIds;
  const monitoringProblem = audio.enabled && (monitoringUnavailable || (audio.monitoringEnabled && !monitoringApplied && !monitoringPending));
  const monitoringStatus = monitoringUnavailable
    ? audio.host?.microphone?.error ?? 'Monitoring is not available with the current audio setup.'
    : monitoringPending
      ? 'Applying the monitoring output and volume.'
      : audio.monitoringEnabled && !monitoringApplied
        ? audio.host?.microphone?.error ?? 'The selected output has not accepted the monitor stream.'
        : audio.monitoringEnabled
          ? 'Hearing your processed voice'
          : 'Off';

  const runPending = (key: string, operation: () => Promise<void>) => {
    setPendingOperations((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
    return operation().finally(() => {
      setPendingOperations((current) => {
        const next = { ...current };
        if ((next[key] ?? 0) <= 1) delete next[key];
        else next[key] = (next[key] ?? 1) - 1;
        return next;
      });
    });
  };
  const commitProcessor = (input: SetMicProcessorInput) => runPending(`processor:${input.processorId}`, () => setMicProcessor(input));
  const toggle = (processorId: MicProcessorId) => (enabled: boolean) => void commitProcessor({ processorId, enabled });

  if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) {
    return <div className="px-6 py-8 text-sm text-destructive">Microphone sound settings are unavailable.</div>;
  }

  const meterActive = engineRunning && micBus.enabled && metering === 'available';
  const meterInactiveLabel = !engineRunning ? 'Audio off' : metering !== 'available' ? 'Level unavailable' : 'Channel off';

  return (
    <div className="audio-channel audio-channel--microphone mic-page" data-channel="microphone">
      <AudioChannelHeader channel="mic" title="Microphone" detail="Cleanup, tone, and dynamics for your voice">
        {/* Listen-back sits with the other channel-wide controls; it survives preset changes. */}
        <div
          id="microphone-monitoring-section"
          className={cn('mic-monitor', audio.monitoringEnabled && !monitoringUnavailable && 'is-on')}
          role="group"
          aria-label="Monitoring"
          aria-busy={monitoringPending || undefined}
          title={monitoringStatus}
        >
          <Switch
            checked={audio.monitoringEnabled}
            disabled={monitoringUnavailable}
            aria-label={`${audio.monitoringEnabled ? 'Turn off' : 'Turn on'} monitoring`}
            onCheckedChange={(enabled) => void runPending('monitoring', () => setAudioMonitoring({ enabled }))}
          />
          <span className="audio-eyebrow">Monitor</span>
          <AudioDevicePicker
            value={audio.monitoringDeviceId}
            devices={audio.devices}
            direction="output"
            label="Microphone monitoring device"
            className="mic-monitor__picker"
            disabled={monitoringPending || monitoringUnavailable}
            excludedIds={excludedIds}
            onManage={() => setDeviceManager('output')}
            onChange={(deviceId) => void runPending('monitoring', () => setAudioMonitoring({ deviceId }))}
          />
          <ParameterControl label="Monitor volume" value={audio.monitoring * 100} min={0} max={100} step={1} unit="%" disabled={monitoringUnavailable} onCommit={(level) => void runPending('monitoring', () => setAudioMonitoring({ level: level / 100 }))} />
        </div>
        <div className="audio-channel-head__preset">
          <span className="audio-eyebrow">Preset</span>
          <PresetPicker
            kind="microphone"
            label="Voice preset"
            presets={audio.pathPresets}
            activeId={audio.activePresetIds.microphone}
            pending={presetPending || unavailable}
            desktopFeatures={Boolean(window.switchboard)}
            onApply={(presetId) => runPending('preset', () => applyAudioPreset({ presetId }))}
            onCreate={(name) => runPending('preset', () => createAudioPreset({ kind: 'microphone', name }))}
            onRename={(presetId, name) => runPending('preset', () => renameAudioPreset({ presetId, name }))}
            onDuplicate={(presetId) => runPending('preset', () => duplicateAudioPreset({ presetId }))}
            onDelete={(presetId) => runPending('preset', () => deleteAudioPreset({ presetId }))}
            onImport={() => runPending('preset', importAudioPreset)}
            onExport={(presetId) => runPending('preset', () => exportAudioPreset({ presetId }))}
          />
        </div>
        <MicrophoneTest
          support={audio.capabilities.microphoneTest}
          pending={microphoneTestPending}
          compact
          onRecord={() => {
            setMicrophoneTestPending(true);
            void testMicrophone().finally(() => setMicrophoneTestPending(false));
          }}
        />
      </AudioChannelHeader>

      {audio.enabled && unavailable ? (
        <AudioNotice>
          {support === 'simulation'
            ? 'This preview does not process microphone audio. Use the desktop application and native Audio.Host.'
            : audio.host?.microphone?.error ?? 'Voice processing is unavailable for the selected microphone.'}
        </AudioNotice>
      ) : null}

      {/* Only a failed processed-microphone output needs attention; a working one stays quiet. */}
      {audio.enabled && audio.host?.microphone?.virtualOutput && !audio.host.microphone.virtualOutput.running ? (
        <AudioNotice>{audio.host.microphone.virtualOutput.error ?? 'Processed microphone output is unavailable.'}</AudioNotice>
      ) : null}

      {monitoringProblem ? <AudioNotice>{monitoringStatus}</AudioNotice> : null}

      <section className="mic-source" aria-labelledby="microphone-source-heading">
        <div className="mic-source__row">
          <div className="mic-source__field">
            <h3 id="microphone-source-heading" className="mic-source__label">Input device</h3>
            <AudioDevicePicker
              value={micBus.deviceId}
              devices={audio.devices}
              direction="input"
              label="Microphone input device"
              className="mic-source__picker"
              disabled={devicePending}
              excludedIds={excludedIds}
              onManage={() => setDeviceManager('input')}
              onChange={(deviceId) => void runPending('device', () => setAudioBusDevice({ busId: 'mic', deviceId }))}
            />
          </div>
          <div id="microphone-input-section" className="mic-source__field">
            <div className="mic-source__gain-head">
              <span id="microphone-input-heading" className="mic-source__label">Input volume</span>
              <Switch
                checked={gain.enabled}
                disabled={unavailable}
                aria-label={`${gain.enabled ? 'Bypass' : 'Enable'} input volume`}
                onCheckedChange={toggle('gain')}
              />
            </div>
            <ParameterControl label="Gain" value={gain.parameters.gainDb} min={-20} max={30} step={0.5} unit=" dB" disabled={unavailable || !gain.enabled} onCommit={(gainDb) => void commitProcessor({ processorId: 'gain', enabled: true, parameters: { gainDb } })} />
          </div>
        </div>
        <MicInputMeter busId="mic" active={meterActive} inactiveLabel={meterInactiveLabel} label="Input level" />
      </section>

      <div className="mic-tone">
        <MicStage
          id="microphone-equalizer-section"
          title="Equalizer"
          description="Hover the curve and click + to add a band. Drag to adjust, or enter exact values below."
          checked={equalizer.enabled}
          unavailable={unavailable}
          onCheckedChange={toggle('equalizer')}
        >
          <ParametricEq bands={equalizer.parameters.bands} disabled={unavailable || !equalizer.enabled} onCommit={(bands) => commitProcessor({ processorId: 'equalizer', parameters: { bands } })} />
        </MicStage>
      </div>

      <MicSection title="Processing" variant="processing">
        <MicStage
          id="microphone-removal-section"
          title="Noise removal"
          description={suppressionUnavailable ? suppressionError ?? 'Unavailable with the current audio setup.' : 'Reduces room noise. Higher strength can change your voice.'}
          checked={suppression.enabled && suppression.parameters.amount > 0 && !suppressionUnavailable}
          unavailable={suppressionUnavailable}
          pending={Boolean(pendingOperations['processor:noise-suppression'])}
          onCheckedChange={(enabled) => void commitProcessor({ processorId: 'noise-suppression', enabled,
            parameters: { amount: enabled && suppression.parameters.amount === 0 ? noiseRemovalAmounts.balanced : suppression.parameters.amount } })}
        >
          <ParameterControl label="Strength" value={suppression.parameters.amount} min={0} max={100} step={1} unit="%" disabled={Boolean(pendingOperations['processor:noise-suppression'])} onCommit={(amount) => void commitProcessor({ processorId: 'noise-suppression', enabled: amount > 0, parameters: { amount } })} />
        </MicStage>
        <MicStage
          id="microphone-gate-section"
          title="Noise gate"
          description="Mutes the room while you are not speaking."
          checked={gate.enabled}
          unavailable={unavailable}
          onCheckedChange={toggle('noise-gate')}
          advanced={(
            <>
              <ParameterControl label="Attack" value={gate.parameters.attackMs} min={0.1} max={100} step={0.5} unit=" ms" precision={1} onCommit={(attackMs) => void commitProcessor({ processorId: 'noise-gate', parameters: { attackMs } })} />
              <ParameterControl label="Release" value={gate.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" onCommit={(releaseMs) => void commitProcessor({ processorId: 'noise-gate', parameters: { releaseMs } })} />
            </>
          )}
        >
          <ParameterControl label="Threshold" value={gate.parameters.thresholdDb} min={-80} max={-10} step={0.5} unit=" dB" precision={1} onCommit={(thresholdDb) => void commitProcessor({ processorId: 'noise-gate', parameters: { thresholdDb } })} />
        </MicStage>
        <MicStage
          id="microphone-consistency-section"
          title="Voice consistency"
          description="Keeps quiet and loud speech at a similar level."
          checked={compressor.enabled}
          unavailable={unavailable}
          onCheckedChange={toggle('compressor')}
          advanced={(
            <>
              <ParameterControl label="Attack" value={compressor.parameters.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} onCommit={(attackMs) => void commitProcessor({ processorId: 'compressor', parameters: { attackMs } })} />
              <ParameterControl label="Release" value={compressor.parameters.releaseMs} min={10} max={2_000} step={5} unit=" ms" onCommit={(releaseMs) => void commitProcessor({ processorId: 'compressor', parameters: { releaseMs } })} />
              <ParameterControl label="Makeup gain" value={compressor.parameters.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} onCommit={(makeupDb) => void commitProcessor({ processorId: 'compressor', parameters: { makeupDb } })} />
            </>
          )}
        >
          <ParameterControl label="Ratio" value={compressor.parameters.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} onCommit={(ratio) => void commitProcessor({ processorId: 'compressor', enabled: true, parameters: { ratio } })} />
          <ParameterControl label="Threshold" value={compressor.parameters.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} onCommit={(thresholdDb) => void commitProcessor({ processorId: 'compressor', parameters: { thresholdDb } })} />
        </MicStage>
        <MicStage
          id="microphone-safety-section"
          title="Output safety"
          description="Catches clipping and sudden peaks."
          checked={limiter.enabled}
          unavailable={unavailable}
          onCheckedChange={toggle('limiter')}
          advanced={<ParameterControl label="Release" value={limiter.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" onCommit={(releaseMs) => void commitProcessor({ processorId: 'limiter', parameters: { releaseMs } })} />}
        >
          <ParameterControl label="Ceiling" value={limiter.parameters.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} onCommit={(thresholdDb) => void commitProcessor({ processorId: 'limiter', parameters: { thresholdDb } })} />
        </MicStage>
      </MicSection>

      <AudioDeviceManager
        open={deviceManager !== null}
        onOpenChange={(open) => { if (!open) setDeviceManager(null); }}
        initialDirection={deviceManager ?? 'input'}
        devices={audio.devices}
        excludedIds={excludedIds}
        inUseIds={[...audio.buses.map((bus) => bus.deviceId), audio.monitoringDeviceId]}
        pending={audioPending}
        onExcludedChange={(deviceId, excluded) => void setAudioDeviceExcluded({ deviceId, excluded })}
      />
    </div>
  );
});

function MicSection({ title, variant, children }: { title: string; variant?: 'processing'; children: ReactNode }) {
  const id = `microphone-group-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className={cn('mic-section', variant && `mic-section--${variant}`)} aria-labelledby={id}>
      <h3 id={id} className="mic-section__title">{title}</h3>
      <div className="mic-section__stages">{children}</div>
    </section>
  );
}

/** One processing stage. Off collapses it to its header; Advanced holds timing controls. */
function MicStage({
  id,
  title,
  description,
  checked,
  unavailable,
  pending = false,
  advanced,
  onCheckedChange,
  children,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  unavailable: boolean;
  pending?: boolean;
  advanced?: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const headingId = `${id}-heading`;
  const open = checked && !unavailable;
  return (
    <article id={id} className={cn('mic-stage', open && 'is-on')} aria-labelledby={headingId} aria-busy={pending || undefined}>
      <header className="mic-stage__head">
        <div className="mic-stage__copy">
          <h4 id={headingId}>{title}</h4>
          <p>{description}</p>
        </div>
        {unavailable ? <span className="mic-stage__state">Unavailable</span> : null}
        <Switch checked={checked} disabled={unavailable || pending} aria-label={`${checked ? 'Turn off' : 'Turn on'} ${title}`} onCheckedChange={onCheckedChange} />
      </header>
      {open ? (
        <div className="mic-stage__body">
          <div className="mic-stage__controls">{children}</div>
          {advanced ? (
            <>
              {showAdvanced ? <div id={`${id}-advanced`} className="mic-stage__controls">{advanced}</div> : null}
              <button
                type="button"
                className={cn('mic-stage__advanced-toggle', showAdvanced && 'is-open')}
                aria-expanded={showAdvanced}
                aria-controls={`${id}-advanced`}
                onClick={() => setShowAdvanced((value) => !value)}
              >
                <ChevronDown aria-hidden="true" />
                Advanced
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
