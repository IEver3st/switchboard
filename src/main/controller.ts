import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { app, clipboard, desktopCapturer, dialog, globalShortcut, screen, shell, type DesktopCapturerSource, type Display } from 'electron';
import { z } from 'zod';
import {
  captureConfigSchema,
  captureHostSnapshotSchema,
  captureSourceSchema,
  audioHostSnapshotSchema,
  audioPresetFileSchema,
  channelProcessingSchema,
  micProcessorSchema,
  type AudioPathId,
  type AudioPresetIdInput,
  type AudioMeterFrame,
  type AudioHostSnapshot,
  type ApplyAudioPresetInput,
  type CaptureConfig,
  type CaptureHostSnapshot,
  type CaptureSource,
  type Clip,
  type ExportClipInput,
  type FeedbackHandoffResult,
  type FeedbackReportInput,
  type EngineStatus,
  type CreateAudioPresetInput,
  type RenameAudioPresetInput,
  type RenameClipInput,
  type SetClipCanvasSizeInput,
  type SetClipAudioTrackLevelInput,
  type SetClipFavoriteInput,
  type SetClipTrimInput,
  type SetAudioChannelProcessorInput,
  type SetAudioBusDeviceInput,
  type SetAudioApplicationRouteInput,
  type SetAudioBusEnabledInput,
  type SetAudioBusGainInput,
  type SetAudioChannelEnabledInput,
  type SetAudioMasterEnabledInput,
  type SetAudioMasterGainInput,
  type SetDeviceSettingInput,
  type SetDeviceControlInput,
  type SetDeviceAppearanceOverrideInput,
  type SetMicProcessorInput,
  type SetAudioMonitoringInput,
  type SetModuleStateInput,
  type SettingsResetScope,
  type SystemSnapshot,
  type UpdateSettingsInput,
} from '../shared/contracts';
import { defaultAudio, defaultCaptureConfig, defaultGameDetection, defaultSettings } from '../shared/defaults';
import {
  applyAudioPathPreset,
  findMatchingAudioPresetId,
  snapshotAudioPathPreset,
} from '../shared/audio-presets';
import { resolveDeviceVariant } from '../shared/device-variant';
import { resolveProductAsset } from '../shared/product-assets';
import { getEncodingPreset, sanitizeClipBaseName } from '../shared/capture-presets';
import { clipGameLabel, createDefaultClipTitle } from '../shared/clip-library';
import { buildFeedbackClipboardText, buildFeedbackIssueUrl, type FeedbackEnvironment } from '../shared/feedback-report';
import { reconcileAudioDevices } from '../shared/audio-devices';
import { CaptureStorageService, type CapturePaths } from './services/capture-storage';
import { ClipLibraryService } from './services/clip-library';
import { AudioEndpointDiscovery } from './services/audio-endpoint-discovery';
import { AppUpdateService, type AppUpdatePreferences } from './services/app-update-service';
import { DeviceRegistry } from './services/device-registry';
import { EngineSupervisor } from './services/engine-supervisor';
import { GameDiscoveryService, gameIdentityKey } from './services/game-discovery';
import { StateStore } from './services/state-store';

const workerSavedClipSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  game: z.string().nullable().optional(),
  createdAt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  fileSize: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  codec: z.string().nullable().optional(),
  thumbnailPath: z.string().nullable().optional(),
});

type WorkerSavedClip = z.infer<typeof workerSavedClipSchema>;
const audioEndpointRefreshMinimumIntervalMs = 10_000;
const captureSourceThumbnailRefreshMinimumIntervalMs = 10_000;

type AppControllerOptions = {
  demoUpdate?: boolean;
  onUpdateInstallRequested?: (installing: boolean) => void;
};

export class AppController {
  private readonly store: StateStore;
  private readonly engines: EngineSupervisor;
  private readonly devices: DeviceRegistry;
  private readonly audioMeterListeners = new Set<(frame: AudioMeterFrame) => void>();
  private readonly captureStorage: CaptureStorageService;
  private readonly clipLibrary: ClipLibraryService;
  private readonly audioEndpointDiscovery: AudioEndpointDiscovery;
  private readonly gameDiscovery: GameDiscoveryService;
  private readonly appUpdates: AppUpdateService;
  private capturePaths: CapturePaths;
  private registeredShortcut: string | null = null;
  private captureRestartTimer: NodeJS.Timeout | null = null;
  private captureRestartAttempts = 0;
  private captureAudioIntegrationSignature: string | null = null;
  private captureAudioIntegrationUpdate: Promise<void> | null = null;
  private audioRestartTimer: NodeJS.Timeout | null = null;
  private audioRestartAttempts = 0;
  private audioDeviceRefresh: Promise<SystemSnapshot> | null = null;
  private audioDevicesRefreshedAt = 0;
  private readonly captureSourceThumbnails = new Map<string, Buffer>();
  private captureSourceThumbnailRefresh: Promise<void> | null = null;
  private captureSourceThumbnailsRefreshedAt = 0;
  private gameScan: Promise<SystemSnapshot> | null = null;
  private initialization: Promise<void> | null = null;
  private disposed = false;

  public constructor(options: AppControllerOptions = {}) {
    this.store = new StateStore(join(app.getPath('userData'), 'switchboard-state.json'));
    this.appUpdates = new AppUpdateService({
      currentVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      demoUpdate: options.demoUpdate,
      onStateChanged: (appUpdate) => {
        this.store.update((draft) => { draft.appUpdate = appUpdate; }, { persist: false });
      },
      onInstallRequested: options.onUpdateInstallRequested,
    });
    this.captureStorage = new CaptureStorageService(app.getPath('videos'), app.getPath('userData'));
    this.capturePaths = this.captureStorage.resolvePaths(null);
    this.clipLibrary = new ClipLibraryService(this.capturePaths.thumbnailDirectory);
    this.audioEndpointDiscovery = new AudioEndpointDiscovery({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    });
    this.gameDiscovery = new GameDiscoveryService({
      extractExecutableIcon: async (executablePath) => {
        const icon = await app.getFileIcon(executablePath, { size: 'normal' });
        return icon.isEmpty() ? undefined : icon.toDataURL();
      },
    });
    this.engines = new EngineSupervisor(
      (status) => this.applyEngineStatus(status),
      (frame) => this.emitAudioMeters(frame),
      (kind, event, payload) => this.applyEngineEvent(kind, event, payload),
    );
    this.devices = new DeviceRegistry(
      () => this.store.get(),
      (devices, options) => {
        this.store.update((draft) => {
          draft.devices = devices;
        }, { persist: options?.persist ?? true });
      },
    );
  }

  public initialize(): Promise<void> {
    this.initialization ??= this.initializeOnce();
    return this.initialization;
  }

  private async initializeOnce(): Promise<void> {
    await this.store.load();
    if (this.disposed) return;
    this.store.update((draft) => {
      draft.version = app.getVersion();
      draft.prototypeMode = !app.isPackaged;
    }, { persist: false });
    await this.appUpdates.initialize(appUpdatePreferences(this.store.get().settings));
    if (this.disposed) return;
    await this.refreshAudioDevices(true);
    if (this.disposed) return;
    // Native UI review uses canonical fixture devices so automated interaction
    // checks never issue writes to connected physical hardware.
    if (process.env.SWITCHBOARD_NATIVE_FIXTURES !== '1') await this.devices.start();
    if (this.disposed) return;
    const snapshot = this.store.get();
    this.applyLoginItemSetting(snapshot.settings.launchAtStartup);
    await this.initializeCaptureStorage();
    if (this.disposed) return;
    this.registerCaptureShortcut(snapshot.capture.config.hotkey, false);
    void this.reconcileClipLibrary();

    const starts: Promise<unknown>[] = [];
    if (snapshot.audio.enabled) starts.push(this.startAudioEngine());
    const currentCapture = this.store.get().capture;
    if (currentCapture.config.enabled && !currentCapture.storage.warning) {
      starts.push(this.startCaptureEngine(currentCapture.config));
    }
    const results = await Promise.allSettled(starts);
    for (const result of results) {
      if (result.status === 'rejected') console.error('Failed to restore an enabled engine.', result.reason);
    }
    if (this.disposed) return;
    if (snapshot.settings.scanGamesAutomatically) {
      void this.scanGames().catch((error) => console.warn('Automatic game scan failed.', error));
    }
  }

