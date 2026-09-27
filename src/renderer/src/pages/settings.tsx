import { AudioDependencySetupPanel } from '@/components/settings/audio-dependency-setup';
import { ApplicationRoutingSettings } from '@/components/settings/application-routing-settings';
import { pickableAudioDevices } from '@/components/audio/AudioDevicePicker';
import '@/components/settings/capture-settings.css';
import '@/components/settings/settings-shell.css';
import { AudioSyncCalibrationSettings } from '@/components/settings/audio-sync-calibration';
import { SetupWorkspace } from '@/components/setup/setup-workspace';
import '@/components/settings/general-settings.css';
import { DiagnosticsWorkspace } from '@/components/settings/diagnostics-workspace';
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
import { SettingsSearchField, SettingsSearchResults } from '@/components/settings/settings-search';
import { NewSettingsProvider, useNewSettings, useNewSettingsTracker } from '@/components/settings/settings-new';
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
  settingsCategoryStorageKey,
  settingsEntry,
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

type SettingsSubview = 'category' | 'module-developer-tools';

export function SettingsPage({ snapshot, onClose }: { snapshot: SystemSnapshot; onClose: () => void }) {
  const [category, setCategory] = useState<SettingsCategoryId>(readInitialCategory);
  const [subview, setSubview] = useState<SettingsSubview>(readInitialSubview);
  const [query, setQuery] = useState('');
  const [confirmation, setConfirmation] = useState<SettingsResetScope | null>(null);
  const [targetSetting, setTargetSetting] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resetSettings = useSystemStore((state) => state.resetSettings);
  const developerMode = snapshot.settings.developerMode === true;
  const searching = query.trim().length > 0;
  const newSettings = useNewSettingsTracker(snapshot, scrollRef);
  const visibleCategories = visibleSettingsCategories(snapshot.settings);
  const categoryDefinition = visibleCategories.find((candidate) => candidate.id === category);
  const resetScope = categoryResetScope(category);

  const changeCategory = useCallback((nextCategory: SettingsCategoryId) => {
    if (!isSettingsCategoryVisible(nextCategory, snapshot.settings)) return;
    setQuery('');
    setCategory(nextCategory);
    setSubview('category');
    if (window.location.hash !== '#settings') window.history.replaceState(null, '', '#settings');
    window.sessionStorage.setItem(settingsCategoryStorageKey, nextCategory);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [snapshot.settings.developerMode]);

  useEffect(() => {
    if (!isSettingsCategoryVisible(category, snapshot.settings)) {
      setCategory('general');
      setSubview('category');
      window.sessionStorage.setItem(settingsCategoryStorageKey, 'general');
    }
  }, [category, snapshot.settings.developerMode]);

  const openModuleDeveloperTools = useCallback(() => {
    setQuery('');
    setCategory('modules');
    setSubview('module-developer-tools');
    window.sessionStorage.setItem(settingsCategoryStorageKey, 'modules');
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
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (document.querySelector('[data-feedback-dialog]')) return;
        if (confirmation) setConfirmation(null);
        else if (searching) setQuery('');
        else if (subview === 'module-developer-tools') closeModuleDeveloperTools();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModuleDeveloperTools, confirmation, onClose, searching, subview]);

  const confirmReset = () => {
    if (!confirmation) return;
    const scope = confirmation;
    setConfirmation(null);
    void resetSettings(scope);
  };

  return (
    <NewSettingsProvider value={newSettings}>
      <div className="settings-page">
        <header className="settings-header app-drag">
          <div className="settings-breadcrumb" aria-label="Breadcrumb">
            <img src="./switchboard-mark.png" alt="" draggable={false} />
            <span>Settings</span>
            <span aria-hidden>/</span>
            {searching ? <strong>Search</strong> : subview === 'module-developer-tools' ? (
              <>
                <span>Features</span>
                <span aria-hidden>/</span>
                <strong>Developer tools</strong>
              </>
            ) : <strong>{categoryDefinition?.label ?? 'General'}</strong>}
          </div>
          <SettingsSearchField
            query={query}
            developerMode={developerMode}
            inputRef={searchInputRef}
            onQueryChange={setQuery}
            onResultSelect={selectSearchResult}
          />
          {/* Balances the breadcrumb so search stays centered; also reserves the native window controls. */}
          <div className="settings-header__actions" aria-hidden />

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
            category={searching ? null : categoryDefinition?.id ?? 'general'}
            snapshot={snapshot}
            onCategoryChange={changeCategory}
            onBack={onClose}
          />
          <div ref={scrollRef} className="settings-content-scroll" data-settings-content-scroll>
            {searching ? (
              <div key="search" className="settings-content settings-content--search">
                <SettingsSearchResults
                  query={query}
                  developerMode={developerMode}
                  inputRef={searchInputRef}
                  onResultSelect={selectSearchResult}
                />
              </div>
            ) : (
              <div key={categoryDefinition?.id ?? category} className="settings-content">
                <SettingsCategory
                  category={categoryDefinition?.id ?? 'general'}
                  subview={subview}
                  targetSetting={targetSetting}
                  snapshot={snapshot}
                  onOpenModuleDeveloperTools={openModuleDeveloperTools}
                  onCloseModuleDeveloperTools={closeModuleDeveloperTools}
                  onOpenCategory={changeCategory}
                  onRestoreDefaults={() => setConfirmation('all')}
                  onReset={categoryDefinition?.resettable && resetScope ? () => setConfirmation(resetScope) : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </NewSettingsProvider>
  );
}


function SettingsCategory({
  targetSetting,
  category,
  subview,
  snapshot,
  onOpenModuleDeveloperTools,
  onCloseModuleDeveloperTools,
  onOpenCategory,
  onRestoreDefaults,
  onReset,
}: {
  targetSetting?: string | null;
  category: SettingsCategoryId;
  subview: SettingsSubview;
  snapshot: SystemSnapshot;
  onOpenModuleDeveloperTools: () => void;
  onCloseModuleDeveloperTools: () => void;
  onOpenCategory: (category: SettingsCategoryId) => void;
  onRestoreDefaults: () => void;
  onReset?: () => void;
}) {
  if (category === 'general') return <GeneralSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'updates') return <UpdatesSettings snapshot={snapshot} />;
  if (category === 'setup') return <SetupWorkspace snapshot={snapshot} />;
  if (category === 'audio') return <AudioSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'capture') return <CaptureSettings snapshot={snapshot} onReset={onReset} targetSetting={targetSetting} />;
  if (category === 'clips') return <ClipsSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'games') return <GameDetectionSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'modules') {
    return subview === 'module-developer-tools'
      ? <ModuleDeveloperTools snapshot={snapshot} onBack={onCloseModuleDeveloperTools} />
      : <FeaturesSettings snapshot={snapshot} onReset={onReset} onOpenDeveloperTools={onOpenModuleDeveloperTools} onOpenCategory={onOpenCategory} />;
  }
  if (category === 'diagnostics') return <DiagnosticsSettings snapshot={snapshot} onReset={onReset} targetSetting={targetSetting} />;
  return <AboutSettings snapshot={snapshot} onOpenCategory={onOpenCategory} onRestoreDefaults={onRestoreDefaults} />;
}

