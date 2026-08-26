import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, globalShortcut, shell } from 'electron';
import { z } from 'zod';
import {
  captureConfigSchema,
  captureHostSnapshotSchema,
  captureSourceSchema,
  audioPresetFileSchema,
  channelProcessingSchema,
  micProcessorSchema,
  type AudioPathId,
  type AudioPresetIdInput,
  type AudioMeterFrame,
  type ApplyAudioPresetInput,
  type CaptureConfig,
  type CaptureHostSnapshot,
  type EngineStatus,
  type CreateAudioPresetInput,
  type RenameAudioPresetInput,
  type RenameClipInput,
  type SetAudioChannelProcessorInput,
  type SetAudioBusDeviceInput,
  type SetAudioBusEnabledInput,
  type SetAudioBusGainInput,
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
import { defaultAudio, defaultCaptureConfig, defaultSettings } from '../shared/defaults';
import {
  applyAudioPathPreset,
  findMatchingAudioPresetId,
  snapshotAudioPathPreset,
} from '../shared/audio-presets';
import { resolveDeviceVariant } from '../shared/device-variant';
import { resolveProductAsset } from '../shared/product-assets';
import { getEncodingPreset } from '../shared/capture-presets';
import { CaptureStorageService, type CapturePaths } from './services/capture-storage';
import { ClipLibraryService } from './services/clip-library';
import { DeviceRegistry } from './services/device-registry';
import { EngineSupervisor } from './services/engine-supervisor';
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

export class AppController {
  private readonly store: StateStore;
  private readonly engines: EngineSupervisor;
  private readonly devices: DeviceRegistry;
  private readonly audioMeterListeners = new Set<(frame: AudioMeterFrame) => void>();
  private readonly captureStorage: CaptureStorageService;
  private readonly clipLibrary: ClipLibraryService;
  private capturePaths: CapturePaths;
  private registeredShortcut: string | null = null;
  private captureRestartTimer: NodeJS.Timeout | null = null;
  private captureRestartAttempts = 0;
  private disposed = false;

  public constructor() {
    this.store = new StateStore(join(app.getPath('userData'), 'switchboard-state.json'));
    this.captureStorage = new CaptureStorageService(app.getPath('videos'), app.getPath('userData'));
    this.capturePaths = this.captureStorage.resolvePaths(null);
    this.clipLibrary = new ClipLibraryService(this.capturePaths.thumbnailDirectory);
    this.engines = new EngineSupervisor(
      (status) => this.applyEngineStatus(status),
      (frame) => this.emitAudioMeters(frame),
      (kind, event, payload) => this.applyEngineEvent(kind, event, payload),
    );
    this.devices = new DeviceRegistry(
      () => this.store.get(),
      (devices) => {
        this.store.update((draft) => {
          draft.devices = devices;
        });
      },
    );
  }

  public async initialize(): Promise<void> {
    await this.store.load();
    await this.devices.start();
    const snapshot = this.store.get();
    this.applyLoginItemSetting(snapshot.settings.launchAtStartup);
    await this.initializeCaptureStorage();
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
    return this.store.setRendererActive(active);
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
    return this.store.update((draft) => {
      const device = draft.devices.find((candidate) => candidate.id === input.deviceId);
      if (!device) throw new Error(`Unknown device: ${input.deviceId}`);
      if (!Object.hasOwn(device.settings, input.key)) {
        throw new Error(`Unsupported setting for ${device.displayName}: ${input.key}`);
      }
      device.settings[input.key] = input.value;
    });
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

    if (enabled) await this.startAudioEngine();
    else await this.engines.stop('audio');

    return this.store.update((draft) => {
      draft.audio.enabled = enabled;
      const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
      if (module) {
        module.installed = true;
        module.enabled = enabled;
      }
    });
  }

  public setAudioBusGain(input: SetAudioBusGainInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const bus = draft.audio.buses.find((candidate) => candidate.id === input.busId);
      if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
      bus.gain = input.gain;
    });
    this.engines.send('audio', 'setBusGain', input);
    return snapshot;
  }

  public setAudioBusEnabled(input: SetAudioBusEnabledInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const bus = draft.audio.buses.find((candidate) => candidate.id === input.busId);
      if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
      bus.enabled = input.enabled;
    });
    this.engines.send('audio', 'setBusEnabled', input);
    return snapshot;
  }

  public setAudioBusDevice(input: SetAudioBusDeviceInput): SystemSnapshot {
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

    const snapshot = this.store.update((draft) => {
      const target = draft.audio.buses.find((candidate) => candidate.id === input.busId);
      if (!target) throw new Error(`Unknown audio bus: ${input.busId}`);
      target.deviceId = input.deviceId;
      if (target.id === 'mic') draft.audio.microphoneDevice = device.name;
      if (target.id === 'game') draft.audio.outputDevice = device.name;
    });
    this.engines.send('audio', 'setBusDevice', input);
    return snapshot;
  }

  public applyAudioPreset(input: ApplyAudioPresetInput): SystemSnapshot {
    const before = this.store.get();
    const preset = before.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
    if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
    const snapshot = this.store.update((draft) => {
      applyAudioPathPreset(draft.audio, preset);
    });
    this.engines.send('audio', 'configure', snapshot.audio);
    return snapshot;
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
    return this.store.update((draft) => {
      const id = `user-${imported.preset.kind}-${randomUUID()}`;
      const preset = { ...structuredClone(imported.preset), id, builtIn: false };
      draft.audio.pathPresets.push(preset);
      applyAudioPathPreset(draft.audio, preset);
    });
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
    this.engines.send('audio', 'setChannelProcessor', input);
    return snapshot;
  }

  public setAudioMonitoring(input: SetAudioMonitoringInput): SystemSnapshot {
    const before = this.store.get();
    if (before.audio.capabilities.monitoring === 'unavailable') {
      throw new Error('Low-latency microphone monitoring is unavailable until Audio.Host owns the microphone stream.');
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
    this.engines.send('audio', 'setMonitoring', input);
    return snapshot;
  }

  public setChatMix(value: number): SystemSnapshot {
    const normalized = Math.max(-1, Math.min(1, value));
    const snapshot = this.store.update((draft) => {
      draft.audio.chatMix = normalized;
      const game = draft.audio.buses.find((bus) => bus.id === 'game');
      const chat = draft.audio.buses.find((bus) => bus.id === 'chat');
      if (game && chat) {
        game.gain = Math.max(0.2, Math.min(1.2, 0.85 - normalized * 0.35));
        chat.gain = Math.max(0.2, Math.min(1.2, 0.85 + normalized * 0.35));
      }
    });
    this.engines.send('audio', 'setChatMix', { value: normalized });
    return snapshot;
  }

  public setMicProcessor(input: SetMicProcessorInput): SystemSnapshot {
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
    this.engines.send('audio', 'setMicProcessor', input);
    return snapshot;
  }

  public async setCaptureConfig(input: Partial<CaptureConfig>): Promise<SystemSnapshot> {
    const before = this.store.get();
    const nextConfig = captureConfigSchema.parse({ ...before.capture.config, ...input });
    const requestedHotkey = input.hotkey;
    const hotkeyChanged = typeof requestedHotkey === 'string' && requestedHotkey !== before.capture.config.hotkey;

    if (hotkeyChanged) {
      this.registerCaptureShortcut(requestedHotkey, true);
    }
    try {
      if (!before.capture.config.enabled && nextConfig.enabled) await this.startCaptureEngine(nextConfig);
      if (before.capture.config.enabled && !nextConfig.enabled) await this.engines.stop('capture');
      if (before.capture.config.enabled && nextConfig.enabled) {
        const hostSnapshot = captureHostSnapshotSchema.parse(
          await this.engines.request('capture', 'configure', this.toHostSettings(nextConfig), 45_000),
        );
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
    const clip = {
      id: randomUUID(),
      path: result.path,
      name: result.name,
      ...(result.game ? { game: result.game } : {}),
      createdAt: result.createdAt,
      durationMs: result.durationMs,
      fileSize: result.fileSize,
      width: result.width,
      height: result.height,
      fps: result.fps,
      ...(result.codec ? { codec: result.codec } : {}),
      ...(result.thumbnailPath ? { thumbnailPath: result.thumbnailPath } : {}),
    };
    const updated = this.store.update((draft) => {
      draft.capture.runtime.lastSavedAt = new Date(result.createdAt).toISOString();
      draft.clips.unshift(clip);
      draft.capture.storage.clipsBytes = draft.clips.reduce((sum, candidate) => sum + candidate.fileSize, 0);
    });
    this.clipLibrary.enqueueThumbnail(clip, (thumbnailPath) => {
      this.store.update((draft) => {
        const current = draft.clips.find((candidate) => candidate.id === clip.id);
        if (current) current.thumbnailPath = thumbnailPath;
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
      return this.store.update((draft) => { draft.capture.sources = sources; }, { persist: false });
    } finally {
      if (!wasRunning) await this.engines.stop('capture');
    }
  }

  public updateSettings(input: UpdateSettingsInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      draft.settings = { ...draft.settings, ...input };
    });

    if (typeof input.launchAtStartup === 'boolean') {
      this.applyLoginItemSetting(input.launchAtStartup);
    }
    return snapshot;
  }

  public async resetSettings(scope: SettingsResetScope): Promise<SystemSnapshot> {
    if (scope === 'all' || scope === 'audio') await this.engines.stop('audio');
    if (scope === 'all' || scope === 'capture') await this.engines.stop('capture');

    let snapshot = this.store.update((draft) => {
      if (scope === 'all') {
        draft.settings = structuredClone(defaultSettings);
        draft.audio = createResetAudioState(draft.audio);
        draft.capture.config = structuredClone(defaultCaptureConfig);
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
      if (scope === 'modules') {
        draft.settings.automaticModuleUpdates = defaultSettings.automaticModuleUpdates;
      }
      if (scope === 'diagnostics') {
        draft.settings.performanceGuard = defaultSettings.performanceGuard;
        draft.settings.diagnosticsRetentionDays = defaultSettings.diagnosticsRetentionDays;
      }
    });
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
    const renamed = await this.clipLibrary.renameClip(clip, input.name);
    return this.store.update((draft) => {
      const index = draft.clips.findIndex((candidate) => candidate.id === input.id);
      if (index >= 0) draft.clips[index] = renamed;
    });
  }

  public getClipPath(id: string, thumbnail: boolean): string | null {
    const clip = this.store.get().clips.find((candidate) => candidate.id === id);
    if (!clip) return null;
    const path = thumbnail ? clip.thumbnailPath ?? null : clip.path;
    return path && existsSync(path) ? path : null;
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    if (this.captureRestartTimer) clearTimeout(this.captureRestartTimer);
    this.captureRestartTimer = null;
    if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut);
    this.devices.dispose();
    await this.engines.dispose();
    await this.store.flush();
  }

  private async startAudioEngine(): Promise<void> {
    await this.engines.start('audio');
    this.engines.send('audio', 'configure', this.store.get().audio);
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
      this.applyCaptureSnapshot(hostSnapshot);
    } catch (error) {
      await this.engines.stop('capture');
      throw error;
    }
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
          draft.capture.runtime.state = 'stopped';
        }
      },
      { persist: false },
    );
    if (status.kind === 'capture' && status.state === 'error') {
      this.scheduleCaptureHostRecovery(status.message);
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
      for (const clip of clips.filter((candidate) => !candidate.thumbnailPath)) {
        this.clipLibrary.enqueueThumbnail(clip, (thumbnailPath) => {
          this.store.update((draft) => {
            const current = draft.clips.find((candidate) => candidate.id === clip.id);
            if (current) current.thumbnailPath = thumbnailPath;
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
    return {
      ...config,
      ...getEncodingPreset(config),
      cacheDirectory: paths.cacheDirectory,
      clipsDirectory: paths.clipsDirectory,
      thumbnailDirectory: paths.thumbnailDirectory,
    };
  }

  private applyEngineEvent(kind: 'audio' | 'capture', event: string, payload: unknown): void {
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

  private applyCaptureSnapshot(snapshot: CaptureHostSnapshot): void {
    if (snapshot.runtime.state === 'buffering' || snapshot.runtime.state === 'waiting') {
      this.captureRestartAttempts = 0;
    }
    this.store.update((draft) => {
      const shortcutRegistered = draft.capture.runtime.shortcutRegistered;
      draft.capture.runtime = { ...snapshot.runtime, shortcutRegistered };
      draft.capture.storage = snapshot.storage;
      draft.capture.capabilities = snapshot.capabilities;
      draft.capture.sources = snapshot.sources;
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

  const defaultOutput = reset.devices.find((device) => device.direction === 'output' && device.available && device.isDefault);
  const defaultInput = reset.devices.find((device) => device.direction === 'input' && device.available && device.isDefault);
  reset.outputDevice = defaultOutput?.name ?? current.outputDevice;
  reset.microphoneDevice = defaultInput?.name ?? current.microphoneDevice;
  for (const kind of ['game', 'chat', 'media', 'microphone'] as const) {
    const defaultId = defaultAudio.activePresetIds[kind];
    reset.activePresetIds[kind] = defaultId && reset.pathPresets.some((preset) => preset.id === defaultId)
      ? defaultId
      : null;
  }
  return reset;
}