  public getSnapshot(): SystemSnapshot {
    return this.store.get();
  }

  public subscribe(listener: (snapshot: SystemSnapshot) => void): () => void {
    return this.store.subscribe(listener);
  }

  public subscribeAudioMeters(listener: (frame: AudioMeterFrame) => void): () => void {
    this.audioMeterListeners.add(listener);
    return () => this.audioMeterListeners.delete(listener);
  }

  public setRendererActive(active: boolean): SystemSnapshot {
    if (active) void this.refreshAudioDevices();
    return this.store.setRendererActive(active);
  }

  public refreshAudioDevices(force = false): Promise<SystemSnapshot> {
    if (this.audioDeviceRefresh) return this.audioDeviceRefresh;
    if (!force && Date.now() - this.audioDevicesRefreshedAt < audioEndpointRefreshMinimumIntervalMs) {
      return Promise.resolve(this.store.get());
    }

    const refresh = this.audioEndpointDiscovery.list()
      .then((devices) => {
        const current = this.store.get();
        const audio = structuredClone(current.audio);
        reconcileAudioDevices(audio, devices);
        this.audioDevicesRefreshedAt = Date.now();
        if (JSON.stringify(audio) === JSON.stringify(current.audio)) return current;
        return this.store.update((draft) => { draft.audio = audio; });
      })
      .catch((error) => {
        console.warn('Windows audio endpoint discovery failed.', error);
        return this.store.get();
      })
      .finally(() => {
        if (this.audioDeviceRefresh === refresh) this.audioDeviceRefresh = null;
      });
    this.audioDeviceRefresh = refresh;
    return refresh;
  }

  public async setModuleState(input: SetModuleStateInput): Promise<SystemSnapshot> {
    const module = this.store.get().modules.find((candidate) => candidate.id === input.moduleId);
    if (!module) throw new Error(`Unknown module: ${input.moduleId}`);

    if (module.kind === 'capture') return this.setCaptureConfig({ enabled: input.enabled });
    if (module.kind === 'audio') return this.setAudioEnabled(input.enabled);

    this.store.update((draft) => {
      const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
      if (!target) throw new Error(`Unknown module: ${input.moduleId}`);
      target.installed = target.installed || input.enabled;
      target.enabled = input.enabled;
    });
    await this.devices.refresh();
    return this.store.get();
  }