/**
 * Pages and the modules behind them live on one surface so a feature is never
 * switched in two unrelated places. Capture and Audio engines keep their single
 * switch in their own categories; this page only decides what appears.
 */
function FeaturesSettings({
  snapshot,
  onReset,
  onOpenDeveloperTools,
  onOpenCategory,
}: CategoryProps & { onOpenDeveloperTools: () => void; onOpenCategory: (category: SettingsCategoryId) => void }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const developerMode = snapshot.settings.developerMode === true;
  const stored = normalizeVisibleWorkspaces(snapshot.settings.visibleWorkspaces) ?? fullWorkspacesForDeveloperMode(developerMode);
  const workspaces = stored;
  const preset = workspacePreset(workspaces, developerMode);
  const devicesVisible = workspaces.includes('devices');
  const enabledDeviceModules = snapshot.modules.filter((module) => module.enabled && module.kind === 'device').length;

  const applyWorkspaces = (next: VisibleWorkspace[]) => {
    const filtered = next;
    void updateSettings({ visibleWorkspaces: filtered }).then(() => {
      const state = useSystemStore.getState();
      const current = state.snapshot;
      if (current && !isPageVisibleForProfile(state.page, current.settings)) {
        state.setPage(defaultPageForProfile(current.settings));
      }
    });
  };

  const setWorkspaceVisible = (workspace: Exclude<VisibleWorkspace, 'capture'>, visible: boolean) => {
    const selected = new Set(workspaces);
    if (visible) selected.add(workspace);
    else selected.delete(workspace);
    applyWorkspaces(workspaceOrder.filter((entry) => selected.has(entry)));
  };

  return (
    <div className="settings-category--modules settings-features">
      <SettingsCategoryHeader
        title="Features"
        description="Choose which pages Switchboard shows and turn on the modules that power them."
        onReset={onReset}
      />

      <div
        id="setting-general.workspace"
        data-setting-id="general.workspace"
        tabIndex={-1}
        className="settings-features__preset"
      >
        <div className="settings-features__preset-copy">
          <strong>Start from a preset</strong>
          <span>{preset === 'custom' ? 'Your current mix of pages is custom.' : 'Presets set which pages appear. You can adjust each one below.'}</span>
        </div>
        <div className="settings-segmented" role="group" aria-label="Page presets">
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
      </div>

      <section className="settings-feature" aria-labelledby="settings-feature-capture">
        <FeatureHeading id="settings-feature-capture" icon={CircleDot} title="Capture" description="Replay, clips, and recording.">
          <span className="settings-feature__locked">Always shown</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenCategory('capture')}>Capture settings</Button>
        </FeatureHeading>
      </section>

      <section className="settings-feature" aria-labelledby="settings-feature-devices">
        <FeatureHeading
          id="settings-feature-devices"
          icon={Cable}
          title="Devices"
          description={!devicesVisible && enabledDeviceModules > 0
            ? `Page hidden. ${enabledDeviceModules === 1 ? 'The enabled module keeps' : 'Enabled modules keep'} applying device settings in the background.`
            : 'Connected hardware and its controls, powered by the modules below.'}
        >
          <Switch
            checked={devicesVisible}
            onCheckedChange={(visible) => setWorkspaceVisible('devices', visible)}
            aria-label="Show the Devices page"
            data-workspace-toggle="devices"
          />
        </FeatureHeading>
        <div className="settings-feature__body">
          <ModuleManagement
            snapshot={snapshot}
            onOpenDeveloperTools={onOpenDeveloperTools}
            onDeviceModuleEnabled={() => { if (!devicesVisible) setWorkspaceVisible('devices', true); }}
          />
          <SettingSwitch
            settingId="modules.automaticUpdates"
            title="Update modules automatically"
            description="Verify signed packages, install safely, and keep one rollback copy. Local and community modules are never changed automatically."
            checked={snapshot.settings.automaticModuleUpdates}
            onCheckedChange={(automaticModuleUpdates) => void updateSettings({ automaticModuleUpdates })}
          />
        </div>
      </section>

      {(
        <section className="settings-feature" aria-labelledby="settings-feature-audio">
          <FeatureHeading id="settings-feature-audio" icon={AudioWaveform} title="Audio" description="Optional app mixing and microphone processing. Install the drivers in Audio settings.">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenCategory('audio')}>Audio settings</Button>
            <Switch
              checked={workspaces.includes('audio')}
              onCheckedChange={(visible) => setWorkspaceVisible('audio', visible)}
              aria-label="Show the Audio page"
              data-workspace-toggle="audio"
            />
          </FeatureHeading>
        </section>
      )}
    </div>
  );
}

