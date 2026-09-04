import { debugDiagnostics } from './services/debug-diagnostics';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';
import {
  app,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  screen,
  shell,
  type DesktopCapturerSource,
  type Display,
} from 'electron';
import { z } from 'zod';
import projectPackage from '../../package.json';
import {
  captureConfigSchema,
  captureHostSnapshotSchema,
  captureSourceSchema,
  autoCaptureSettingsPatchSchema,
  autoCaptureSettingsSchema,
  audioHostSnapshotSchema,
  audioPresetFileSchema,
  channelProcessingSchema,
  micProcessorSchema,
  type AudioPathId,
  type AudioPresetIdInput,
  type AudioMeterFrame,
  type AudioHostSnapshot,
  type ApplyAudioPresetInput,
  type AutoCaptureSettingsPatch,
  type AutoCaptureTestEventInput,
  type CaptureConfig,
  type CaptureHostSnapshot,
  type CaptureSource,
  type Clip,
  type ClipAudioChannel,
  type ClipExportProgress,
  type CreateModuleProjectInput,
  type ExportClipInput,
  type ExportMontageInput,
  type FeedbackHandoffResult,
  type FeedbackReportInput,
  type EngineStatus,
  type GameEvent,
  type MarkClipsReviewedInput,
  type ModuleProjectIdInput,
  type PrepareClipShareInput,
  type PreparedShareFile,
  type CreateAudioPresetInput,
  type RenameAudioPresetInput,
  type RenameClipInput,
  type SetClipCanvasSizeInput,
  type SetClipAudioTrackLevelInput,
  type SetClipFavoriteInput,
  type SetClipTrimInput,
  type SetCaptureConfigInput,
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
import { defaultAudio, defaultAutoCapture, defaultCaptureConfig, defaultDevices, defaultGameDetection, defaultSettings } from '../shared/defaults';
import {
  applyAudioPathPreset,
  findMatchingAudioPresetId,
  snapshotAudioPathPreset,
} from '../shared/audio-presets';
import { resolveDeviceVariant } from '../shared/device-variant';
import { resolveProductAsset } from '../shared/product-assets';
import { getEncodingPreset, sanitizeClipBaseName } from '../shared/capture-presets';
import { clipGameLabel, createDefaultClipTitle } from '../shared/clip-library';
import { applyClipTrackLevel, hasEffectiveClipMixChanged } from '../shared/clip-track-levels';
import type { FeedbackEnvironment } from '../shared/feedback-report';
import { reconcileAudioDevices } from '../shared/audio-devices';
import { CaptureStorageService, type CapturePaths } from './services/capture-storage';
import { ClipLibraryService, selectShareVideoEncoder } from './services/clip-library';
import { AudioEndpointDiscovery } from './services/audio-endpoint-discovery';
import { AppUpdateService, type AppUpdatePreferences } from './services/app-update-service';
import { DeviceRegistry } from './services/device-registry';
import { EngineSupervisor } from './services/engine-supervisor';
import { GameDiscoveryService, gameIdentityKey } from './services/game-discovery';
import { performFeedbackHandoff } from './services/feedback-handoff';
import { StateStore } from './services/state-store';
import { PerformanceMonitor } from './services/performance-monitor';
import { ResourceJournal } from './services/resource-journal';
import {
  AudioMeterDemandGate,
  AudioSnapshotUpdateGate,
  CaptureSnapshotUpdateGate,
  isMaterialEngineStatusChange,
} from './services/runtime-update-gates';
import { getPreparedShareService } from './services/prepared-share';
import { AutoCaptureEngine, type AutoCapturePreserveRequest } from './autocapture/auto-capture-engine';
import { AutoCaptureRegistry } from './autocapture/registry';
import { AutoCaptureCoordinator } from './autocapture/coordinator';
import { TestEventProvider } from './autocapture/providers/test-event-provider';
import { CS2Provider } from './autocapture/providers/cs2/cs2-provider';
import { WarThunderProvider } from './autocapture/providers/war-thunder/war-thunder-provider';
import {
  desktopCaptureRequestsForSources,
  matchDesktopCaptureSource,
  onlySourcesAvailableToElectron,
  preserveValidatedWindowSources,
} from './capture-source-previews';
import { WardogsProvider } from './autocapture/providers/wardogs/wardogs-provider';
import { Battlefield6Provider } from './autocapture/providers/battlefield-6/battlefield-6-provider';
import type { OverwolfRuntimeHost } from './autocapture/providers/battlefield-6/overwolf-gep-session';
import { autoCaptureTitle, markersForClip } from './autocapture/capture-window-planner';
import { resolveCaptureChatAudioDeviceId, resolveCaptureMicrophoneDeviceId, resolveCaptureSystemAudioDeviceId } from './capture-microphone-routing';
import {
  createModuleProject as scaffoldModuleProject,
  moduleManifestFromProject,
  validateModuleProject,
  type ModuleProjectValidation,
} from './services/module-authoring';
import { SandboxedDeviceAddon } from './modules/sandboxed-device-addon';

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
  captureStartedAt: z.number().int().nonnegative().nullable().optional(),
  captureEndedAt: z.number().int().nonnegative().nullable().optional(),
});
const workerReactionDetectionSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  levelDb: z.number().min(-120).max(0),
  baselineDb: z.number().min(-120).max(0),
}).strict();

type WorkerSavedClip = z.infer<typeof workerSavedClipSchema>;
const audioEndpointRefreshMinimumIntervalMs = 10_000;
const captureSourceThumbnailRefreshMinimumIntervalMs = 10_000;
const reactionClippingProviderId = 'microphone-reaction';

function sameAudioChannels(left: readonly ClipAudioChannel[] | undefined, right: readonly ClipAudioChannel[]): boolean {
  return left?.length === right.length && left.every((channel, index) => channel === right[index]);
}

type AppControllerOptions = {
  demoUpdate?: boolean;
  onUpdateInstallRequested?: (installing: boolean) => void;
  getRendererRuntime?: () => Promise<unknown>;
};

export class AppController {
  private readonly store: StateStore;
  private readonly engines: EngineSupervisor;
  private readonly devices: DeviceRegistry;
  private readonly audioMeterListeners = new Set<(frame: AudioMeterFrame) => void>();
  private readonly clipExportProgressListeners = new Set<(progress: ClipExportProgress) => void>();
  private readonly captureStorage: CaptureStorageService;
  private readonly clipLibrary: ClipLibraryService;
  private readonly audioEndpointDiscovery: AudioEndpointDiscovery;
  private readonly gameDiscovery: GameDiscoveryService;
  private readonly appUpdates: AppUpdateService;
  private readonly performance: PerformanceMonitor;
  private readonly resourceJournal: ResourceJournal;
  private readonly appliedEngineStatuses = new Map<EngineStatus['kind'], EngineStatus>();
  private readonly audioSnapshotUpdateGate = new AudioSnapshotUpdateGate();
  private readonly audioMeterDemandGate = new AudioMeterDemandGate();
  private readonly captureSnapshotUpdateGate = new CaptureSnapshotUpdateGate();
  private readonly autoCaptureRegistry: AutoCaptureRegistry;
  private readonly autoCaptureEngine: AutoCaptureEngine;
  private readonly autoCaptureCoordinator: AutoCaptureCoordinator;
  private readonly testEventProvider: TestEventProvider;
  private readonly localDeviceModules = new Map<string, SandboxedDeviceAddon>();
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
  private readonly validatedCaptureWindowSourceIds = new Set<string>();
  private captureSourceThumbnailRefresh: Promise<void> | null = null;
  private captureSourceThumbnailsRefreshedAt = 0;
  private gameScan: Promise<SystemSnapshot> | null = null;
  private readonly activeClipExports = new Map<string, AbortController>();
  private snapshotPreparation: Promise<void> | null = null;
  private initialization: Promise<void> | null = null;
  private disposed = false;
  private rendererActive = true;

