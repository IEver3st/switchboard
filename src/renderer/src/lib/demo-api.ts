import type {
  DetectedGame,
  SetDeviceAppearanceOverrideInput,
  SetDeviceControlInput,
  SetDeviceSettingInput,
  SetCaptureConfigInput,
  SetModuleStateInput,
  SettingsResetScope,
  SwitchboardApi,
  SystemSnapshot,
  UpdateSettingsInput,
} from '../../../shared/contracts';
import { autoCaptureSettingsSchema } from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import { createDefaultSnapshot } from '../../../shared/defaults';
import { applyClipTrackLevel } from '../../../shared/clip-track-levels';

let snapshot = createDefaultSnapshot();
snapshot.gameDetection.capability = 'simulation';
const listeners = new Set<(value: SystemSnapshot) => void>();
let engineTimer: number | undefined;

function emit(): SystemSnapshot {
  const value = structuredClone(snapshot);
  for (const listener of listeners) listener(value);
  return value;
}

function recalculate(): void {
  const running = snapshot.engines.filter((engine) => engine.state === 'running');
  const engineMemory = running.reduce((sum, engine) => sum + engine.memoryMb, 0);
  snapshot.performance = {
    ...snapshot.performance,
    totalMemoryMb: 136 + engineMemory,
    totalCpuPercent: 0.3 + running.reduce((sum, engine) => sum + engine.cpuPercent, 0),
    activeProcesses: 2 + running.length,
  };
}

function ensureTimer(): void {
  if (engineTimer !== undefined) return;
  engineTimer = window.setInterval(() => {
    let changed = false;
    for (const engine of snapshot.engines) {
      if (engine.state !== 'running') continue;
      engine.uptimeSeconds += 1;
      engine.cpuPercent = 0.8;
      engine.memoryMb = 31;
      changed = true;
    }
    if (changed) {
      recalculate();
      emit();
    }
  }, 1000);
}

function setEngine(kind: 'capture', enabled: boolean): void {
  const engine = snapshot.engines.find((candidate) => candidate.kind === kind);
  if (!engine) return;
  engine.state = enabled ? 'running' : 'stopped';
  engine.pid = enabled ? 18496 : undefined;
  engine.cpuPercent = enabled ? 0.8 : 0;
  engine.memoryMb = enabled ? 31 : 0;
  engine.uptimeSeconds = 0;
  engine.message = enabled ? 'Browser preview simulation active' : undefined;
  if (!enabled) {
    snapshot.capture.runtime.bufferedSeconds = 0;
    snapshot.capture.runtime.segmentCount = 0;
    snapshot.capture.runtime.replayCacheBytes = 0;
  }
  recalculate();
  ensureTimer();
}

async function simulateGameScan(): Promise<SystemSnapshot> {
  snapshot.gameDetection.scanState = 'scanning';
  snapshot.gameDetection.error = undefined;
  emit();
  await new Promise<void>((resolveScan) => window.setTimeout(resolveScan, 420));
  const addedAt = new Date().toISOString();
  const games: DetectedGame[] = [
    {
      id: 'game-preview-baldurs-gate-3',
      name: "Baldur's Gate 3",
      source: 'steam',
      installDirectory: 'C:\\Games\\Steam\\Baldurs Gate 3',
      executablePath: null,
      launchUri: 'steam://rungameid/1086940',
      addedAt,
    },
    {
      id: 'game-preview-cyberpunk-2077',
      name: 'Cyberpunk 2077',
      source: 'epic',
      installDirectory: 'C:\\Games\\Epic\\Cyberpunk 2077',
      executablePath: 'C:\\Games\\Epic\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
      launchUri: null,
      addedAt,
    },
    {
      id: 'game-preview-hades-2',
      name: 'Hades II',
      source: 'steam',
      installDirectory: 'C:\\Games\\Steam\\Hades II',
      executablePath: null,
      launchUri: 'steam://rungameid/1145350',
      addedAt,
    },
  ];
  const manualGames = snapshot.gameDetection.games.filter((game) => game.source === 'manual');
  snapshot.gameDetection.games = [...games, ...manualGames]
    .sort((left, right) => left.name.localeCompare(right.name));
  snapshot.gameDetection.scanState = 'idle';
  snapshot.gameDetection.lastScanAt = new Date().toISOString();
  return emit();
}