function FeatureHeading({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-feature__heading">
      <Icon className="settings-feature__icon" aria-hidden />
      <div className="settings-feature__copy">
        <h3 id={id}>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="settings-feature__actions">{children}</div>
    </div>
  );
}

function GeneralSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);

  return (
    <>
      <SettingsCategoryHeader title="General" description="Choose how Switchboard starts, closes, and looks." onReset={onReset} />
      <SettingSection title="Startup">
        <SettingSwitch
          settingId="general.startup"
          title="Start Switchboard with Windows"
          description="Launch Switchboard automatically when you sign in. Capture and other engines keep their own saved state."
          checked={snapshot.settings.launchAtStartup}
          onCheckedChange={(checked) => void updateSettings({ launchAtStartup: checked })}
        />
        <SettingSwitch
          settingId="general.startMinimized"
          title="Start minimized"
          description={snapshot.settings.launchAtStartup
            ? 'Start in the system tray when you sign in to Windows. Open Switchboard from its tray icon.'
            : 'Turn on Start Switchboard with Windows to use this.'}
          checked={snapshot.settings.startMinimized}
          disabled={!snapshot.settings.launchAtStartup}
          onCheckedChange={(checked) => void updateSettings({ startMinimized: checked })}
        />
      </SettingSection>
      <SettingSection title="Tray">
        <SettingSwitch
          settingId="general.closeToTray"
          title="Close to tray"
          description="Keep global shortcuts, connected-device profiles, and active engines available after closing the window."
          checked={snapshot.settings.closeToTray}
          onCheckedChange={(checked) => void updateSettings({ closeToTray: checked })}
        />
        <SettingSwitch
          settingId="general.trayOnGameLaunch"
          title="Move to tray when a game starts"
          description={snapshot.settings.trayOnGameLaunch && snapshot.setup.runtime.desktopError
            ? snapshot.setup.runtime.desktopError
            : snapshot.settings.trayOnGameLaunch && snapshot.setup.runtime.desktopState === 'starting'
              ? 'Starting game detection…'
              : snapshot.gameDetection.capability === 'simulation'
                ? 'Preview only. Game detection runs in the Windows app.'
                : 'Detect recognized game windows and move Switchboard to the tray. Capture and audio keep running. Reopen from the tray at any time.'}
          checked={snapshot.settings.trayOnGameLaunch}
          onCheckedChange={(checked) => void updateSettings({ trayOnGameLaunch: checked })}
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
      </SettingSection>
      <SettingSection title="Performance">
        <SettingSwitch
          settingId="general.destroyRenderer"
          title="Release interface memory in tray"
          description={snapshot.settings.closeToTray || snapshot.settings.trayOnGameLaunch
            ? 'Close the interface process while Switchboard is in the tray. Capture, shortcuts, and devices keep running.'
            : 'Turn on Close to tray or Move to tray when a game starts to use this.'}
          checked={snapshot.settings.destroyRendererInTray}
          disabled={!snapshot.settings.closeToTray && !snapshot.settings.trayOnGameLaunch}
          onCheckedChange={(checked) => void updateSettings({ destroyRendererInTray: checked })}
        />
        <SettingSwitch
          settingId="general.softwareRendering"
          title="Low resource rendering"
          description="Use software rendering on the next launch to reduce background memory. Leave off for smoother high-resolution clip playback."
          checked={snapshot.settings.softwareRendering}
          onCheckedChange={(checked) => void updateSettings({ softwareRendering: checked })}
        />
      </SettingSection>
      <SettingSection title="Advanced">
        <SettingSwitch
          settingId="general.developerMode"
          title="Developer mode"
          description="Show advanced diagnostics and development tools."
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
    </>
  );
}

