import type {
  ApplyAudioPresetInput,
  AudioPresetIdInput,
  AudioMeterFrame,
  CreateAudioPresetInput,
  DetectedGame,
  FeedbackReportInput,
  RenameAudioPresetInput,
  SetAudioChannelProcessorInput,
  SetAudioBusDeviceInput,
  SetAudioApplicationRouteInput,
  SetAudioBusEnabledInput,
  SetAudioBusGainInput,
  SetAudioChannelEnabledInput,
  SetAudioMasterEnabledInput,
  SetAudioMasterGainInput,
  SetDeviceAppearanceOverrideInput,
  SetDeviceControlInput,
  SetDeviceSettingInput,
  SetMicProcessorInput,
  SetAudioMonitoringInput,
  SetCaptureConfigInput,
  SetModuleStateInput,
  SettingsResetScope,
  SwitchboardApi,
  SystemSnapshot,
  UpdateSettingsInput,
} from '../../../shared/contracts';
import { autoCaptureSettingsSchema, channelProcessingSchema, micProcessorSchema } from '../../../shared/contracts';
import {
  applyAudioPathPreset,
  findMatchingAudioPresetId,
  snapshotAudioPathPreset,
} from '../../../shared/audio-presets';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import { createDefaultSnapshot } from '../../../shared/defaults';
import { applyClipTrackLevel } from '../../../shared/clip-track-levels';
import { buildFeedbackClipboardText, buildFeedbackIssueUrl } from '../../../shared/feedback-report';

let snapshot = createDefaultSnapshot();
snapshot.gameDetection.capability = 'simulation';
snapshot.audio.capabilities = {
  virtualChannels: 'simulation',
  applicationRouting: 'simulation',
  channelDsp: 'simulation',
  microphoneDsp: 'simulation',
  noiseSuppression: 'unavailable',
  realtimeMetering: 'simulation',
  microphoneTest: 'unavailable',
  monitoring: 'unavailable',
  spatialAudio: 'unavailable',
};
snapshot.audio.applications = [
  {
    id: 'preview-game-session',
    name: 'Cyberpunk 2077',
    executableName: 'Cyberpunk2077',
    processId: 18_640,
    destination: 'game',
    currentDestination: 'game',
    preferredDestination: 'game',
    routingState: 'applied',
    active: true,
  },
  {
    id: 'preview-chat-session',
    name: 'Discord',
    executableName: 'Discord',
    processId: 18_704,
    destination: 'chat',
    currentDestination: 'chat',
    preferredDestination: 'chat',
    routingState: 'applied',
    active: true,
  },
  {
    id: 'preview-game-launcher-session',
    name: 'Steam',
    executableName: 'steamwebhelper',
    processId: 18_736,
    destination: 'game',
    currentDestination: 'game',
    preferredDestination: 'game',
    routingState: 'applied',
    active: false,
  },
  {
    id: 'preview-media-session',
    name: 'Spotify',
    executableName: 'Spotify',
    processId: 18_768,
    destination: 'media',
    currentDestination: 'media',
    preferredDestination: 'media',
    routingState: 'applied',
    active: false,
  },
];
for (const bus of snapshot.audio.buses) {
  bus.appCount = snapshot.audio.applications.filter((application) => application.currentDestination === bus.id).length;
}
const listeners = new Set<(value: SystemSnapshot) => void>();
const audioMeterListeners = new Set<(frame: AudioMeterFrame) => void>();
let engineTimer: number | undefined;
let audioMeterTimer: number | undefined;
let meterSequence = 0;
let meterPhase = 0;

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
      engine.cpuPercent = engine.kind === 'capture' ? 0.8 : 0.3;
      engine.memoryMb = engine.kind === 'capture' ? 31 : 24;
      changed = true;
    }
    if (changed) {
      recalculate();
      emit();
    }
  }, 1000);
}