const demoApi: SwitchboardApi = {
  async saveScene() { throw new Error('Scene changes are available in the desktop app.'); },
  async deleteScene() { throw new Error('Scene changes are available in the desktop app.'); },
  async applyScene() { throw new Error('Scenes require the desktop app.'); },
  async restoreScene() { throw new Error('Scenes require the desktop app.'); },
  async setSetupPreferences() { throw new Error('Setup preferences require the desktop app.'); },
  async openQuickControls() { throw new Error('Quick controls require the desktop app.'); },
  async closeQuickControls() {},
  async getVerticalGuideLayout() { throw new Error('Desktop framing requires the desktop app.'); },
  async setShortcutRecording() {},
  setUiScale() {},
  async getSnapshot() {
    ensureTimer();
    return structuredClone(snapshot);
  },
  async setModuleState(input: SetModuleStateInput) {
    const module = snapshot.modules.find((candidate) => candidate.id === input.moduleId);
    if (module) {
      module.installed = module.installed || input.enabled;
      module.enabled = input.enabled;
      if (module.kind === 'capture') {
        snapshot.capture.config.enabled = input.enabled;
        setEngine('capture', input.enabled);
      }
    }
    return emit();
  },
  async createModuleProject() {
    throw new Error('Creating a module project requires the Switchboard desktop application.');
  },
  async inspectCommunityModule() { throw new Error('GitHub modules require the Switchboard desktop application.'); },
  async installCommunityModule() { throw new Error('GitHub modules require the Switchboard desktop application.'); },
  async manageCommunityModule() { throw new Error('GitHub modules require the Switchboard desktop application.'); },
  async linkModuleProject() {
    throw new Error('Linking a module project requires the Switchboard desktop application.');
  },
  async validateModuleProject(input) {
    const module = snapshot.modules.find((candidate) => candidate.id === input.moduleId && candidate.source === 'local');
    if (module?.development) {
      module.development.status = 'ready';
      module.development.lastValidatedAt = new Date().toISOString();
      module.development.issues = [];
    }
    return emit();
  },
  async revealModuleProject() {
    throw new Error('Opening a module project requires the Switchboard desktop application.');
  },
  async unlinkModuleProject(input) {
    snapshot.modules = snapshot.modules.filter((candidate) => candidate.id !== input.moduleId || candidate.source !== 'local');
    return emit();
  },
  async setDeviceControl(input: SetDeviceControlInput) {
    const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device) return emit();
    const { change } = input;
    if (change.type === 'dpi' && device.capabilities.dpi) device.capabilities.dpi.activeDpi = change.value;
    if (change.type === 'dpi-stages' && device.capabilities.dpi) device.capabilities.dpi.stages = change.stages;
    if (change.type === 'dpi-shift' && device.capabilities.dpi) device.capabilities.dpi.shiftDpi = change.value;
    if (change.type === 'report-rate' && device.capabilities.reportRate) device.capabilities.reportRate.value = change.value;
    if (change.type === 'button-assignment' && device.capabilities.buttonAssignments) {
      const binding = device.capabilities.buttonAssignments.bindings.find((candidate) => candidate.buttonId === change.buttonId);
      if (binding) binding.currentActionId = change.actionId;
    }
    if (change.type === 'onboard-memory' && device.capabilities.onboardMemory) {
      device.capabilities.onboardMemory.enabled = change.enabled;
      const mode = change.enabled ? 'onboard' : 'software';
      const reason = change.enabled ? 'Stored onboard profiles are active. Turn off onboard memory to edit the software profile.' : undefined;
      if (device.capabilities.dpi) Object.assign(device.capabilities.dpi, { profileMode: mode, writable: !change.enabled, unavailableReason: reason });
      if (device.capabilities.reportRate) Object.assign(device.capabilities.reportRate, { profileMode: mode, writable: !change.enabled, unavailableReason: reason });
      if (device.capabilities.buttonAssignments) Object.assign(device.capabilities.buttonAssignments, { profileMode: mode, writable: !change.enabled, unavailableReason: reason });
      if (device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
        profileMode: mode,
        writable: !change.enabled,
        colorWritable: !change.enabled,
        brightnessWritable: !change.enabled,
        speedWritable: !change.enabled,
        unavailableReason: reason,
      });
    }
    if (change.type === 'lighting-enabled' && device.capabilities.lighting) device.capabilities.lighting.enabled = change.enabled;
    if (change.type === 'lighting-color' && device.capabilities.lighting) {
      device.capabilities.lighting.color = change.color;
      device.capabilities.lighting.enabled = true;
    }
    if (change.type === 'lighting-brightness' && device.capabilities.lighting) Object.assign(device.capabilities.lighting, { brightness: change.brightness, activeProfileId: 'custom' });
    if (change.type === 'lighting-effect' && device.capabilities.lighting) Object.assign(device.capabilities.lighting, { activeEffectId: change.effectId, activeProfileId: 'custom' });
    if (change.type === 'lighting-speed' && device.capabilities.lighting) Object.assign(device.capabilities.lighting, { speed: change.speed, activeProfileId: 'custom' });
    if (change.type === 'lighting-direction' && device.capabilities.lighting) {
      Object.assign(device.capabilities.lighting, { direction: change.direction, activeProfileId: 'custom' });
    }
    if (change.type === 'lighting-zone-color' && device.capabilities.lighting) {
      const zone = device.capabilities.lighting.zones?.find((candidate) => candidate.id === change.zoneId);
      if (zone) Object.assign(zone, { color: change.color });
      Object.assign(device.capabilities.lighting, { activeEffectId: 'static', activeProfileId: 'custom' });
    }
    if (change.type === 'lighting-profile' && device.capabilities.lighting) {
      const profile = device.capabilities.lighting.profiles.find((candidate) => candidate.id === change.profileId);
      if (profile) Object.assign(device.capabilities.lighting, {
        activeProfileId: profile.id,
        activeEffectId: profile.effectId,
        brightness: profile.brightness,
        speed: profile.speed,
      });
    }
    if (change.type === 'keyboard-gaming-mode' && device.capabilities.keyboard?.gamingMode) {
      device.capabilities.keyboard.gamingMode.enabled = change.enabled;
    }
    if (change.type === 'keyboard-onboard-profile' && device.capabilities.keyboard?.onboardProfiles) {
      const profile = device.capabilities.keyboard.onboardProfiles.profiles.find((candidate) => candidate.id === change.profileId);
      if (profile) device.capabilities.keyboard.onboardProfiles.activeProfileId = profile.id;
    }
    if (change.type === 'keyboard-rapid-trigger' && device.capabilities.keyboard?.rapidTrigger?.writable) {
      device.capabilities.keyboard.rapidTrigger.enabled = change.enabled;
    }
    if (change.type === 'keyboard-snap-tap' && device.capabilities.keyboard?.snapTap?.writable) {
      device.capabilities.keyboard.snapTap.enabled = change.enabled;
    }
    if (change.type === 'microphone-mute-lighting' && device.capabilities.lighting) {
      device.capabilities.lighting.muteLinked = change.enabled;
    }
    return emit();
  },
  async refreshDevices() {
    return emit();
  },
  async setDeviceSetting(input: SetDeviceSettingInput) {
    const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
    if (device) device.settings[input.key] = input.value;
    return emit();
  },
  async setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput) {
    const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device) return emit();
    if (input.override) snapshot.settings.deviceAppearanceOverrides[input.deviceId] = input.override;
    else delete snapshot.settings.deviceAppearanceOverrides[input.deviceId];
    if (device.variantResolution.confidence !== 'hardware') {
      const resolved = resolveDeviceVariant(
        { ...device.identity, variant: undefined, colorway: undefined },
        [],
        input.override ?? undefined,
      );
      device.identity = resolved.identity;
      device.variantResolution = resolved.resolution;
      device.asset = resolveProductAsset(resolved.identity, device.kind);
    }
    return emit();
  },
  async audioCalibration() {
    throw new Error('Audio calibration requires the Windows desktop app and real audio devices.');
  },
  async setCaptureConfig(input: SetCaptureConfigInput) {
    if (input.enabled) throw new Error('Instant Replay is available only in the Switchboard desktop application.');
    const { defaultTrackLevels, ...rest } = input;
    snapshot.capture.config = {
      ...snapshot.capture.config,
      ...rest,
      ...(defaultTrackLevels ? {
        defaultTrackLevels: { ...snapshot.capture.config.defaultTrackLevels, ...defaultTrackLevels },
      } : {}),
    };
    if (typeof input.enabled === 'boolean') {
      const module = snapshot.modules.find((candidate) => candidate.id === 'capability.replay');
      if (module) {
        module.installed = true;
        module.enabled = input.enabled;
      }
      setEngine('capture', input.enabled);
    }
    return emit();
  },
  async saveReplay() {
    throw new Error('Saving a real replay requires the Switchboard desktop capture host.');
  },
  async chooseReplayCacheDirectory() { throw new Error('Folder selection requires the Switchboard desktop application.'); },
  async operateClips() { throw new Error('Clip management requires the Switchboard desktop application.'); },
  async chooseClipDirectory() { throw new Error('Folder selection requires the Switchboard desktop application.'); },
  async openClipsDirectory() { throw new Error('Opening the Clips folder requires the Switchboard desktop application.'); },
  async refreshCaptureSources() { return emit(); },
  async updateAutoCaptureSettings(input) {
    const current = snapshot.capture.autoCapture.settings;
    const games = { ...current.games };
    for (const [gameId, patch] of Object.entries(input.games ?? {})) {
      games[gameId] = autoCaptureSettingsSchema.shape.games.valueType.parse({
        enabled: true,
        useGlobalTiming: true,
        ...games[gameId],
        ...patch,
        events: { ...games[gameId]?.events, ...patch.events },
      });
    }
    snapshot.capture.autoCapture.settings = autoCaptureSettingsSchema.parse({
      ...current,
      ...input,
      reactionClipping: { ...current.reactionClipping, ...input.reactionClipping },
      games,
      dismissedAvailability: { ...current.dismissedAvailability, ...input.dismissedAvailability },
    });
    return emit();
  },
  async setupAutoCaptureProvider() { throw new Error('Provider setup requires the Switchboard desktop application.'); },
  async emitAutoCaptureTestEvent() { throw new Error('Test events require the Switchboard desktop capture host.'); },
  async scanGames() { return simulateGameScan(); },
  async addGame() { throw new Error('Selecting a game executable requires the Switchboard desktop application.'); },
  async checkAppUpdates() { return emit(); },
  async downloadAppUpdate() { throw new Error('Application updates require the Switchboard desktop application.'); },
  async installAppUpdate() { throw new Error('Application updates require an installed Switchboard build.'); },
  async exportResourceDiagnostics() { throw new Error('Resource diagnostics require the native app.'); },
  async runDiagnostics() { throw new Error('Run diagnostics requires the native app.'); },
  async cancelDiagnostics() { return structuredClone(snapshot); },
  async updateSettings(input: UpdateSettingsInput) {
    const enableAutomaticScan = input.scanGamesAutomatically === true && !snapshot.settings.scanGamesAutomatically;
    snapshot.settings = { ...snapshot.settings, ...input };
    return enableAutomaticScan ? simulateGameScan() : emit();
  },
  async resetSettings(scope: SettingsResetScope) {
    const defaults = createDefaultSnapshot();
    if (scope === 'all') {
      snapshot.settings = defaults.settings;
      snapshot.capture.config = defaults.capture.config;
      snapshot.gameDetection = { ...defaults.gameDetection, capability: 'simulation' };
      const captureModule = snapshot.modules.find((candidate) => candidate.id === 'capability.replay');
      if (captureModule) captureModule.enabled = false;
      setEngine('capture', false);
    }
    if (scope === 'general') {
      snapshot.settings.uiScalePercent = defaults.settings.uiScalePercent;
      snapshot.settings.launchAtStartup = defaults.settings.launchAtStartup;
      snapshot.settings.startMinimized = defaults.settings.startMinimized;
      snapshot.settings.trayOnGameLaunch = defaults.settings.trayOnGameLaunch;
      snapshot.settings.closeToTray = defaults.settings.closeToTray;
      snapshot.settings.destroyRendererInTray = defaults.settings.destroyRendererInTray;
      snapshot.settings.softwareRendering = defaults.settings.softwareRendering;
      snapshot.settings.automaticAppUpdates = defaults.settings.automaticAppUpdates;
      snapshot.settings.automaticAppUpdateDownloads = defaults.settings.automaticAppUpdateDownloads;
      snapshot.settings.installAppUpdatesOnNextStartup = defaults.settings.installAppUpdatesOnNextStartup;
      snapshot.settings.installAppUpdatesWhenIdle = defaults.settings.installAppUpdatesWhenIdle;
      snapshot.settings.developerMode = defaults.settings.developerMode;
    }
    if (scope === 'devices') snapshot.settings.deviceAppearanceOverrides = {};
    if (scope === 'capture') {
      snapshot.capture.config = defaults.capture.config;
      const module = snapshot.modules.find((candidate) => candidate.id === 'capability.replay');
      if (module) module.enabled = false;
      setEngine('capture', false);
    }
    if (scope === 'games') {
      snapshot.settings.scanGamesAutomatically = defaults.settings.scanGamesAutomatically;
      snapshot.gameDetection = { ...defaults.gameDetection, capability: 'simulation' };
    }
    if (scope === 'modules') snapshot.settings.automaticModuleUpdates = defaults.settings.automaticModuleUpdates;
    if (scope === 'diagnostics') {
      snapshot.settings.performanceGuard = defaults.settings.performanceGuard;
      snapshot.settings.diagnosticsRetentionDays = defaults.settings.diagnosticsRetentionDays;
    }
    return emit();
  },
  async submitFeedbackReport() {
    return { submitted: false, message: 'Feedback submission is available in the desktop app. This preview does not send messages.' };
  },
  async revealClip() {},
  async deleteClip(id) {
    snapshot.clips = snapshot.clips.filter((clip) => clip.id !== id);
    snapshot.capture.storage.clipsBytes = snapshot.clips.reduce((total, clip) => total + clip.fileSize, 0);
    return emit();
  },
  async markClipsReviewed(input) {
    snapshot.clipReview.reviewedThrough = Math.max(snapshot.clipReview.reviewedThrough, input.reviewedThrough);
    return emit();
  },
  async renameClip(input) {
    const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
    if (clip) {
      clip.name = input.name;
      clip.titleEdited = true;
    }
    return emit();
  },
  async setClipFavorite(input) {
    const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
    if (clip) clip.favorite = input.favorite;
    return emit();
  },
  async setClipTrim(input) {
    const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
    if (clip) {
      clip.trimStartMs = input.startMs;
      clip.trimEndMs = input.endMs < clip.durationMs ? input.endMs : undefined;
      const audioTrackTrims = [...(input.audioTrackTrims ?? [])];
      while (audioTrackTrims.at(-1) === null) audioTrackTrims.pop();
      clip.audioTrackTrims = audioTrackTrims.length > 0 ? audioTrackTrims : undefined;
    }
    return emit();
  },
  async setClipCanvasSize(input) {
    const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
    if (clip) clip.canvasSize = input.canvasSize;
    return emit();
  },
  async setClipAudioTrackLevel(input) {
    const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
    if (clip) {
      const levels = applyClipTrackLevel(
        clip.audioTrackLevels,
        clip.audioChannels,
        snapshot.capture.config.defaultTrackLevels,
        input.trackIndex,
        input.level,
      );
      clip.audioTrackLevels = levels.length > 0 ? levels : undefined;
    }
    return emit();
  },
  async loadClipAudioWaveform(id) { return { clipId: id, tracks: [] }; },
  async exportClip() { return false; },
  async prepareClipShare() { return null; },
  startPreparedShareDrag() {},
  async revealPreparedShareFile() {},
  async exportMontage() { return false; },
  async cancelClipExport() {},
  subscribeClipExportProgress() { return () => {}; },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const switchboardApi: SwitchboardApi = window.switchboard ?? demoApi;