function AudioSettings({ snapshot, onReset }: CategoryProps) {
  const setPage = useSystemStore((state) => state.setPage);
  const setAudioEnabled = useSystemStore((state) => state.setAudioEnabled);
  const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
  const gameBus = snapshot.audio.buses.find((bus) => bus.id === 'game');
  const micBus = snapshot.audio.buses.find((bus) => bus.id === 'mic');
  const outputOptions = pickableAudioDevices(snapshot.audio.devices, 'output', snapshot.audio.excludedDeviceIds, gameBus?.deviceId)
    .map((device) => ({ value: device.id, label: `${device.name}${device.isDefault ? ' · Windows default' : ''}` }));
  const inputOptions = pickableAudioDevices(snapshot.audio.devices, 'input', snapshot.audio.excludedDeviceIds, micBus?.deviceId)
    .map((device) => ({ value: device.id, label: `${device.name}${device.isDefault ? ' · Windows default' : ''}` }));
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');

  return (
    <>
      <SettingsCategoryHeader title="Audio" description="Manage audio routing and default devices." onReset={onReset} />
      <SettingSection title="Audio drivers"><AudioDependencySetupPanel state={snapshot.audio.dependencies} /></SettingSection>
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
      <ApplicationRoutingSettings audio={snapshot.audio} />
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

const captureViews = [
  { id: 'recording', label: 'Recording' },
  { id: 'audio', label: 'Audio' },
  { id: 'automatic', label: 'Auto Capture' },
  { id: 'reactions', label: 'Reactions' },
] as const;
type CaptureView = typeof captureViews[number]['id'];

function captureViewForSetting(id: string): CaptureView {
  if (id.startsWith('capture.audioSync')) return 'audio';
  if (id.startsWith('reactionClipping.')) return 'reactions';
  if (id.startsWith('autocapture.')) return 'automatic';
  if (['capture.microphone', 'capture.systemAudio', 'capture.systemAudioMode', 'capture.chatAudio', 'capture.audioDevices'].includes(id)) return 'audio';
  return 'recording';
}

function CaptureSettings({ snapshot, onReset, targetSetting }: CategoryProps & { targetSetting?: string | null }) {
  const [selectedView, setSelectedView] = useState<CaptureView>('recording');
  const { unseenIds } = useNewSettings();
  const view = targetSetting ? captureViewForSetting(targetSetting) : selectedView;
  useEffect(() => {
    if (targetSetting) setSelectedView(captureViewForSetting(targetSetting));
  }, [targetSetting]);
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const setPage = useSystemStore((state) => state.setPage);
  const [enginePending, setEnginePending] = useState(false);
  const config = snapshot.capture.config;
  const capabilities = snapshot.capture.capabilities;
  const codecLabels = { auto: 'Automatic', h264: 'H.264', hevc: 'HEVC', av1: 'AV1' } as const;
  const codecOptions = [...new Set(['auto' as const, ...capabilities.codecs, config.codec])]
    .map((codec) => ({ value: codec, label: codecLabels[codec] }));
  const encoderOptions = getEncoderOptions(config.encoder, capabilities.encoders);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'capture');

  return (
    <div className="capture-settings">
      <SettingsCategoryHeader title="Capture" description="Choose what to record and when to save it." onReset={onReset} />
      <SettingSection title="Engine and shortcut">
        <SettingSwitch
          settingId="capture.engine"
          title="Capture engine"
          description={captureEngineDescription(config.enabled, engine?.state, engine?.message)}
          checked={config.enabled}
          disabled={enginePending || engine?.state === 'starting'}
          onCheckedChange={async (enabled) => {
            setEnginePending(true);
            try { await setCaptureConfig({ enabled }); }
            finally { setEnginePending(false); }
          }}
        />
        <SettingShortcut
          settingId="capture.shortcut"
          title="Save replay shortcut"
          value={config.hotkey}
          onValueChange={(hotkey) => void setCaptureConfig({ hotkey })}
        />
      </SettingSection>

      <div className="capture-settings__tabs" role="tablist" aria-label="Capture settings">
        {captureViews.map((item, index) => (
          <button key={item.id} type="button" role="tab" id={`capture-tab-${item.id}`}
            aria-selected={view === item.id} aria-controls={`capture-panel-${item.id}`}
            tabIndex={view === item.id ? 0 : -1}
            onClick={() => setSelectedView(item.id)}
            onKeyDown={(event) => {
              const next = event.key === 'ArrowRight' ? (index + 1) % captureViews.length
                : event.key === 'ArrowLeft' ? (index + captureViews.length - 1) % captureViews.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? captureViews.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              const nextView = captureViews[next];
              if (!nextView) return;
              setSelectedView(nextView.id);
              document.getElementById(`capture-tab-${nextView.id}`)?.focus();
            }}
          >
            {item.label}
            {unseenIds.some((id) => settingsEntry(id)?.category === 'capture' && captureViewForSetting(id) === item.id) ? (
              <span className="settings-new-dot" data-new-setting-dot><span className="sr-only">New settings</span></span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`capture-panel-${view}`} aria-labelledby={`capture-tab-${view}`} tabIndex={0}>
      {view === 'recording' ? <>


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
        <SettingSwitch
          settingId="capture.cursor"
          title="Capture cursor"
          description="Include the Windows pointer in saved footage."
          checked={config.includeCursor}
          onCheckedChange={(includeCursor) => void setCaptureConfig({ includeCursor })}
        />
      </SettingSection>

      </> : null}
      {view === 'audio' ? <>
      <SettingSection title="Recorded tracks">
        <SettingRow settingId="capture.systemAudioMode" title="Game track captures" description={config.source === 'display' ? 'Choose a game or window source to isolate its audio.' : 'Game-only audio excludes other applications. Requires Windows build 20348 or later.'}>
          <select id="capture-audio-mode" aria-label="Game track captures" className="setup-select" value={config.systemAudioMode} disabled={!config.includeSystemAudio}
            onChange={event => void setCaptureConfig({ systemAudioMode: event.target.value as 'system' | 'game' })}>
            <option value="system">All audio from output device</option>
            <option value="game" disabled={config.source === 'display'}>Selected game or window only</option>
          </select>
        </SettingRow>
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
            title="Record game track"
            description={config.systemAudioMode === 'game' ? 'Include only the selected game or window and its child processes.' : 'Include audio from the selected output device.'}
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

      </SettingSection>

      <SettingSection title="Replay audio devices">
        <CaptureAudioDeviceSettings snapshot={snapshot} />
      </SettingSection>
      <AudioSyncCalibrationSettings snapshot={snapshot} />

      </> : null}
      {view === 'automatic' || view === 'reactions' ? (
        <AutoCaptureSettings snapshot={snapshot} section={view === 'reactions' ? 'reactions' : 'automatic'} />
      ) : null}
      </div>
      <SettingSection title="Workspace">
        <SettingAction
          settingId="capture.workspace"
          title="Capture workspace"
          description="Replay configuration, the save action, and the clip library stay on the Capture page."
          label="Open Capture"
          onClick={() => setPage('capture')}
        />
      </SettingSection>
    </div>
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
  const gameAndChatSame = config.systemAudioMode !== 'game' && config.includeSystemAudio && config.includeChatAudio
    && Boolean(config.systemAudioDeviceId) && config.systemAudioDeviceId === config.chatAudioDeviceId;

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
            disabled={!systemAvailable || !config.includeSystemAudio || config.systemAudioMode === 'game'}
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
        {config.systemAudioMode === 'game' ? <p className="settings-capture-devices__note">Only the selected game's or window's process and its child processes feed the Game track. Microphone and Chat remain separate inputs.{config.includeChatAudio ? ' Chat can still include other desktop sounds depending on the chosen output.' : ''}</p> : null}
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
  const chooseReplayCacheDirectory = useSystemStore((state) => state.chooseReplayCacheDirectory);
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
          title="Saved clips"
          path={clipDirectory}
          onChange={() => void chooseClipDirectory()}
          onOpen={() => void openClipsDirectory()}
          className="clip-storage-location"
        />
        <SettingRow settingId="capture.replay-cache" title="Replay cache" description={`${storage.cacheAvailableBytes == null ? 'Capacity unavailable' : `${formatBytes(storage.cacheAvailableBytes)} free`} · Changing this location restarts the replay buffer. Existing clips stay where they are.`}>
          <div className="min-w-0 text-right"><p className="max-w-72 truncate text-xs text-muted-foreground" title={storage.cacheDirectory}>{storage.cacheDirectory}</p><Button size="sm" onClick={() => void chooseReplayCacheDirectory()}>Change cache folder</Button></div>
        </SettingRow>
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

function DiagnosticsSettings({ snapshot, targetSetting }: CategoryProps & { targetSetting?: string | null }) {
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
      <SettingsCategoryHeader title="Diagnostics" />
      <DiagnosticsWorkspace targetSetting={targetSetting}>
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
        <EngineSummary title="Audio" engine={audioEngine} />
        <EngineSummary title="Capture" engine={captureEngine} />
      </section>

      {snapshot.performance.warning ? (
        <div id="setting-diagnostics.performance-warning" data-setting-id="diagnostics.performance-warning" tabIndex={-1} className="diagnostics-warning" role="status">
          <AlertTriangle aria-hidden />
          <span><strong>Sustained budget warning</strong>{snapshot.performance.warning}</span>
        </div>
      ) : null}

      {captureRuntime.error && <div className="diagnostics-attention" role="status"><AlertTriangle aria-hidden className="size-4" /><div><strong>Capture needs attention</strong><p>{captureRuntime.error}</p></div></div>}
      <div id="diagnostic-pane-checks" data-diagnostic-pane="checks"><DiagnosticRunner snapshot={snapshot} expanded /></div>
      <div id="diagnostic-pane-resources" data-diagnostic-pane="resources">
      <ResourceDiagnostics snapshot={snapshot} showExport={false} />

      <section className="diagnostics-maintenance" aria-labelledby="diagnostics-maintenance-title">
        <div className="diagnostics-section__heading">
          <h3 id="diagnostics-maintenance-title">Local records</h3>
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

      </div>
      <div id="diagnostic-pane-pipelines" data-diagnostic-pane="pipelines">
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

      </div>
      <div id="diagnostic-pane-devices" data-diagnostic-pane="devices">
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
      </DiagnosticsWorkspace>
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

function UpdatesSettings({ snapshot }: { snapshot: SystemSnapshot }) {
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
      <SettingsCategoryHeader title="Updates" description="See whether a new version is ready and choose how Switchboard updates itself." />
      <SettingSection title="Status">
        <SettingRow
          settingId="about.updates"
          title="Switchboard updates"
          className="settings-update-status"
          controlClassName="settings-update-status__control"
          description={(
            <span role="status" aria-live="polite">
              <span className="settings-update-status__version">Version {snapshot.version}</span>
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
              variant={update.status === 'downloaded' ? 'primary' : 'secondary'}
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
      <SettingSection title="Preferences">
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
    </>
  );
}

function AboutSettings({ snapshot, onOpenCategory, onRestoreDefaults }: {
  snapshot: SystemSnapshot;
  onOpenCategory: (category: SettingsCategoryId) => void;
  onRestoreDefaults: () => void;
}) {
  const electronVersion = navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1];
  const platform = navigator.userAgent.includes('Windows') || navigator.platform.startsWith('Win') ? 'Windows' : navigator.platform;
  const developerMode = snapshot.settings.developerMode === true;

  return (
    <>
      <SettingsCategoryHeader title="Help & about" description="Troubleshoot capture problems and see version and runtime details." />
      <div className="settings-about-intro">
        <img src="./switchboard-mark.png" alt="" draggable={false} />
        <div>
          <h3>Switchboard {snapshot.version}</h3>
          <p>A compact Windows utility for hardware and game capture, with optional audio mixing and microphone processing.</p>
        </div>
      </div>
      {developerMode ? (
        <SettingSection title="Troubleshooting">
          <SettingAction
            settingId="general.runDiagnostics"
            title="Run diagnostics"
            description="Capture checks, pipelines, device identity, and resource history are together in Diagnostics."
            label="Open Diagnostics"
            onClick={() => onOpenCategory('diagnostics')}
          />
        </SettingSection>
      ) : (
        <DiagnosticRunner snapshot={snapshot} />
      )}
      <SettingSection title="Build">
        <SettingValue settingId="about.version" title="Version" description={snapshot.prototypeMode ? 'Development features are enabled.' : undefined} value={snapshot.version} />
        <SettingValue settingId="about.runtime" title="Runtime" description={platform} value={electronVersion ? `Electron ${electronVersion}` : 'Browser preview'} />
        <SettingValue settingId="about.isolation" title="Renderer isolation" description="Sandboxed renderer with a narrow, validated preload bridge." value="Enabled" tone="success" />
      </SettingSection>
      <SettingSection title="Reset">
        <SettingRow
          settingId="about.restoreDefaults"
          title="Restore all defaults"
          description="Reset every preference plus Audio and Capture configuration. Installed modules, device profiles, and saved clips stay."
        >
          <Button type="button" variant="danger" size="sm" className="settings-restore-all" onClick={onRestoreDefaults}>
            <RotateCcw aria-hidden />
            Restore defaults
          </Button>
        </SettingRow>
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
    : resetScopeLabels[scope];

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

const resetScopeLabels: Record<Exclude<SettingsResetScope, 'all'>, string> = {
  general: 'General settings, update preferences, and Developer mode',
  devices: 'Devices settings',
  audio: 'Audio settings',
  capture: 'Capture and Clips settings',
  games: 'Games settings',
  modules: 'Features settings',
  diagnostics: 'Diagnostics settings',
};

type CategoryProps = {
  snapshot: SystemSnapshot;
  onReset?: () => void;
};

function readInitialCategory(): SettingsCategoryId {
  if (readInitialSubview() === 'module-developer-tools') return 'modules';
  const stored = window.sessionStorage.getItem(settingsCategoryStorageKey);
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
  if (category === 'about' || category === 'setup' || category === 'updates') return null;
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
  if (state === 'error') return message ? `Capture failed: ${message}` : 'Capture failed. Use Retry on the Capture page, or check Diagnostics.';
  if (state === 'starting') return 'Starting the isolated Capture host and registering the save shortcut.';
  if (enabled) return 'Replay runs automatically while Capture is enabled and resumes on the next launch. Turning Capture off stops recording.';
  return 'Enable Capture to start Replay automatically and resume it on the next launch.';
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