function setEngine(kind: 'audio' | 'capture', enabled: boolean): void {
  const engine = snapshot.engines.find((candidate) => candidate.kind === kind);
  if (!engine) return;
  engine.state = enabled ? 'running' : 'stopped';
  engine.pid = enabled ? (kind === 'audio' ? 18432 : 18496) : undefined;
  engine.cpuPercent = enabled ? (kind === 'audio' ? 0.3 : 0.8) : 0;
  engine.memoryMb = enabled ? (kind === 'audio' ? 24 : 31) : 0;
  engine.uptimeSeconds = 0;
  engine.message = enabled ? 'Browser preview simulation active' : undefined;
  if (!enabled && kind === 'capture') {
    snapshot.capture.runtime.bufferedSeconds = 0;
    snapshot.capture.runtime.segmentCount = 0;
    snapshot.capture.runtime.replayCacheBytes = 0;
  }
  recalculate();
  ensureTimer();
  if (kind === 'audio') syncAudioMeterTimer();
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

function syncAudioMeterTimer(): void {
  const shouldRun = snapshot.audio.enabled && audioMeterListeners.size > 0;
  if (!shouldRun && audioMeterTimer !== undefined) {
    window.clearInterval(audioMeterTimer);
    audioMeterTimer = undefined;
    return;
  }
  if (!shouldRun || audioMeterTimer !== undefined) return;

  audioMeterTimer = window.setInterval(() => {
    meterPhase += 0.17;
    const personalMix = snapshot.audio.mixes.find((mix) => mix.id === 'personal');
    const frame: AudioMeterFrame = {
      sequence: meterSequence++,
      timestamp: new Date().toISOString(),
      values: snapshot.audio.buses.map((bus, index) => {
        const movement = 0.52 + Math.sin(meterPhase + index * 1.31) * 0.22 + Math.sin(meterPhase * 0.43 + index) * 0.12;
        const control = personalMix?.buses.find((candidate) => candidate.id === bus.id);
        const level = control?.enabled
          ? Math.max(0, Math.min(1, bus.meter * movement * Math.min(1.25, control.gain + 0.18)))
          : 0;
        const peak = Math.min(1, level + 0.055);
        return { busId: bus.id, level, peak, clipping: peak >= 0.985 };
      }),
    };
    for (const listener of audioMeterListeners) listener(frame);
  }, 50);
}

const demoApi: SwitchboardApi = {
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
      if (module.kind === 'audio') {
        snapshot.audio.enabled = input.enabled;
        setEngine('audio', input.enabled);
      }
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
  async setAudioEnabled(enabled: boolean) {
    if (enabled && snapshot.settings.developerMode !== true) {
      throw new Error('Audio is available only when Developer mode is enabled in Settings, General.');
    }
    snapshot.audio.enabled = enabled;
    const module = snapshot.modules.find((candidate) => candidate.id === 'capability.audio-router');
    if (module) {
      module.installed = true;
      module.enabled = enabled;
    }
    setEngine('audio', enabled);
    return emit();
  },
  async setAudioBusGain(input: SetAudioBusGainInput) {
    const bus = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId)?.buses.find((candidate) => candidate.id === input.busId);
    if (bus) bus.gain = input.gain;
    return emit();
  },
  async setAudioMasterGain(input: SetAudioMasterGainInput) {
    const mix = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId);
    if (mix) mix.master.gain = input.gain;
    return emit();
  },
  async setAudioMasterEnabled(input: SetAudioMasterEnabledInput) {
    const mix = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId);
    if (mix) mix.master.enabled = input.enabled;
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
  async setAudioBusEnabled(input: SetAudioBusEnabledInput) {
    const bus = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId)?.buses.find((candidate) => candidate.id === input.busId);
    if (bus) bus.enabled = input.enabled;
    return emit();
  },
  async setAudioChannelEnabled(input: SetAudioChannelEnabledInput) {
    const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
    if (bus) bus.enabled = input.enabled;
    return emit();
  },
  async setAudioBusDevice(input: SetAudioBusDeviceInput) {
    const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
    const device = snapshot.audio.devices.find((candidate) => candidate.id === input.deviceId);
    if (bus && device) {
      bus.deviceId = device.id;
      if (bus.id === 'mic') snapshot.audio.microphoneDevice = device.name;
      if (bus.id === 'game') snapshot.audio.outputDevice = device.name;
    }
    return emit();
  },
  async setAudioApplicationRoute(input: SetAudioApplicationRouteInput) {
    const application = snapshot.audio.applications.find((candidate) => candidate.id === input.applicationId);
    if (!application) throw new Error('That audio session is no longer available.');
    application.destination = input.destination;
    application.preferredDestination = input.destination;
    application.routingState = application.currentDestination === input.destination ? 'applied' : 'pending-restart';
    return emit();
  },
  async applyAudioPreset(input: ApplyAudioPresetInput) {
    const preset = snapshot.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
    if (!preset) return emit();
    applyAudioPathPreset(snapshot.audio, preset);
    return emit();
  },
  async createAudioPreset(input: CreateAudioPresetInput) {
    const id = `user-${input.kind}-${crypto.randomUUID()}`;
    snapshot.audio.pathPresets.push(snapshotAudioPathPreset(snapshot.audio, input.kind, id, input.name));
    snapshot.audio.activePresetIds[input.kind] = id;
    return emit();
  },
  async renameAudioPreset(input: RenameAudioPresetInput) {
    const preset = snapshot.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
    if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
    if (preset.builtIn) throw new Error('Built-in presets cannot be renamed. Duplicate it first.');
    preset.name = input.name;
    return emit();
  },
  async duplicateAudioPreset(input: AudioPresetIdInput) {
    const source = snapshot.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
    if (!source) throw new Error(`Unknown audio preset: ${input.presetId}`);
    const id = `user-${source.kind}-${crypto.randomUUID()}`;
    snapshot.audio.pathPresets.push(snapshotAudioPathPreset(snapshot.audio, source.kind, id, `${source.name} copy`));
    snapshot.audio.activePresetIds[source.kind] = id;
    return emit();
  },
  async deleteAudioPreset(input: AudioPresetIdInput) {
    const index = snapshot.audio.pathPresets.findIndex((candidate) => candidate.id === input.presetId);
    if (index < 0) throw new Error(`Unknown audio preset: ${input.presetId}`);
    const preset = snapshot.audio.pathPresets[index]!;
    if (preset.builtIn) throw new Error('Built-in presets cannot be deleted.');
    snapshot.audio.pathPresets.splice(index, 1);
    snapshot.audio.activePresetIds[preset.kind] = findMatchingAudioPresetId(snapshot.audio, preset.kind);
    return emit();
  },
  async importAudioPreset() {
    throw new Error('Preset import requires the Switchboard desktop application.');
  },
  async exportAudioPreset() {
    throw new Error('Preset export requires the Switchboard desktop application.');
  },
  async setAudioChannelProcessor(input: SetAudioChannelProcessorInput) {
    const processing = snapshot.audio.channelProcessing.find((candidate) => candidate.busId === input.busId);
    if (!processing) throw new Error(`Unknown audio processing path: ${input.busId}`);
    if (input.processorId === 'equalizer') {
      processing.equalizer = { ...processing.equalizer, enabled: input.enabled ?? processing.equalizer.enabled, ...input.parameters };
    } else if (input.processorId === 'normalization') {
      processing.normalization = {
        ...processing.normalization,
        enabled: input.enabled ?? processing.normalization.enabled,
        ...input.parameters,
      };
    } else if (input.processorId === 'compressor') {
      processing.compressor = {
        ...processing.compressor,
        enabled: input.enabled ?? processing.compressor.enabled,
        ...input.parameters,
      };
    } else {
      processing.limiter = {
        ...processing.limiter,
        enabled: input.enabled ?? processing.limiter.enabled,
        ...input.parameters,
      };
    }
    snapshot.audio.channelProcessing[snapshot.audio.channelProcessing.indexOf(processing)] = channelProcessingSchema.parse(processing);
    snapshot.audio.activePresetIds[input.busId] = findMatchingAudioPresetId(snapshot.audio, input.busId);
    return emit();
  },
  async setAudioMonitoring(input: SetAudioMonitoringInput) {
    if (snapshot.audio.capabilities.monitoring === 'unavailable') {
      throw new Error('Low-latency microphone monitoring is unavailable in the browser preview.');
    }
    if (typeof input.enabled === 'boolean') snapshot.audio.monitoringEnabled = input.enabled;
    if (typeof input.level === 'number') snapshot.audio.monitoring = input.level;
    if (input.deviceId) snapshot.audio.monitoringDeviceId = input.deviceId;
    snapshot.audio.activePresetIds.microphone = findMatchingAudioPresetId(snapshot.audio, 'microphone');
    return emit();
  },
  async testMicrophone() {
    throw new Error('Microphone testing requires the native Audio.Host.');
  },
  async setChatMix(value: number) {
    snapshot.audio.chatMix = value;
    return emit();
  },
  async setMicProcessor(input: SetMicProcessorInput) {
    const processor = snapshot.audio.micProcessors.find((candidate) => candidate.id === input.processorId);
    if (processor) {
      const index = snapshot.audio.micProcessors.indexOf(processor);
      snapshot.audio.micProcessors[index] = micProcessorSchema.parse({
        ...processor,
        enabled: input.enabled ?? processor.enabled,
        parameters: { ...processor.parameters, ...input.parameters },
      });
    }
    snapshot.audio.activePresetIds.microphone = findMatchingAudioPresetId(snapshot.audio, 'microphone');
    return emit();
  },
  subscribeAudioMeters(listener) {
    audioMeterListeners.add(listener);
    syncAudioMeterTimer();
    return () => {
      audioMeterListeners.delete(listener);
      syncAudioMeterTimer();
    };
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
  async updateSettings(input: UpdateSettingsInput) {
    const enableAutomaticScan = input.scanGamesAutomatically === true && !snapshot.settings.scanGamesAutomatically;
    if (input.developerMode === false) {
      snapshot.audio.enabled = false;
      const module = snapshot.modules.find((candidate) => candidate.id === 'capability.audio-router');
      if (module) module.enabled = false;
      setEngine('audio', false);
    }
    snapshot.settings = { ...snapshot.settings, ...input };
    return enableAutomaticScan ? simulateGameScan() : emit();
  },
  async resetSettings(scope: SettingsResetScope) {
    const defaults = createDefaultSnapshot();
    if (scope === 'all') {
      snapshot.settings = defaults.settings;
      snapshot.audio = createResetAudioState(snapshot.audio, defaults.audio);
      snapshot.capture.config = defaults.capture.config;
      snapshot.gameDetection = { ...defaults.gameDetection, capability: 'simulation' };
      const audioModule = snapshot.modules.find((candidate) => candidate.id === 'capability.audio-router');
      if (audioModule) audioModule.enabled = false;
      const captureModule = snapshot.modules.find((candidate) => candidate.id === 'capability.replay');
      if (captureModule) captureModule.enabled = false;
      setEngine('audio', false);
      setEngine('capture', false);
    }
    if (scope === 'general') {
      snapshot.settings.uiScalePercent = defaults.settings.uiScalePercent;
      snapshot.settings.launchAtStartup = defaults.settings.launchAtStartup;
      snapshot.settings.closeToTray = defaults.settings.closeToTray;
      snapshot.settings.destroyRendererInTray = defaults.settings.destroyRendererInTray;
      snapshot.settings.softwareRendering = defaults.settings.softwareRendering;
      snapshot.settings.automaticAppUpdates = defaults.settings.automaticAppUpdates;
      snapshot.settings.automaticAppUpdateDownloads = defaults.settings.automaticAppUpdateDownloads;
      snapshot.settings.installAppUpdatesOnNextStartup = defaults.settings.installAppUpdatesOnNextStartup;
      snapshot.settings.installAppUpdatesWhenIdle = defaults.settings.installAppUpdatesWhenIdle;
      snapshot.settings.developerMode = defaults.settings.developerMode;
      if (defaults.settings.developerMode !== true) {
        snapshot.audio.enabled = false;
        const audioModule = snapshot.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (audioModule) audioModule.enabled = false;
        setEngine('audio', false);
      }
    }
    if (scope === 'devices') snapshot.settings.deviceAppearanceOverrides = {};
    if (scope === 'audio') {
      snapshot.audio = createResetAudioState(snapshot.audio, defaults.audio);
      const module = snapshot.modules.find((candidate) => candidate.id === 'capability.audio-router');
      if (module) module.enabled = false;
      setEngine('audio', false);
    }
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
  async handoffFeedbackReport(input: FeedbackReportInput) {
    const environment = {
      version: snapshot.version,
      runtime: 'Browser preview',
      platform: navigator.platform || 'Browser',
      prototypeMode: snapshot.prototypeMode,
    };
    let copied = false;
    try {
      await navigator.clipboard.writeText(buildFeedbackClipboardText(input, environment));
      copied = true;
    } catch {
      // Clipboard access can be unavailable for a local or permission-restricted preview.
    }
    const issueWindow = window.open(buildFeedbackIssueUrl(input, environment), '_blank');
    if (issueWindow) issueWindow.opener = null;
    return { copied, opened: Boolean(issueWindow) };
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

function createResetAudioState(
  current: SystemSnapshot['audio'],
  defaults: SystemSnapshot['audio'],
): SystemSnapshot['audio'] {
  const reset = structuredClone(defaults);
  reset.devices = structuredClone(current.devices);
  reset.pathPresets = [
    ...structuredClone(defaults.pathPresets),
    ...structuredClone(current.pathPresets.filter((preset) => !preset.builtIn)),
  ];

  const availableDeviceIds = new Set(reset.devices.map((device) => device.id));
  for (const bus of reset.buses) {
    if (availableDeviceIds.has(bus.deviceId)) continue;
    const currentBus = current.buses.find((candidate) => candidate.id === bus.id);
    if (currentBus && availableDeviceIds.has(currentBus.deviceId)) bus.deviceId = currentBus.deviceId;
  }

  const defaultOutput = reset.devices.find((device) => device.direction === 'output' && device.available && device.isDefault);
  const defaultInput = reset.devices.find((device) => device.direction === 'input' && device.available && device.isDefault);
  reset.outputDevice = defaultOutput?.name ?? current.outputDevice;
  reset.microphoneDevice = defaultInput?.name ?? current.microphoneDevice;
  for (const kind of ['game', 'chat', 'media', 'microphone'] as const) {
    const defaultId = defaults.activePresetIds[kind];
    reset.activePresetIds[kind] = defaultId && reset.pathPresets.some((preset) => preset.id === defaultId)
      ? defaultId
      : null;
  }
  return reset;
}
