import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Circle, Mic, MicOff, Pin, RotateCcw, Settings2, SlidersHorizontal, Video, Volume2, VolumeX, X } from 'lucide-react';
import type { CaptureConfig, SetCaptureConfigInput, UpdateSettingsInput } from '../../../../shared/contracts';
import { useSystemStore } from '@/stores/use-system-store';
import { switchboardApi } from '@/lib/demo-api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { manageAsyncCleanup } from '@/lib/async-cleanup';
import { useSetupAction } from './use-setup-action';
import './setup.css';
import './quick-controls.css';

const tabs = [['audio', 'Audio', SlidersHorizontal], ['capture', 'Capture', Video], ['app', 'App', Settings2]] as const;
type Tab = typeof tabs[number][0];

export function QuickControls() {
  const snapshot = useSystemStore(state => state.snapshot);
  const initialize = useSystemStore(state => state.initialize);
  const loadingError = useSystemStore(state => state.error);
  const { run, pending, error } = useSetupAction();
  const [tab, setTab] = useState<Tab>('capture');
  const [held, setHeld] = useState(() => new URLSearchParams(window.location.search).get('held') === '1');
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLElement>(null);
  useEffect(() => manageAsyncCleanup(initialize()), [initialize]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault(); void switchboardApi.closeQuickControls();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (snapshot) root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(); }, [Boolean(snapshot)]);
  useEffect(() => { content.current?.scrollTo(0, 0); }, [tab]);
  const close = () => { void switchboardApi.closeQuickControls(); };
  if (!snapshot) return <div className="quick-controls"><header className="quick-header"><h1>Quick controls</h1><Button variant="ghost" size="icon" aria-label="Close quick controls" onClick={close}><X size={18} /></Button></header><p className="quick-loading" role={loadingError ? 'alert' : 'status'}>{loadingError ?? 'Loading your settings…'}</p></div>;

  const { setup, audio, capture, settings } = snapshot;
  const { config, runtime } = capture;
  const audioReady = settings.developerMode && audio.enabled && audio.host?.running === true;
  const mic = audio.buses.find(bus => bus.id === 'mic');
  const personal = audio.mixes.find(mix => mix.id === 'personal');
  const outputs = audio.devices.filter(device => device.direction === 'output' && device.available && !device.isSwitchboard);
  const inputs = audio.devices.filter(device => device.direction === 'input' && device.available && !device.isSwitchboard);
  const output = audio.buses.find(bus => bus.id === 'game')?.deviceId ?? '';
  const changing = pending || setup.runtime.state === 'applying' || setup.runtime.state === 'restoring';
  const actions = setup.preferences.quickActions;
  const capturePatch = (patch: SetCaptureConfigInput) => { void run(() => switchboardApi.setCaptureConfig(patch)); };
  const settingsPatch = (patch: UpdateSettingsInput) => { void run(() => switchboardApi.updateSettings(patch)); };
  const canSave = ['buffering', 'saving'].includes(runtime.state) && runtime.bufferedSeconds > 0;
  const replayState = !config.enabled ? 'Replay off' : runtime.state === 'buffering' ? 'Replay ready' : runtime.state === 'saving' ? 'Saving replay…' : runtime.state === 'starting' ? 'Starting replay…' : runtime.state === 'error' ? 'Replay needs attention' : runtime.state === 'stopped' ? 'Replay stopped' : 'Waiting for a source';
  const replayDetail = !config.enabled ? 'Turn on to keep the last few moments.' : runtime.activeSource?.name ?? 'Waiting for a capture source';
  const duration = Math.round(Math.min(config.replaySeconds, runtime.bufferedSeconds));
  const actionError = error?.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');

  return <div className="quick-controls" ref={root}>
    <header className="quick-header">
      <div><span className="quick-brand">Switchboard</span><h1>Quick controls</h1></div>
      <div className="quick-header-actions">
        {held ? <Button variant="ghost" size="sm" disabled={changing} onClick={() => void run(async () => { await switchboardApi.openQuickControls(); setHeld(false); })}><Pin size={14} />Keep open</Button> : null}
        <Button variant="ghost" size="icon" aria-label="Close quick controls" onClick={close}><X size={18} /></Button>
      </div>
    </header>
    <section className="quick-replay" aria-label="Instant Replay">
      <div className="quick-row"><div className="quick-replay-state"><Circle size={9} fill="currentColor" data-ready={canSave} aria-hidden /><strong>{replayState}</strong></div>
        <Switch aria-label="Instant Replay" checked={config.enabled} disabled={changing} onCheckedChange={enabled => capturePatch({ enabled })} /></div>
      <p className="quick-source" title={replayDetail}>{replayDetail}</p>
      {actions.includes('replay') ? <Button className="quick-save" variant={canSave ? 'primary' : 'secondary'} disabled={changing || !canSave} onClick={() => void run(() => switchboardApi.saveReplay())}><Video size={16} />{canSave ? `Save last ${duration} seconds` : 'Save replay'}</Button> : null}
    </section>
    <nav className="quick-tabs" role="tablist" aria-label="Quick control sections" onKeyDown={event => {
      const index = tabs.findIndex(([id]) => id === tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      const target = tabs[next];
      if (!target) return;
      event.preventDefault(); setTab(target[0]); document.getElementById(`quick-tab-${target[0]}`)?.focus();
    }}>{tabs.map(([id, label, Icon]) => <button type="button" role="tab" id={`quick-tab-${id}`} aria-controls={`quick-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} key={id} onClick={() => setTab(id)}><Icon size={15} aria-hidden />{label}</button>)}</nav>

    <main className="quick-body" ref={content} role="tabpanel" id={`quick-panel-${tab}`} aria-labelledby={`quick-tab-${tab}`} tabIndex={0}>
      {tab === 'audio' ? <>
        <QuickSection title="Audio engine">
          <QuickToggle label="Enable Audio" checked={audio.enabled} disabled={changing || !settings.developerMode} onChange={enabled => void run(() => switchboardApi.setAudioEnabled(enabled))} />
          {!audioReady ? <p className="quick-note">{!settings.developerMode ? 'Audio is available in Developer mode. Enable it in Settings → General.' : audio.enabled ? 'Audio is unavailable. Check the engine in Settings → Audio.' : 'Turn on Audio to adjust your mix.'}</p> : null}
        </QuickSection>
        <QuickSection title="Personal output" action={<Button variant="secondary" size="sm" aria-label={personal?.master.enabled ? 'Mute output' : 'Unmute output'} disabled={!audioReady || !personal || changing} onClick={() => void run(() => switchboardApi.setAudioMasterEnabled({ mixId: 'personal', enabled: !personal?.master.enabled }))}>{personal?.master.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{personal?.master.enabled ? 'Mute' : 'Unmute'}</Button>}>
          {actions.includes('output') ? <QuickSelect label="Output device" value={output} disabled={!audioReady || changing || !outputs.length} onChange={deviceId => void run(() => switchboardApi.runQuickAction({ type: 'output', deviceId }))}>
            {!outputs.some(device => device.id === output) ? <option value={output}>{output ? 'Selected output unavailable' : 'Choose output'}</option> : null}
            {outputs.map(device => <option value={device.id} key={device.id}>{device.name}</option>)}
          </QuickSelect> : null}
          <QuickRange label="Personal volume" value={personal?.master.gain ?? 1} min={0} max={1.5} step={0.01} format={value => `${Math.round(value * 100)}%`} disabled={!audioReady || !personal || changing} onCommit={gain => void run(() => switchboardApi.setAudioMasterGain({ mixId: 'personal', gain }))} />
        </QuickSection>
        {actions.includes('microphone') ? <QuickSection title="Microphone" className="quick-microphone" action={<Button variant="secondary" size="sm" aria-label={mic?.enabled ? 'Mute microphone' : 'Unmute microphone'} disabled={!audioReady || !mic || changing} onClick={() => void run(() => switchboardApi.runQuickAction({ type: 'microphone', muted: Boolean(mic?.enabled) }))}>{mic?.enabled ? <Mic size={15} /> : <MicOff size={15} />}{mic?.enabled ? 'Mute' : 'Unmute'}</Button>}>
          <QuickSelect label="Input device" value={mic?.deviceId ?? ''} disabled={!audioReady || !mic || changing || !inputs.length} onChange={deviceId => void run(() => switchboardApi.setAudioBusDevice({ busId: 'mic', deviceId }))}>
            {!inputs.some(device => device.id === mic?.deviceId) ? <option value={mic?.deviceId ?? ''}>{mic?.deviceId ? 'Selected input unavailable' : 'Choose microphone'}</option> : null}
            {inputs.map(device => <option value={device.id} key={device.id}>{device.name}</option>)}
          </QuickSelect>
        </QuickSection> : null}
        {actions.includes('chatmix') ? <QuickSection title="ChatMix"><QuickRange label="ChatMix" value={audio.chatMix} min={-1} max={1} step={0.05} disabled={!audioReady || changing} format={chatMixLabel} onCommit={value => void run(() => switchboardApi.runQuickAction({ type: 'chatmix', value }))} /><div className="quick-range-ends"><span>Game</span><span>Chat</span></div></QuickSection> : null}
      </> : tab === 'capture' ? <>
        <QuickSection title="Recording">
          <QuickSelect label="Capture source" value={config.source} disabled={changing} onChange={source => capturePatch({ source: source as CaptureConfig['source'], sourceId: null })}><option value="automatic-game">Automatic game</option><option value="window">Window</option><option value="display" disabled={config.includeSystemAudio && config.systemAudioMode === 'game'}>Display</option></QuickSelect>
          <div className="quick-field-pair"><QuickSelect label="Replay duration" value={String(config.replaySeconds)} disabled={changing} onChange={value => capturePatch({ replaySeconds: Number(value) })}>
            {![15, 30, 60, 90, 120, 180, 300].includes(config.replaySeconds) ? <option value={config.replaySeconds}>{config.replaySeconds} seconds</option> : null}
            {[15, 30, 60, 90, 120, 180, 300].map(value => <option key={value} value={value}>{value < 60 ? `${value} seconds` : `${value / 60} ${value === 60 ? 'minute' : 'minutes'}`}</option>)}
          </QuickSelect><QuickSelect label="Video quality" value={String(config.quality)} disabled={changing} onChange={quality => capturePatch({ quality: Number(quality) })}>{['Economy', 'Balanced', 'Good', 'High', 'Maximum'].map((label, index) => <option value={index + 1} key={label}>{label}</option>)}</QuickSelect></div>
          <div className="quick-field-pair"><QuickSelect label="Resolution" value={config.resolution} disabled={changing} onChange={resolution => capturePatch({ resolution: resolution as CaptureConfig['resolution'] })}>{['720p', '1080p', '1440p', '2160p', 'native'].map(value => <option key={value} value={value}>{value === 'native' ? 'Native' : value}</option>)}</QuickSelect>
            <QuickSelect label="Frame rate" value={String(config.fps)} disabled={changing} onChange={fps => capturePatch({ fps: Number(fps) as CaptureConfig['fps'] })}>{[30, 60, 120].map(value => <option value={value} key={value}>{value} fps</option>)}</QuickSelect></div>
          <QuickToggle label="Include cursor" checked={config.includeCursor} disabled={changing} onChange={includeCursor => capturePatch({ includeCursor })} />
        </QuickSection>
        <QuickSection title="Recorded audio">
          <QuickSelect label="Desktop audio" value={config.includeSystemAudio ? config.systemAudioMode : 'off'} disabled={changing} onChange={mode => capturePatch(mode === 'off' ? { includeSystemAudio: false } : { includeSystemAudio: true, systemAudioMode: mode as CaptureConfig['systemAudioMode'] })}><option value="off">Off</option><option value="system">All desktop audio</option><option value="game" disabled={config.source === 'display'}>Game only</option></QuickSelect>
          <QuickToggle label="Record microphone" checked={config.includeMic} disabled={changing} onChange={includeMic => capturePatch({ includeMic })} />
          <QuickToggle label="Record chat separately" checked={config.includeChatAudio} disabled={changing} onChange={includeChatAudio => capturePatch({ includeChatAudio })} />
          {config.includeChatAudio ? <p className="quick-note">Uses the chat device selected in Capture settings.</p> : null}
        </QuickSection>
      </> : <>
        <QuickSection title="App behavior">
          <QuickToggle label="Launch at startup" checked={settings.launchAtStartup} disabled={changing} onChange={launchAtStartup => settingsPatch({ launchAtStartup })} />
          <QuickToggle label="Close to tray" checked={settings.closeToTray} disabled={changing} onChange={closeToTray => settingsPatch({ closeToTray })} />
          <QuickToggle label="Release interface in tray" checked={settings.destroyRendererInTray} disabled={changing || !settings.closeToTray} onChange={destroyRendererInTray => settingsPatch({ destroyRendererInTray })} />
        </QuickSection>
        <QuickSection title="Performance & updates">
          <QuickToggle label="Performance guard" checked={settings.performanceGuard} disabled={changing} onChange={performanceGuard => settingsPatch({ performanceGuard })} />
          <QuickToggle label="Low resource rendering" checked={settings.softwareRendering} disabled={changing} onChange={softwareRendering => settingsPatch({ softwareRendering })} />
          <p className="quick-note">Rendering changes take effect next launch.</p>
          <QuickToggle label="Check for app updates" checked={settings.automaticAppUpdates} disabled={changing} onChange={automaticAppUpdates => settingsPatch({ automaticAppUpdates })} />
        </QuickSection>
        {actions.includes('scenes') ? <QuickSection title="Scenes">
          {setup.scenes.length ? setup.scenes.map(scene => <button className="quick-scene-row" type="button" key={scene.id} disabled={changing} onClick={() => void run(() => switchboardApi.applyScene(scene.id))}><span>{scene.name}</span>{scene.id === setup.runtime.activeSceneId ? <Check size={15} aria-label={setup.runtime.state === 'partial' ? 'Partially applied' : 'Active'} /> : null}</button>) : <p className="quick-note">No saved scenes. Create one in Settings → Setup.</p>}
          {setup.restore ? <Button variant="secondary" size="sm" disabled={changing} onClick={() => void run(() => switchboardApi.restoreScene())}><RotateCcw size={14} />Restore previous setup</Button> : null}
        </QuickSection> : null}
      </>}
    </main>
    <footer className="quick-footer">
      {actionError || runtime.error ? <p className="quick-error" role="alert">{actionError ?? runtime.error}</p> : null}
      {setup.runtime.state === 'partial' ? <p className="quick-error" role="status">{setup.runtime.issues.join(' ')}</p> : null}
      {runtime.warning ? <p className="quick-note">{runtime.warning}</p> : null}
      <div className="quick-row"><span role="status">{changing ? 'Applying…' : 'Changes save automatically'}</span><span>{held ? 'Release to close' : 'Esc to close'}</span></div>
    </footer>
  </div>;
}

function QuickSection({ title, className = '', action, children }: { title: string; className?: string; action?: ReactNode; children: ReactNode }) {
  return <section className={`quick-section ${className}`} aria-label={title}><div className="quick-section-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
function QuickToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange(value: boolean): void }) {
  return <label className="quick-row quick-toggle"><span>{label}</span><Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>;
}
function QuickSelect({ label, value, disabled, onChange, children }: { label: string; value: string; disabled: boolean; onChange(value: string): void; children: ReactNode }) {
  return <label className="quick-field"><span>{label}</span><select className="setup-select" aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}
function QuickRange({ label, value, min, max, step, disabled, format, onCommit }: { label: string; value: number; min: number; max: number; step: number; disabled: boolean; format(value: number): string; onCommit(value: number): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!disabled) setDraft(value); }, [value, disabled]);
  const commit = (next: number) => { if (!disabled && next !== value) onCommit(next); };
  return <label className="quick-range"><output>{format(draft)}</output><input type="range" aria-label={label} aria-valuetext={format(draft)} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={event => setDraft(Number(event.target.value))} onPointerUp={event => commit(Number(event.currentTarget.value))} onKeyUp={event => commit(Number(event.currentTarget.value))} onBlur={event => commit(Number(event.currentTarget.value))} onPointerCancel={() => setDraft(value)} /></label>;
}
function chatMixLabel(value: number): string {
  return value === 0 ? 'Balanced' : `${Math.round(Math.abs(value) * 100)}% toward ${value < 0 ? 'Game' : 'Chat'}`;
}