  public constructor(options: AppControllerOptions = {}) {
    this.store = new StateStore(join(app.getPath('userData'), 'switchboard-state.json'));
    this.resourceJournal = new ResourceJournal({
      directory: join(app.getPath('userData'), 'diagnostics', 'resources'),
      getRetentionDays: () => this.store.get().settings.diagnosticsRetentionDays,
    });
    this.appUpdates = new AppUpdateService({
      currentVersion: currentCoreVersion(),
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
      { additionalModules: () => [...this.localDeviceModules.values()] },
    );
    this.performance = new PerformanceMonitor({
      getProcessMetrics: () => app.getAppMetrics(),
      getContext: () => ({
        rendererActive: this.rendererActive,
        guardEnabled: this.store.getPerformanceGuardEnabled(),
        detailedDiagnostics: this.store.getDetailedDiagnosticsEnabled(),
        engines: (['audio', 'capture'] as const).map((kind) => this.engines.getStatus(kind)),
      }),
      publish: (performance) => { this.store.setPerformance(performance); },
      getRendererRuntime: options.getRendererRuntime,
      recordSample: (sample) => this.resourceJournal.record(sample),
    });
    const autoCaptureLog = (
      event: string,
      fields: Readonly<Record<string, string | number | boolean | null>> = {},
    ) => {
      const details = Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ');
      console.info(`[autocapture] ${event}${details ? ` ${details}` : ''}`);
    };
    this.autoCaptureRegistry = new AutoCaptureRegistry(autoCaptureLog);
    this.testEventProvider = new TestEventProvider();
    this.autoCaptureRegistry.register(new CS2Provider(join(app.getPath('userData'), 'autocapture', 'cs2-gsi-token')));
    this.autoCaptureRegistry.register(new Battlefield6Provider({
      runtime: app as unknown as OverwolfRuntimeHost,
      gameEventsEnabled: process.env.SWITCHBOARD_BF6_OVERWOLF_ENABLED === '1',
    }));
    this.autoCaptureRegistry.register(new WarThunderProvider());
    this.autoCaptureRegistry.register(new WardogsProvider());
    this.autoCaptureRegistry.register(this.testEventProvider);
    this.autoCaptureEngine = new AutoCaptureEngine({
      getSettings: () => this.store.get().capture.autoCapture.settings,
      getMaximumWindowMs: () => this.store.get().capture.config.replaySeconds * 1_000,
      preserve: (request) => this.preserveAutoCaptureWindow(request),
      onRuntime: (runtime) => {
        this.store.update((draft) => { draft.capture.autoCapture.runtime = runtime; }, { persist: false });
      },
      log: autoCaptureLog,
    });
    this.autoCaptureCoordinator = new AutoCaptureCoordinator({
      registry: this.autoCaptureRegistry,
      engine: this.autoCaptureEngine,
      testProvider: this.testEventProvider,
      getSettings: () => this.store.get().capture.autoCapture.settings,
      includeDevelopmentProviders: () => this.store.get().prototypeMode,
      onProvidersChanged: (providers) => {
        this.store.update((draft) => { draft.capture.autoCapture.providers = providers; }, { persist: false });
      },
    });
  }

  public initialize(): Promise<void> {
    this.initialization ??= this.initializeOnce();
    return this.initialization;
  }

  public prepareSnapshot(): Promise<void> {
    this.snapshotPreparation ??= this.prepareSnapshotOnce();
    return this.snapshotPreparation;
  }

  private async prepareSnapshotOnce(): Promise<void> {
    await this.store.load();
    if (this.disposed) return;
    if (process.env.SWITCHBOARD_NATIVE_FIXTURES === '1') {
      this.store.update((draft) => {
        draft.devices = structuredClone(defaultDevices);
      }, { persist: false });
    } else {
      this.devices.removeLegacyFixtures();
    }
    this.store.update((draft) => {
      draft.version = currentCoreVersion();
      draft.prototypeMode = !app.isPackaged;
    }, { persist: false });
  }

  private async initializeOnce(): Promise<void> {
    await this.prepareSnapshot();
    if (this.disposed) return;
    debugDiagnostics.setEnabled(this.store.getDetailedDiagnosticsEnabled());
    this.performance.start();
    await this.appUpdates.initialize(appUpdatePreferences(this.store.get().settings));
    if (this.disposed) return;
    await this.loadPersistedLocalModules();
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
    await this.autoCaptureCoordinator.initialize(this.store.get().gameDetection.games);
    if (this.disposed) return;
    this.registerCaptureShortcut(snapshot.capture.config.hotkey, false);
    void this.reconcileClipLibrary();

    const starts: Promise<unknown>[] = [];
    if (snapshot.audio.enabled && snapshot.settings.developerMode === true) {
      starts.push(this.startAudioEngine());
    } else if (snapshot.audio.enabled) {
      this.store.update((draft) => {
        draft.audio.enabled = false;
        const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (module) module.enabled = false;
      });
    }
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

  public subscribeClipExportProgress(listener: (progress: ClipExportProgress) => void): () => void {
    this.clipExportProgressListeners.add(listener);
    return () => this.clipExportProgressListeners.delete(listener);
  }

  public setRendererActive(active: boolean): SystemSnapshot {
    if (this.rendererActive === active) return this.store.get();
    this.rendererActive = active;
    if (this.audioMeterDemandGate.setRendererActive(active)) this.syncAudioMeterDemand();
    if (active) void this.refreshAudioDevices();
    this.performance.refresh();
    return this.store.get();
  }

  public setAudioMeteringRequested(requested: boolean): void {
    if (this.audioMeterDemandGate.setRendererRequested(requested)) this.syncAudioMeterDemand();
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

    if (module.source === 'local') {
      if (input.enabled && !['ready', 'active'].includes(module.development?.status ?? 'invalid')) {
        await this.validateModuleProject({ moduleId: input.moduleId });
        const validated = this.store.get().modules.find((candidate) => candidate.id === input.moduleId);
        if (!validated || validated.development?.status !== 'ready') {
          throw new Error(`${module.name} must pass validation before it can be enabled.`);
        }
      }
      this.store.update((draft) => {
        const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
        if (!target?.development) throw new Error(`Local module metadata is missing for ${input.moduleId}.`);
        target.enabled = input.enabled;
        target.development.status = 'ready';
        target.development.issues = target.development.issues.filter((issue) => issue.code !== 'runtime-error');
      });
      await this.devices.reconcileModuleState(input.moduleId, input.enabled);
      return this.store.get();
    }

    if (module.kind === 'capture') return this.setCaptureConfig({ enabled: input.enabled });
    if (module.kind === 'audio') return this.setAudioEnabled(input.enabled);

    this.store.update((draft) => {
      const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
      if (!target) throw new Error(`Unknown module: ${input.moduleId}`);
      target.installed = target.installed || input.enabled;
      target.enabled = input.enabled;
    });
    await this.devices.reconcileModuleState(input.moduleId, input.enabled);
    return this.store.get();
  }

  public async createModuleProject(input: CreateModuleProjectInput): Promise<SystemSnapshot> {
    if (this.store.get().modules.some((module) => module.id === input.id)) {
      throw new Error(`A module with the ID ${input.id} is already installed or linked.`);
    }
    const reviewParent = nativeReviewPath('SWITCHBOARD_MODULE_PROJECT_REVIEW_PARENT');
    const selection = reviewParent ? null : await dialog.showOpenDialog({
        title: 'Choose a parent folder for the module project',
        defaultPath: app.getPath('documents'),
        buttonLabel: 'Create project here',
        properties: ['openDirectory', 'createDirectory'],
      });
    const parentDirectory = reviewParent ?? selection?.filePaths[0];
    if (selection?.canceled || !parentDirectory) return this.store.get();
    const projectPath = await scaffoldModuleProject(parentDirectory, input, currentCoreVersion());
    const validation = await validateModuleProject(projectPath, currentCoreVersion());
    await this.linkValidatedModuleProject(projectPath, validation);
    return this.store.get();
  }

  public async linkModuleProject(): Promise<SystemSnapshot> {
    const reviewProject = nativeReviewPath('SWITCHBOARD_MODULE_PROJECT_REVIEW_LINK');
    const selection = reviewProject ? null : await dialog.showOpenDialog({
        title: 'Link a Switchboard module project',
        defaultPath: app.getPath('documents'),
        buttonLabel: 'Link project',
        properties: ['openDirectory'],
      });
    const projectPath = reviewProject ?? selection?.filePaths[0];
    if (selection?.canceled || !projectPath) return this.store.get();
    const validation = await validateModuleProject(projectPath, currentCoreVersion());
    await this.linkValidatedModuleProject(projectPath, validation);
    return this.store.get();
  }

  public async validateModuleProject(input: ModuleProjectIdInput): Promise<SystemSnapshot> {
    const current = this.store.get().modules.find((candidate) => candidate.id === input.moduleId && candidate.source === 'local');
    if (!current?.development) throw new Error(`Unknown local module: ${input.moduleId}`);
    this.store.update((draft) => {
      const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
      if (target?.development) target.development.status = 'validating';
    }, { persist: false });

    const validation = await validateModuleProject(current.development.projectPath, currentCoreVersion());
    if (validation.manifest && validation.manifest.id !== current.id) {
      validation.issues.push({
        severity: 'error',
        code: 'module-id-changed',
        message: `The linked manifest ID changed from ${current.id} to ${validation.manifest.id}. Unlink it before changing IDs.`,
        file: 'switchboard.module.json',
      });
      validation.status = 'invalid';
    }
    await this.replaceLinkedModule(current, validation);
    if (this.store.get().modules.find((candidate) => candidate.id === input.moduleId)?.enabled) {
      await this.devices.refresh();
    }
    return this.store.get();
  }

  public async revealModuleProject(input: ModuleProjectIdInput): Promise<void> {
    const module = this.store.get().modules.find((candidate) => candidate.id === input.moduleId && candidate.source === 'local');
    const projectPath = module?.development?.projectPath;
    if (!projectPath) throw new Error(`Unknown local module: ${input.moduleId}`);
    const error = await shell.openPath(projectPath);
    if (error) throw new Error(error);
  }

  public async unlinkModuleProject(input: ModuleProjectIdInput): Promise<SystemSnapshot> {
    const module = this.store.get().modules.find((candidate) => candidate.id === input.moduleId && candidate.source === 'local');
    if (!module) throw new Error(`Unknown local module: ${input.moduleId}`);
    const runtime = this.localDeviceModules.get(input.moduleId);
    this.localDeviceModules.delete(input.moduleId);
    await runtime?.dispose();
    this.devices.removeModuleDevices(input.moduleId);
    return this.store.update((draft) => {
      draft.modules = draft.modules.filter((candidate) => candidate.id !== input.moduleId);
      for (const deviceId of Object.keys(draft.settings.deviceAppearanceOverrides)) {
        if (!draft.devices.some((device) => device.id === deviceId)) delete draft.settings.deviceAppearanceOverrides[deviceId];
      }
    });
  }

  private async loadPersistedLocalModules(): Promise<void> {
    const localModules = this.store.get().modules.filter((module) => module.source === 'local' && module.development);
    for (const module of localModules) {
      if (this.disposed || !module.development) return;
      const validation = await validateModuleProject(module.development.projectPath, currentCoreVersion());
      if (validation.manifest && validation.manifest.id !== module.id) {
        validation.issues.push({
          severity: 'error',
          code: 'module-id-changed',
          message: `The linked manifest ID changed from ${module.id} to ${validation.manifest.id}.`,
          file: 'switchboard.module.json',
        });
        validation.status = 'invalid';
      }
      await this.replaceLinkedModule(module, validation);
    }
  }

  private async linkValidatedModuleProject(projectPath: string, validation: ModuleProjectValidation): Promise<void> {
    if (!validation.manifest) {
      throw new Error(validation.issues[0]?.message ?? 'The selected folder is not a valid Switchboard module project.');
    }
    const existing = this.store.get().modules.find((candidate) => candidate.id === validation.manifest?.id);
    if (existing && (existing.source !== 'local' || existing.development?.projectPath !== resolve(projectPath))) {
      throw new Error(`A module with the ID ${validation.manifest.id} is already installed or linked.`);
    }
    if (existing) {
      await this.replaceLinkedModule(existing, validation);
      return;
    }

    const linked = moduleManifestFromProject(projectPath, validation, false);
    this.store.update((draft) => {
      draft.modules.push(linked);
      draft.modules.sort((left, right) => left.name.localeCompare(right.name));
    });
    await this.installLocalRuntime(linked, validation);
  }

  private async replaceLinkedModule(current: SystemSnapshot['modules'][number], validation: ModuleProjectValidation): Promise<void> {
    const runtime = this.localDeviceModules.get(current.id);
    this.localDeviceModules.delete(current.id);
    await runtime?.dispose();

    if (!validation.manifest || validation.manifest.id !== current.id) {
      this.store.update((draft) => {
        const target = draft.modules.find((candidate) => candidate.id === current.id);
        if (!target?.development) return;
        target.enabled = false;
        target.sizeMb = validation.sizeMb;
        target.development.status = validation.status;
        target.development.lastValidatedAt = new Date().toISOString();
        target.development.issues = validation.issues;
      });
      this.devices.removeModuleDevices(current.id);
      return;
    }

    const linked = moduleManifestFromProject(
      current.development?.projectPath ?? '',
      validation,
      current.enabled && validation.status === 'ready',
    );
    this.store.update((draft) => {
      const index = draft.modules.findIndex((candidate) => candidate.id === current.id);
      if (index >= 0) draft.modules[index] = linked;
    });
    await this.installLocalRuntime(linked, validation);
    if (validation.status !== 'ready') this.devices.removeModuleDevices(current.id);
  }

  private async installLocalRuntime(
    module: SystemSnapshot['modules'][number],
    validation: ModuleProjectValidation,
  ): Promise<void> {
    if (validation.status !== 'ready' || !validation.manifest || !validation.entrypointPath) return;
    const runtime = new SandboxedDeviceAddon(
      validation.manifest,
      validation.entrypointPath,
      (moduleId, status, message) => this.applyLocalModuleRuntimeState(moduleId, status, message),
    );
    this.localDeviceModules.set(module.id, runtime);
  }

  private applyLocalModuleRuntimeState(
    moduleId: string,
    status: 'ready' | 'active' | 'runtime-error',
    message?: string,
  ): void {
    const current = this.store.get().modules.find((candidate) => candidate.id === moduleId);
    if (!current?.development || (status === 'active' && !current.enabled)) return;
    const runtimeIssue = current.development.issues.find((issue) => issue.code === 'runtime-error');
    if (current.development.status === status && (status !== 'runtime-error' || runtimeIssue?.message === message)) return;
    this.store.update((draft) => {
      const module = draft.modules.find((candidate) => candidate.id === moduleId);
      if (!module?.development) return;
      module.development.status = status;
      module.development.issues = module.development.issues.filter((issue) => issue.code !== 'runtime-error');
      if (status === 'runtime-error') {
        module.enabled = false;
        module.development.issues.unshift({
          severity: 'error',
          code: 'runtime-error',
          message: message ?? 'The sandboxed module stopped unexpectedly.',
        });
      }
    });
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

  public async refreshDevices(): Promise<SystemSnapshot> {
    await this.devices.refresh();
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
      if (this.store.get().settings.developerMode !== true) {
        throw new Error('Audio is available only when Developer mode is enabled in Settings, General.');
      }
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

  public async setCaptureConfig(input: SetCaptureConfigInput): Promise<SystemSnapshot> {
    const before = this.store.get();
    const mergedInput: SetCaptureConfigInput = { ...input };
    if (input.defaultTrackLevels) {
      mergedInput.defaultTrackLevels = {
        ...before.capture.config.defaultTrackLevels,
        ...input.defaultTrackLevels,
      };
    }
    const nextConfig = captureConfigSchema.parse({ ...before.capture.config, ...mergedInput });
    const requestedHotkey = input.hotkey;
    const hotkeyChanged = typeof requestedHotkey === 'string' && requestedHotkey !== before.capture.config.hotkey;

    if (hotkeyChanged) {
      this.registerCaptureShortcut(requestedHotkey, true);
    }
    const disabling = before.capture.config.enabled && !nextConfig.enabled;
    const replayWindowChanged = before.capture.config.enabled
      && nextConfig.enabled
      && before.capture.config.replaySeconds !== nextConfig.replaySeconds;
    if (disabling || replayWindowChanged) {
      await this.autoCaptureCoordinator.flushBeforeCaptureStops(disabling ? 'capture-disabled' : 'replay-buffer-changed');
    }
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
        const engineStatus = this.engines.getStatus('capture');
        const engineAlive = engineStatus.state === 'running' || engineStatus.state === 'starting';
        if (!engineAlive) {
          await this.startCaptureEngine(nextConfig);
        } else {
          try {
            const hostSnapshot = captureHostSnapshotSchema.parse(
              await this.engines.request('capture', 'configure', this.toHostSettings(nextConfig), 45_000),
            );
            this.captureAudioIntegrationSignature = this.getCaptureAudioIntegrationSignature(nextConfig);
            this.applyCaptureSnapshot(hostSnapshot);
          } catch (configureError) {
            if (nextConfig.enabled && isEngineNotRunningError(configureError)) {
              await this.startCaptureEngine(nextConfig);
            } else {
              throw configureError;
            }
          }
        }
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

  public async updateAutoCaptureSettings(input: AutoCaptureSettingsPatch): Promise<SystemSnapshot> {
    const patch = autoCaptureSettingsPatchSchema.parse(input);
    const current = this.store.get().capture.autoCapture.settings;
    const games = { ...current.games };
    for (const [gameId, gamePatch] of Object.entries(patch.games ?? {})) {
      games[gameId] = {
        enabled: true,
        useGlobalTiming: true,
        ...games[gameId],
        ...gamePatch,
        events: { ...games[gameId]?.events, ...gamePatch.events },
      };
    }
    const next = autoCaptureSettingsSchema.parse({
      ...current,
      ...patch,
      reactionClipping: {
        ...current.reactionClipping,
        ...patch.reactionClipping,
      },
      games,
      dismissedAvailability: {
        ...current.dismissedAvailability,
        ...patch.dismissedAvailability,
      },
    });
    this.store.update((draft) => { draft.capture.autoCapture.settings = next; });
    const snapshot = this.store.get();
    await this.autoCaptureCoordinator.reconcile(
      snapshot.capture.runtime.activeSource,
      snapshot.capture.config.enabled,
      snapshot.gameDetection.games,
    );
    this.scheduleCaptureAudioIntegrationSync();
    await this.captureAudioIntegrationUpdate;
    return this.store.get();
  }

  public async setupAutoCaptureProvider(providerId: string): Promise<SystemSnapshot> {
    await this.autoCaptureCoordinator.setup(providerId);
    return this.store.get();
  }

  public async emitAutoCaptureTestEvent(input: AutoCaptureTestEventInput): Promise<SystemSnapshot> {
    if (!this.store.get().prototypeMode) throw new Error('Auto Capture test events are available only in development builds.');
    await this.autoCaptureCoordinator.emitTestEvent(input.type);
    return this.store.get();
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
    return this.persistSavedClip(result);
  }

  private async preserveAutoCaptureWindow(request: AutoCapturePreserveRequest): Promise<void> {
    const snapshot = this.store.get();
    if (!snapshot.capture.config.enabled) throw new Error('Instant Replay stopped before the Auto Capture window could be preserved.');
    const response = await this.engines.request<WorkerSavedClip>(
      'capture',
      'saveReplay',
      { startedAt: request.startedAt, endedAt: request.endsAt },
      120_000,
    );
    const result = workerSavedClipSchema.parse(response);
    const provider = snapshot.capture.autoCapture.providers.find((candidate) => candidate.id === request.providerId);
    const game = provider?.displayName ?? result.game ?? request.gameId;
    const clipStartedAt = result.captureStartedAt
      ?? Math.max(0, (result.captureEndedAt ?? request.endsAt) - result.durationMs);
    const markers = markersForClip(request.events, clipStartedAt, result.durationMs);
    this.persistSavedClip(result, {
      game,
      name: autoCaptureTitle(game, request.events),
      autoCapture: {
        autoCaptured: true,
        providerId: request.providerId,
        gameId: request.gameId,
        events: markers,
      },
    });
  }

  private persistSavedClip(
    result: WorkerSavedClip,
    overrides: Pick<Clip, 'name' | 'game' | 'autoCapture'> | Partial<Pick<Clip, 'name' | 'game' | 'autoCapture'>> = {},
  ): SystemSnapshot {
    const game = overrides.game ?? result.game ?? undefined;
    const clip: Clip = {
      id: randomUUID(),
      path: result.path,
      name: overrides.name ?? createDefaultClipTitle(game, result.createdAt),
      ...(game ? { game } : {}),
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
      ...(overrides.autoCapture ? { autoCapture: overrides.autoCapture } : {}),
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
      const nativeSources = await this.listNativeCaptureSources(sources);
      const visibleSources = onlySourcesAvailableToElectron(
        sources,
        nativeSources,
        captureIndexedDisplays().map((display) => display.id),
      );
      this.validatedCaptureWindowSourceIds.clear();
      for (const source of visibleSources) {
        if (source.type === 'window') this.validatedCaptureWindowSourceIds.add(source.id);
      }
      const orderedSources = orderCaptureSourcesByDisplayPosition(visibleSources);
      const snapshot = this.store.update((draft) => { draft.capture.sources = orderedSources; }, { persist: false });
      this.replaceCaptureSourceThumbnails(orderedSources, nativeSources);
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
    const diagnosticsWereEnabled = this.store.getDetailedDiagnosticsEnabled();
    const automaticScanWasEnabled = this.store.get().settings.scanGamesAutomatically;
    const disablingDeveloperMode = input.developerMode === false;
    if (disablingDeveloperMode) {
      if (this.audioRestartTimer) clearTimeout(this.audioRestartTimer);
      this.audioRestartTimer = null;
      this.audioRestartAttempts = 0;
      await this.engines.stop('audio');
    }
    const snapshot = this.store.update((draft) => {
      draft.settings = { ...draft.settings, ...input };
      if (disablingDeveloperMode) {
        draft.audio.enabled = false;
        const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (module) module.enabled = false;
      }
    });

    if (typeof input.detailedDiagnostics === 'boolean' && input.detailedDiagnostics !== diagnosticsWereEnabled) {
      debugDiagnostics.setEnabled(input.detailedDiagnostics);
      if (input.detailedDiagnostics) this.performance.clearDebugHistory();
      else {
        this.performance.invalidateDebugSample();
        this.store.update(draft => { delete draft.performance.debug; }, { persist: false });
      }
      this.performance.refresh();
    }
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

  public async exportResourceDiagnostics(): Promise<boolean> {
    const samples = this.performance.getDebugHistory();
    if (!samples.length) throw new Error('Enable detailed diagnostics and wait for a resource sample before exporting.');
    const result = await dialog.showSaveDialog({
      title: 'Export resource diagnostics',
      defaultPath: `switchboard-resources-${Date.now()}.json`,
      filters: [{ name: 'JSON report', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, JSON.stringify({
      schemaVersion: 1, version: this.store.get().version, exportedAt: new Date().toISOString(),
      droppedJournalWrites: this.resourceJournal.getDroppedWrites(),
      limits: 'Last 120 debug samples. Timings are inclusive wall time, not CPU attribution. Native child CPU, GPU load and Windows handle counts are unavailable. Renderer heap is approximate. No payloads or media paths are collected.',
      samples,
    }, null, 2), 'utf8');
    return true;
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
    return performFeedbackHandoff(input, environment, {
      writeClipboard: (text) => clipboard.writeText(text),
      openExternal: (url) => shell.openExternal(url),
    });
  }

  public async resetSettings(scope: SettingsResetScope): Promise<SystemSnapshot> {
    if (scope === 'all' || scope === 'audio') await this.engines.stop('audio');
    if (scope === 'all' || scope === 'capture') await this.engines.stop('capture');
    if (scope === 'general' && this.store.get().settings.developerMode === true && defaultSettings.developerMode !== true) {
      await this.engines.stop('audio');
    }

    let snapshot = this.store.update((draft) => {
      if (scope === 'all') {
        draft.settings = structuredClone(defaultSettings);
        draft.audio = createResetAudioState(draft.audio);
        draft.capture.config = structuredClone(defaultCaptureConfig);
        draft.capture.autoCapture.settings = structuredClone(defaultAutoCapture.settings);
        draft.gameDetection = structuredClone(defaultGameDetection);
        const audioModule = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
        if (audioModule) audioModule.enabled = false;
        const captureModule = draft.modules.find((candidate) => candidate.id === 'capability.replay');
        if (captureModule) captureModule.enabled = false;
        return;
      }
      if (scope === 'general') {
        draft.settings.uiScalePercent = defaultSettings.uiScalePercent;
        draft.settings.launchAtStartup = defaultSettings.launchAtStartup;
        draft.settings.closeToTray = defaultSettings.closeToTray;
        draft.settings.destroyRendererInTray = defaultSettings.destroyRendererInTray;
        draft.settings.softwareRendering = defaultSettings.softwareRendering;
        draft.settings.automaticAppUpdates = defaultSettings.automaticAppUpdates;
        draft.settings.automaticAppUpdateDownloads = defaultSettings.automaticAppUpdateDownloads;
        draft.settings.installAppUpdatesOnNextStartup = defaultSettings.installAppUpdatesOnNextStartup;
        draft.settings.developerMode = defaultSettings.developerMode;
        if (defaultSettings.developerMode !== true) {
          draft.audio.enabled = false;
          const audioModule = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
          if (audioModule) audioModule.enabled = false;
        }
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
        draft.capture.autoCapture.settings = structuredClone(defaultAutoCapture.settings);
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
        draft.settings.detailedDiagnostics = false;
        draft.settings.diagnosticsRetentionDays = defaultSettings.diagnosticsRetentionDays;
      }
    });
    if (scope === 'all' || scope === 'diagnostics') {
      this.performance.invalidateDebugSample();
      debugDiagnostics.setEnabled(false);
      snapshot = this.store.update(draft => { delete draft.performance.debug; }, { persist: false });
      this.performance.refresh();
    }
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

  public markClipsReviewed(input: MarkClipsReviewedInput): SystemSnapshot {
    return this.store.update((draft) => {
      draft.clipReview.reviewedThrough = Math.max(draft.clipReview.reviewedThrough, input.reviewedThrough);
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
          titleEdited: name !== createDefaultClipTitle(clipGameLabel(current), current.createdAt),
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
    const defaults = this.store.get().capture.config.defaultTrackLevels;
    return this.store.update((draft) => {
      const current = draft.clips.find((candidate) => candidate.id === input.id);
      if (!current) return;
      const levels = applyClipTrackLevel(
        current.audioTrackLevels,
        current.audioChannels,
        defaults,
        input.trackIndex,
        input.level,
      );
      current.audioTrackLevels = levels.length > 0 ? levels : undefined;
    });
  }

  public async loadClipAudioWaveform(id: string) {
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip) throw new Error('The clip no longer exists in the library.');
    if (!existsSync(clip.path)) throw new Error('The clip file no longer exists.');
    const waveform = await this.clipLibrary.loadAudioWaveform(clip);
    const audioChannels = waveform.tracks.flatMap((track) => track.channel ? [track.channel] : []);
    if (audioChannels.length > 0
      && audioChannels.length === waveform.tracks.length
      && !sameAudioChannels(clip.audioChannels, audioChannels)) {
      this.store.update((draft) => {
        const current = draft.clips.find((candidate) => candidate.id === id);
        if (current) current.audioChannels = audioChannels;
      });
    }
    return waveform;
  }

  public async getClipAudioPreviewPath(id: string, trackIndex: number): Promise<string | null> {
    if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 7) return null;
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip || !existsSync(clip.path)) return null;
    return this.clipLibrary.prepareAudioPreview(clip, trackIndex);
  }

  private planClipExport(input: ExportClipInput): {
    clip: Clip;
    canCopyOriginal: boolean;
    extension: string;
    fileName: string;
    expectedBytes: number;
  } {
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
    const defaults = this.store.get().capture.config.defaultTrackLevels;
    const audioMixChanged = hasEffectiveClipMixChanged(clip.audioTrackLevels, clip.audioChannels, defaults);
    const audioTrimChanged = (input.audioTrackTrims ?? clip.audioTrackTrims)?.some(Boolean) ?? false;
    const canCopyOriginal = input.preset === 'original' && fullRange && clip.canvasSize === 'original' && !audioMixChanged && !audioTrimChanged;
    const extension = canCopyOriginal ? extname(clip.path) || '.mp4' : '.mp4';
    const presetSuffix = input.preset === 'original'
      ? (fullRange ? (audioMixChanged || audioTrimChanged ? '-mixed' : '') : '-trimmed')
      : `-${input.preset}`;
    const canvasSuffix = clip.canvasSize === '9:16' ? '-9x16' : '';
    const sourceStem = parse(clip.path).name.trim() || clip.name;
    const fileName = `${sanitizeClipBaseName(sourceStem)}${canvasSuffix}${presetSuffix}${extension}`;
    const expectedBytes = canCopyOriginal
      ? clip.fileSize
      : input.preset === 'original'
        ? Math.ceil(clip.fileSize * (input.endMs - input.startMs) / Math.max(1, clip.durationMs))
        : exportPresetTargetBytes(input.preset);
    return { clip, canCopyOriginal, extension, fileName, expectedBytes };
  }

  private async writeClipExport(
    input: ExportClipInput,
    plan: ReturnType<AppController['planClipExport']>,
    destination: string,
  ): Promise<boolean> {
    if (plan.canCopyOriginal) {
      await ensureExportDiskSpace(dirname(destination), plan.clip.fileSize + 64 * 1_024 * 1_024);
      await copyFile(plan.clip.path, destination);
      if (input.exportId) this.emitClipExportProgress({ exportId: input.exportId, percent: 100, stage: 'complete' });
      return true;
    }
    await ensureExportDiskSpace(dirname(destination), plan.expectedBytes + 64 * 1_024 * 1_024);
    const controller = input.exportId ? new AbortController() : null;
    if (input.exportId && controller) this.activeClipExports.set(input.exportId, controller);
    if (input.exportId) this.emitClipExportProgress({ exportId: input.exportId, percent: 0, stage: 'compressing' });
    try {
      await this.clipLibrary.renderExport(plan.clip, destination, input, {
        signal: controller?.signal,
        encoder: selectShareVideoEncoder(this.store.get().capture.capabilities.encoders),
        defaultTrackLevels: this.store.get().capture.config.defaultTrackLevels,
        onProgress: input.exportId
          ? (progress) => this.emitClipExportProgress({
              exportId: input.exportId!,
              percent: Math.min(98, Math.max(1, Math.round(progress * 98))),
              stage: progress >= 0.98 ? 'finalizing' : 'compressing',
            })
          : undefined,
      });
      if (input.exportId) {
        this.emitClipExportProgress({ exportId: input.exportId, percent: 99, stage: 'finalizing' });
        this.emitClipExportProgress({ exportId: input.exportId, percent: 100, stage: 'complete' });
      }
    } catch (error) {
      await rm(destination, { force: true });
      if (controller?.signal.aborted) return false;
      throw error;
    } finally {
      if (input.exportId) this.activeClipExports.delete(input.exportId);
    }
    return true;
  }

  public async exportClip(input: ExportClipInput): Promise<boolean> {
    const plan = this.planClipExport(input);
    const selection = await dialog.showSaveDialog({
      title: 'Create share file',
      defaultPath: join(app.getPath('videos'), plan.fileName),
      filters: [{ name: 'Video', extensions: [plan.extension.replace(/^\./, '')] }],
    });
    if (selection.canceled || !selection.filePath) return false;
    const destinationIsSource = resolve(selection.filePath).toLocaleLowerCase() === resolve(plan.clip.path).toLocaleLowerCase();
    if (destinationIsSource && !plan.canCopyOriginal) {
      throw new Error('Choose a different file name so the original clip stays intact.');
    }
    if (plan.canCopyOriginal) {
      if (destinationIsSource) return true;
      return this.writeClipExport(input, plan, selection.filePath);
    }
    return this.writeClipExport(input, plan, selection.filePath);
  }

  public async prepareClipShare(input: PrepareClipShareInput): Promise<PreparedShareFile | null> {
    const plan = this.planClipExport(input);
    const shares = getPreparedShareService();
    if (plan.canCopyOriginal) {
      return shares.register(input.exportId, plan.clip.path, basename(plan.clip.path), {
        ...(plan.clip.thumbnailPath ? { iconPath: plan.clip.thumbnailPath } : {}),
        temporary: false,
      });
    }
    const destination = await shares.allocate(input.exportId, plan.fileName);
    try {
      const prepared = await this.writeClipExport(input, plan, destination);
      if (!prepared) {
        await shares.discard(input.exportId);
        return null;
      }
      return await shares.register(input.exportId, destination, plan.fileName, {
        ...(plan.clip.thumbnailPath ? { iconPath: plan.clip.thumbnailPath } : {}),
        temporary: true,
      });
    } catch (error) {
      await shares.discard(input.exportId);
      throw error;
    }
  }

  public async exportMontage(input: ExportMontageInput): Promise<boolean> {
    const snapshot = this.store.get();
    const clipsById = new Map(snapshot.clips.map((clip) => [clip.id, clip]));
    const entries = input.project.segments.map((segment) => ({ segment, clip: clipsById.get(segment.clipId) }));
    const missing = entries.filter((entry) => !entry.clip || !existsSync(entry.clip.path));
    if (missing.length > 0) {
      const names = missing.slice(0, 3).map((entry) => entry.clip?.name ?? entry.segment.clipId).join(', ');
      throw new Error(`Montage source unavailable: ${names}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}. Remove or restore the missing clip before exporting.`);
    }

    for (const entry of entries) {
      const clip = entry.clip!;
      const segment = entry.segment;
      if (segment.sourceDurationMs !== clip.durationMs) throw new Error(`${clip.name} changed after this montage was opened. Reopen the montage to refresh its media metadata.`);
      if (segment.trimEndMs > clip.durationMs || segment.trimEndMs - segment.trimStartMs < 100) {
        throw new Error(`The trim range for ${clip.name} is invalid.`);
      }
      for (const trim of segment.audioTrackTrims ?? []) {
        if (!trim) continue;
        if (trim.endMs > clip.durationMs || trim.endMs - trim.startMs < 100) {
          throw new Error(`An audio trim for ${clip.name} is invalid.`);
        }
      }
    }

    const suffix = input.preset === 'original' ? '' : `-${input.preset}`;
    const canvasSuffix = input.project.canvasSize === '9:16' ? '-9x16' : '';
    const selection = await dialog.showSaveDialog({
      title: 'Create montage share file',
      defaultPath: join(app.getPath('videos'), `${sanitizeClipBaseName(input.project.name)}${canvasSuffix}${suffix}.mp4`),
      filters: [{ name: 'Video', extensions: ['mp4'] }],
    });
    if (selection.canceled || !selection.filePath) return false;
    const resolvedDestination = resolve(selection.filePath).toLocaleLowerCase();
    if (entries.some((entry) => resolve(entry.clip!.path).toLocaleLowerCase() === resolvedDestination)) {
      throw new Error('Choose a different file name so every source clip stays intact.');
    }

    const proportionalSourceBytes = entries.reduce((total, entry) => {
      const duration = entry.segment.trimEndMs - entry.segment.trimStartMs;
      return total + entry.clip!.fileSize * duration / Math.max(1, entry.clip!.durationMs);
    }, 0);
    const finalBytes = input.preset === 'original' ? proportionalSourceBytes : exportPresetTargetBytes(input.preset);
    await ensureExportDiskSpace(selection.filePath, Math.ceil(proportionalSourceBytes + finalBytes + 128 * 1_024 * 1_024));

    const controller = new AbortController();
    this.activeClipExports.set(input.exportId, controller);
    try {
      await this.clipLibrary.renderMontageExport(
        entries.map((entry) => ({ clip: entry.clip!, segment: entry.segment })),
        selection.filePath,
        input,
        controller.signal,
        { defaultTrackLevels: this.store.get().capture.config.defaultTrackLevels },
      );
    } catch (error) {
      await rm(selection.filePath, { force: true });
      if (controller.signal.aborted) return false;
      throw error;
    } finally {
      this.activeClipExports.delete(input.exportId);
    }
    return true;
  }

  public cancelClipExport(exportId: string): void {
    this.activeClipExports.get(exportId)?.abort();
  }

  public getClipPath(id: string, thumbnail: boolean): string | null {
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip) return null;
    const path = thumbnail ? clip.thumbnailPath ?? null : clip.path;
    return path && existsSync(path) ? path : null;
  }

  public async getCaptureSourceThumbnail(id: string): Promise<Buffer | null> {
    const knownSource = this.store.get().capture.sources.find((source) => source.id === id);
    if (!knownSource || knownSource.type === 'automatic-game') return null;
    await this.refreshCaptureSourceThumbnails(false);
    return this.captureSourceThumbnails.get(id) ?? null;
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    debugDiagnostics.dispose();
    this.performance.dispose();
    await this.resourceJournal.dispose();
    for (const controller of this.activeClipExports.values()) controller.abort();
    this.activeClipExports.clear();
    this.clipExportProgressListeners.clear();
    this.appUpdates.dispose();
    await this.initialization?.catch(() => undefined);
    await this.autoCaptureCoordinator.dispose();
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
      const updated = this.store.update((draft) => {
        draft.gameDetection.games = [...byIdentity.values()]
          .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
        draft.gameDetection.scanState = 'idle';
        draft.gameDetection.lastScanAt = new Date().toISOString();
        draft.gameDetection.warning = result.warnings.length > 0
          ? `${result.warnings.length} launcher ${result.warnings.length === 1 ? 'entry' : 'entries'} could not be read.`
          : undefined;
        draft.gameDetection.error = undefined;
      });
      await this.autoCaptureCoordinator.refreshAvailability(updated.gameDetection.games);
      return this.store.get();
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
      this.syncAudioMeterDemand();
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
      try {
        await this.refreshCaptureSources();
      } catch (error) {
        console.warn('Capture sources could not be validated after the recorder started.', error);
      }
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
      const sources = this.store.get().capture.sources.filter((source) => source.type !== 'automatic-game');
      if (sources.length === 0) {
        this.captureSourceThumbnails.clear();
        this.captureSourceThumbnailsRefreshedAt = Date.now();
        return;
      }

      const nativeSources = await this.listNativeCaptureSources(sources);
      this.replaceCaptureSourceThumbnails(sources, nativeSources);
    })().catch((error) => {
      console.warn('Capture source thumbnails could not be refreshed.', error);
    }).finally(() => {
      this.captureSourceThumbnailRefresh = null;
    });
    return this.captureSourceThumbnailRefresh;
  }

  private async listNativeCaptureSources(sources: readonly CaptureSource[]): Promise<DesktopCapturerSource[]> {
    const groups = await Promise.all(desktopCaptureRequestsForSources(sources).map((request) => (
      desktopCapturer.getSources(request)
    )));
    return groups.flat();
  }

  private replaceCaptureSourceThumbnails(
    sources: readonly CaptureSource[],
    nativeSources: DesktopCapturerSource[],
  ): void {
    const next = new Map<string, Buffer>();
    for (const source of sources) {
      const nativeSource = matchDesktopCaptureSource(
        source,
        nativeSources,
        captureIndexedDisplays().map((display) => display.id),
      );
      if (!nativeSource || nativeSource.thumbnail.isEmpty()) continue;
      next.set(source.id, nativeSource.thumbnail.toPNG());
    }
    this.captureSourceThumbnails.clear();
    for (const [id, thumbnail] of next) this.captureSourceThumbnails.set(id, thumbnail);
    this.captureSourceThumbnailsRefreshedAt = Date.now();
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
    const previous = this.appliedEngineStatuses.get(status.kind);
    if (!isMaterialEngineStatusChange(previous, status)) return;
    this.appliedEngineStatuses.set(status.kind, structuredClone(status));
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
      void this.autoCaptureCoordinator.reconcile(null, false, this.store.get().gameDetection.games);
      this.scheduleCaptureHostRecovery(status.message);
    } else if (status.kind === 'capture' && status.state === 'stopped' && this.store.get().capture.config.enabled) {
      void this.autoCaptureCoordinator.reconcile(null, false, this.store.get().gameDetection.games);
      this.scheduleCaptureHostRecovery(status.message ?? 'Capture.Host stopped unexpectedly while Instant Replay stayed enabled.');
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
    const current = this.store.get();
    const audio = current.audio;
    const reaction = current.capture.autoCapture.settings.reactionClipping;
    const switchboardAudioReady = audio.enabled
      && audio.host?.running === true
      && audio.capabilities.virtualChannels === 'available';
    const processedMicrophone = audio.host?.driver.endpoints.find((endpoint) => (
      endpoint.flow === 'capture' && endpoint.name === 'Switchboard Audio - Microphone'
    ));
    const processedMicrophoneRequested = config.includeMic || reaction.enabled;
    const routingState = { ...audio, capture: config };
    const microphoneDeviceId = processedMicrophoneRequested
      ? resolveCaptureMicrophoneDeviceId(routingState)
      : null;
    const systemAudioDeviceId = config.includeSystemAudio
      ? resolveCaptureSystemAudioDeviceId(routingState)
      : null;
    const chatAudioDeviceId = config.includeChatAudio
      ? resolveCaptureChatAudioDeviceId(routingState)
      : null;
    const requestedSwitchboardAudioReady = switchboardAudioReady
      && (!processedMicrophoneRequested || processedMicrophone !== undefined);
    const usesExplicitSystemDevice = config.includeSystemAudio && systemAudioDeviceId !== null;
    const { defaultTrackLevels: _defaultTrackLevels, ...hostConfig } = config;
    void _defaultTrackLevels;
    return {
      ...hostConfig,
      ...getEncodingPreset(config),
      cacheDirectory: paths.cacheDirectory,
      clipsDirectory: paths.clipsDirectory,
      thumbnailDirectory: paths.thumbnailDirectory,
      clipMixPipeName: switchboardAudioReady && config.includeSystemAudio && !usesExplicitSystemDevice ? 'switchboard-audio-clip-v1' : null,
      processedMicrophoneDeviceId: switchboardAudioReady && processedMicrophoneRequested
        ? processedMicrophone?.id ?? null
        : null,
      microphoneDeviceId,
      systemAudioDeviceId,
      chatAudioDeviceId,
      reactionClippingEnabled: reaction.enabled,
      reactionSensitivity: reaction.sensitivity,
      reactionCooldownSeconds: reaction.cooldownSeconds,
      audioFallbackReason: requestedSwitchboardAudioReady || (!config.includeSystemAudio && !config.includeChatAudio && !processedMicrophoneRequested)
        ? null
        : 'Switchboard audio routing is unavailable for one or more replay inputs; Windows default devices are being used where needed.',
    };
  }

  private getCaptureAudioIntegrationSignature(config: CaptureConfig): string {
    const settings = this.toHostSettings(config);
    return JSON.stringify([
      settings.clipMixPipeName ?? null,
      settings.processedMicrophoneDeviceId ?? null,
      settings.microphoneDeviceId ?? null,
      settings.systemAudioDeviceId ?? null,
      settings.chatAudioDeviceId ?? null,
      settings.includeChatAudio ?? false,
      settings.audioFallbackReason ?? null,
      settings.reactionClippingEnabled,
      settings.reactionSensitivity,
      settings.reactionCooldownSeconds,
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
    if (event === 'reactionDetected') {
      this.handleReactionDetected(payload);
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

  private handleReactionDetected(payload: unknown): void {
    const parsed = workerReactionDetectionSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn('Capture.Host sent an invalid reaction event.', parsed.error);
      return;
    }
    const snapshot = this.store.get();
    const reaction = snapshot.capture.autoCapture.settings.reactionClipping;
    const source = snapshot.capture.runtime.activeSource;
    if (!reaction.enabled || !snapshot.capture.config.enabled || !source) return;

    const gameProvider = this.autoCaptureRegistry.getForSource(source, snapshot.gameDetection.games);
    const event: GameEvent = {
      id: `${reactionClippingProviderId}-${parsed.data.timestamp}`,
      gameId: gameProvider?.gameId ?? reactionGameId(source),
      providerId: reactionClippingProviderId,
      type: 'highlight',
      timestamp: parsed.data.timestamp,
      confidence: parsed.data.confidence,
      label: 'Reaction',
      metadata: { code: 'voice-reaction' },
      source: 'microphone',
    };
    this.autoCaptureEngine.handleEvent(event, {
      enabled: true,
      preRollSeconds: reaction.preRollSeconds,
      postRollSeconds: reaction.postRollSeconds,
      mergeNearbyEvents: true,
      mergeThresholdSeconds: 0,
    });
  }

  private applyAudioHostSnapshot(snapshot: AudioHostSnapshot): void {
    if (!this.audioSnapshotUpdateGate.shouldApply(snapshot)) return;
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

  private syncAudioMeterDemand(): void {
    this.engines.send('audio', 'setMetering', this.audioMeterDemandGate.enabled);
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
    if (!this.captureSnapshotUpdateGate.shouldApply(snapshot)) return;
    if (snapshot.runtime.state === 'buffering' || snapshot.runtime.state === 'waiting') {
      this.captureRestartAttempts = 0;
    }
    this.store.update((draft) => {
      const shortcutRegistered = draft.capture.runtime.shortcutRegistered;
      draft.capture.runtime = { ...snapshot.runtime, shortcutRegistered };
      draft.capture.storage = snapshot.storage;
      draft.capture.capabilities = snapshot.capabilities;
      draft.capture.sources = orderCaptureSourcesByDisplayPosition(
        preserveValidatedWindowSources(
          snapshot.sources,
          snapshot.sources.filter((source) => this.validatedCaptureWindowSourceIds.has(source.id)),
        ),
      );
    }, { persist: false });
    const current = this.store.get();
    void this.autoCaptureCoordinator.reconcile(
      snapshot.runtime.activeSource,
      current.capture.config.enabled,
      current.gameDetection.games,
    ).catch((error) => {
      console.warn('[autocapture] lifecycle_reconcile_failed', error);
    });
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

  private emitClipExportProgress(progress: ClipExportProgress): void {
    for (const listener of this.clipExportProgressListeners) listener(progress);
  }
}

function exportPresetTargetBytes(preset: ExportClipInput['preset']): number {
  if (preset === '10mb') return 10 * 1_024 * 1_024;
  if (preset === '25mb') return 25 * 1_024 * 1_024;
  if (preset === '50mb') return 50 * 1_024 * 1_024;
  return 0;
}

async function ensureExportDiskSpace(destination: string, requiredBytes: number): Promise<void> {
  try {
    const storage = await statfs(dirname(destination), { bigint: true });
    const availableBytes = storage.bavail * storage.bsize;
    if (availableBytes < BigInt(Math.max(0, Math.ceil(requiredBytes)))) {
      throw new Error('There is not enough free disk space to create this export. Choose another destination or shorten the project.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not enough free disk space')) throw error;
    // Some network and virtual filesystems do not expose capacity through statfs.
  }
}

function appUpdatePreferences(settings: SystemSnapshot['settings']): AppUpdatePreferences {
  return {
    automaticChecks: settings.automaticAppUpdates,
    automaticDownloads: settings.automaticAppUpdateDownloads,
    installOnNextStartup: settings.installAppUpdatesOnNextStartup,
  };
}

function currentCoreVersion(): string {
  return app.isPackaged ? app.getVersion() : projectPackage.version;
}

function nativeReviewPath(variable: string): string | null {
  if (process.env.SWITCHBOARD_NATIVE_REVIEW !== '1') return null;
  const value = process.env[variable]?.trim();
  return value ? resolve(value) : null;
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

function reactionGameId(source: CaptureSource): string {
  const normalized = source.name.toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `reaction-${normalized || 'captured-source'}`;
}

function isEngineNotRunningError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('is not running') || message.includes('engine exited') || message.includes('could not accept');
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