  public setDeviceSetting(input: SetDeviceSettingInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const device = draft.devices.find((candidate) => candidate.id === input.deviceId);
      if (!device) throw new Error(`Unknown device: ${input.deviceId}`);
      if (!Object.hasOwn(device.settings, input.key)) {
        throw new Error(`Unsupported setting for ${device.displayName}: ${input.key}`);
      }
      device.settings[input.key] = input.value;
    });
    return snapshot;
  }

  public async setDeviceControl(input: SetDeviceControlInput): Promise<SystemSnapshot> {
    await this.devices.setControl(input.deviceId, input.change);
    return this.store.get();
  }

  public setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput): SystemSnapshot {
    return this.store.update((draft) => {
      const device = draft.devices.find((candidate) => candidate.id === input.deviceId);
      if (!device) throw new Error(`Unknown device: ${input.deviceId}`);
      if (input.override) draft.settings.deviceAppearanceOverrides[input.deviceId] = input.override;
      else delete draft.settings.deviceAppearanceOverrides[input.deviceId];

      if (device.variantResolution.confidence === 'hardware') return;
      const baseIdentity = { ...device.identity, variant: undefined, colorway: undefined };
      const resolved = resolveDeviceVariant(baseIdentity, [], input.override ?? undefined);
      device.identity = resolved.identity;
      device.variantResolution = resolved.resolution;
      device.asset = resolveProductAsset(resolved.identity, device.kind);
    });
  }

  public async setAudioEnabled(enabled: boolean): Promise<SystemSnapshot> {
    const current = this.store.get().audio.enabled;
    if (current === enabled) return this.store.get();

    if (enabled) {
      this.store.update((draft) => {
        draft.audio.enabled = true;
        const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (module) {
          module.installed = true;
          module.enabled = true;
        }
      });
      try {
        await this.startAudioEngine();
        return this.store.get();
      } catch (error) {
        this.store.update((draft) => {
          draft.audio.enabled = false;
          const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
          if (module) module.enabled = false;
        });
        throw error;
      }
    }

    if (this.audioRestartTimer) clearTimeout(this.audioRestartTimer);
    this.audioRestartTimer = null;
    this.audioRestartAttempts = 0;
    await this.engines.stop('audio');
    return this.store.update((draft) => {
      draft.audio.enabled = false;
      const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
      if (module) module.enabled = false;
    });
  }

  public setAudioBusGain(input: SetAudioBusGainInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
      if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
      const bus = mix.buses.find((candidate) => candidate.id === input.busId);
      if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
      bus.gain = input.gain;
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public setAudioMasterGain(input: SetAudioMasterGainInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
      if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
      mix.master.gain = input.gain;
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public setAudioMasterEnabled(input: SetAudioMasterEnabledInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
      if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
      mix.master.enabled = input.enabled;
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public setAudioBusEnabled(input: SetAudioBusEnabledInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
      if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
      const bus = mix.buses.find((candidate) => candidate.id === input.busId);
      if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
      bus.enabled = input.enabled;
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public setAudioChannelEnabled(input: SetAudioChannelEnabledInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const bus = draft.audio.buses.find((candidate) => candidate.id === input.busId);
      if (!bus) throw new Error(`Unknown audio channel: ${input.busId}`);
      bus.enabled = input.enabled;
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public async setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<SystemSnapshot> {
    const before = this.store.get();
    const bus = before.audio.buses.find((candidate) => candidate.id === input.busId);
    if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);

    const device = before.audio.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device) throw new Error(`Unknown audio device: ${input.deviceId}`);
    if (!device.available) throw new Error(`${device.name} is not currently available.`);

    const requiredDirection = bus.id === 'mic' ? 'input' : 'output';
    if (device.direction !== requiredDirection) {
      throw new Error(`${device.name} cannot be assigned to the ${bus.label} channel.`);
    }
    if (device.isSwitchboard) {
      throw new Error('Choose a physical Windows audio device instead of a Switchboard transport endpoint.');
    }

    const snapshot = this.store.update((draft) => {
      const target = draft.audio.buses.find((candidate) => candidate.id === input.busId);
      if (!target) throw new Error(`Unknown audio bus: ${input.busId}`);
      target.deviceId = input.deviceId;
      if (target.id === 'mic') draft.audio.microphoneDevice = device.name;
      if (target.id === 'game') draft.audio.outputDevice = device.name;
    });
    try {
      return await this.configureAudioEngine(snapshot);
    } catch (error) {
      this.store.update((draft) => {
        const target = draft.audio.buses.find((candidate) => candidate.id === input.busId);
        if (target) target.deviceId = bus.deviceId;
        draft.audio.outputDevice = before.audio.outputDevice;
        draft.audio.microphoneDevice = before.audio.microphoneDevice;
      });
      this.engines.send('audio', 'configure', before.audio);
      throw error;
    }
  }

  public async setAudioApplicationRoute(input: SetAudioApplicationRouteInput): Promise<SystemSnapshot> {
    const before = this.store.get();
    if (before.audio.capabilities.applicationRouting !== 'available') {
      throw new Error(before.audio.capabilities.reason ?? 'Application audio routing is unavailable.');
    }
    const application = before.audio.applications.find((candidate) => candidate.id === input.applicationId);
    if (!application) throw new Error('That audio session is no longer available.');
    const hostSnapshot = audioHostSnapshotSchema.parse(await this.engines.request('audio', 'routeApplication', {
      processId: application.processId,
      destination: input.destination,
    }, 15_000));
    this.applyAudioHostSnapshot(hostSnapshot);
    return this.store.get();
  }

  public async applyAudioPreset(input: ApplyAudioPresetInput): Promise<SystemSnapshot> {
    const before = this.store.get();
    const preset = before.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
    if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
    const snapshot = this.store.update((draft) => {
      applyAudioPathPreset(draft.audio, preset);
    });
    return this.configureAudioEngine(snapshot);
  }

  public createAudioPreset(input: CreateAudioPresetInput): SystemSnapshot {
    const id = `user-${input.kind}-${randomUUID()}`;
    return this.store.update((draft) => {
      const preset = snapshotAudioPathPreset(draft.audio, input.kind, id, input.name);
      draft.audio.pathPresets.push(preset);
      draft.audio.activePresetIds[input.kind] = id;
    });
  }

  public renameAudioPreset(input: RenameAudioPresetInput): SystemSnapshot {
    return this.store.update((draft) => {
      const preset = draft.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
      if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
      if (preset.builtIn) throw new Error('Built-in presets cannot be renamed. Duplicate it first.');
      preset.name = input.name;
    });
  }

  public duplicateAudioPreset(input: AudioPresetIdInput): SystemSnapshot {
    return this.store.update((draft) => {
      const source = draft.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
      if (!source) throw new Error(`Unknown audio preset: ${input.presetId}`);
      const copy = snapshotAudioPathPreset(
        draft.audio,
        source.kind,
        `user-${source.kind}-${randomUUID()}`,
        `${source.name} copy`,
      );
      draft.audio.pathPresets.push(copy);
      draft.audio.activePresetIds[source.kind] = copy.id;
    });
  }

  public deleteAudioPreset(input: AudioPresetIdInput): SystemSnapshot {
    return this.store.update((draft) => {
      const index = draft.audio.pathPresets.findIndex((candidate) => candidate.id === input.presetId);
      if (index < 0) throw new Error(`Unknown audio preset: ${input.presetId}`);
      const preset = draft.audio.pathPresets[index]!;
      if (preset.builtIn) throw new Error('Built-in presets cannot be deleted.');
      draft.audio.pathPresets.splice(index, 1);
      if (draft.audio.activePresetIds[preset.kind] === preset.id) {
        draft.audio.activePresetIds[preset.kind] = findMatchingAudioPresetId(draft.audio, preset.kind);
      }
    });
  }

  public async importAudioPreset(): Promise<SystemSnapshot> {
    const selection = await dialog.showOpenDialog({
      title: 'Import audio preset',
      properties: ['openFile'],
      filters: [{ name: 'Switchboard audio preset', extensions: ['json'] }],
    });
    if (selection.canceled || !selection.filePaths[0]) return this.store.get();
    const source = await readFile(selection.filePaths[0], 'utf8');
    if (Buffer.byteLength(source, 'utf8') > 1_000_000) throw new Error('Audio preset files must be smaller than 1 MB.');
    const imported = audioPresetFileSchema.parse(JSON.parse(source));
    const snapshot = this.store.update((draft) => {
      const id = `user-${imported.preset.kind}-${randomUUID()}`;
      const preset = { ...structuredClone(imported.preset), id, builtIn: false };
      draft.audio.pathPresets.push(preset);
      applyAudioPathPreset(draft.audio, preset);
    });
    return this.configureAudioEngine(snapshot);
  }

  public async exportAudioPreset(input: AudioPresetIdInput): Promise<void> {
    const preset = this.store.get().audio.pathPresets.find((candidate) => candidate.id === input.presetId);
    if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
    const safeName = preset.name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'audio-preset';
    const selection = await dialog.showSaveDialog({
      title: 'Export audio preset',
      defaultPath: `${safeName}.json`,
      filters: [{ name: 'Switchboard audio preset', extensions: ['json'] }],
    });
    if (selection.canceled || !selection.filePath) return;
    const payload = audioPresetFileSchema.parse({ schemaVersion: 1, preset });
    await writeFile(selection.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  public setAudioChannelProcessor(input: SetAudioChannelProcessorInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const processing = draft.audio.channelProcessing.find((candidate) => candidate.busId === input.busId);
      if (!processing) throw new Error(`Unknown audio processing path: ${input.busId}`);
      if (input.processorId === 'equalizer') {
        processing.equalizer = {
          ...processing.equalizer,
          enabled: input.enabled ?? processing.equalizer.enabled,
          ...input.parameters,
        };
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
      const index = draft.audio.channelProcessing.indexOf(processing);
      draft.audio.channelProcessing[index] = channelProcessingSchema.parse(processing);
      draft.audio.activePresetIds[input.busId] = findMatchingAudioPresetId(draft.audio, input.busId);
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public async setAudioMonitoring(input: SetAudioMonitoringInput): Promise<SystemSnapshot> {
    const before = this.store.get();
    if (before.audio.capabilities.monitoring === 'unavailable') {
      throw new Error('Low-latency microphone monitoring is unavailable until Audio.Host owns the microphone stream.');
    }
    const nextDeviceId = input.deviceId ?? before.audio.monitoringDeviceId;
    const nextEnabled = input.enabled ?? before.audio.monitoringEnabled;
    const nextDevice = before.audio.devices.find((candidate) => candidate.id === nextDeviceId);
    if (nextEnabled && (!nextDevice?.available || nextDevice.direction !== 'output' || nextDevice.isSwitchboard)) {
      throw new Error('Select an available physical output before enabling microphone monitoring.');
    }
    const snapshot = this.store.update((draft) => {
      if (typeof input.enabled === 'boolean') draft.audio.monitoringEnabled = input.enabled;
      if (typeof input.level === 'number') draft.audio.monitoring = input.level;
      if (input.deviceId) {
        const device = draft.audio.devices.find((candidate) => candidate.id === input.deviceId);
        if (!device?.available || device.direction !== 'output') throw new Error('Select an available output device for monitoring.');
        draft.audio.monitoringDeviceId = input.deviceId;
      }
      draft.audio.activePresetIds.microphone = findMatchingAudioPresetId(draft.audio, 'microphone');
    });
    return this.configureAudioEngine(snapshot);
  }

  public async testMicrophone(): Promise<void> {
    const snapshot = this.store.get();
    if (snapshot.audio.capabilities.microphoneTest !== 'available') {
      throw new Error(snapshot.audio.host?.capabilities.reason ?? 'Microphone testing is unavailable with the current audio setup.');
    }
    await this.engines.request('audio', 'testMicrophone', undefined, 10_000);
  }

  public setChatMix(value: number): SystemSnapshot {
    const normalized = Math.max(-1, Math.min(1, value));
    const snapshot = this.store.update((draft) => {
      draft.audio.chatMix = normalized;
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
  }

  public async setMicProcessor(input: SetMicProcessorInput): Promise<SystemSnapshot> {
    const snapshot = this.store.update((draft) => {
      const processor = draft.audio.micProcessors.find((candidate) => candidate.id === input.processorId);
      if (!processor) throw new Error(`Unknown microphone processor: ${input.processorId}`);
      const index = draft.audio.micProcessors.indexOf(processor);
      draft.audio.micProcessors[index] = micProcessorSchema.parse({
        ...processor,
        enabled: input.enabled ?? processor.enabled,
        parameters: { ...processor.parameters, ...input.parameters },
      });
      draft.audio.activePresetIds.microphone = findMatchingAudioPresetId(draft.audio, 'microphone');
    });
    return this.configureAudioEngine(snapshot);
  }

  public async setCaptureConfig(input: Partial<CaptureConfig>): Promise<SystemSnapshot> {
    const before = this.store.get();
    const nextConfig = captureConfigSchema.parse({ ...before.capture.config, ...input });
    const requestedHotkey = input.hotkey;
    const hotkeyChanged = typeof requestedHotkey === 'string' && requestedHotkey !== before.capture.config.hotkey;

    if (hotkeyChanged) {
      this.registerCaptureShortcut(requestedHotkey, true);
    }
    const disabling = before.capture.config.enabled && !nextConfig.enabled;
    if (disabling) {
      if (this.captureRestartTimer) clearTimeout(this.captureRestartTimer);
      this.captureRestartTimer = null;
      this.captureRestartAttempts = 0;
      this.captureAudioIntegrationSignature = null;
      this.store.update((draft) => {
        draft.capture.config = nextConfig;
        draft.capture.runtime = {
          ...draft.capture.runtime,
          state: 'stopped',
          bufferedSeconds: 0,
          segmentCount: 0,
          replayCacheBytes: 0,
          observedBitrateBps: 0,
          activeSource: null,
          saveQueueDepth: 0,
          error: undefined,
          warning: draft.capture.runtime.warning?.includes('could not be registered')
            ? draft.capture.runtime.warning
            : undefined,
        };
        draft.capture.storage.replayCacheBytes = 0;
        const module = draft.modules.find((candidate) => candidate.id === 'capability.replay');
        if (module) module.enabled = false;
      });
    }
    try {
      if (!before.capture.config.enabled && nextConfig.enabled) await this.startCaptureEngine(nextConfig);
      if (disabling) await this.engines.stop('capture');
      if (before.capture.config.enabled && nextConfig.enabled) {
        const hostSnapshot = captureHostSnapshotSchema.parse(
          await this.engines.request('capture', 'configure', this.toHostSettings(nextConfig), 45_000),
        );
        this.captureAudioIntegrationSignature = this.getCaptureAudioIntegrationSignature(nextConfig);
        this.applyCaptureSnapshot(hostSnapshot);
      }
    } catch (operationError) {
      if (hotkeyChanged) this.registerCaptureShortcut(before.capture.config.hotkey, false);
      throw operationError;
    }

    const snapshot = this.store.update((draft) => {
      draft.capture.config = nextConfig;
      const module = draft.modules.find((candidate) => candidate.id === 'capability.replay');
      if (module) {
        module.installed = true;
        module.enabled = nextConfig.enabled;
      }
    });

    return snapshot;
  }

  public async saveReplay(): Promise<SystemSnapshot> {
    const snapshot = this.store.get();
    if (!snapshot.capture.config.enabled) {
      throw new Error('Enable Instant Replay before saving a clip.');
    }

    const response = await this.engines.request<WorkerSavedClip>(
      'capture',
      'saveReplay',
      { requestedAt: Date.now() },
      120_000,
    );
    const result = workerSavedClipSchema.parse(response);
    const clip: Clip = {
      id: randomUUID(),
      path: result.path,
      name: createDefaultClipTitle(result.game),
      ...(result.game ? { game: result.game } : {}),
      createdAt: result.createdAt,
      durationMs: result.durationMs,
      fileSize: result.fileSize,
      width: result.width,
      height: result.height,
      fps: result.fps,
      ...(result.codec ? { codec: result.codec } : {}),
      ...(result.thumbnailPath ? { thumbnailPath: result.thumbnailPath } : {}),
      favorite: false,
      titleEdited: false,
      canvasSize: 'original',
    };
    const updated = this.store.update((draft) => {
      draft.capture.runtime.lastSavedAt = new Date(result.createdAt).toISOString();
      draft.clips.unshift(clip);
      draft.capture.storage.clipsBytes = draft.clips.reduce((sum, candidate) => sum + candidate.fileSize, 0);
    });
    this.clipLibrary.enqueueThumbnail(clip, (enrichment) => {
      this.store.update((draft) => {
        const current = draft.clips.find((candidate) => candidate.id === clip.id);
        if (current) Object.assign(current, enrichment);
      });
    });
    return updated;
  }

  public async chooseClipDirectory(): Promise<SystemSnapshot> {
    const selection = await dialog.showOpenDialog({
      title: 'Choose Switchboard Clips folder',
      defaultPath: this.capturePaths.clipsDirectory,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (selection.canceled || selection.filePaths.length === 0) return this.store.get();
    const selected = selection.filePaths[0]!;
    const paths = await this.captureStorage.validate(selected);
    const before = this.store.get();
    if (before.capture.config.enabled) {
      const hostSnapshot = captureHostSnapshotSchema.parse(
        await this.engines.request(
          'capture',
          'configure',
          this.toHostSettings({ ...before.capture.config, clipsDirectory: selected }, paths),
          45_000,
        ),
      );
      this.applyCaptureSnapshot(hostSnapshot);
    }
    this.capturePaths = paths;
    const storage = await this.captureStorage.getStorageStatus(
      paths,
      before.clips.reduce((sum, clip) => sum + clip.fileSize, 0),
      before.capture.runtime.replayCacheBytes,
    );
    const snapshot = this.store.update((draft) => {
      draft.capture.config.clipsDirectory = selected;
      draft.capture.storage = storage;
    });
    void this.reconcileClipLibrary();
    return snapshot;
  }

  public async openClipsDirectory(): Promise<void> {
    this.capturePaths = await this.captureStorage.validate(this.store.get().capture.config.clipsDirectory);
    const result = await shell.openPath(this.capturePaths.clipsDirectory);
    if (result) throw new Error(result);
  }

  public async refreshCaptureSources(): Promise<SystemSnapshot> {
    const wasRunning = this.store.get().capture.config.enabled;
    if (!wasRunning) await this.engines.start('capture');
    try {
      const sources = z.array(captureSourceSchema).parse(
        await this.engines.request('capture', 'listSources', undefined, 15_000),
      );
      const orderedSources = orderCaptureSourcesByDisplayPosition(sources);
      const snapshot = this.store.update((draft) => { draft.capture.sources = orderedSources; }, { persist: false });
      await this.refreshCaptureSourceThumbnails(true);
      return snapshot;
    } finally {
      if (!wasRunning) await this.engines.stop('capture');
    }
  }

  public scanGames(): Promise<SystemSnapshot> {
    if (this.gameScan) return this.gameScan;
    this.gameScan = this.performGameScan();
    return this.gameScan;
  }

  public async addGame(): Promise<SystemSnapshot> {
    const selection = await dialog.showOpenDialog({
      title: 'Add a game executable',
      buttonLabel: 'Add game',
      properties: ['openFile'],
      filters: [{ name: 'Windows games', extensions: ['exe'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) return this.store.get();

    const game = await this.gameDiscovery.fromExecutable(selection.filePaths[0]!);
    const key = gameIdentityKey(game);
    const current = this.store.get();
    if (current.gameDetection.games.some((candidate) => gameIdentityKey(candidate) === key)) return current;
    return this.store.update((draft) => {
      draft.gameDetection.games.push(game);
      draft.gameDetection.games.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
      draft.gameDetection.error = undefined;
    });
  }

  public async updateSettings(input: UpdateSettingsInput): Promise<SystemSnapshot> {
    const automaticScanWasEnabled = this.store.get().settings.scanGamesAutomatically;
    const snapshot = this.store.update((draft) => {
      draft.settings = { ...draft.settings, ...input };
    });

    if (typeof input.launchAtStartup === 'boolean') {
      this.applyLoginItemSetting(input.launchAtStartup);
    }
    if (
      typeof input.automaticAppUpdates === 'boolean'
      || typeof input.automaticAppUpdateDownloads === 'boolean'
      || typeof input.installAppUpdatesOnNextStartup === 'boolean'
    ) {
      this.appUpdates.setPreferences(appUpdatePreferences(snapshot.settings));
    }
    if (input.scanGamesAutomatically === true && !automaticScanWasEnabled) {
      return this.scanGames();
    }
    return snapshot;
  }

  public async checkAppUpdates(): Promise<SystemSnapshot> {
    await this.appUpdates.checkForUpdates();
    return this.store.get();
  }

  public async downloadAppUpdate(): Promise<SystemSnapshot> {
    await this.appUpdates.downloadAvailableUpdate();
    return this.store.get();
  }

  public installAppUpdate(): void {
    this.appUpdates.installDownloadedUpdate();
  }

  public enableDemoUpdate(): SystemSnapshot {
    this.appUpdates.enableDemoUpdate();
    return this.store.get();
  }

  public async handoffFeedbackReport(input: FeedbackReportInput): Promise<FeedbackHandoffResult> {
    const environment: FeedbackEnvironment = {
      version: this.store.get().version,
      runtime: `Electron ${process.versions.electron ?? 'unknown'}`,
      platform: `${process.platform} ${process.arch}`,
      prototypeMode: this.store.get().prototypeMode,
    };
    let copied = true;
    try {
      clipboard.writeText(buildFeedbackClipboardText(input, environment));
    } catch {
      copied = false;
    }
    let opened = true;
    try {
      await shell.openExternal(buildFeedbackIssueUrl(input, environment));
    } catch {
      opened = false;
    }
    return { copied, opened };
  }

  public async resetSettings(scope: SettingsResetScope): Promise<SystemSnapshot> {
    if (scope === 'all' || scope === 'audio') await this.engines.stop('audio');
    if (scope === 'all' || scope === 'capture') await this.engines.stop('capture');

    let snapshot = this.store.update((draft) => {
      if (scope === 'all') {
        draft.settings = structuredClone(defaultSettings);
        draft.audio = createResetAudioState(draft.audio);
        draft.capture.config = structuredClone(defaultCaptureConfig);
        draft.gameDetection = structuredClone(defaultGameDetection);
        const audioModule = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (audioModule) audioModule.enabled = false;
        const captureModule = draft.modules.find((candidate) => candidate.id === 'capability.replay');
        if (captureModule) captureModule.enabled = false;
        return;
      }
      if (scope === 'general') {
        draft.settings.launchAtStartup = defaultSettings.launchAtStartup;
        draft.settings.closeToTray = defaultSettings.closeToTray;
        draft.settings.destroyRendererInTray = defaultSettings.destroyRendererInTray;
        draft.settings.automaticAppUpdates = defaultSettings.automaticAppUpdates;
      }
      if (scope === 'devices') {
        draft.settings.deviceAppearanceOverrides = {};
      }
      if (scope === 'audio') {
        draft.audio = createResetAudioState(draft.audio);
        const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (module) module.enabled = false;
      }
      if (scope === 'capture') {
        draft.capture.config = structuredClone(defaultCaptureConfig);
        const module = draft.modules.find((candidate) => candidate.id === 'capability.replay');
        if (module) module.enabled = false;
      }
      if (scope === 'games') {
        draft.settings.scanGamesAutomatically = defaultSettings.scanGamesAutomatically;
        draft.gameDetection = structuredClone(defaultGameDetection);
      }
      if (scope === 'modules') {
        draft.settings.automaticModuleUpdates = defaultSettings.automaticModuleUpdates;
      }
      if (scope === 'diagnostics') {
        draft.settings.performanceGuard = defaultSettings.performanceGuard;
        draft.settings.diagnosticsRetentionDays = defaultSettings.diagnosticsRetentionDays;
      }
    });
    if (scope === 'all' || scope === 'general') {
      this.appUpdates.setPreferences(appUpdatePreferences(snapshot.settings));
    }
    if (scope === 'all' || scope === 'capture') {
      this.capturePaths = await this.captureStorage.validate(defaultCaptureConfig.clipsDirectory);
      const storage = await this.captureStorage.getStorageStatus(
        this.capturePaths,
        snapshot.clips.reduce((sum, clip) => sum + clip.fileSize, 0),
        0,
      );
      this.registerCaptureShortcut(defaultCaptureConfig.hotkey, false);
      snapshot = this.store.update((draft) => { draft.capture.storage = storage; });
      void this.reconcileClipLibrary();
    }
    this.applyLoginItemSetting(snapshot.settings.launchAtStartup);
    return snapshot;
  }

  public async revealClip(id: string): Promise<void> {
    const knownClip = this.store.get().clips.find((clip) => clip.id === id);
    if (!knownClip) throw new Error('Rejected an unknown clip path.');
    if (!existsSync(knownClip.path)) throw new Error('The clip file no longer exists.');
    shell.showItemInFolder(knownClip.path);
  }

  public async deleteClip(id: string): Promise<SystemSnapshot> {
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    if (!existsSync(clip.path)) throw new Error('The clip file no longer exists.');
    await shell.trashItem(clip.path);
    await this.clipLibrary.removeThumbnail(clip);
    return this.store.update((draft) => {
      draft.clips = draft.clips.filter((candidate) => candidate.id !== id);
      draft.capture.storage.clipsBytes = draft.clips.reduce((sum, candidate) => sum + candidate.fileSize, 0);
    });
  }

  public async renameClip(input: RenameClipInput): Promise<SystemSnapshot> {
    const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    return this.store.update((draft) => {
      const index = draft.clips.findIndex((candidate) => candidate.id === input.id);
      if (index >= 0) {
        const current = draft.clips[index]!;
        const name = input.name.trim();
        draft.clips[index] = {
          ...current,
          name,
          titleEdited: name !== createDefaultClipTitle(clipGameLabel(current)),
        };
      }
    });
  }

  public setClipFavorite(input: SetClipFavoriteInput): SystemSnapshot {
    const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    return this.store.update((draft) => {
      const current = draft.clips.find((candidate) => candidate.id === input.id);
      if (current) current.favorite = input.favorite;
    });
  }

  public setClipTrim(input: SetClipTrimInput): SystemSnapshot {
    const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    if (input.endMs > clip.durationMs) throw new Error('The trim range exceeds the clip duration.');
    if (input.endMs - input.startMs < 100) throw new Error('Keep at least 0.1 seconds in the trim range.');
    for (const trim of input.audioTrackTrims ?? []) {
      if (!trim) continue;
      if (trim.endMs > clip.durationMs) throw new Error('An audio track trim exceeds the clip duration.');
      if (trim.endMs - trim.startMs < 100) throw new Error('Keep at least 0.1 seconds in each audio track trim range.');
    }
    return this.store.update((draft) => {
      const current = draft.clips.find((candidate) => candidate.id === input.id);
      if (!current) return;
      current.trimStartMs = input.startMs;
      current.trimEndMs = input.endMs < current.durationMs ? input.endMs : undefined;
      const audioTrackTrims = [...(input.audioTrackTrims ?? [])];
      while (audioTrackTrims.at(-1) === null) audioTrackTrims.pop();
      current.audioTrackTrims = audioTrackTrims.length > 0 ? audioTrackTrims : undefined;
    });
  }

  public setClipCanvasSize(input: SetClipCanvasSizeInput): SystemSnapshot {
    const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    return this.store.update((draft) => {
      const current = draft.clips.find((candidate) => candidate.id === input.id);
      if (current) current.canvasSize = input.canvasSize;
    });
  }

  public setClipAudioTrackLevel(input: SetClipAudioTrackLevelInput): SystemSnapshot {
    const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    return this.store.update((draft) => {
      const current = draft.clips.find((candidate) => candidate.id === input.id);
      if (!current) return;
      const levels = [...(current.audioTrackLevels ?? [])];
      while (levels.length <= input.trackIndex) levels.push(100);
      levels[input.trackIndex] = input.level;
      while (levels.at(-1) === 100) levels.pop();
      current.audioTrackLevels = levels.length > 0 ? levels : undefined;
    });
  }

  public async loadClipAudioWaveform(id: string) {
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    if (!existsSync(clip.path)) throw new Error('The clip file no longer exists.');
    return this.clipLibrary.loadAudioWaveform(clip);
  }

  public async exportClip(input: ExportClipInput): Promise<boolean> {
    const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    if (!existsSync(clip.path)) throw new Error('The clip file no longer exists.');
    if (input.endMs > clip.durationMs) throw new Error('The export range exceeds the clip duration.');
    if (input.endMs - input.startMs < 100) throw new Error('Keep at least 0.1 seconds in the export range.');
    for (const trim of input.audioTrackTrims ?? clip.audioTrackTrims ?? []) {
      if (!trim) continue;
      if (trim.endMs > clip.durationMs) throw new Error('An audio track trim exceeds the clip duration.');
      if (trim.endMs - trim.startMs < 100) throw new Error('Keep at least 0.1 seconds in each audio track trim range.');
    }
    const fullRange = input.startMs === 0 && input.endMs === clip.durationMs;
    const audioMixChanged = clip.audioTrackLevels?.some((level) => level !== 100) ?? false;
    const audioTrimChanged = (input.audioTrackTrims ?? clip.audioTrackTrims)?.some(Boolean) ?? false;
    const canCopyOriginal = input.preset === 'original' && fullRange && clip.canvasSize === 'original' && !audioMixChanged && !audioTrimChanged;
    const extension = canCopyOriginal ? extname(clip.path) || '.mp4' : '.mp4';
    const presetSuffix = input.preset === 'original'
      ? (fullRange ? (audioMixChanged || audioTrimChanged ? '-mixed' : '') : '-trimmed')
      : `-${input.preset}`;
    const canvasSuffix = clip.canvasSize === '9:16' ? '-9x16' : '';
    const selection = await dialog.showSaveDialog({
      title: 'Create share file',
      defaultPath: join(app.getPath('videos'), `${sanitizeClipBaseName(clip.name)}${canvasSuffix}${presetSuffix}${extension}`),
      filters: [{ name: 'Video', extensions: [extension.replace(/^\./, '')] }],
    });
    if (selection.canceled || !selection.filePath) return false;
    const destinationIsSource = resolve(selection.filePath).toLocaleLowerCase() === resolve(clip.path).toLocaleLowerCase();
    if (destinationIsSource && !canCopyOriginal) {
      throw new Error('Choose a different file name so the original clip stays intact.');
    }
    if (canCopyOriginal) {
      if (destinationIsSource) return true;
      await copyFile(clip.path, selection.filePath);
      return true;
    }
    try {
      await this.clipLibrary.renderExport(clip, selection.filePath, input);
    } catch (error) {
      await rm(selection.filePath, { force: true });
      throw error;
    }
    return true;
  }

  public getClipPath(id: string, thumbnail: boolean): string | null {
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip) return null;
    const path = thumbnail ? clip.thumbnailPath ?? null : clip.path;
    return path && existsSync(path) ? path : null;
  }

  public async getCaptureSourceThumbnail(id: string): Promise<Buffer | null> {
    const knownSource = this.store.get().capture.sources.find((source) => source.id === id);
    if (!knownSource || knownSource.type !== 'display') return null;
    await this.refreshCaptureSourceThumbnails(false);
    return this.captureSourceThumbnails.get(id) ?? null;
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    this.appUpdates.dispose();
    await this.initialization?.catch(() => undefined);
    if (this.audioRestartTimer) clearTimeout(this.audioRestartTimer);
    this.audioRestartTimer = null;
    if (this.captureRestartTimer) clearTimeout(this.captureRestartTimer);
    this.captureRestartTimer = null;
    this.captureAudioIntegrationUpdate = null;
    if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut);
    this.captureSourceThumbnails.clear();
    if (this.gameScan) await this.gameScan.catch(() => undefined);
    await this.devices.dispose();
    await this.engines.dispose();
    await this.store.flush();
  }

  private async performGameScan(): Promise<SystemSnapshot> {
    this.store.update((draft) => {
      draft.gameDetection.scanState = 'scanning';
      draft.gameDetection.warning = undefined;
      draft.gameDetection.error = undefined;
    }, { persist: false });

    try {
      const result = await this.gameDiscovery.scan();
      const previousGames = this.store.get().gameDetection.games;
      const preservedGames = result.warnings.length > 0
        ? previousGames
        : previousGames.filter((game) => game.source === 'manual');
      const previousByIdentity = new Map(previousGames.map((game) => [gameIdentityKey(game), game]));
      const byIdentity = new Map(result.games.map((game): [string, typeof game] => {
        const key = gameIdentityKey(game);
        const previous = previousByIdentity.get(key);
        return [key, {
          ...game,
          iconDataUrl: game.iconDataUrl ?? previous?.iconDataUrl,
        }];
      }));
      for (const game of preservedGames) {
        if (!byIdentity.has(gameIdentityKey(game))) byIdentity.set(gameIdentityKey(game), game);
      }
      return this.store.update((draft) => {
        draft.gameDetection.games = [...byIdentity.values()]
          .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
        draft.gameDetection.scanState = 'idle';
        draft.gameDetection.lastScanAt = new Date().toISOString();
        draft.gameDetection.warning = result.warnings.length > 0
          ? `${result.warnings.length} launcher ${result.warnings.length === 1 ? 'entry' : 'entries'} could not be read.`
          : undefined;
        draft.gameDetection.error = undefined;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.update((draft) => {
        draft.gameDetection.scanState = 'error';
        draft.gameDetection.error = `Game scan failed: ${message}`;
      }, { persist: false });
      throw error;
    } finally {
      this.gameScan = null;
    }
  }

  private async startAudioEngine(): Promise<void> {
    await this.engines.start('audio');
    try {
      const snapshot = audioHostSnapshotSchema.parse(
        await this.engines.request('audio', 'start', this.store.get().audio, 30_000),
      );
      this.applyAudioHostSnapshot(snapshot);
    } catch (error) {
      await this.engines.stop('audio');
      throw error;
    }
  }

  private async configureAudioEngine(snapshot: SystemSnapshot): Promise<SystemSnapshot> {
    if (!snapshot.audio.enabled) return snapshot;
    const hostSnapshot = audioHostSnapshotSchema.parse(
      await this.engines.request('audio', 'configure', snapshot.audio, 30_000),
    );
    this.applyAudioHostSnapshot(hostSnapshot);
    return this.store.get();
  }

  private async startCaptureEngine(config: CaptureConfig): Promise<void> {
    this.capturePaths = await this.captureStorage.validate(config.clipsDirectory);
    const storage = await this.captureStorage.getStorageStatus(
      this.capturePaths,
      this.store.get().clips.reduce((sum, clip) => sum + clip.fileSize, 0),
      0,
    );
    if (storage.criticalSpace) throw new Error(storage.warning ?? 'Not enough disk space to start Instant Replay.');
    this.store.update((draft) => { draft.capture.storage = storage; }, { persist: false });
    await this.engines.start('capture');
    try {
      const hostSnapshot = captureHostSnapshotSchema.parse(
        await this.engines.request('capture', 'start', this.toHostSettings(config), 60_000),
      );
      this.captureAudioIntegrationSignature = this.getCaptureAudioIntegrationSignature(config);
      this.applyCaptureSnapshot(hostSnapshot);
    } catch (error) {
      await this.engines.stop('capture');
      throw error;
    }
  }

  private async refreshCaptureSourceThumbnails(force: boolean): Promise<void> {
    if (this.captureSourceThumbnailRefresh) return this.captureSourceThumbnailRefresh;
    const now = Date.now();
    if (!force && now - this.captureSourceThumbnailsRefreshedAt < captureSourceThumbnailRefreshMinimumIntervalMs) return;

    this.captureSourceThumbnailRefresh = (async () => {
      const sources = this.store.get().capture.sources.filter((source) => source.type === 'display');
      if (sources.length === 0) {
        this.captureSourceThumbnails.clear();
        this.captureSourceThumbnailsRefreshedAt = Date.now();
        return;
      }

      const nativeSources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 320, height: 180 },
      });
      const next = new Map<string, Buffer>();
      for (const source of sources) {
        const nativeSource = matchDesktopCaptureSource(source, nativeSources);
        if (!nativeSource || nativeSource.thumbnail.isEmpty()) continue;
        next.set(source.id, nativeSource.thumbnail.toPNG());
      }
      this.captureSourceThumbnails.clear();
      for (const [id, thumbnail] of next) this.captureSourceThumbnails.set(id, thumbnail);
      this.captureSourceThumbnailsRefreshedAt = Date.now();
    })().catch((error) => {
      console.warn('Capture source thumbnails could not be refreshed.', error);
    }).finally(() => {
      this.captureSourceThumbnailRefresh = null;
    });
    return this.captureSourceThumbnailRefresh;
  }

  private applyLoginItemSetting(enabled: boolean): void {
    if (!['win32', 'darwin'].includes(process.platform)) return;
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    } catch (error) {
      console.warn('Failed to update launch-at-startup state.', error);
    }
  }

  private applyEngineStatus(status: EngineStatus): void {
    this.store.update(
      (draft) => {
        const index = draft.engines.findIndex((engine) => engine.kind === status.kind);
        if (index >= 0) draft.engines[index] = status;
        else draft.engines.push(status);

        if (status.kind === 'capture' && status.state === 'error') {
          draft.capture.runtime.state = 'error';
          draft.capture.runtime.error = status.message ?? 'Capture.Host exited unexpectedly.';
        } else if (status.kind === 'capture' && status.state === 'stopped') {
          draft.capture.runtime = {
            ...draft.capture.runtime,
            state: 'stopped',
            bufferedSeconds: 0,
            segmentCount: 0,
            replayCacheBytes: 0,
            observedBitrateBps: 0,
            activeSource: null,
            saveQueueDepth: 0,
          };
          draft.capture.storage.replayCacheBytes = 0;
        } else if (status.kind === 'audio' && status.state !== 'running') {
          draft.audio.capabilities = {
            virtualChannels: 'unavailable',
            applicationRouting: 'unavailable',
            channelDsp: 'unavailable',
            microphoneDsp: 'unavailable',
            noiseSuppression: 'unavailable',
            realtimeMetering: 'unavailable',
            microphoneTest: 'unavailable',
            monitoring: 'unavailable',
            spatialAudio: 'unavailable',
          };
          draft.audio.host = null;
          draft.audio.applications = [];
          for (const bus of draft.audio.buses) bus.appCount = 0;
        }
      },
      { persist: false },
    );
    if (status.kind === 'capture' && status.state === 'error') {
      this.scheduleCaptureHostRecovery(status.message);
    } else if (status.kind === 'audio' && status.state === 'error') {
      this.scheduleAudioHostRecovery(status.message);
    }
    if (status.kind === 'audio' && (status.state === 'stopped' || status.state === 'error')) {
      this.scheduleCaptureAudioIntegrationSync();
    }
  }

  private async initializeCaptureStorage(): Promise<void> {
    const snapshot = this.store.get();
    try {
      this.capturePaths = await this.captureStorage.validate(snapshot.capture.config.clipsDirectory);
      const storage = await this.captureStorage.getStorageStatus(
        this.capturePaths,
        snapshot.clips.reduce((sum, clip) => sum + clip.fileSize, 0),
        0,
      );
      this.store.update((draft) => { draft.capture.storage = storage; });
    } catch (storageError) {
      const paths = this.captureStorage.resolvePaths(snapshot.capture.config.clipsDirectory);
      const message = `Clips storage is unavailable: ${storageError instanceof Error ? storageError.message : String(storageError)}`;
      this.store.update((draft) => {
        draft.capture.config.enabled = false;
        draft.capture.runtime.state = 'error';
        draft.capture.runtime.error = message;
        draft.capture.storage = {
          clipsDirectory: paths.clipsDirectory,
          cacheDirectory: paths.cacheDirectory,
          availableBytes: 0,
          volumeTotalBytes: 0,
          volumeAvailableBytes: 0,
          clipsBytes: draft.clips.reduce((sum, clip) => sum + clip.fileSize, 0),
          replayCacheBytes: 0,
          lowSpace: false,
          criticalSpace: false,
          warning: message,
        };
      });
    }
  }

  private async reconcileClipLibrary(): Promise<void> {
    const before = this.store.get();
    try {
      const clips = await this.clipLibrary.reconcile(before.clips, this.capturePaths.clipsDirectory);
      this.store.update((draft) => {
        draft.clips = clips;
        draft.capture.storage.clipsBytes = clips.reduce((sum, clip) => sum + clip.fileSize, 0);
      });
      for (const clip of clips.filter((candidate) => this.clipLibrary.needsEnrichment(candidate))) {
        this.clipLibrary.enqueueThumbnail(clip, (enrichment) => {
          this.store.update((draft) => {
            const current = draft.clips.find((candidate) => candidate.id === clip.id);
            if (current) Object.assign(current, enrichment);
          });
        });
      }
    } catch (reconcileError) {
      this.store.update((draft) => {
        draft.capture.storage.warning = `Clip library reconciliation failed: ${reconcileError instanceof Error ? reconcileError.message : String(reconcileError)}`;
      }, { persist: false });
    }
  }

  private toHostSettings(config: CaptureConfig, paths = this.capturePaths): Record<string, unknown> {
    const audio = this.store.get().audio;
    const switchboardAudioReady = audio.enabled
      && audio.host?.running === true
      && audio.capabilities.virtualChannels === 'available';
    const processedMicrophone = audio.host?.driver.endpoints.find((endpoint) => (
      endpoint.flow === 'capture' && endpoint.name === 'Switchboard Audio - Microphone'
    ));
    return {
      ...config,
      ...getEncodingPreset(config),
      cacheDirectory: paths.cacheDirectory,
      clipsDirectory: paths.clipsDirectory,
      thumbnailDirectory: paths.thumbnailDirectory,
      clipMixPipeName: switchboardAudioReady && config.includeSystemAudio ? 'switchboard-audio-clip-v1' : null,
      processedMicrophoneDeviceId: switchboardAudioReady && config.includeMic ? processedMicrophone?.id ?? null : null,
      audioFallbackReason: switchboardAudioReady || (!config.includeSystemAudio && !config.includeMic)
        ? null
        : 'Switchboard audio routing is unavailable; replay audio is using the current Windows default devices.',
    };
  }

  private getCaptureAudioIntegrationSignature(config: CaptureConfig): string {
    const settings = this.toHostSettings(config);
    return JSON.stringify([
      settings.clipMixPipeName ?? null,
      settings.processedMicrophoneDeviceId ?? null,
      settings.audioFallbackReason ?? null,
    ]);
  }

  private scheduleCaptureAudioIntegrationSync(): void {
    if (this.disposed || this.captureAudioIntegrationUpdate) return;
    const snapshot = this.store.get();
    if (!snapshot.capture.config.enabled) {
      this.captureAudioIntegrationSignature = null;
      return;
    }
    const captureEngine = snapshot.engines.find((engine) => engine.kind === 'capture');
    if (captureEngine?.state !== 'running') return;
    const signature = this.getCaptureAudioIntegrationSignature(snapshot.capture.config);
    if (signature === this.captureAudioIntegrationSignature) return;

    const previousSignature = this.captureAudioIntegrationSignature;
    this.captureAudioIntegrationSignature = signature;
    this.captureAudioIntegrationUpdate = this.engines.request(
      'capture',
      'configure',
      this.toHostSettings(snapshot.capture.config),
      45_000,
    ).then((raw) => {
      this.applyCaptureSnapshot(captureHostSnapshotSchema.parse(raw));
    }).catch((integrationError) => {
      this.captureAudioIntegrationSignature = previousSignature;
      if (this.disposed) return;
      this.store.update((draft) => {
        draft.capture.runtime.warning = `Replay audio could not follow the current Switchboard route: ${integrationError instanceof Error ? integrationError.message : String(integrationError)}`;
      }, { persist: false });
    }).finally(() => {
      this.captureAudioIntegrationUpdate = null;
      if (this.getCaptureAudioIntegrationSignature(this.store.get().capture.config) !== this.captureAudioIntegrationSignature) {
        this.scheduleCaptureAudioIntegrationSync();
      }
    });
  }

  private applyEngineEvent(kind: 'audio' | 'capture', event: string, payload: unknown): void {
    if (kind === 'audio') {
      if (event === 'audioSnapshot') {
        const parsed = audioHostSnapshotSchema.safeParse(payload);
        if (parsed.success) this.applyAudioHostSnapshot(parsed.data);
        else console.warn('Audio.Host sent an invalid snapshot.', parsed.error);
      }
      return;
    }
    if (kind !== 'capture') return;
    if (event === 'captureSnapshot') {
      const parsed = captureHostSnapshotSchema.safeParse(payload);
      if (parsed.success) this.applyCaptureSnapshot(parsed.data);
      else console.warn('Capture.Host sent an invalid snapshot.', parsed.error);
      return;
    }
    if (event === 'fatalCaptureError') {
      const parsed = z.object({ message: z.string() }).safeParse(payload);
      if (parsed.success) {
        this.store.update((draft) => {
          draft.capture.runtime.state = 'error';
          draft.capture.runtime.error = parsed.data.message;
        }, { persist: false });
      }
    }
  }

  private applyAudioHostSnapshot(snapshot: AudioHostSnapshot): void {
    if (snapshot.running) this.audioRestartAttempts = 0;
    this.store.update((draft) => {
      draft.audio.host = snapshot;
      draft.audio.capabilities = { ...snapshot.capabilities };
      draft.audio.applications = snapshot.applications;
      const applicationCounts = new Map(snapshot.buses.map((bus) => [bus.id, bus.applicationCount]));
      for (const bus of draft.audio.buses) bus.appCount = applicationCounts.get(bus.id) ?? 0;
    }, { persist: false });
    this.scheduleCaptureAudioIntegrationSync();
  }

  private scheduleAudioHostRecovery(reason?: string): void {
    if (this.disposed || this.audioRestartTimer || !this.store.get().audio.enabled) return;
    if (this.audioRestartAttempts >= 3) {
      this.store.update((draft) => {
        draft.audio.capabilities.reason = 'Audio.Host failed repeatedly. Automatic recovery stopped; disable and re-enable Audio to retry.';
      }, { persist: false });
      return;
    }

    this.audioRestartAttempts += 1;
    const attempt = this.audioRestartAttempts;
    const delayMs = attempt * 1_000;
    this.store.update((draft) => {
      draft.audio.capabilities.reason = `Audio.Host stopped unexpectedly${reason ? `: ${reason}` : ''}. Recovery attempt ${attempt} of 3.`;
    }, { persist: false });
    this.audioRestartTimer = setTimeout(() => {
      this.audioRestartTimer = null;
      if (this.disposed || !this.store.get().audio.enabled) return;
      void this.startAudioEngine().catch((restartError) => {
        this.store.update((draft) => {
          draft.audio.capabilities.reason = restartError instanceof Error ? restartError.message : String(restartError);
        }, { persist: false });
        this.scheduleAudioHostRecovery();
      });
    }, delayMs);
  }

  private applyCaptureSnapshot(snapshot: CaptureHostSnapshot): void {
    if (snapshot.runtime.state === 'buffering' || snapshot.runtime.state === 'waiting') {
      this.captureRestartAttempts = 0;
    }
    this.store.update((draft) => {
      const shortcutRegistered = draft.capture.runtime.shortcutRegistered;
      draft.capture.runtime = { ...snapshot.runtime, shortcutRegistered };
      draft.capture.storage = snapshot.storage;
      draft.capture.capabilities = snapshot.capabilities;
      draft.capture.sources = orderCaptureSourcesByDisplayPosition(snapshot.sources);
    }, { persist: false });
  }

  private scheduleCaptureHostRecovery(reason?: string): void {
    if (this.disposed || this.captureRestartTimer || !this.store.get().capture.config.enabled) return;
    if (this.captureRestartAttempts >= 3) {
      this.store.update((draft) => {
        draft.capture.runtime.state = 'error';
        draft.capture.runtime.error = 'Capture.Host failed repeatedly. Instant Replay was left enabled but automatic recovery stopped.';
      }, { persist: false });
      return;
    }

    this.captureRestartAttempts += 1;
    const delayMs = this.captureRestartAttempts * 1_000;
    this.store.update((draft) => {
      draft.capture.runtime.state = 'recovering';
      draft.capture.runtime.warning = `Capture.Host stopped unexpectedly${reason ? `: ${reason}` : ''}. Recovery attempt ${this.captureRestartAttempts} of 3.`;
      draft.capture.runtime.error = undefined;
    }, { persist: false });
    this.captureRestartTimer = setTimeout(() => {
      this.captureRestartTimer = null;
      if (this.disposed || !this.store.get().capture.config.enabled) return;
      void this.startCaptureEngine(this.store.get().capture.config).catch((restartError) => {
        this.store.update((draft) => {
          draft.capture.runtime.state = 'recovering';
          draft.capture.runtime.warning = restartError instanceof Error ? restartError.message : String(restartError);
        }, { persist: false });
        this.scheduleCaptureHostRecovery();
      });
    }, delayMs);
  }

  private registerCaptureShortcut(accelerator: string, throwOnFailure: boolean): void {
    if (this.registeredShortcut === accelerator) return;
    let registered = false;
    let registrationError: unknown;
    try {
      registered = globalShortcut.register(accelerator, () => {
        void this.saveReplay().catch((shortcutError) => {
          this.store.update((draft) => {
            draft.capture.runtime.warning = shortcutError instanceof Error ? shortcutError.message : String(shortcutError);
          }, { persist: false });
        });
      });
    } catch (error) {
      registrationError = error;
    }
    if (!registered) {
      const detail = registrationError instanceof Error ? ` ${registrationError.message}` : '';
      const message = `${accelerator} could not be registered.${detail || ' Another application may already use it.'}`;
      this.store.update((draft) => {
        draft.capture.runtime.shortcutRegistered = this.registeredShortcut !== null;
        draft.capture.runtime.warning = message;
      }, { persist: false });
      if (throwOnFailure) throw new Error(message);
      return;
    }
    if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut);
    this.registeredShortcut = accelerator;
    this.store.update((draft) => {
      draft.capture.runtime.shortcutRegistered = true;
      if (draft.capture.runtime.warning?.includes('could not be registered')) draft.capture.runtime.warning = undefined;
    }, { persist: false });
  }

  private emitAudioMeters(frame: AudioMeterFrame): void {
    for (const listener of this.audioMeterListeners) listener(frame);
  }
}

function appUpdatePreferences(settings: SystemSnapshot['settings']): AppUpdatePreferences {
  return {
    automaticChecks: settings.automaticAppUpdates,
    automaticDownloads: settings.automaticAppUpdateDownloads,
    installOnNextStartup: settings.installAppUpdatesOnNextStartup,
  };
}

function matchDesktopCaptureSource(
  source: SystemSnapshot['capture']['sources'][number],
  nativeSources: DesktopCapturerSource[],
): DesktopCapturerSource | undefined {
  if (source.type === 'display') {
    const displays = nativeSources.filter((candidate) => candidate.id.startsWith('screen:'));
    const displayIndex = Number(source.displayId ?? source.id.replace(/^display:/, ''));
    const windowsDisplay = captureIndexedDisplays()[displayIndex];
    return displays.find((candidate) => candidate.display_id === String(windowsDisplay?.id)) ?? displays[displayIndex];
  }
  return undefined;
}

function orderCaptureSourcesByDisplayPosition(sources: CaptureSource[]): CaptureSource[] {
  const windowsDisplays = captureIndexedDisplays();
  const displaySources = sources
    .filter((source) => source.type === 'display')
    .map((source) => {
      const displayIndex = Number(source.displayId ?? source.id.replace(/^display:/, ''));
      const bounds = windowsDisplays[displayIndex]?.bounds;
      return { source, x: bounds?.x ?? displayIndex, y: bounds?.y ?? 0 };
    })
    .sort((left, right) => left.x - right.x || left.y - right.y)
    .map(({ source }) => source);
  return [
    ...sources.filter((source) => source.type === 'automatic-game'),
    ...displaySources,
    ...sources.filter((source) => source.type === 'window'),
  ];
}

function captureIndexedDisplays(): Display[] {
  const primary = screen.getPrimaryDisplay();
  return [
    primary,
    ...screen.getAllDisplays()
      .filter((display) => display.id !== primary.id)
      .sort((left, right) => left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y),
  ];
}

function createResetAudioState(current: SystemSnapshot['audio']): SystemSnapshot['audio'] {
  const reset = structuredClone(defaultAudio);
  reset.devices = structuredClone(current.devices);
  reset.pathPresets = [
    ...structuredClone(defaultAudio.pathPresets),
    ...structuredClone(current.pathPresets.filter((preset) => !preset.builtIn)),
  ];

  const availableDeviceIds = new Set(reset.devices.map((device) => device.id));
  for (const bus of reset.buses) {
    if (availableDeviceIds.has(bus.deviceId)) continue;
    const currentBus = current.buses.find((candidate) => candidate.id === bus.id);
    if (currentBus && availableDeviceIds.has(currentBus.deviceId)) bus.deviceId = currentBus.deviceId;
  }

  reconcileAudioDevices(reset, current.devices);
  for (const kind of ['game', 'chat', 'media', 'microphone'] as const) {
    const defaultId = defaultAudio.activePresetIds[kind];
    reset.activePresetIds[kind] = defaultId && reset.pathPresets.some((preset) => preset.id === defaultId)
      ? defaultId
      : null;
  }
  return reset;
}
