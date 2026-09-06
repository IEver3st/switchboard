import { ResourceDiagnostics } from '@/components/settings/resource-diagnostics';
import { DiagnosticRunner } from '@/components/settings/diagnostic-runner';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, AudioWaveform, Cable, CircleDot, Download, LoaderCircle, RefreshCw, RotateCcw, type LucideIcon } from 'lucide-react';
import type {
  AppUpdateState,
  CaptureConfig,
  CaptureEncoderPreference,
  Device,
  SettingsResetScope,
  SystemSnapshot,
  VisibleWorkspace,
} from '../../../shared/contracts';
import {
  defaultPageForProfile,
  fullWorkspacesForDeveloperMode,
  isPageVisibleForProfile,
  normalizeVisibleWorkspaces,
  workspaceOrder,
  workspacePreset,
} from '../../../shared/workspace-profile';
import { estimateClipSize, getEncodingPreset } from '../../../shared/capture-presets';
import { GameDetectionSettings } from '@/components/settings/game-detection';
import { AutoCaptureSettings } from '@/components/settings/autocapture-settings';
import { ModuleDeveloperTools } from '@/components/settings/module-developer-tools';
import { ModuleManagement } from '@/components/settings/module-management';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import {
  CaptureAudioDeviceSelect,
  captureInputDevices,
  captureOutputDevices,
  chatAutomaticLabel,
  gameAutomaticLabel,
  micAutomaticLabel,
} from '@/components/capture/capture-audio-device-select';
import {
  isSettingsCategory,
  isSettingsCategoryVisible,
  visibleSettingsCategories,
  type SettingsCategoryId,
  type SettingsSearchEntry,
} from '@/components/settings/settings-catalog';
import {
  SettingAction,
  SettingFolder,
  SettingRow,
  SettingSection,
  SettingSelect,
  SettingShortcut,
  SettingSlider,
  SettingSwitch,
  SettingValue,
  SettingsCategoryHeader,
} from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { formatBytes, formatRelativeTime, percent } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const categoryStorageKey = 'switchboard.settings.category';
type SettingsSubview = 'category' | 'module-developer-tools';

export function SettingsPage({ snapshot, onClose }: { snapshot: SystemSnapshot; onClose: () => void }) {
  const [category, setCategory] = useState<SettingsCategoryId>(readInitialCategory);
  const [subview, setSubview] = useState<SettingsSubview>(readInitialSubview);
  const [query, setQuery] = useState('');
  const [confirmation, setConfirmation] = useState<SettingsResetScope | null>(null);
  const [targetSetting, setTargetSetting] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resetSettings = useSystemStore((state) => state.resetSettings);
  const developerMode = snapshot.settings.developerMode === true;
  const visibleCategories = visibleSettingsCategories(snapshot.settings);
  const categoryDefinition = visibleCategories.find((candidate) => candidate.id === category);
  const resetScope = categoryResetScope(category);

  const changeCategory = useCallback((nextCategory: SettingsCategoryId) => {
    if (!isSettingsCategoryVisible(nextCategory, snapshot.settings)) return;
    setCategory(nextCategory);
    setSubview('category');
    if (window.location.hash !== '#settings') window.history.replaceState(null, '', '#settings');
    window.sessionStorage.setItem(categoryStorageKey, nextCategory);
  }, [snapshot.settings.developerMode]);

  useEffect(() => {
    if (!isSettingsCategoryVisible(category, snapshot.settings)) {
      setCategory('general');
      setSubview('category');
      window.sessionStorage.setItem(categoryStorageKey, 'general');
    }
  }, [category, snapshot.settings.developerMode]);

  const openModuleDeveloperTools = useCallback(() => {
    setCategory('modules');
    setSubview('module-developer-tools');
    window.sessionStorage.setItem(categoryStorageKey, 'modules');
    if (window.location.hash !== '#settings/modules/developer-tools') {
      window.history.replaceState(null, '', '#settings/modules/developer-tools');
    }
  }, []);

  const closeModuleDeveloperTools = useCallback(() => {
    setSubview('category');
    if (window.location.hash !== '#settings') window.history.replaceState(null, '', '#settings');
  }, []);

  const selectSearchResult = useCallback((result: SettingsSearchEntry) => {
    setTargetSetting(result.id);
    if (result.id === 'modules.create' || result.id === 'modules.local') openModuleDeveloperTools();
    else changeCategory(result.category);
  }, [changeCategory, openModuleDeveloperTools]);

  useEffect(() => {
    if (!targetSetting) return;
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`setting-${targetSetting}`);
      if (!element) return;
      element.focus({ preventScroll: true });
      element.classList.add('settings-row--highlighted');
      element.scrollIntoView({ block: 'center', behavior: reducedMotionEnabled() ? 'auto' : 'smooth' });
      window.setTimeout(() => element.classList.remove('settings-row--highlighted'), 1400);
      setTargetSetting(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [category, subview, targetSetting]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (event.key === 'Escape') {
        if (document.querySelector('[data-feedback-dialog]')) return;
        if (confirmation) setConfirmation(null);
        else if (subview === 'module-developer-tools') closeModuleDeveloperTools();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModuleDeveloperTools, confirmation, onClose, subview]);

  const confirmReset = () => {
    if (!confirmation) return;
    const scope = confirmation;
    setConfirmation(null);
    void resetSettings(scope);
  };

  return (
    <div className="settings-page">
      <header className="settings-header app-drag">
        <div className="settings-breadcrumb" aria-label="Breadcrumb">
          <img src="./switchboard-mark.png" alt="" draggable={false} />
          <span>Settings</span>
          <span aria-hidden>/</span>
          {subview === 'module-developer-tools' ? (
            <>
              <span>Modules</span>
              <span aria-hidden>/</span>
              <strong>Developer tools</strong>
            </>
          ) : <strong>{categoryDefinition?.label ?? 'General'}</strong>}
        </div>
        <div className="settings-header__actions no-drag">
          <button type="button" className="settings-restore" onClick={() => setConfirmation('all')}>
            <RotateCcw className="size-4" aria-hidden />
            Restore defaults
          </button>
        </div>
        {confirmation ? (
          <ResetConfirmation
            scope={confirmation}
            onCancel={() => setConfirmation(null)}
            onConfirm={confirmReset}
          />
        ) : null}
      </header>

      <div className="settings-shell">
        <SettingsSidebar
          category={categoryDefinition?.id ?? 'general'}
          appUpdate={snapshot.appUpdate}
          developerMode={developerMode}
          query={query}
          searchInputRef={searchInputRef}
          onCategoryChange={changeCategory}
          onQueryChange={setQuery}
          onResultSelect={selectSearchResult}
          onBack={onClose}
        />
        <div className="settings-content-scroll" data-settings-content-scroll>
          <div key={categoryDefinition?.id ?? category} className="settings-content">
            <SettingsCategory
              category={categoryDefinition?.id ?? 'general'}
              subview={subview}
              snapshot={snapshot}
              onOpenModuleDeveloperTools={openModuleDeveloperTools}
              onCloseModuleDeveloperTools={closeModuleDeveloperTools}
              onReset={categoryDefinition?.resettable && resetScope ? () => setConfirmation(resetScope) : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsCategory({
  category,
  subview,
  snapshot,
  onOpenModuleDeveloperTools,
  onCloseModuleDeveloperTools,
  onReset,
}: {
  category: SettingsCategoryId;
  subview: SettingsSubview;
  snapshot: SystemSnapshot;
  onOpenModuleDeveloperTools: () => void;
  onCloseModuleDeveloperTools: () => void;
  onReset?: () => void;
}) {
  if (category === 'general') return <GeneralSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'audio') {
    if (snapshot.settings.developerMode !== true) return <GeneralSettings snapshot={snapshot} onReset={onReset} />;
    return <AudioSettings snapshot={snapshot} onReset={onReset} />;
  }
  if (category === 'capture') return <CaptureSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'clips') return <ClipsSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'games') return <GameDetectionSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'modules') {
    return subview === 'module-developer-tools'
      ? <ModuleDeveloperTools snapshot={snapshot} onBack={onCloseModuleDeveloperTools} />
      : <ModulesSettings snapshot={snapshot} onReset={onReset} onOpenDeveloperTools={onOpenModuleDeveloperTools} />;
  }
  if (category === 'diagnostics') return <DiagnosticsSettings snapshot={snapshot} onReset={onReset} />;
  return <AboutSettings snapshot={snapshot} />;
}

