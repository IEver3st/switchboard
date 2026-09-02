import { useState, type ReactNode } from 'react';
import type { MicProcessor, MicProcessorId, SetMicProcessorInput, SystemSnapshot } from '../../../../shared/contracts';
import { microphoneMonitoringApplied } from '../../../../shared/microphone-runtime';
import { Switch } from '@/components/ui/switch';
import { AudioDevicePicker } from './AudioDevicePicker';
import { ParametricEq } from './ParametricEq';
import { PresetPicker } from './presets/PresetPicker';
import { ParameterControl } from './processors/ParameterControl';
import { MicrophoneTest } from './testing/MicrophoneTest';
import { useSystemStore } from '@/stores/use-system-store';

function getProcessor<T extends MicProcessorId>(processors: MicProcessor[], id: T): Extract<MicProcessor, { id: T }> | null {
  return (processors.find((processor) => processor.id === id) as Extract<MicProcessor, { id: T }> | undefined) ?? null;
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
  const suppressionUnavailable = snapshot.audio.capabilities.noiseSuppression !== 'available';
  const suppressionError = snapshot.audio.host?.noiseSuppression.lastError ?? snapshot.audio.host?.capabilities.reason;
  const desktopFeatures = Boolean(window.switchboard);
  const unavailable = support !== 'available';
  const monitoringUnavailable = snapshot.audio.capabilities.monitoring !== 'available';
  const processorPending = Object.keys(pendingOperations).some((key) => key.startsWith('processor:'));
  const pending = processorPending;
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
  const commitProcessor = (input: SetMicProcessorInput) => runPending(`processor:${input.processorId}`, () => setMicProcessor(input));

  if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) {
    return <div className="px-6 py-8 text-sm text-destructive">Microphone sound settings are unavailable.</div>;
  }

  return (
    <div className="audio-channel audio-channel--microphone" data-channel="microphone">
      {snapshot.audio.enabled && support !== 'available' ? (
        <p className="audio-status" role="status">
          {support === 'simulation'
            ? 'This preview does not process microphone audio. Use the desktop application and native Audio.Host.'
            : snapshot.audio.host?.microphone?.error ?? 'Voice processing is unavailable for the selected microphone.'}
        </p>
      ) : null}
      <div className="audio-toolbar">
        <section className="audio-toolbar__group" aria-label="Preset">
          <span className="audio-eyebrow">Preset</span>
          <div className="audio-toolbar__card">
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
          </div>
        </section>
        <span className="grow" />
        <section className="audio-toolbar__group" aria-label="Test">
          <span className="audio-eyebrow">Test</span>
          <div className="audio-toolbar__card">
            <MicrophoneTest
              support={snapshot.audio.capabilities.microphoneTest}
              pending={microphoneTestPending}
              compact
              onRecord={() => {
                setMicrophoneTestPending(true);
                void testMicrophone().finally(() => setMicrophoneTestPending(false));
              }}
            />
          </div>
        </section>
      </div>
      <section className="audio-panel audio-panel--eq" aria-labelledby="microphone-equalizer-heading">
        <header className="audio-panel__head">
          <Switch checked={equalizer.enabled} disabled={unavailable || Boolean(pendingOperations['processor:equalizer'])} aria-label={`${equalizer.enabled ? 'Bypass' : 'Enable'} Equalizer`} onCheckedChange={(enabled) => commitProcessor({ processorId: 'equalizer', enabled })} />
          <h3 id="microphone-equalizer-heading">Equalizer</h3>
        </header>
        <ParametricEq bands={equalizer.parameters.bands} disabled={unavailable || !equalizer.enabled || Boolean(pendingOperations['processor:equalizer'])} onCommit={(bands) => commitProcessor({ processorId: 'equalizer', parameters: { bands } })} />
      </section>
      <div className="audio-panel-grid" aria-busy={processorPending}>
        <MicProcessorSection id="microphone-input-section" title="Input volume" headingId="microphone-input-heading" description="Software level after cleanup, before tone and dynamics." checked={gain.enabled} disabled={unavailable} pending={Boolean(pendingOperations['processor:gain'])} onCheckedChange={(enabled) => commitProcessor({ processorId: 'gain', enabled })}>
          <ParameterControl label="Gain" value={gain.parameters.gainDb} min={-20} max={30} step={0.5} unit=" dB" disabled={unavailable || !gain.enabled || Boolean(pendingOperations['processor:gain'])} onCommit={(gainDb) => commitProcessor({ processorId: 'gain', enabled: true, parameters: { gainDb } })} />
        </MicProcessorSection>
        <MicProcessorSection id="microphone-gate-section" title="Noise gate" headingId="microphone-gate-heading" description="Mutes the room while you are not speaking." checked={gate.enabled} disabled={unavailable} pending={Boolean(pendingOperations['processor:noise-gate'])} onCheckedChange={(enabled) => commitProcessor({ processorId: 'noise-gate', enabled })}>
          <ParameterControl label="Gate threshold" value={gate.parameters.thresholdDb} min={-80} max={-10} step={0.5} unit=" dB" precision={1} disabled={unavailable || !gate.enabled || pending} onCommit={(thresholdDb) => commitProcessor({ processorId: 'noise-gate', parameters: { thresholdDb } })} />
          <ParameterControl label="Attack" value={gate.parameters.attackMs} min={0.1} max={100} step={0.5} unit=" ms" precision={1} disabled={unavailable || !gate.enabled || pending} onCommit={(attackMs) => commitProcessor({ processorId: 'noise-gate', parameters: { attackMs } })} />
          <ParameterControl label="Release" value={gate.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !gate.enabled || pending} onCommit={(releaseMs) => commitProcessor({ processorId: 'noise-gate', parameters: { releaseMs } })} />
        </MicProcessorSection>
        <MicProcessorSection id="microphone-removal-section" title="Noise removal" headingId="microphone-removal-heading" description={suppressionUnavailable ? suppressionError ?? 'Unavailable with the current audio setup.' : 'Reduces fans, keys, and background sound.'} checked={suppression.enabled && !suppressionUnavailable} disabled={suppressionUnavailable} pending={Boolean(pendingOperations['processor:noise-suppression'])} onCheckedChange={(enabled) => commitProcessor({ processorId: 'noise-suppression', enabled })}>
          <ParameterControl label="Removal strength" value={suppression.parameters.amount} min={0} max={100} step={1} unit="%" disabled={suppressionUnavailable || !suppression.enabled || pending} onCommit={(amount) => commitProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount } })} />
        </MicProcessorSection>
        <MicProcessorSection id="microphone-consistency-section" title="Voice consistency" headingId="microphone-consistency-heading" description="Keeps quiet and loud speech at a similar level." checked={compressor.enabled} disabled={unavailable} pending={Boolean(pendingOperations['processor:compressor'])} onCheckedChange={(enabled) => commitProcessor({ processorId: 'compressor', enabled })}>
          <ParameterControl label="Compression ratio" value={compressor.parameters.ratio} min={1} max={20} step={0.1} unit=":1" precision={1} disabled={unavailable || !compressor.enabled || pending} onCommit={(ratio) => commitProcessor({ processorId: 'compressor', enabled: true, parameters: { ratio } })} />
          <ParameterControl label="Threshold" value={compressor.parameters.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || pending} onCommit={(thresholdDb) => commitProcessor({ processorId: 'compressor', parameters: { thresholdDb } })} />
          <ParameterControl label="Attack" value={compressor.parameters.attackMs} min={0.1} max={200} step={0.5} unit=" ms" precision={1} disabled={unavailable || !compressor.enabled || pending} onCommit={(attackMs) => commitProcessor({ processorId: 'compressor', parameters: { attackMs } })} />
          <ParameterControl label="Release" value={compressor.parameters.releaseMs} min={10} max={2_000} step={5} unit=" ms" disabled={unavailable || !compressor.enabled || pending} onCommit={(releaseMs) => commitProcessor({ processorId: 'compressor', parameters: { releaseMs } })} />
          <ParameterControl label="Makeup gain" value={compressor.parameters.makeupDb} min={0} max={18} step={0.5} unit=" dB" precision={1} disabled={unavailable || !compressor.enabled || pending} onCommit={(makeupDb) => commitProcessor({ processorId: 'compressor', parameters: { makeupDb } })} />
        </MicProcessorSection>
        <MicProcessorSection id="microphone-safety-section" title="Output safety" headingId="microphone-safety-heading" description="Catches clipping and sudden peaks." checked={limiter.enabled} disabled={unavailable} pending={Boolean(pendingOperations['processor:limiter'])} onCheckedChange={(enabled) => commitProcessor({ processorId: 'limiter', enabled })}>
          <ParameterControl label="Ceiling" value={limiter.parameters.thresholdDb} min={-18} max={0} step={0.1} unit=" dB" precision={1} disabled={unavailable || !limiter.enabled || pending} onCommit={(thresholdDb) => commitProcessor({ processorId: 'limiter', parameters: { thresholdDb } })} />
          <ParameterControl label="Release" value={limiter.parameters.releaseMs} min={10} max={1_000} step={5} unit=" ms" disabled={unavailable || !limiter.enabled || pending} onCommit={(releaseMs) => commitProcessor({ processorId: 'limiter', parameters: { releaseMs } })} />
        </MicProcessorSection>
        <section id="microphone-monitoring-section" className={`audio-panel${monitoringUnavailable ? ' is-disabled' : ''}`} aria-labelledby="microphone-monitoring-heading" aria-busy={monitoringPending}>
          <header className="audio-panel__head">
            <Switch checked={snapshot.audio.monitoringEnabled} disabled={monitoringUnavailable || monitoringPending} aria-label="Monitoring" onCheckedChange={(enabled) => runPending('monitoring', () => setAudioMonitoring({ enabled }))} />
            <h3 id="microphone-monitoring-heading">Monitoring</h3>
            <p className="audio-panel__note">{monitoringDescription}</p>
          </header>
          <div className="audio-panel__body">
            <label className="audio-panel__row"><span>Output</span><AudioDevicePicker value={snapshot.audio.monitoringDeviceId} devices={snapshot.audio.devices} direction="output" label="Microphone monitoring device" disabled={monitoringUnavailable || monitoringPending} onChange={(deviceId) => runPending('monitoring', () => setAudioMonitoring({ deviceId }))} /></label>
            <ParameterControl label="Monitor volume" value={snapshot.audio.monitoring * 100} min={0} max={100} step={1} unit="%" disabled={monitoringUnavailable || monitoringPending || !snapshot.audio.monitoringEnabled} onCommit={(level) => runPending('monitoring', () => setAudioMonitoring({ level: level / 100 }))} />
          </div>
        </section>
      </div>
    </div>
  );
}

function MicProcessorSection({ id, headingId, title, description, checked, disabled, pending, onCheckedChange, children }: { id: string; headingId: string; title: string; description?: string; checked: boolean; disabled: boolean; pending: boolean; onCheckedChange: (checked: boolean) => void; children?: ReactNode }) {
  return (
    <section id={id} className={`audio-panel${(!checked || disabled) ? ' is-disabled' : ''}`} aria-labelledby={headingId} aria-busy={pending}>
      <header className="audio-panel__head">
        <Switch checked={checked} disabled={disabled || pending} aria-label={title} onCheckedChange={onCheckedChange} />
        <h3 id={headingId}>{title}</h3>
        {description ? <p className="audio-panel__note">{description}</p> : null}
      </header>
      {children ? <div className="audio-panel__body">{children}</div> : null}
    </section>
  );
}
