import { useState } from 'react';
import { Layers, Plus, RotateCcw, Keyboard, Lightbulb, Play, Trash2 } from 'lucide-react';
import type { SaveSceneInput, SetupPreferences, SetupScene, SystemSnapshot } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingRow, SettingSection, SettingSwitch, SettingSelect, SettingsCategoryHeader } from '@/components/settings/settings-primitives';
import { useSetupAction } from './use-setup-action';
import './setup.css';

const actionLabels: Record<SetupPreferences['quickActions'][number], string> = {
  scenes: 'Scenes', replay: 'Save replay', microphone: 'Microphone', output: 'Output device', chatmix: 'ChatMix',
};

export function SetupWorkspace({ snapshot }: { snapshot: SystemSnapshot }) {
  const [view, setView] = useState<'scenes' | 'quick' | 'lighting'>('scenes');
  const [selected, setSelected] = useState<string | null>(snapshot.setup.scenes[0]?.id ?? null);
  const { pending, error, run } = useSetupAction();
  const { preferences, runtime, scenes, restore } = snapshot.setup;
  const scene = scenes.find(item => item.id === selected);
  const changing = pending || runtime.state === 'applying' || runtime.state === 'restoring';
  const update = (input: Partial<SetupPreferences>) => run(() => switchboardApi.setSetupPreferences({ ...preferences, ...input }));
  const targets = snapshot.devices.filter(device => device.capabilities.lighting?.statusLightingSupported);
  return <div className="setup-workspace" id="setting-setup.scenes" tabIndex={-1}>
    <SettingsCategoryHeader title="Setup" description="Switch your devices, audio, and replay together." />
    <nav className="setup-tabs" aria-label="Setup sections">
      {([['scenes', Layers, 'Scenes'], ['quick', Keyboard, 'Quick controls'], ['lighting', Lightbulb, 'Status lighting']] as const).map(([id, Icon, label]) =>
        <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={15} aria-hidden />{label}</button>)}
    </nav>
    {error ? <p className="setup-error" role="alert">{error}</p> : null}
    {view === 'scenes' ? <>
      <div className="setup-active" role="status" data-state={runtime.state}>
        <div><strong>{runtime.activeSceneId ? scenes.find(item => item.id === runtime.activeSceneId)?.name ?? 'Previous scene' : 'Your current setup'}</strong>
          <span>{runtime.state === 'partial' ? 'Some settings need attention' : runtime.state === 'applying' ? 'Applying scene…' : runtime.state === 'restoring' ? 'Restoring setup…' : runtime.activeSceneId ? 'Scene applied' : 'Save it as a scene to switch back later.'}</span></div>
        {restore ? <Button size="sm" variant="secondary" disabled={changing} onClick={() => void run(() => switchboardApi.restoreScene())}><RotateCcw size={14} />Restore previous setup</Button> : null}
      </div>
      {runtime.issues.length ? <ul className="setup-error" aria-label="Scene issues">{runtime.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
      <div className="setup-scenes">
        <div className="setup-scene-list">
          <SettingRow settingId="setup.savedScenes" title="Saved scenes" description={scenes.length === 0 ? 'No saved scenes yet.' : `${scenes.length} saved`} controlClassName="setup-scene-picker">
            {scenes.length > 0 ? <Select value={scene?.id ?? 'new'} onValueChange={value => setSelected(value === 'new' ? null : value)} disabled={changing}>
              <SelectTrigger aria-label="Saved scenes"><SelectValue /></SelectTrigger>
              <SelectContent className="setup-scene-options"><SelectItem value="new">New scene</SelectItem>{scenes.map(item => <SelectItem key={item.id} value={item.id}>{item.name}{item.automatic ? ` · ${item.executable}` : ' · Manual'}</SelectItem>)}</SelectContent>
            </Select> : null}
            <Button variant="secondary" size="sm" disabled={changing} onClick={() => setSelected(null)}><Plus size={14} />New scene</Button>
          </SettingRow>
        </div>
        <SceneEditor key={scene?.id ?? 'new'} scene={scene} snapshot={snapshot} disabled={changing}
          onApply={() => scene && void run(() => switchboardApi.applyScene(scene.id))}
          onDelete={async () => { if (scene && await run(() => switchboardApi.deleteScene(scene.id))) setSelected(null); }}
          onSave={async input => {
            const result = await run(() => switchboardApi.saveScene(input));
            if (result && typeof result !== 'boolean') setSelected(input.id ?? result.setup.scenes.at(-1)?.id ?? null);
          }} />
      </div>
    </> : view === 'quick' ? <>
      <SettingSection title="Shortcut">
      <SettingRow controlClassName="settings-row__control--actions" settingId="setup.quickEnabled" title="Open from anywhere" description="Press the shortcut to open or close Quick controls, including while Switchboard is in the tray.">
        <Button variant="secondary" size="sm" disabled={changing} onClick={() => void run(() => switchboardApi.openQuickControls())}>Open panel</Button>
        <Switch aria-label="Enable quick controls shortcut" checked={preferences.quickControlsEnabled} disabled={changing} onCheckedChange={quickControlsEnabled => void update({ quickControlsEnabled })} />
      </SettingRow>
      <SettingSelect settingId="setup.shortcut" title="Quick controls shortcut" description="" value={preferences.quickShortcut} disabled={changing}
        options={['Control+Alt+Space', 'Control+Shift+Space', 'Alt+Space'].map(value => ({ value, label: value }))}
        onValueChange={quickShortcut => void update({ quickShortcut: quickShortcut as SetupPreferences['quickShortcut'] })} />
      <DesktopStatus snapshot={snapshot} />
      </SettingSection>
      <SettingSection title="Show in quick controls">
      {Object.entries(actionLabels).map(([key, label]) => <SettingRow key={key} settingId={`setup.action.${key}`} title={label}>
        <Switch aria-label={`Show ${label}`} disabled={changing} checked={preferences.quickActions.includes(key as keyof typeof actionLabels)} onCheckedChange={checked => void update({ quickActions: checked
          ? [...preferences.quickActions, key as keyof typeof actionLabels] : preferences.quickActions.filter(action => action !== key) })} />
      </SettingRow>)}
      {!snapshot.settings.developerMode ? <p className="setup-note">Microphone, output, and ChatMix controls become available when Audio is running in Developer mode.</p> : null}
      </SettingSection>
    </> : <>
      <SettingSection title="Status lighting">
      <SettingRow settingId="setup.lighting" title="Use device lights for status" description="Temporary cues restore your selected effect afterward. Battery warnings and cutoff always take priority.">
        <Switch aria-label="Enable status lighting" checked={preferences.lighting.enabled} disabled={changing} onCheckedChange={enabled => void update({ lighting: { ...preferences.lighting, enabled } })} />
      </SettingRow>
      </SettingSection>
      <SettingSection title="Devices">
      {targets.length ? targets.map(device => <SettingRow key={device.id} settingId={`setup.light.${device.id}`} title={device.displayName} description={device.connected ? 'Temporary lighting supported' : 'Disconnected'}>
        <Switch aria-label={`Status lighting on ${device.displayName}`} checked={preferences.lighting.deviceIds.includes(device.id)} disabled={changing}
          onCheckedChange={checked => void update({ lighting: { ...preferences.lighting, deviceIds: checked ? [...preferences.lighting.deviceIds, device.id] : preferences.lighting.deviceIds.filter(id => id !== device.id) } })} />
      </SettingRow>) : <p className="setup-note">Connect a supported device to choose a status light. Native G502 X Plus lighting is supported when its static effect is available.</p>}
      </SettingSection>
      <SettingSection title="Lighting cues">
      {([['clipSaved', 'Clip saved', 'Green for a moment after a replay is saved.'], ['microphoneMuted', 'Microphone muted', 'Amber while a connected microphone reports mute or the Audio microphone channel is muted.'], ['captureError', 'Capture error', 'Red while an enabled replay session reports an error.']] as const).map(([key, title, description]) =>
        <SettingRow key={key} settingId={`setup.cue.${key}`} title={title} description={description}>
          <Switch aria-label={`${title} lighting cue`} checked={preferences.lighting[key]} disabled={changing} onCheckedChange={checked => void update({ lighting: { ...preferences.lighting, [key]: checked } })} />
        </SettingRow>)}
      </SettingSection>
      {runtime.lightingMessage ? <p className={runtime.lightingState === 'error' ? 'setup-error' : 'setup-note'} role="status">{runtime.lightingMessage}</p> : null}
      <p className="setup-note">A device acknowledgement confirms the command. Physical light output must be checked on the device.</p>
    </>}
  </div>;
}

function SceneEditor({ scene, snapshot, disabled, onSave, onApply, onDelete }: {
  scene?: SetupScene; snapshot: SystemSnapshot; disabled: boolean;
  onSave(input: SaveSceneInput): Promise<void>; onApply(): void; onDelete(): Promise<void>;
}) {
  const [name, setName] = useState(scene?.name ?? '');
  const [executable, setExecutable] = useState(scene?.executable ?? '');
  const [automatic, setAutomatic] = useState(scene?.automatic ?? false);
  const [restoreOnExit, setRestoreOnExit] = useState(scene?.restoreOnExit ?? true);
  const [includeAudio, setIncludeAudio] = useState(Boolean(scene?.values.audio));
  const [includeCapture, setIncludeCapture] = useState(scene ? Boolean(scene.values.capture) : true);
  const [includeDevices, setIncludeDevices] = useState(scene ? scene.values.devices.length > 0 : true);
  const [recapture, setRecapture] = useState(!scene);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <form className="setup-scene-editor" onSubmit={event => { event.preventDefault(); void onSave({ id: scene?.id, name, executable, automatic, restoreOnExit, includeAudio, includeCapture, includeDevices, captureCurrent: recapture }); }}>
    <div className="setup-editor-heading"><h3>{scene ? 'Edit scene' : 'Save current setup'}</h3><div className="setup-editor-footer">
      {scene ? <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onApply}><Play size={14} />Apply scene</Button> : null}
      <Button type="submit" size="sm" disabled={disabled || !name.trim()}>{disabled ? 'Working…' : scene ? 'Save changes' : 'Save scene'}</Button>
    </div></div>
    <SettingRow settingId="setup.sceneName" title="Scene name" className="setup-field">
      <Input aria-label="Scene name" value={name} onChange={event => setName(event.target.value)} maxLength={64} required placeholder="e.g. War Thunder" disabled={disabled} />
    </SettingRow>
    <SettingSection title="Include">
      {scene ? <SettingSwitch settingId="setup.recapture" title="Replace saved settings with my current setup" description="" checked={recapture} disabled={disabled} onCheckedChange={setRecapture} /> : <p className="setup-note">Set up your devices and replay first, then save the parts you want this scene to remember.</p>}
      <div className="setup-included-settings">
      <SettingSwitch settingId="setup.includeDevices" title="Devices" description={scene ? scene.values.devices.map(device => device.name).join(', ') || 'Not included' : ''} checked={includeDevices} disabled={disabled || !recapture} onCheckedChange={setIncludeDevices} />
      <SettingSwitch settingId="setup.includeCapture" title="Replay" description={scene ? scene.values.capture ? `${scene.values.capture.enabled ? 'Enabled' : 'Off'} · ${scene.values.capture.replaySeconds}s · ${scene.values.capture.systemAudioMode === 'game' ? 'Game-only audio' : 'Desktop audio'}` : 'Not included' : ''} checked={includeCapture} disabled={disabled || !recapture} onCheckedChange={setIncludeCapture} />
      <SettingSwitch settingId="setup.includeAudio" title="Audio" description={!snapshot.settings.developerMode ? 'Developer mode' : scene ? scene.values.audio ? `${scene.values.audio.enabled ? 'Enabled' : 'Off'} · ${scene.values.audio.outputDevice || 'Default output'}` : 'Not included' : ''} checked={includeAudio} disabled={disabled || !recapture || !snapshot.settings.developerMode} onCheckedChange={setIncludeAudio} />
      </div>
    </SettingSection>
    <SettingSection title="Application switching">
      <SettingSwitch settingId="setup.automatic" title="Apply when an application starts" description={automatic ? <DesktopStatus snapshot={snapshot} /> : ''} checked={automatic} disabled={disabled} onCheckedChange={setAutomatic} />
      {automatic ? <div className="setup-trigger">
        <SettingRow settingId="setup.executable" title="Application executable">
          <Input aria-label="Application executable" value={executable} onChange={event => setExecutable(event.target.value)} placeholder="aces.exe" maxLength={120} required disabled={disabled} />
        </SettingRow>
        <SettingSwitch settingId="setup.restoreOnExit" title="Restore previous setup when it closes" description="" checked={restoreOnExit} disabled={disabled} onCheckedChange={setRestoreOnExit} />
        <p className="setup-note">Use the executable name shown in Task Manager. If multiple matches are running, the first matching scene in the list takes priority. Changes you make during a scene are kept on automatic restore.</p>
      </div> : null}
    </SettingSection>
    {scene ? <div className="setup-editor-footer"><Button type="button" size="sm" variant="ghost" disabled={disabled || snapshot.setup.runtime.activeSceneId === scene.id} onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Delete</Button></div> : null}
    {confirmDelete ? <div className="setup-delete" role="alert"><span>Delete “{scene?.name}”?</span><Button type="button" size="sm" variant="danger" disabled={disabled} onClick={() => void onDelete()}>Delete scene</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button></div> : null}
  </form>;
}

function DesktopStatus({ snapshot }: { snapshot: SystemSnapshot }) {
  const runtime = snapshot.setup.runtime;
  return <p role="status" className={runtime.desktopState === 'error' ? 'setup-error' : 'setup-note'}>{runtime.desktopError ?? (runtime.desktopState === 'ready'
    ? 'Desktop controls are ready.' : runtime.desktopState === 'starting' ? 'Starting desktop controls…' : 'Global shortcut and application watching are inactive.')}</p>;
}
