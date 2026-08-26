import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type {
  CaptureConfig,
  CaptureEncoderPreference,
  Device,
  SettingsResetScope,
  SystemSnapshot,
} from '../../../shared/contracts';
import { estimateClipSize } from '../../../shared/capture-presets';
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
  SettingSlider,
  SettingSwitch,
  SettingValue,
  SettingsCategoryHeader,
} from '@/components/settings/settings-primitives';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatBytes, percent } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const categoryStorageKey = 'switchboard.settings.category';

export function SettingsPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const [category, setCategory] = useState<SettingsCategoryId>(readInitialCategory);
  const [query, setQuery] = useState('');
  const [confirmation, setConfirmation] = useState<SettingsResetScope | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const targetSettingRef = useRef<string | null>(null);
  const resetSettings = useSystemStore((state) => state.resetSettings);
  const actionPending = useSystemStore((state) => state.actionPending);
  const categoryDefinition = settingsCategories.find((candidate) => candidate.id === category);

  const changeCategory = useCallback((nextCategory: SettingsCategoryId) => {
    setCategory(nextCategory);
    window.sessionStorage.setItem(categoryStorageKey, nextCategory);
  }, []);

  const selectSearchResult = useCallback((result: SettingsSearchEntry) => {
    targetSettingRef.current = result.id;
    changeCategory(result.category);
  }, [changeCategory]);

  useEffect(() => {
    const targetSetting = targetSettingRef.current;
    if (!targetSetting) return;
    targetSettingRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(`setting-${targetSetting}`);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: reducedMotionEnabled() ? 'auto' : 'smooth' });
      element.focus({ preventScroll: true });
      element.classList.add('settings-row--highlighted');
      window.setTimeout(() => element.classList.remove('settings-row--highlighted'), 1400);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [category]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (event.key === 'Escape' && confirmation) setConfirmation(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmation]);

  const confirmReset = () => {
    if (!confirmation) return;
    void resetSettings(confirmation).then(() => setConfirmation(null));
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-breadcrumb" aria-label="Breadcrumb">
          <span>Settings</span>
          <span aria-hidden>/</span>
          <strong>{categoryDefinition?.label ?? category}</strong>
        </div>
        <button type="button" className="settings-restore" onClick={() => setConfirmation('all')}>
          <RotateCcw className="size-3" aria-hidden />
          Restore defaults
        </button>
        {confirmation ? (
          <ResetConfirmation
            scope={confirmation}
            pending={actionPending === 'settings:reset'}
            onCancel={() => setConfirmation(null)}
            onConfirm={confirmReset}
          />
        ) : null}
      </header>

      <div className="settings-shell">
        <SettingsSidebar
          category={category}
          query={query}
          searchInputRef={searchInputRef}
          onCategoryChange={changeCategory}
          onQueryChange={setQuery}
          onResultSelect={selectSearchResult}
        />
        <div className="settings-content-scroll" data-settings-content-scroll>
          <div key={category} className="settings-content">
            <SettingsCategory
              category={category}
              snapshot={snapshot}
              onReset={categoryDefinition?.resettable ? () => setConfirmation(category as SettingsResetScope) : undefined}
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
  if (category === 'audio') return <AudioSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'capture') return <CaptureSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'modules') return <ModulesSettings snapshot={snapshot} onReset={onReset} />;
  if (category === 'diagnostics') return <DiagnosticsSettings snapshot={snapshot} onReset={onReset} />;
  return <AboutSettings snapshot={snapshot} />;
}

function GeneralSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const pending = useSystemStore((state) => state.actionPending) === 'settings:update';

  return (
    <>
      <SettingsCategoryHeader title="General" onReset={onReset} />
      <SettingSection title="Startup and window">
        <SettingSwitch
          settingId="general.startup"
          title="Start Switchboard with Windows"
          description="Launch the control plane automatically when you sign in. Optional engines keep their own saved state."
          checked={snapshot.settings.launchAtStartup}
          disabled={pending}
          onCheckedChange={(checked) => void updateSettings({ launchAtStartup: checked })}
        />
        <SettingSwitch
          settingId="general.closeToTray"
          title="Close to tray"
          description="Keep global shortcuts, connected-device profiles, and active engines available after closing the window."
          checked={snapshot.settings.closeToTray}
          disabled={pending}
          onCheckedChange={(checked) => void updateSettings({ closeToTray: checked })}
        />
        <SettingSwitch
          settingId="general.destroyRenderer"
          title="Release interface memory in tray"
          description="Destroy the Chromium renderer in tray mode. The control plane and enabled hosts remain independent."
          checked={snapshot.settings.destroyRendererInTray}
          disabled={pending || !snapshot.settings.closeToTray}
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
  const actionPending = useSystemStore((state) => state.actionPending);
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
      <SettingsCategoryHeader title="Audio" onReset={onReset} />
      <SettingSection title="Engine">
        <SettingSwitch
          settingId="audio.engine"
          title="Audio engine"
          description={snapshot.audio.enabled
            ? 'The isolated Audio host is enabled and will be restored on the next launch. Stopping it releases its process and endpoints.'
            : 'Start the isolated Audio host now and restore it on the next launch.'}
          checked={snapshot.audio.enabled}
          disabled={actionPending === 'audio:enabled'}
          onCheckedChange={(checked) => void setAudioEnabled(checked)}
        />
        <SettingValue
          settingId="audio.sampleRate"
          title="Processing format"
          description="The current Audio graph has one fixed allocation-free processing format."
          value={`${snapshot.audio.sampleRate / 1000} kHz · float32`}
        />
      </SettingSection>
      <SettingSection title="Default endpoints">
        {gameBus ? (
          <SettingSelect
            settingId="audio.output"
            title="Default output"
            description="Choose the Windows output assigned to the Game bus. The change applies immediately when the host is running."
            value={gameBus.deviceId}
            options={outputOptions}
            disabled={actionPending === 'audio:game:device' || outputOptions.length === 0}
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
            disabled={actionPending === 'audio:mic:device' || inputOptions.length === 0}
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
  const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
  const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
  const setPage = useSystemStore((state) => state.setPage);
  const actionPending = useSystemStore((state) => state.actionPending);
  const config = snapshot.capture.config;
  const capabilities = snapshot.capture.capabilities;
  const configPending = actionPending === 'capture:config';
  const folderPending = actionPending === 'capture:directory';
  const clipDirectory = config.clipsDirectory || snapshot.capture.storage.clipsDirectory || 'Windows Videos\\Switchboard Clips';
  const sizeEstimate = estimateClipSize(config, snapshot.capture.runtime.observedBitrateBps);
  const fpsOptions = ([30, 60, 120] as const)
    .filter((fps) => fps <= capabilities.maximumFps || fps === config.fps)
    .map((fps) => ({ value: String(fps), label: `${fps} FPS` }));
  const codecLabels = { h264: 'H.264', hevc: 'HEVC', av1: 'AV1' } as const;
  const codecOptions = [...new Set([...capabilities.codecs, config.codec])]
    .map((codec) => ({ value: codec, label: codecLabels[codec] }));
  const encoderOptions = getEncoderOptions(config.encoder, capabilities.encoders);

  return (
    <>
      <SettingsCategoryHeader title="Capture" onReset={onReset} />
      <SettingSection title="Clips">
        <SettingFolder
          settingId="capture.storage"
          title="Clip storage location"
          path={clipDirectory}
          disabled={folderPending}
          onChange={() => void chooseClipDirectory()}
          onOpen={() => void openClipsDirectory()}
        />
        <SettingSelect
          settingId="capture.duration"
          title="Default replay length"
          description="Set how much recent footage is retained for the next saved clip. The host keeps a bounded rotating segment ring."
          value={String(config.replaySeconds)}
          options={[15, 30, 45, 60, 90, 120, 180, 300].map((seconds) => ({ value: String(seconds), label: `${seconds} sec` }))}
          disabled={configPending}
          onValueChange={(value) => void setCaptureConfig({ replaySeconds: Number(value) })}
        />
        <SettingShortcut
          settingId="capture.shortcut"
          title="Save replay shortcut"
          value={config.hotkey}
          disabled={configPending}
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
          disabled={configPending}
          onValueChange={(source) => void setCaptureConfig({ source: source as CaptureConfig['source'], sourceId: null })}
        />
        <SettingSelect
          settingId="capture.resolution"
          title="Resolution"
          description="Set the output size for new replay segments. Native follows the selected source."
          value={config.resolution}
          options={[
            { value: '720p', label: '720p' },
            { value: '1080p', label: '1080p' },
            { value: '1440p', label: '1440p' },
            { value: '2160p', label: '2160p' },
            { value: 'native', label: 'Native' },
          ]}
          disabled={configPending}
          onValueChange={(resolution) => void setCaptureConfig({ resolution: resolution as CaptureConfig['resolution'] })}
        />
        <SettingSelect
          settingId="capture.frameRate"
          title="Frame rate"
          description={`The active host reports a maximum of ${capabilities.maximumFps} FPS.`}
          value={String(config.fps)}
          options={fpsOptions}
          disabled={configPending}
          onValueChange={(fps) => void setCaptureConfig({ fps: Number(fps) as CaptureConfig['fps'] })}
        />
        <SettingSlider
          settingId="capture.quality"
          title="Capture quality"
          description={`Balance bitrate against clip size. Current estimate: ${formatBytes(sizeEstimate.estimatedBytes)} for ${config.replaySeconds} seconds.`}
          value={config.quality}
          min={1}
          max={5}
          step={1}
          disabled={configPending}
          formatValue={(quality) => `${quality} / 5`}
          onValueCommit={(quality) => void setCaptureConfig({ quality })}
        />
        <SettingSelect
          settingId="capture.encoder"
          title="Preferred encoder"
          description={capabilities.encoders.length > 0
            ? 'Automatic chooses the first compatible hardware encoder. A preference is used only when the host reports it.'
            : 'No hardware encoder has been reported yet. Automatic remains the only supported preference.'}
          value={config.encoder}
          options={encoderOptions}
          disabled={configPending}
          onValueChange={(encoder) => void setCaptureConfig({ encoder: encoder as CaptureConfig['encoder'] })}
        />
        <SettingSelect
          settingId="capture.codec"
          title="Video codec"
          description="Only codecs reported by the active capture host are available."
          value={config.codec}
          options={codecOptions}
          disabled={configPending || codecOptions.length <= 1}
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
            disabled={configPending}
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
            disabled={configPending}
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
          disabled={configPending}
          onCheckedChange={(includeCursor) => void setCaptureConfig({ includeCursor })}
        />
        <SettingAction
          settingId="capture.workspace"
          title="Instant Replay workspace"
          description="Replay state, buffer readiness, saving, and the clip library stay on the Capture page."
          label="Open Capture"
          onClick={() => setPage('capture')}
        />
      </SettingSection>
    </>
  );
}

function ModulesSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const setPage = useSystemStore((state) => state.setPage);
  const pending = useSystemStore((state) => state.actionPending) === 'settings:update';
  const installed = snapshot.modules.filter((module) => module.installed);
  const enabled = installed.filter((module) => module.enabled);

  return (
    <>
      <SettingsCategoryHeader title="Modules" onReset={onReset} />
      <SettingSection title="Maintenance">
        <SettingSwitch
          settingId="modules.automaticUpdates"
          title="Automatic module updates"
          description="Verify signatures, install atomically, and retain one rollback copy. Application updates are not configured in this prototype."
          checked={snapshot.settings.automaticModuleUpdates}
          disabled={pending}
          onCheckedChange={(automaticModuleUpdates) => void updateSettings({ automaticModuleUpdates })}
        />
        <SettingAction
          settingId="modules.installed"
          title="Installed modules"
          description={`${installed.length} installed · ${enabled.length} enabled. Discovery, installation, removal, and per-module state remain in the Modules workspace.`}
          label="Open Modules"
          onClick={() => setPage('modules')}
        />
      </SettingSection>
    </>
  );
}

function DiagnosticsSettings({ snapshot, onReset }: CategoryProps) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const setDeviceAppearanceOverride = useSystemStore((state) => state.setDeviceAppearanceOverride);
  const actionPending = useSystemStore((state) => state.actionPending);
  const pending = useSystemStore((state) => state.actionPending) === 'settings:update';
  const audioEngine = snapshot.engines.find((engine) => engine.kind === 'audio');
  const captureEngine = snapshot.engines.find((engine) => engine.kind === 'capture');

  return (
    <>
      <SettingsCategoryHeader title="Diagnostics" onReset={onReset} />
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
          disabled={pending}
          onValueChange={(days) => void updateSettings({ diagnosticsRetentionDays: Number(days) })}
        />
        <SettingSwitch
          settingId="diagnostics.guard"
          title="Performance guard"
          description="Warn when sustained runtime usage crosses the prototype memory or idle CPU budget."
          checked={snapshot.settings.performanceGuard}
          disabled={pending}
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
      </SettingSection>
      <SettingSection title="Device identity">
        {snapshot.devices.map((device) => {
          const hardwareResolved = device.variantResolution.confidence === 'hardware';
          const appearanceOverride = snapshot.settings.deviceAppearanceOverrides[device.id];
          return (
            <div key={device.id} className="settings-device-identity">
              <SettingRow
                settingId={`diagnostics.device.${device.id}.identity`}
                title={device.displayName}
                description={<DeviceIdentityDetails device={device} />}
              >
                <span className="settings-row__value">{device.connected ? 'Connected' : 'Disconnected'}</span>
              </SettingRow>
              <SettingSelect
                settingId={`diagnostics.device.${device.id}.appearance`}
                title="Appearance fallback"
                description={hardwareResolved
                  ? `Disabled because ${device.variantResolution.source} identified an exact hardware variant.`
                  : 'Used only when automatic hardware and module evidence cannot identify the cosmetic SKU. Stored against this stable device identity.'}
                value={hardwareResolved ? 'automatic' : (appearanceOverride?.variant ?? 'automatic')}
                options={[
                  { value: 'automatic', label: 'Automatic' },
                  { value: 'white', label: 'White' },
                  { value: 'black', label: 'Black' },
                ]}
                disabled={hardwareResolved || actionPending === `device:${device.id}:appearance`}
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
      </SettingSection>
    </>
  );
}

function DeviceIdentityDetails({ device }: { device: Device }) {
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
  ].filter((field): field is [string, string] => Boolean(field[1]));

  return (
    <span className="settings-device-identity__fields">
      {fields.map(([label, value]) => <span key={label}><strong>{label}</strong>{value}</span>)}
    </span>
  );
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

  return (
    <>
      <SettingsCategoryHeader title="About" />
      <div className="settings-about-intro">
        <img src="./switchboard-icon.png" alt="" draggable={false} />
        <div>
          <h3>Switchboard</h3>
          <p>A compact Windows utility for hardware, audio routing, and game capture.</p>
        </div>
      </div>
      <SettingSection title="Build">
        <SettingValue settingId="about.version" title="Version" description={snapshot.prototypeMode ? 'Prototype mode is enabled.' : undefined} value={snapshot.version} />
        <SettingValue settingId="about.runtime" title="Runtime" description={platform} value={electronVersion ? `Electron ${electronVersion}` : 'Browser preview'} />
        <SettingValue settingId="about.isolation" title="Renderer isolation" description="Sandboxed renderer with a narrow, validated preload bridge." value="Enabled" tone="success" />
      </SettingSection>
    </>
  );
}

function ResetConfirmation({
  scope,
  pending,
  onCancel,
  onConfirm,
}: {
  scope: SettingsResetScope;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const label = scope === 'all'
    ? 'all Settings preferences plus Audio and Capture configuration'
    : `${scope[0]?.toLocaleUpperCase()}${scope.slice(1)} settings`;

  useEffect(() => confirmRef.current?.focus(), []);

  return (
    <div className="settings-reset-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="reset-settings-title" aria-describedby="reset-settings-description">
      <AlertTriangle className="settings-reset-confirmation__icon" aria-hidden />
      <div>
        <h2 id="reset-settings-title">Restore defaults?</h2>
        <p id="reset-settings-description">This resets {label}. Installed modules, device profiles, and saved clips are not removed.</p>
      </div>
      <div className="settings-reset-confirmation__actions">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button ref={confirmRef} type="button" variant="danger" size="sm" disabled={pending} onClick={onConfirm}>
          {pending ? 'Resetting…' : 'Restore'}
        </Button>
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