function WorkspaceSettings({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const developerMode = snapshot.settings.developerMode === true;
  const stored = normalizeVisibleWorkspaces(snapshot.settings.visibleWorkspaces) ?? fullWorkspacesForDeveloperMode(developerMode);
  const workspaces = developerMode ? stored : stored.filter((entry) => entry !== 'audio');
  const preset = workspacePreset(workspaces, developerMode);

  const applyWorkspaces = (next: VisibleWorkspace[]) => {
    const filtered = developerMode ? next : next.filter((entry) => entry !== 'audio');
    void updateSettings({ visibleWorkspaces: filtered }).then(() => {
      const state = useSystemStore.getState();
      const current = state.snapshot;
      if (current && !isPageVisibleForProfile(state.page, current.settings)) {
        state.setPage(defaultPageForProfile(current.settings));
      }
    });
  };

  const toggle = (workspace: VisibleWorkspace) => {
    if (workspace === 'capture') return;
    if (workspace === 'audio' && !developerMode) return;
    const selected = new Set(workspaces);
    if (selected.has(workspace)) selected.delete(workspace);
    else selected.add(workspace);
    applyWorkspaces(workspaceOrder.filter((entry) => selected.has(entry)));
  };

  return (
    <div
      id="setting-general.workspace"
      data-setting-id="general.workspace"
      tabIndex={-1}
      className="settings-row settings-row--stacked settings-workspaces-block"
    >
      <div className="settings-row__copy">
        <div className="settings-row__title">Workspaces</div>
        <div className="settings-row__description">{developerMode
          ? 'Choose which parts of Switchboard stay visible. Capture stays on.'
          : 'Choose which parts of Switchboard stay visible. Capture stays on. Audio appears only with Developer mode.'}
        </div>
      </div>
      <div className="settings-row__control settings-workspaces">
        <div className="settings-workspaces__presets">
          <div className="settings-segmented" role="group" aria-label="Workspace presets">
            <button
              type="button"
              className="settings-segmented__option"
              data-active={preset === 'clipping' || undefined}
              aria-pressed={preset === 'clipping'}
              onClick={() => applyWorkspaces(['capture'])}
            >
              Just clipping
            </button>
            <button
              type="button"
              className="settings-segmented__option"
              data-active={preset === 'full' || undefined}
              aria-pressed={preset === 'full'}
              onClick={() => applyWorkspaces(fullWorkspacesForDeveloperMode(developerMode))}
            >
              Full setup
            </button>
          </div>
          {preset === 'custom' ? <span className="settings-workspaces__custom">Custom</span> : null}
        </div>
        <div className="settings-workspaces__list">
          {workspaceOptions
            .filter(({ id }) => developerMode || id !== 'audio')
            .map(({ id, title, description, icon: Icon }) => {
              if (id === 'capture') {
                return (
                  <div key={id} className="settings-workspaces__item" data-locked>
                    <Icon aria-hidden="true" />
                    <span className="settings-workspaces__copy">
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    <span className="settings-workspaces__locked">Always on</span>
                  </div>
                );
              }
              const checked = workspaces.includes(id);
              return (
                <div key={id} className="settings-workspaces__item">
                  <Icon aria-hidden="true" />
                  <span className="settings-workspaces__copy">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <Switch
                    checked={checked}
                    onCheckedChange={() => toggle(id)}
                    aria-label={title}
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

const workspaceOptions: ReadonlyArray<{ id: VisibleWorkspace; title: string; description: string; icon: LucideIcon }> = [
  { id: 'devices', title: 'Devices', description: 'Connected hardware and its controls.', icon: Cable },
  { id: 'audio', title: 'Audio', description: 'Unfinished routing, mixes, and processing. Developer mode only.', icon: AudioWaveform },
  { id: 'capture', title: 'Capture', description: 'Replay, clips, and recording.', icon: CircleDot },
];

function GeneralSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);

  return (
    <>
      <SettingsCategoryHeader title="General" description="Choose how Switchboard starts, closes, and releases the interface." onReset={onReset} />
      <DiagnosticRunner snapshot={snapshot} />
      <SettingSection title="Workspace">
        <WorkspaceSettings snapshot={snapshot} />
      </SettingSection>
      <SettingSection title="Developer">
        <SettingSwitch
          settingId="general.developerMode"
          title="Developer mode"
          description="Show Diagnostics and unfinished Audio routing, mixes, and processing. Audio settings do not work yet. Turning this off hides both and stops the Audio engine."
          checked={snapshot.settings.developerMode === true}
          onCheckedChange={(developerMode) => {
            void updateSettings({ developerMode }).then(() => {
              const state = useSystemStore.getState();
              const current = state.snapshot;
              if (current && !isPageVisibleForProfile(state.page, current.settings)) {
                state.setPage(defaultPageForProfile(current.settings));
              }
            });
          }}
        />
      </SettingSection>
      <SettingSection title="Appearance">
        <SettingSelect
          settingId="general.uiScale"
          title="Interface scale"
          description="Make text, controls, and workspaces larger or smaller throughout Switchboard. Changes apply immediately."
          value={String(snapshot.settings.uiScalePercent)}
          options={[
            { value: '90', label: '90% · Compact' },
            { value: '100', label: '100%' },
            { value: '110', label: '110%' },
            { value: '125', label: '125% · Recommended' },
            { value: '150', label: '150% · Large' },
          ]}
          onValueChange={(value) => void updateSettings({ uiScalePercent: Number(value) as 90 | 100 | 110 | 125 | 150 })}
        />
        <SettingSwitch
          settingId="general.softwareRendering"
          title="Low resource rendering"
          description="Use software rendering on the next launch to reduce background memory. Leave off for smoother high-resolution clip playback."
          checked={snapshot.settings.softwareRendering}
          onCheckedChange={(checked) => void updateSettings({ softwareRendering: checked })}
        />
      </SettingSection>
      <SettingSection title="Startup and window">
        <SettingSwitch
          settingId="general.startup"
          title="Start Switchboard with Windows"
          description="Launch the control plane automatically when you sign in. Optional engines keep their own saved state."
          checked={snapshot.settings.launchAtStartup}
          onCheckedChange={(checked) => void updateSettings({ launchAtStartup: checked })}
        />
        <SettingSwitch
          settingId="general.closeToTray"
          title="Close to tray"
          description="Keep global shortcuts, connected-device profiles, and active engines available after closing the window."
          checked={snapshot.settings.closeToTray}
          onCheckedChange={(checked) => void updateSettings({ closeToTray: checked })}
        />
        <SettingSwitch
          settingId="general.destroyRenderer"
          title="Release interface memory in tray"
          description="Destroy the Chromium renderer in tray mode. The control plane and enabled hosts remain independent."
          checked={snapshot.settings.destroyRendererInTray}
          disabled={!snapshot.settings.closeToTray}
          onCheckedChange={(checked) => void updateSettings({ destroyRendererInTray: checked })}
        />
      </SettingSection>
    </>
  );
}

function AudioSettings({ snapshot, onReset }: CategoryProps) {
  const setPage = useSystemStore((state) => state.setPage);
  const setAudioEnabled = useSystemStore((state) => state.setAudioEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const gameBus = snapshot.audio.buses.find((bus) => bus.id === 'game');
  const micBus = snapshot.audio.buses.find((bus) => bus.id === 'mic');
  const outputOptions = snapshot.audio.devices
    .filter((device) => device.direction === 'output' && device.available)
    .map((device) => ({ value: device.id, label: `${device.name}${device.isDefault ? ' · Windows default' : ''}` }));
  const inputOptions = snapshot.audio.devices
    .filter((device) => device.direction === 'input' && device.available)
    .map((device) => ({ value: device.id, label: `${device.name}${device.isDefault ? ' · Windows default' : ''}` }));
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');

  return (
    <>
      <SettingsCategoryHeader title="Audio" description="Unfinished Developer mode area. Set the Audio host lifecycle and default Windows endpoints." onReset={onReset} />
      <SettingSection title="Engine">
        <SettingSwitch
          settingId="audio.engine"
          title="Audio engine"
          description={snapshot.audio.enabled
            ? 'Audio starts automatically at launch. Turning it off releases audio devices and background work.'
            : 'Start the isolated Audio host now and restore it on the next launch.'}
          checked={snapshot.audio.enabled}
          onCheckedChange={(checked) => void setAudioEnabled(checked)}
        />
        <SettingValue
          settingId="audio.sampleRate"
          title="Processing format"
          description="The current Audio graph has one fixed allocation-free processing format."
          value={`${snapshot.audio.sampleRate / 1000} kHz · float32`}
        />
      </SettingSection>
      <SettingSection title="Default devices">
        {gameBus ? (
          <SettingSelect
            settingId="audio.output"
            title="Default output"
            description="Choose the Windows output assigned to the Game bus. The change applies immediately when the host is running."
            value={gameBus.deviceId}
            options={outputOptions}
            disabled={outputOptions.length === 0}
            onValueChange={(deviceId) => void setAudioBusDevice({ busId: 'game', deviceId })}
          />
        ) : null}
        {micBus ? (
          <SettingSelect
            settingId="audio.microphone"
            title="Default microphone"
            description="Choose the Windows input assigned to the Microphone bus. Hardware gain remains on the device page."
            value={micBus.deviceId}
            options={inputOptions}
            disabled={inputOptions.length === 0}
            onValueChange={(deviceId) => void setAudioBusDevice({ busId: 'mic', deviceId })}
          />
        ) : null}
        <SettingAction
          settingId="audio.mixer"
          title="Mixer and processing"
          description={`Monitoring ${percent(snapshot.audio.monitoring)} · ${engineStateLabel(engine?.state)}. Bus levels, ChatMix, and microphone DSP stay in the Audio workspace.`}
          label="Open Audio"
          onClick={() => setPage('audio')}
        />
      </SettingSection>
    </>
  );
}

function CaptureSettings({ snapshot, onReset }: CategoryProps) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const setPage = useSystemStore((state) => state.setPage);
  const config = snapshot.capture.config;
  const capabilities = snapshot.capture.capabilities;
  const codecLabels = { auto: 'Automatic', h264: 'H.264', hevc: 'HEVC', av1: 'AV1' } as const;
  const codecOptions = [...new Set(['auto' as const, ...capabilities.codecs, config.codec])]
    .map((codec) => ({ value: codec, label: codecLabels[codec] }));
  const encoderOptions = getEncoderOptions(config.encoder, capabilities.encoders);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'capture');

  return (
    <>
      <SettingsCategoryHeader title="Capture" description="Control the isolated capture host, source, encoder, and recorded inputs." onReset={onReset} />
      <SettingSection title="Engine and shortcut">
        <SettingSwitch
          settingId="capture.engine"
          title="Capture engine"
          description={captureEngineDescription(config.enabled, engine?.state, engine?.message)}
          checked={config.enabled}
          disabled={engine?.state === 'starting'}
          onCheckedChange={(enabled) => void setCaptureConfig({ enabled })}
        />
        <SettingShortcut
          settingId="capture.shortcut"
          title="Save replay shortcut"
          value={config.hotkey}
          onValueChange={(hotkey) => void setCaptureConfig({ hotkey })}
        />
      </SettingSection>

      <AutoCaptureSettings snapshot={snapshot} />

      <SettingSection title="Video">
        <SettingSelect
          settingId="capture.source"
          title="Capture source"
          description="Automatic game capture follows an eligible foreground game. Window and display modes use the source selected by the host."
          value={config.source}
          options={[
            { value: 'automatic-game', label: 'Automatic game' },
            { value: 'window', label: 'Window' },
            { value: 'display', label: 'Display' },
          ]}
          onValueChange={(source) => void setCaptureConfig({ source: source as CaptureConfig['source'], sourceId: null })}
        />
        <SettingSelect
          settingId="capture.encoder"
          title="Preferred encoder"
          description={capabilities.encoders.length > 0
            ? 'Automatic chooses the first compatible hardware encoder. A preference is used only when the host reports it.'
            : 'No hardware encoder has been reported yet. Automatic remains the only supported preference.'}
          value={config.encoder}
          options={encoderOptions}
          onValueChange={(encoder) => void setCaptureConfig({ encoder: encoder as CaptureConfig['encoder'] })}
        />
        <SettingSelect
          settingId="capture.codec"
          title="Video codec"
          description="Automatic prefers H.264 for compatibility and uses a tested encoder. The active encoder appears in Diagnostics."
          value={config.codec}
          options={codecOptions}
          disabled={codecOptions.length <= 1}
          onValueChange={(codec) => void setCaptureConfig({ codec: codec as CaptureConfig['codec'] })}
        />
      </SettingSection>

      <SettingSection title="Audio and pointer">
        {capabilities.microphoneAudio ? (
          <SettingSwitch
            settingId="capture.microphone"
            title="Record microphone"
            description="Include the selected microphone as a separate replay input."
            checked={config.includeMic}
            onCheckedChange={(includeMic) => void setCaptureConfig({ includeMic })}
          />
        ) : (
          <SettingValue settingId="capture.microphone" title="Record microphone" description="The current capture host has not reported microphone capture support." value="Unavailable" />
        )}
        {capabilities.systemAudio ? (
          <SettingSwitch
            settingId="capture.systemAudio"
            title="Record system audio"
            description="Include desktop audio in replay clips."
            checked={config.includeSystemAudio}
            onCheckedChange={(includeSystemAudio) => void setCaptureConfig({ includeSystemAudio })}
          />
        ) : (
          <SettingValue settingId="capture.systemAudio" title="Record system audio" description="The current capture host has not reported system-audio support." value="Unavailable" />
        )}
        {capabilities.systemAudio ? (
          <SettingSwitch
            settingId="capture.chatAudio"
            title="Record chat audio separately"
            description="Capture Discord or voice chat on its own track, apart from the game mix."
            checked={config.includeChatAudio}
            onCheckedChange={(includeChatAudio) => void setCaptureConfig({ includeChatAudio })}
          />
        ) : (
          <SettingValue settingId="capture.chatAudio" title="Record chat audio separately" description="The current capture host has not reported system-audio support." value="Unavailable" />
        )}
        <SettingSwitch
          settingId="capture.cursor"
          title="Capture cursor"
          description="Include the Windows pointer in saved footage."
          checked={config.includeCursor}
          onCheckedChange={(includeCursor) => void setCaptureConfig({ includeCursor })}
        />
      </SettingSection>

      <SettingSection title="Replay audio devices">
        <CaptureAudioDeviceSettings snapshot={snapshot} />
      </SettingSection>

      <SettingSection title="Workspace">
        <SettingAction
          settingId="capture.workspace"
          title="Capture workspace"
          description="Replay configuration, the save action, and the clip library stay on the Capture page."
          label="Open Capture"
          onClick={() => setPage('capture')}
        />
      </SettingSection>
    </>
  );
}

function CaptureAudioDeviceSettings({ snapshot }: { snapshot: SystemSnapshot }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const config = snapshot.capture.config;
  const capabilities = snapshot.capture.capabilities;
  const outputDevices = captureOutputDevices(snapshot);
  const inputDevices = captureInputDevices(snapshot);
  const systemAvailable = capabilities.systemAudio;
  const micAvailable = capabilities.microphoneAudio;
  const explicitMicUnavailable = Boolean(config.microphoneDeviceId)
    && !inputDevices.some((device) => device.id === config.microphoneDeviceId);
  const gameAndChatSame = config.includeSystemAudio && config.includeChatAudio
    && (config.systemAudioDeviceId ?? 'auto') === (config.chatAudioDeviceId ?? 'auto');

  return (
    <SettingRow
      settingId="capture.audioDevices"
      title="Replay audio devices"
      description="Choose which Game, Chat, and Microphone devices feed Instant Replay. Each stays on its own track."
      className="settings-capture-devices-block"
      controlClassName="settings-capture-devices-control"
    >
      <div className="settings-capture-devices">
        <div className="settings-capture-devices__field">
          <span id="capture-device-game-label">Game device</span>
          <CaptureAudioDeviceSelect
            label="Game audio device"
            triggerId="capture-device-game-label"
            value={config.systemAudioDeviceId}
            devices={outputDevices}
            automaticLabel={gameAutomaticLabel(snapshot)}
            disabled={!systemAvailable || !config.includeSystemAudio}
            onChange={(systemAudioDeviceId) => void setCaptureConfig({ systemAudioDeviceId })}
          />
        </div>
        <div className="settings-capture-devices__field">
          <span id="capture-device-chat-label">Chat device</span>
          <CaptureAudioDeviceSelect
            label="Chat audio device"
            triggerId="capture-device-chat-label"
            value={config.chatAudioDeviceId}
            devices={outputDevices}
            automaticLabel={chatAutomaticLabel()}
            disabled={!systemAvailable || !config.includeChatAudio}
            onChange={(chatAudioDeviceId) => void setCaptureConfig({ chatAudioDeviceId })}
          />
        </div>
        <div className="settings-capture-devices__field">
          <span id="capture-device-mic-label">Microphone device</span>
          <CaptureAudioDeviceSelect
            label="Microphone device"
            triggerId="capture-device-mic-label"
            value={config.microphoneDeviceId}
            devices={inputDevices}
            automaticLabel={micAutomaticLabel(snapshot)}
            disabled={!micAvailable || !config.includeMic}
            onChange={(microphoneDeviceId) => void setCaptureConfig({ microphoneDeviceId })}
          />
        </div>
        {!systemAvailable && !micAvailable ? (
          <p className="settings-capture-devices__note" role="status">
            The capture host has not reported audio support yet. Device choices unlock once support is available.
          </p>
        ) : (
          <p className="settings-capture-devices__note">
            Sonar users can assign Sonar Game, Sonar Chat, and the microphone to separate inputs.
          </p>
        )}
        {explicitMicUnavailable && config.includeMic ? (
          <p className="settings-capture-devices__note settings-capture-devices__note--warning" role="status">
            The selected microphone is not currently available. Reconnect it or choose another input.
          </p>
        ) : null}
        {gameAndChatSame ? (
          <p className="settings-capture-devices__note settings-capture-devices__note--warning" role="status">
            Game and chat are using the same output, so their tracks will contain the same sound. Choose different devices to keep them separate.
          </p>
        ) : null}
      </div>
    </SettingRow>
  );
}

function ClipsSettings({ snapshot, onReset }: CategoryProps) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
  const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
  const config = snapshot.capture.config;
  const capabilities = snapshot.capture.capabilities;
  const storage = snapshot.capture.storage;
  const clipDirectory = config.clipsDirectory || storage.clipsDirectory || 'Windows Videos\\Switchboard Clips';
  const estimate = estimateClipSize(config, snapshot.capture.runtime.observedBitrateBps);
  const totalBytes = storage.volumeTotalBytes;
  const freeBytes = storage.volumeAvailableBytes;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const otherBytes = Math.max(0, usedBytes - storage.clipsBytes);
  const usedPercent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
  const clipsPercent = totalBytes > 0 ? Math.min(100, (storage.clipsBytes / totalBytes) * 100) : 0;
  const otherPercent = totalBytes > 0 ? Math.min(100 - clipsPercent, (otherBytes / totalBytes) * 100) : 0;
  const possibleClips = estimate.estimatedBytes > 0 && freeBytes > 0 ? Math.floor(freeBytes / estimate.estimatedBytes) : null;
  const fpsOptions = ([30, 60, 120] as const)
    .filter((fps) => fps <= capabilities.maximumFps || fps === config.fps)
    .map((fps) => ({ value: String(fps), label: `${fps} FPS` }));

  return (
    <div className="clip-settings">
      <SettingsCategoryHeader
        title="Clips"
        description="Adjust defaults for new clips, review the size estimate, and manage storage."
        onReset={onReset}
      />

      <section className="clip-settings__section" aria-labelledby="clip-settings-quality-heading">
        <div className="clip-settings__section-heading">
          <h3 id="clip-settings-quality-heading">Clip quality and memory</h3>
          <p>Higher settings improve image quality while increasing encoder load and file size.</p>
        </div>
        <div className="clip-settings__fields">
          <ClipSelectField
            settingId="capture.duration"
            label="Duration"
            value={String(config.replaySeconds)}
            options={[15, 30, 45, 60, 90, 120, 180, 300].map((seconds) => ({ value: String(seconds), label: formatClipDuration(seconds) }))}
            onValueChange={(value) => void setCaptureConfig({ replaySeconds: Number(value) })}
          />
          <ClipSelectField
            settingId="capture.quality"
            label="Video quality"
            value={String(config.quality)}
            options={[
              { value: '1', label: 'Economy' },
              { value: '2', label: 'Balanced' },
              { value: '3', label: 'Good' },
              { value: '4', label: 'High (Default)' },
              { value: '5', label: 'Maximum' },
            ]}
            onValueChange={(value) => void setCaptureConfig({ quality: Number(value) })}
          />
          <ClipSelectField
            settingId="capture.resolution"
            label="Resolution"
            value={config.resolution}
            options={[
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
              { value: '1440p', label: '1440p (Default)' },
              { value: '2160p', label: '2160p' },
              { value: 'native', label: 'Native source' },
            ]}
            onValueChange={(resolution) => void setCaptureConfig({ resolution: resolution as CaptureConfig['resolution'] })}
          />
          <ClipSelectField
            settingId="capture.frameRate"
            label="Frame rate"
            value={String(config.fps)}
            options={fpsOptions}
            onValueChange={(fps) => void setCaptureConfig({ fps: Number(fps) as CaptureConfig['fps'] })}
          />
        </div>
        <div className="clip-settings__estimate" aria-live="polite">
          <span>Estimated clip size: <strong>{formatBytes(estimate.estimatedBytes)}</strong> per clip</span>
          <span>RAM usage: <strong className="clip-settings__memory">Low</strong> <small>Disk-backed replay ring</small></span>
        </div>
      </section>

      <SettingSection title="Default track levels">
        {([
          { channel: 'game', label: 'Game' },
          { channel: 'chat', label: 'Chat' },
          { channel: 'microphone', label: 'Microphone' },
          { channel: 'media', label: 'Media' },
        ] as const).map(({ channel, label }) => (
          <SettingSlider
            key={channel}
            settingId={`clips.defaultTrackLevel.${channel}`}
            title={`Default ${label} volume`}
            description={`New clips start the ${label} track here. Clips with a saved level keep it.`}
            value={config.defaultTrackLevels[channel]}
            min={0}
            max={100}
            step={1}
            formatValue={(value) => `${value}%`}
            onValueCommit={(level) => void setCaptureConfig({ defaultTrackLevels: { [channel]: level } as Partial<typeof config.defaultTrackLevels> })}
          />
        ))}
      </SettingSection>

      <section className="clip-settings__section clip-storage" aria-labelledby="clip-storage-heading">
        <div className="clip-settings__section-heading clip-storage__heading">
          <div>
            <h3 id="clip-storage-heading">Drive space</h3>
            {totalBytes > 0 ? (
              <p><strong>{formatBytes(freeBytes)}</strong> free of {formatBytes(totalBytes)}</p>
            ) : (
              <p>Drive capacity is unavailable until the Clips folder can be inspected.</p>
            )}
          </div>
          {totalBytes > 0 ? <span>{usedPercent}% used</span> : null}
        </div>
        <div
          className="clip-storage__meter"
          role="img"
          aria-label={totalBytes > 0 ? `${usedPercent}% of the Clips drive is used` : 'Clips drive capacity unavailable'}
        >
          <span className="clip-storage__meter-clips" style={{ width: `${clipsPercent}%` }} />
          <span className="clip-storage__meter-other" style={{ width: `${otherPercent}%` }} />
        </div>
        <div className="clip-storage__legend">
          <span><i data-tone="clips" />Switchboard clips: <strong>{formatBytes(storage.clipsBytes)}</strong> ({snapshot.clips.length})</span>
          {totalBytes > 0 ? <span><i data-tone="other" />Other files: <strong>{formatBytes(otherBytes)}</strong></span> : null}
          <span className="clip-storage__capacity">Possible clips: <strong>{possibleClips?.toLocaleString() ?? '—'}</strong></span>
        </div>
        {storage.warning ? <p className="clip-storage__warning"><AlertTriangle aria-hidden />{storage.warning}</p> : null}
        <SettingFolder
          settingId="capture.storage"
          title="Storage location"
          path={clipDirectory}
          onChange={() => void chooseClipDirectory()}
          onOpen={() => void openClipsDirectory()}
          className="clip-storage-location"
        />
      </section>
    </div>
  );
}

function ClipSelectField({
  settingId,
  label,
  value,
  options,
  disabled,
  onValueChange,
}: {
  settingId: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const labelId = `clip-field-${settingId.replace(/[^a-z0-9]+/gi, '-')}`;
  return (
    <div id={`setting-${settingId}`} data-setting-id={settingId} tabIndex={-1} className="clip-settings__field">
      <span id={labelId}>{label}</span>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-labelledby={labelId} className="clip-settings__select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ModulesSettings({
  snapshot,
  onReset,
  onOpenDeveloperTools,
}: CategoryProps & { onOpenDeveloperTools: () => void }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);

  return (
    <div className="settings-category--modules">
      <SettingsCategoryHeader title="Modules" description="Extend Switchboard with device integrations and capabilities." onReset={onReset} />
      <ModuleManagement snapshot={snapshot} onOpenDeveloperTools={onOpenDeveloperTools} />
      <SettingSection title="Module updates">
        <SettingSwitch
          settingId="modules.automaticUpdates"
          title="Update installed modules automatically"
          description="Verify signed packages, install safely, and retain one rollback copy. Local projects are never changed automatically."
          checked={snapshot.settings.automaticModuleUpdates}
          onCheckedChange={(automaticModuleUpdates) => void updateSettings({ automaticModuleUpdates })}
        />
      </SettingSection>
    </div>
  );
}

function DiagnosticsSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const [pendingSetting, setPendingSetting] = useState<'retention' | 'guard' | null>(null);
  const developerMode = snapshot.settings.developerMode === true;
  const audioEngine = snapshot.engines.find((engine) => engine.kind === 'audio');
  const captureEngine = snapshot.engines.find((engine) => engine.kind === 'capture');
  const capturePreset = getEncodingPreset(snapshot.capture.config);
  const captureRuntime = snapshot.capture.runtime;
  const autoCapture = snapshot.capture.autoCapture;
  const autoCaptureProvider = autoCapture.providers.find((provider) => provider.id === autoCapture.runtime.activeProviderId);
  const noise = snapshot.audio.host?.noiseSuppression;
  const processSample = snapshot.performance.sampledAt
    ? `Sampled ${formatRelativeTime(new Date(snapshot.performance.sampledAt).getTime())}`
    : 'Waiting for first sample';

  return (
    <div className="settings-diagnostics">
      <SettingsCategoryHeader title="Diagnostics" onReset={onReset} />
      <DiagnosticRunner snapshot={snapshot} />
      <section className="diagnostics-overview" aria-label="Current health">
        <article id="setting-diagnostics.memory" data-setting-id="diagnostics.memory" tabIndex={-1} className="diagnostics-overview__system">
          <span className="diagnostics-eyebrow">Private memory</span>
          <strong>{snapshot.performance.sampledAt ? <>{snapshot.performance.totalMemoryMb}<small>MB</small></> : 'Collecting…'}</strong>
          {snapshot.performance.sampledAt ? <>
            <span>Core {snapshot.performance.coreMemoryMb} · renderer {snapshot.performance.rendererMemoryMb} MB</span>
            <small>Working set {snapshot.performance.residentMemoryMb} MB</small>
          </> : null}
        </article>
        <article>
          <span className="diagnostics-eyebrow">CPU</span>
          <strong>{snapshot.performance.sampledAt ? <>{snapshot.performance.totalCpuPercent.toFixed(1)}<small>%</small></> : 'Collecting…'}</strong>
          {snapshot.performance.sampledAt ? <span>{snapshot.performance.activeProcesses} processes</span> : null}
          <small>{processSample}</small>
        </article>
        {developerMode ? <EngineSummary title="Audio" engine={audioEngine} /> : null}
        <EngineSummary title="Capture" engine={captureEngine} />
      </section>

      {snapshot.performance.warning ? (
        <div id="setting-diagnostics.performance-warning" data-setting-id="diagnostics.performance-warning" tabIndex={-1} className="diagnostics-warning" role="status">
          <AlertTriangle aria-hidden />
          <span><strong>Sustained budget warning</strong>{snapshot.performance.warning}</span>
        </div>
      ) : null}

      <ResourceDiagnostics snapshot={snapshot} />

      <section className="diagnostics-maintenance" aria-labelledby="diagnostics-maintenance-title">
        <div className="diagnostics-section__heading">
          <h3 id="diagnostics-maintenance-title">Local records</h3>
          <span id="setting-diagnostics.telemetry" data-setting-id="diagnostics.telemetry" tabIndex={-1} className="diagnostics-local-only">Telemetry off</span>
        </div>
        <div className="diagnostics-maintenance__controls">
          <div id="setting-diagnostics.retention" data-setting-id="diagnostics.retention" tabIndex={-1} className="diagnostics-maintenance__control">
            <strong>Local retention</strong>
            <Select value={String(snapshot.settings.diagnosticsRetentionDays)} disabled={pendingSetting !== null} onValueChange={(days) => {
              setPendingSetting('retention');
              void updateSettings({ diagnosticsRetentionDays: Number(days) }).finally(() => setPendingSetting(null));
            }}>
              <SelectTrigger aria-label="Local retention"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 3, 7, 14, 30].map((days) => <SelectItem key={days} value={String(days)}>{days === 1 ? '1 day' : `${days} days`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div id="setting-diagnostics.guard" data-setting-id="diagnostics.guard" tabIndex={-1} className="diagnostics-maintenance__control">
            <span><strong>Performance guard</strong><small>Warn on sustained memory or CPU overuse.</small></span>
            <Switch checked={snapshot.settings.performanceGuard} disabled={pendingSetting !== null} onCheckedChange={(performanceGuard) => {
              setPendingSetting('guard');
              void updateSettings({ performanceGuard }).finally(() => setPendingSetting(null));
            }} aria-label="Performance guard" />
          </div>
        </div>
      </section>

      <DiagnosticsSection title="Pipelines">
        {captureRuntime.error ? <DiagnosticsReadout
          settingId="diagnostics.capture-error"
          title="Capture failure"
          description={<span className="whitespace-pre-line">{captureRuntime.error}</span>}
          value={captureRuntime.state}
          tone="danger"
        /> : null}
        <DiagnosticsReadout
          settingId="diagnostics.capture-path"
          title="Capture pipeline"
          description={`${captureRuntime.backendLabel} · ${captureRuntime.encoderLabel} · ${snapshot.capture.config.codec.toUpperCase()} · ${snapshot.capture.config.resolution} at ${snapshot.capture.config.fps} FPS`}
          value={`${formatBytes(capturePreset.targetVideoBitrateBps / 8)}/s target`}
        />
        <DiagnosticsReadout
          settingId="diagnostics.capture-health"
          title="Replay health"
          description={`${captureRuntime.encodedFrames.toLocaleString()} encoded · ${captureRuntime.droppedFrames.toLocaleString()} dropped · ${captureRuntime.audioSyncCorrections.toLocaleString()} audio corrections`}
          value={`${formatBytes(captureRuntime.replayCacheBytes)} cache${captureRuntime.observedBitrateBps > 0 ? ` · ${formatBytes(captureRuntime.observedBitrateBps / 8)}/s observed` : ''}`}
          tone={captureRuntime.droppedFrames > 0 ? 'warning' : 'default'}
        />
        {developerMode ? (
          <>
            <DiagnosticsReadout
              settingId="diagnostics.noise-suppression"
              title="Microphone noise removal"
              description={noise
                ? `${noise.backend} · ${noise.modelIdentifier ?? 'no model'} · ${noise.frameLength} samples at ${noise.processingSampleRate.toLocaleString()} Hz · ${noise.attenuationLimitDb.toFixed(1)} dB limit`
                : 'Start the audio engine to load the backend.'}
              value={noise ? `${noise.state} · p99 ${noise.p99Ms.toFixed(2)} ms` : 'Not loaded'}
              tone={noise?.lastError ? 'danger' : 'default'}
            />
            <DiagnosticsReadout
              settingId="diagnostics.microphone-realtime"
              title="Microphone realtime health"
              description={noise
                ? `${noise.captureOverruns.toLocaleString()} capture overruns · ${noise.monitorOverruns.toLocaleString()}/${noise.monitorUnderruns.toLocaleString()} monitor over/underruns · ${noise.droppedOrBypassedFrames.toLocaleString()} dropped or bypassed frames · callback p99 ${noise.captureCallbackP99Ms.toFixed(2)} ms`
                : undefined}
              value={noise?.lastError ?? (noise ? `${noise.algorithmicLatencyMs.toFixed(1)} ms algorithmic` : 'No data')}
              tone={noise?.lastError ? 'danger' : 'default'}
            />
          </>
        ) : null}
      </DiagnosticsSection>

      <DiagnosticsSection title="Automation">
        <DiagnosticsReadout
          settingId="diagnostics.autocapture"
          title="Auto Capture"
          description={autoCapture.settings.enabled
            ? `${autoCaptureProvider?.displayName ?? autoCapture.runtime.activeGameId ?? 'No active game'} · ${autoCapture.runtime.eventsReceived.toLocaleString()} events · ${autoCapture.runtime.eventsDeduplicated.toLocaleString()} deduplicated · ${autoCapture.runtime.clipsCreated.toLocaleString()} clips`
            : undefined}
          value={`${autoCapture.settings.enabled ? autoCapture.runtime.state : 'Off'}${autoCapture.runtime.lastEvent ? ` · ${autoCapture.runtime.lastEvent.label ?? autoCapture.runtime.lastEvent.type.replaceAll('_', ' ')} ${formatRelativeTime(autoCapture.runtime.lastEvent.at)}` : ''}`}
          tone={autoCapture.runtime.lastError ? 'danger' : 'default'}
        />
        <DiagnosticsReadout
          settingId="diagnostics.reaction-clipping"
          title="Reaction clipping"
          description={snapshot.capture.autoCapture.settings.reactionClipping.enabled
            ? `${captureRuntime.reactionClipping.reactionsDetected.toLocaleString()} detected · ${captureRuntime.reactionClipping.analyzedFrames.toLocaleString()} frames at ${captureRuntime.reactionClipping.analysisAverageMs.toFixed(4)} ms average · input ${captureRuntime.reactionClipping.inputLevelDb.toFixed(1)} dBFS · learned floor ${captureRuntime.reactionClipping.noiseFloorDb.toFixed(1)} dBFS · trigger ${captureRuntime.reactionClipping.triggerThresholdDb.toFixed(1)} dBFS`
            : undefined}
          value={`${snapshot.capture.autoCapture.settings.reactionClipping.enabled ? captureRuntime.reactionClipping.state : 'Off'}${captureRuntime.reactionClipping.lastReactionAt ? ` · last ${formatRelativeTime(captureRuntime.reactionClipping.lastReactionAt)}` : ''}`}
        />
        {autoCapture.runtime.pendingCapture ? (
          <DiagnosticsReadout
            settingId="diagnostics.autocapture-pending"
            title="Pending Auto Capture"
            description={`${autoCapture.runtime.pendingCapture.eventCount} event${autoCapture.runtime.pendingCapture.eventCount === 1 ? '' : 's'} · preserving through ${new Date(autoCapture.runtime.pendingCapture.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`}
            value="Post-roll"
            tone="warning"
          />
        ) : null}
        {autoCapture.runtime.lastError ? (
          <DiagnosticsReadout settingId="diagnostics.autocapture-error" title="Auto Capture provider" description={autoCapture.runtime.lastError} value="Degraded" tone="danger" />
        ) : null}
      </DiagnosticsSection>

      <DiagnosticsSection title="Device identity">
        {snapshot.devices.length === 0 ? <p className="diagnostics-empty">No devices detected.</p> : snapshot.devices.map((device, index) => (
          <DeviceIdentityRecord
            key={device.id}
            settingId={index === 0 ? 'diagnostics.deviceIdentity' : `diagnostics.${device.id}.identity`}
            device={device}
          />
        ))}
      </DiagnosticsSection>
    </div>
  );
}

function EngineSummary({ title, engine }: { title: string; engine: SystemSnapshot['engines'][number] | undefined }) {
  return (
    <article id={title === 'Audio' ? 'setting-diagnostics.engines' : undefined} data-setting-id={title === 'Audio' ? 'diagnostics.engines' : undefined} tabIndex={title === 'Audio' ? -1 : undefined} className="diagnostics-overview__engine">
      <span className="diagnostics-eyebrow">{title} host</span>
      <strong><i className={cn('settings-status-dot', statusDotClass(engine?.state))} aria-hidden />{engine ? engineStateLabel(engine.state) : 'Unavailable'}</strong>
      {engine?.pid ? <span>PID {engine.pid}</span> : null}
      {engine?.state === 'error' && engine.message ? <span className="diagnostics-engine-error line-clamp-3" title={engine.message}>{engine.message.split('\n')[0]}</span> : null}
    </article>
  );
}

function DiagnosticsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = `diagnostics-${title.toLocaleLowerCase().replaceAll(' ', '-')}`;
  return (
    <section className="diagnostics-section" aria-labelledby={headingId}>
      <div className="diagnostics-section__heading">
        <h3 id={headingId}>{title}</h3>
      </div>
      <div className="diagnostics-table">{children}</div>
    </section>
  );
}

function DiagnosticsReadout({ settingId, title, description, value, tone = 'default' }: {
  settingId: string;
  title: string;
  description?: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <article id={`setting-${settingId}`} data-setting-id={settingId} data-tone={tone} tabIndex={-1} className="diagnostics-readout">
      <div><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>
      <output>{value}</output>
    </article>
  );
}

function deviceSummary(device: Device): string {
  const product = [device.identity.manufacturer, device.identity.model].filter(Boolean).join(' ');
  const appearance = [device.identity.variant, device.identity.colorway].filter(Boolean).join(' · ');
  const connection = device.identity.connectionLabel ?? device.identity.connection;
  return [product, appearance, connection].filter(Boolean).join(' · ') || 'Identity details are available in Diagnostics.';
}

function DeviceIdentityRecord({ device, settingId }: { device: Device; settingId: string }) {
  const keyboard = device.capabilities.keyboard;
  const keyboardDiagnostics = keyboard?.diagnostics;
  const failedReads = keyboardDiagnostics?.reads.filter((read) => !read.ok) ?? [];
  const fields = [
    ['Manufacturer', device.identity.manufacturer],
    ['Model', device.identity.model],
    ['Variant', device.identity.variant],
    ['Colorway', device.identity.colorway],
    ['VID', formatHardwareId(device.identity.vendorId)],
    ['PID', formatProductIds(device)],
    ['Hardware revision', device.identity.hardwareRevision],
    ['Serial / unit ID', device.identity.serialNumber],
    ['Variant source', `${device.variantResolution.source} · ${device.variantResolution.confidence}${device.variantResolution.evidence ? ` · ${device.variantResolution.evidence}` : ''}`],
    ['Asset result', `${device.asset.key} · ${device.asset.matchedBy} · ${device.asset.source}`],
    ['Firmware', keyboard?.firmwareVersion],
    ['Polling rate', keyboard?.pollingRateHz ? `${keyboard.pollingRateHz.toLocaleString()} Hz` : undefined],
    ['Control transport', keyboardDiagnostics?.protocol],
    ['Control endpoint', keyboardDiagnostics?.endpoint],
    ['Last control sync', keyboardDiagnostics?.lastSyncAt],
    ['Readback health', keyboardDiagnostics ? `${keyboardDiagnostics.reads.length - failedReads.length}/${keyboardDiagnostics.reads.length} reads available` : undefined],
    ['Failed readbacks', failedReads.length ? failedReads.map((read) => `${read.id}: ${read.error ?? 'unavailable'}`).join(' · ') : undefined],
    ['Last write error', keyboardDiagnostics?.lastControlError],
    ['External capabilities', keyboard?.features.filter((feature) => feature.status !== 'native').map((feature) => feature.label).join(' · ') || undefined],
  ].filter((field): field is [string, string] => Boolean(field[1]));

  return (
    <article
      id={`setting-${settingId}`}
      data-setting-id={settingId}
      tabIndex={-1}
      className="settings-device-identity"
      aria-labelledby={`device-identity-${device.id}`}
    >
      <header className="settings-device-identity__header">
        <h4 id={`device-identity-${device.id}`}>{device.displayName}</h4>
        <span className="settings-device-identity__confidence">
          <i aria-hidden />
          {formatVariantConfidence(device.variantResolution.confidence)}
        </span>
      </header>
      <dl className="settings-device-identity__fields">
        {fields.map(([label, value]) => (
          <div key={label} data-wide={['Variant source', 'Asset result', 'Failed readbacks', 'Last write error', 'External capabilities'].includes(label) || undefined}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function formatVariantConfidence(confidence: Device['variantResolution']['confidence']): string {
  if (confidence === 'hardware') return 'Hardware evidence';
  if (confidence === 'product-id') return 'Product ID mapping';
  if (confidence === 'module-metadata') return 'Module metadata';
  if (confidence === 'user-override') return 'Appearance override';
  return 'Identity fallback';
}

function formatHardwareId(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `0x${value.toString(16).padStart(4, '0').toUpperCase()}`;
}

function formatProductIds(device: Device): string | undefined {
  const primary = formatHardwareId(device.identity.productId);
  const transport = formatHardwareId(device.identity.transportProductId);
  const interfaces = device.identity.interfaceProductIds?.map(formatHardwareId).filter(Boolean).join(', ');
  return [primary, transport ? `transport ${transport}` : undefined, interfaces ? `interfaces ${interfaces}` : undefined]
    .filter(Boolean)
    .join(' · ') || undefined;
}

function AboutSettings({ snapshot }: { snapshot: SystemSnapshot }) {
  const electronVersion = navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1];
  const platform = navigator.userAgent.includes('Windows') || navigator.platform.startsWith('Win') ? 'Windows' : navigator.platform;
  const checkAppUpdates = useSystemStore((state) => state.checkAppUpdates);
  const downloadAppUpdate = useSystemStore((state) => state.downloadAppUpdate);
  const installAppUpdate = useSystemStore((state) => state.installAppUpdate);
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const update = snapshot.appUpdate;
  const automaticDownloads = snapshot.settings.automaticAppUpdateDownloads;
  const automaticDownloadActive = automaticDownloads && !snapshot.prototypeMode;
  const updateBusy = update.status === 'checking'
    || update.status === 'downloading'
    || update.status === 'installing'
    || (update.status === 'available' && automaticDownloadActive);
  const updateActionLabel = appUpdateActionLabel(update, automaticDownloadActive);

  return (
    <>
      <SettingsCategoryHeader title="About" description="Version, updates, runtime, and process-isolation information." />
      <div className="settings-about-intro">
        <img src="./switchboard-mark.png" alt="" draggable={false} />
        <div>
          <h3>Switchboard</h3>
          <p>A compact Windows utility for hardware and game capture{snapshot.settings.developerMode === true ? ', with unfinished audio routing behind Developer mode' : ''}.</p>
        </div>
      </div>
      <SettingSection title="Updates">
        <SettingRow
          settingId="about.updates"
          title="Switchboard updates"
          description={(
            <span role="status" aria-live="polite">
              {appUpdateDescription(
                update,
                automaticDownloads,
                snapshot.settings.installAppUpdatesOnNextStartup,
                snapshot.prototypeMode,
              )}
            </span>
          )}
        >
          {update.capability === 'available' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn('settings-update-action', update.status === 'downloaded' && 'settings-update-action--ready')}
              data-app-update-action={update.status}
              disabled={updateBusy || (automaticDownloads && update.status === 'available')}
              onClick={() => {
                if (update.status === 'downloaded') void installAppUpdate();
                else if (update.status === 'available') void downloadAppUpdate();
                else void checkAppUpdates();
              }}
            >
              {updateBusy ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : update.status === 'available' ? (
                <Download className="size-3.5" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              {updateActionLabel}
            </Button>
          ) : (
            <span className="settings-row__value">Unavailable</span>
          )}
        </SettingRow>
      </SettingSection>
      <SettingSection title="Update preferences">
        <SettingSwitch
          settingId="about.automaticAppUpdates"
          title="Always keep Switchboard up to date"
          description="Check shortly after launch and every 30 minutes while Switchboard is running. Manual checks remain available when this is off."
          checked={snapshot.settings.automaticAppUpdates}
          onCheckedChange={(automaticAppUpdates) => void updateSettings({ automaticAppUpdates })}
        />
        <SettingSwitch
          settingId="about.automaticAppUpdateDownloads"
          title="Download updates automatically"
          description="Download a release in the background after a check finds it. Turn this off to choose when the download starts."
          checked={snapshot.settings.automaticAppUpdateDownloads}
          onCheckedChange={(automaticAppUpdateDownloads) => void updateSettings({ automaticAppUpdateDownloads })}
        />
        <SettingSwitch
          settingId="about.installAppUpdatesWhenIdle"
          title="Install while away"
          description="After 10 minutes away, silently install and return to the tray. Waits until the interface is closed and audio, capture, and exports are inactive. Requires automatic checks."
          checked={snapshot.settings.installAppUpdatesWhenIdle}
          onCheckedChange={(installAppUpdatesWhenIdle) => void updateSettings({ installAppUpdatesWhenIdle })}
        />
        <SettingSwitch
          settingId="about.installAppUpdatesOnNextStartup"
          title="Install for the next startup"
          description="Apply a downloaded update when Switchboard closes so the next launch starts on the new version."
          checked={snapshot.settings.installAppUpdatesOnNextStartup}
          onCheckedChange={(installAppUpdatesOnNextStartup) => void updateSettings({ installAppUpdatesOnNextStartup })}
        />
      </SettingSection>
      <SettingSection title="Build">
        <SettingValue settingId="about.version" title="Version" description={snapshot.prototypeMode ? 'Development features are enabled.' : undefined} value={snapshot.version} />
        <SettingValue settingId="about.runtime" title="Runtime" description={platform} value={electronVersion ? `Electron ${electronVersion}` : 'Browser preview'} />
        <SettingValue settingId="about.isolation" title="Renderer isolation" description="Sandboxed renderer with a narrow, validated preload bridge." value="Enabled" tone="success" />
      </SettingSection>
    </>
  );
}

function appUpdateActionLabel(update: AppUpdateState, automaticDownloads: boolean): string {
  if (update.status === 'checking') return 'Checking…';
  if (update.status === 'available') return automaticDownloads ? 'Preparing download…' : 'Download update';
  if (update.status === 'downloading') return `Downloading ${Math.round(update.downloadProgress ?? 0)}%`;
  if (update.status === 'downloaded') return 'Restart to update';
  if (update.status === 'installing') return 'Restarting…';
  if (update.status === 'error') return 'Try again';
  return 'Check now';
}

function appUpdateDescription(
  update: AppUpdateState,
  automaticDownloads: boolean,
  installOnNextStartup: boolean,
  prototypeMode: boolean,
): string {
  if (update.status === 'unavailable') return update.unavailableReason ?? 'Application updates are unavailable in this build.';
  if (update.status === 'checking') return 'Checking the Switchboard release feed.';
  if (update.status === 'available' && prototypeMode) return `Development preview: version ${update.availableVersion ?? 'new'} is available.`;
  if (update.status === 'available') return automaticDownloads
    ? `Version ${update.availableVersion ?? 'new'} is available. The download will start automatically.`
    : `Version ${update.availableVersion ?? 'new'} is available. Download it when convenient.`;
  if (update.status === 'downloading') return `Downloading version ${update.availableVersion ?? 'new'} in the background.`;
  if (update.status === 'downloaded') return installOnNextStartup
    ? `Version ${update.availableVersion ?? 'new'} is downloaded and will be installed when Switchboard closes.`
    : `Version ${update.availableVersion ?? 'new'} is downloaded and ready. Restart when convenient to install it.`;
  if (update.status === 'installing') return 'Installing silently in the background and restarting.';
  if (update.status === 'error') return update.error ?? 'The update could not be completed.';
  if (update.checkedAt) return `Switchboard is up to date. Last checked ${new Date(update.checkedAt).toLocaleString()}.`;
  return 'Check GitHub Releases for a newer version of Switchboard.';
}

function ResetConfirmation({
  scope,
  onCancel,
  onConfirm,
}: {
  scope: SettingsResetScope;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const label = scope === 'all'
    ? 'all Settings preferences plus Audio and Capture configuration'
    : `${scope[0]?.toLocaleUpperCase()}${scope.slice(1)} settings`;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    if (controls.length === 0) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current <= 0 ? controls.length - 1 : current - 1)
      : (current === controls.length - 1 ? 0 : current + 1);
    event.preventDefault();
    controls[next]?.focus();
  };

  return (
    <div ref={dialogRef} className="settings-reset-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="reset-settings-title" aria-describedby="reset-settings-description" onKeyDown={keepFocusInside}>
      <AlertTriangle className="settings-reset-confirmation__icon" aria-hidden />
      <div>
        <h2 id="reset-settings-title">Restore defaults?</h2>
        <p id="reset-settings-description">This resets {label}. Installed modules, device profiles, and saved clips are not removed.</p>
      </div>
      <div className="settings-reset-confirmation__actions">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button ref={confirmRef} type="button" variant="danger" size="sm" onClick={onConfirm}>Restore</Button>
      </div>
    </div>
  );
}

type CategoryProps = {
  snapshot: SystemSnapshot;
  onReset?: () => void;
};

function readInitialCategory(): SettingsCategoryId {
  if (readInitialSubview() === 'module-developer-tools') return 'modules';
  const stored = window.sessionStorage.getItem(categoryStorageKey);
  return isSettingsCategory(stored) ? stored : 'general';
}

function readInitialSubview(): SettingsSubview {
  return window.location.hash === '#settings/modules/developer-tools'
    ? 'module-developer-tools'
    : 'category';
}

function reducedMotionEnabled(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function categoryResetScope(category: SettingsCategoryId): SettingsResetScope | null {
  if (category === 'about') return null;
  if (category === 'clips') return 'capture';
  return category;
}

function formatClipDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function engineStateLabel(state: 'stopped' | 'starting' | 'running' | 'error' | undefined): string {
  if (state === 'running') return 'running';
  if (state === 'starting') return 'starting';
  if (state === 'error') return 'needs attention';
  return 'stopped';
}

function statusDotClass(state: 'stopped' | 'starting' | 'running' | 'error' | undefined): string {
  if (state === 'running') return 'settings-status-dot--good';
  if (state === 'starting') return 'settings-status-dot--warning';
  if (state === 'error') return 'settings-status-dot--danger';
  return '';
}

function captureEngineDescription(
  enabled: boolean,
  state: 'stopped' | 'starting' | 'running' | 'error' | undefined,
  message: string | undefined,
): string {
  if (state === 'error') return message ? `Capture failed: ${message}` : 'Capture failed. Turn the engine off and on to retry, or check Diagnostics.';
  if (state === 'starting') return 'Starting the isolated Capture host and registering the save shortcut.';
  if (enabled) return 'The isolated Capture host is enabled and will be restored on the next launch. Turning it off releases the process and encoder session.';
  return 'Start the isolated Capture host now and restore it on the next launch.';
}

function getEncoderOptions(current: CaptureEncoderPreference, reported: readonly string[]) {
  const labels: Record<CaptureEncoderPreference, string> = {
    auto: 'Automatic',
    nvenc: 'NVIDIA NVENC',
    amf: 'AMD AMF',
    qsv: 'Intel Quick Sync',
    software: 'Software',
  };
  const normalized = new Set(reported.map((encoder) => encoder.toLocaleLowerCase()));
  const preferences: CaptureEncoderPreference[] = ['auto', 'nvenc', 'amf', 'qsv', 'software'];
  return preferences
    .filter((preference) => preference === 'auto' || preference === current || normalized.has(preference))
    .map((value) => ({ value, label: labels[value] }));
}
