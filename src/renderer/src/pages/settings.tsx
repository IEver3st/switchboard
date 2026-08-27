import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, Download, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react';
import type {
  AppUpdateState,
  CaptureConfig,
  CaptureEncoderPreference,
  Device,
  SettingsResetScope,
  SystemSnapshot,
} from '../../../shared/contracts';
import { estimateClipSize, getEncodingPreset } from '../../../shared/capture-presets';
import { GameDetectionSettings } from '@/components/settings/game-detection';
import { ModuleManagement } from '@/components/settings/module-management';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import {
  isSettingsCategory,
  settingsCategories,
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
  SettingSwitch,
  SettingValue,
  SettingsCategoryHeader,
} from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { formatBytes, percent } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const categoryStorageKey = 'switchboard.settings.category';

export function SettingsPage({ snapshot, onClose }: { snapshot: SystemSnapshot; onClose: () => void }) {
  const [category, setCategory] = useState<SettingsCategoryId>(readInitialCategory);
  const [query, setQuery] = useState('');
  const [confirmation, setConfirmation] = useState<SettingsResetScope | null>(null);
  const [targetSetting, setTargetSetting] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resetSettings = useSystemStore((state) => state.resetSettings);
  const categoryDefinition = settingsCategories.find((candidate) => candidate.id === category);
  const resetScope = categoryResetScope(category);

  const changeCategory = useCallback((nextCategory: SettingsCategoryId) => {
    setCategory(nextCategory);
    window.sessionStorage.setItem(categoryStorageKey, nextCategory);
  }, []);

  const selectSearchResult = useCallback((result: SettingsSearchEntry) => {
    setTargetSetting(result.id);
    changeCategory(result.category);
  }, [changeCategory]);

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
  }, [category, targetSetting]);

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
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmation, onClose]);

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
          <strong>{categoryDefinition?.label ?? category}</strong>
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
          category={category}
          appUpdate={snapshot.appUpdate}
          query={query}
          searchInputRef={searchInputRef}
          onCategoryChange={changeCategory}
          onQueryChange={setQuery}
          onResultSelect={selectSearchResult}
          onBack={onClose}
        />
        <div className="settings-content-scroll" data-settings-content-scroll>
          <div key={category} className="settings-content">
            <SettingsCategory
              category={category}
              snapshot={snapshot}
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
  snapshot,
  onReset,
}: {
  category: SettingsCategoryId;
  snapshot: SystemSnapshot;
  onReset?: () => void;
}) {
  if (category === 'general') return <GeneralSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'devices') return <DevicesSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'audio') return <AudioSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'capture') return <CaptureSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'clips') return <ClipsSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'games') return <GameDetectionSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'modules') return <ModulesSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'diagnostics') return <DiagnosticsSettings snapshot={snapshot} onReset={onReset} />;
  return <AboutSettings snapshot={snapshot} />;
}

function GeneralSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);

  return (
    <>
      <SettingsCategoryHeader title="General" description="Choose how Switchboard starts, closes, and releases the interface." onReset={onReset} />
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

function DevicesSettings({ snapshot, onReset }: CategoryProps) {
  const setPage = useSystemStore((state) => state.setPage);
  const setDeviceAppearanceOverride = useSystemStore((state) => state.setDeviceAppearanceOverride);

  return (
    <>
      <SettingsCategoryHeader title="Devices" description="Review connected hardware identity and appearance fallbacks." onReset={onReset} />
      <SettingSection title="Hardware identity">
        {snapshot.devices.map((device, index) => {
          const hardwareResolved = device.variantResolution.confidence === 'hardware';
          const appearanceOverride = snapshot.settings.deviceAppearanceOverrides[device.id];
          return (
            <div key={device.id} className="settings-device-identity">
              <SettingRow
                settingId={index === 0 ? 'devices.connected' : `devices.${device.id}.identity`}
                title={device.displayName}
                description={deviceSummary(device)}
              >
                <span className="settings-row__value">{device.connected ? 'Connected' : 'Disconnected'}</span>
              </SettingRow>
              <SettingSelect
                settingId={index === 0 ? 'devices.appearanceFallback' : `devices.${device.id}.appearanceFallback`}
                title={`Appearance fallback · ${device.displayName}`}
                description={hardwareResolved
                  ? `Disabled because ${device.variantResolution.source} identified an exact hardware variant.`
                  : 'Used only when automatic hardware and module evidence cannot identify the cosmetic SKU. Stored against this stable device identity.'}
                value={hardwareResolved ? 'automatic' : (appearanceOverride?.variant ?? 'automatic')}
                options={[
                  { value: 'automatic', label: 'Automatic' },
                  { value: 'white', label: 'White' },
                  { value: 'black', label: 'Black' },
                ]}
                disabled={hardwareResolved}
                onValueChange={(value) => void setDeviceAppearanceOverride({
                  deviceId: device.id,
                  override: value === 'automatic'
                    ? null
                    : { variant: value, colorway: value === 'white' ? 'White' : 'Black' },
                })}
              />
            </div>
          );
        })}
        <SettingAction
          settingId="devices.workspace"
          title="Per-device controls"
          description="Hardware gain, DPI, polling rate, lighting, and button assignments remain on each device workbench."
          label="Open Devices"
          onClick={() => setPage('devices')}
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
      <SettingsCategoryHeader title="Audio" description="Set the Audio host lifecycle and default Windows endpoints." onReset={onReset} />
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
  const codecLabels = { h264: 'H.264', hevc: 'HEVC', av1: 'AV1' } as const;
  const codecOptions = [...new Set([...capabilities.codecs, config.codec])]
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
          description="Only codecs reported by the active capture host are available."
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
        <SettingSwitch
          settingId="capture.cursor"
          title="Capture cursor"
          description="Include the Windows pointer in saved footage."
          checked={config.includeCursor}
          onCheckedChange={(includeCursor) => void setCaptureConfig({ includeCursor })}
        />
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
      </section>

      <SettingSection title="Storage location">
        <SettingFolder
          settingId="capture.storage"
          title="Clip folder"
          path={clipDirectory}
          onChange={() => void chooseClipDirectory()}
          onOpen={() => void openClipsDirectory()}
          className="clip-storage-location"
        />
      </SettingSection>
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

function ModulesSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);

  return (
    <div className="settings-category--modules">
      <SettingsCategoryHeader title="Modules" description="Manage signed capability modules and their update behavior." onReset={onReset} />
      <SettingSection title="Maintenance">
        <SettingSwitch
          settingId="modules.automaticUpdates"
          title="Automatic module updates"
          description="Verify signatures, install safely, and keep one rollback copy. Application updates are not configured yet."
          checked={snapshot.settings.automaticModuleUpdates}
          onCheckedChange={(automaticModuleUpdates) => void updateSettings({ automaticModuleUpdates })}
        />
      </SettingSection>
      <ModuleManagement snapshot={snapshot} />
    </div>
  );
}

function DiagnosticsSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const audioEngine = snapshot.engines.find((engine) => engine.kind === 'audio');
  const captureEngine = snapshot.engines.find((engine) => engine.kind === 'capture');
  const capturePreset = getEncodingPreset(snapshot.capture.config);
  const captureRuntime = snapshot.capture.runtime;
  const noise = snapshot.audio.host?.noiseSuppression;

  return (
    <>
      <SettingsCategoryHeader title="Diagnostics" description="Inspect local health, retention, and the active resource budget." onReset={onReset} />
      <SettingSection title="Collection">
        <SettingValue
          settingId="diagnostics.telemetry"
          title="Telemetry"
          description="Remote telemetry is hard-disabled in the current schema. Diagnostics stay local."
          value="Off"
        />
        <SettingSelect
          settingId="diagnostics.retention"
          title="Local retention"
          description="Retain engine crashes, process samples, and module load failures for local troubleshooting."
          value={String(snapshot.settings.diagnosticsRetentionDays)}
          options={[1, 3, 7, 14, 30].map((days) => ({ value: String(days), label: days === 1 ? '1 day' : `${days} days` }))}
          onValueChange={(days) => void updateSettings({ diagnosticsRetentionDays: Number(days) })}
        />
        <SettingSwitch
          settingId="diagnostics.guard"
          title="Performance guard"
          description="Warn when sustained resource use crosses the memory or idle CPU budget."
          checked={snapshot.settings.performanceGuard}
          onCheckedChange={(performanceGuard) => void updateSettings({ performanceGuard })}
        />
      </SettingSection>
      <SettingSection title="Latest snapshot">
        <SettingRow
          settingId="diagnostics.memory"
          title="Process usage"
          description={`Core ${snapshot.performance.coreMemoryMb} MB · Renderer ${snapshot.performance.rendererMemoryMb} MB · ${snapshot.performance.activeProcesses} active processes`}
        >
          <span className="settings-row__value">
            {snapshot.performance.totalMemoryMb} MB · {snapshot.performance.totalCpuPercent.toFixed(1)}% CPU
          </span>
        </SettingRow>
        <SettingRow
          settingId="diagnostics.engines"
          title="Engine status"
          description="Status updates are event-driven and sampled by the control plane; this page adds no high-frequency timer."
        >
          <span className="settings-engine-readout">
            <span><i className={cn('settings-status-dot', statusDotClass(audioEngine?.state))} />Audio {engineStateLabel(audioEngine?.state)}</span>
            <span><i className={cn('settings-status-dot', statusDotClass(captureEngine?.state))} />Capture {engineStateLabel(captureEngine?.state)}</span>
          </span>
        </SettingRow>
        <SettingRow
          settingId="diagnostics.capture-path"
          title="Capture pipeline"
          description={`${captureRuntime.backendLabel} · ${captureRuntime.encoderLabel} · ${snapshot.capture.config.codec.toUpperCase()} · ${snapshot.capture.config.resolution} at ${snapshot.capture.config.fps} FPS`}
        >
          <span className="settings-row__value">{formatBytes(capturePreset.targetVideoBitrateBps / 8)}/s target</span>
        </SettingRow>
        <SettingRow
          settingId="diagnostics.noise-suppression"
          title="Microphone noise removal"
          description={noise
            ? `${noise.backend} · ${noise.modelIdentifier ?? 'no model'} · ${noise.frameLength} samples at ${noise.processingSampleRate.toLocaleString()} Hz · ${noise.attenuationLimitDb.toFixed(1)} dB limit`
            : 'Start the audio engine to inspect the microphone noise-removal backend.'}
        >
          <span className="settings-row__value">
            {noise ? `${noise.state} · p99 ${noise.p99Ms.toFixed(2)} ms` : 'Not loaded'}
          </span>
        </SettingRow>
        <SettingRow
          settingId="diagnostics.microphone-realtime"
          title="Microphone realtime health"
          description={noise
            ? `${noise.captureOverruns.toLocaleString()} capture overruns · ${noise.monitorOverruns.toLocaleString()}/${noise.monitorUnderruns.toLocaleString()} monitor over/underruns · ${noise.droppedOrBypassedFrames.toLocaleString()} dropped or bypassed frames · callback p99 ${noise.captureCallbackP99Ms.toFixed(2)} ms`
            : 'Frame timing, callback timing, and overload counters are reported by Audio.Host.'}
        >
          <span className="settings-row__value">
            {noise?.lastError ?? (noise ? `${noise.algorithmicLatencyMs.toFixed(1)} ms algorithmic` : 'No data')}
          </span>
        </SettingRow>
        <SettingRow
          settingId="diagnostics.capture-health"
          title="Replay health"
          description={`${captureRuntime.encodedFrames.toLocaleString()} encoded · ${captureRuntime.droppedFrames.toLocaleString()} dropped · ${captureRuntime.audioSyncCorrections.toLocaleString()} audio corrections`}
        >
          <span className="settings-row__value">
            {formatBytes(captureRuntime.replayCacheBytes)} cache
            {captureRuntime.observedBitrateBps > 0 ? ` · ${formatBytes(captureRuntime.observedBitrateBps / 8)}/s observed` : ''}
          </span>
        </SettingRow>
      </SettingSection>
      <SettingSection title="Device identity">
        {snapshot.devices.map((device, index) => (
          <DeviceIdentityRecord
            key={device.id}
            settingId={index === 0 ? 'diagnostics.deviceIdentity' : `diagnostics.${device.id}.identity`}
            device={device}
          />
        ))}
      </SettingSection>
    </>
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
  const headset = device.capabilities.headset;
  const headsetDiagnostics = headset?.diagnostics;
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
    ['Sony transport', headset ? `${headset.transportState} · ${headsetDiagnostics?.protocol ?? 'unknown protocol'}` : undefined],
    ['Sony last sync', headsetDiagnostics?.lastSyncAt ?? undefined],
    ['Sony transport health', headsetDiagnostics ? `${headsetDiagnostics.commandFailureCount} command failures · ${headsetDiagnostics.malformedFrameCount} malformed frames · ${headsetDiagnostics.reconnectCount} reconnects` : undefined],
    ['Sony last error', headsetDiagnostics?.lastErrorCode ?? undefined],
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
          <p>A compact Windows utility for hardware, audio routing, and game capture.</p>
        </div>
      </div>
      <SettingSection title="Updates">
        <SettingRow
          settingId="about.updates"
          title="Switchboard updates"
          description={<span role="status" aria-live="polite">{appUpdateDescription(update, automaticDownloads, snapshot.prototypeMode)}</span>}
        >
          {update.capability === 'available' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn('settings-update-action', update.status === 'downloaded' && 'settings-update-action--ready')}
              data-app-update-action={update.status}
              disabled={updateBusy}
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
          description="Check shortly after launch and every six hours while Switchboard is running. Manual checks remain available when this is off."
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

function appUpdateDescription(update: AppUpdateState, automaticDownloads: boolean, prototypeMode: boolean): string {
  if (update.status === 'unavailable') return update.unavailableReason ?? 'Application updates are unavailable in this build.';
  if (update.status === 'checking') return 'Checking the Switchboard release feed.';
  if (update.status === 'available' && prototypeMode) return `Development preview: version ${update.availableVersion ?? 'new'} is available.`;
  if (update.status === 'available') return automaticDownloads
    ? `Version ${update.availableVersion ?? 'new'} is available. The download will start automatically.`
    : `Version ${update.availableVersion ?? 'new'} is available. Download it when convenient.`;
  if (update.status === 'downloading') return `Downloading version ${update.availableVersion ?? 'new'} in the background.`;
  if (update.status === 'downloaded') return `Version ${update.availableVersion ?? 'new'} is downloaded and ready. Restart when convenient to install it.`;
  if (update.status === 'installing') return 'Closing Switchboard and starting the verified installer.';
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
  const stored = window.sessionStorage.getItem(categoryStorageKey);
  return isSettingsCategory(stored) ? stored : 'general';
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
