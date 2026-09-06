import { debugDiagnostics } from './debug-diagnostics';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { systemSnapshotSchema, type EngineKind, type PerformanceSnapshot, type SystemSnapshot } from '../../shared/contracts';
import { migrateVisibleWorkspaces } from '../../shared/workspace-profile';
import { latestClipCreatedAt } from '../../shared/clip-review';
import { createDefaultSnapshot } from '../../shared/defaults';

type Listener = (snapshot: SystemSnapshot) => void;

type UpdateOptions = {
  persist?: boolean;
  emit?: boolean;
};

const runtimeEngineKinds: EngineKind[] = ['audio', 'capture'];

export class StateStore {
  private snapshot: SystemSnapshot = createDefaultSnapshot();
  private readonly listeners = new Set<Listener>();
  private persistChain: Promise<void> = Promise.resolve();
  private persistedPayload: string | null = null;

  public constructor(private readonly filePath: string) {}

  public async load(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (raw !== null) {
      try {
        this.snapshot = this.resetRuntimeState(parsePersistedState(raw));
        this.persistedPayload = raw;
        return;
      } catch (error) {
        // Preserve original bytes before recovery. If preservation fails, do not overwrite them.
        const preservedPath = `${this.filePath}.corrupt-${Date.now()}-${randomUUID()}`;
        await rename(this.filePath, preservedPath);
        console.warn('Switchboard state was invalid. The original file was preserved; trying the backup.', preservedPath, error);
      }
    }

    try {
      const backup = await readFile(`${this.filePath}.bak`, 'utf8');
      this.snapshot = this.resetRuntimeState(parsePersistedState(backup));
      this.persistedPayload = backup;
      await this.persist();
      console.warn('Switchboard state was recovered from its last valid backup.');
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Switchboard state backup could not be loaded. Defaults will be used.', error);
      }
    }

    this.snapshot = createDefaultSnapshot();
    await this.persist();
  }

  public get(): SystemSnapshot {
    return debugDiagnostics.measure('state.clone', () => structuredClone(this.snapshot));
  }

  public getDetailedDiagnosticsEnabled(): boolean {
    return this.snapshot.settings.developerMode === true && this.snapshot.settings.detailedDiagnostics;
  }

  public getPerformanceGuardEnabled(): boolean {
    return this.snapshot.settings.performanceGuard;
  }

  public update(mutator: (draft: SystemSnapshot) => void, options: UpdateOptions = {}): SystemSnapshot {
    const { persist = true, emit = true } = options;
    const next = debugDiagnostics.measure('state.clone-update', () => structuredClone(this.snapshot));
    mutator(next);
    this.snapshot = debugDiagnostics.measure('state.validate', () => systemSnapshotSchema.parse(next));

    if (emit) debugDiagnostics.measure('state.emit', () => this.emit());
    if (persist) void this.persist();
    return this.get();
  }

  public restore(snapshot: SystemSnapshot): SystemSnapshot {
    const parsed = systemSnapshotSchema.parse(structuredClone(snapshot));
    this.snapshot = parsed;
    this.emit();
    void this.persist();
    return this.get();
  }

  public setPerformance(performance: PerformanceSnapshot): SystemSnapshot {
    return this.update((draft) => { draft.performance = performance; }, { persist: false });
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async flush(): Promise<void> {
    await this.persistChain;
  }

  private resetRuntimeState(snapshot: SystemSnapshot): SystemSnapshot {
    const next = structuredClone(snapshot);
    const defaults = createDefaultSnapshot();
    const modulesById = new Map(next.modules.map((module) => [module.id, module]));
    const bundledModules = defaults.modules.map((fallback) => {
      const existing = modulesById.get(fallback.id);
      return existing
        ? { ...structuredClone(fallback), enabled: existing.enabled }
        : structuredClone(fallback);
    });
    const localModules = next.modules
      .filter((module) => module.source === 'local' && module.development)
      .map((module) => ({
        ...module,
        enabled: module.enabled,
        development: module.development
          ? { ...module.development, status: 'validating' as const }
          : undefined,
      }));
    next.modules = [...bundledModules, ...localModules];
    next.audio.devices = [];
    next.audio.outputDevice = '';
    next.audio.microphoneDevice = '';

    const currentBuses = new Map(next.audio.buses.map((bus) => [bus.id, bus]));
    const legacyAux = currentBuses.get('aux');
    next.audio.buses = defaults.audio.buses.map((fallback) => {
      const existing = currentBuses.get(fallback.id) ?? (fallback.id === 'mic' ? legacyAux : undefined);
      if (!existing) return structuredClone(fallback);
      return {
        ...structuredClone(fallback),
        ...existing,
        id: fallback.id,
        label: fallback.label,
        endpoint: fallback.endpoint,
        deviceId: existing.deviceId || fallback.deviceId,
      };
    });

    const processingByBus = new Map(next.audio.channelProcessing.map((processing) => [processing.busId, processing]));
    next.audio.channelProcessing = defaults.audio.channelProcessing.map((fallback) => (
      structuredClone(processingByBus.get(fallback.busId) ?? fallback)
    ));

    const knownPresets = new Map(next.audio.pathPresets.map((preset) => [preset.id, preset]));
    for (const preset of defaults.audio.pathPresets) {
      if (!knownPresets.has(preset.id)) knownPresets.set(preset.id, structuredClone(preset));
    }
    next.audio.pathPresets = [...knownPresets.values()];
    for (const kind of ['game', 'chat', 'media', 'microphone'] as const) {
      const activeId = next.audio.activePresetIds[kind];
      if (activeId && !knownPresets.has(activeId)) next.audio.activePresetIds[kind] = null;
    }
    next.audio.capabilities = structuredClone(defaults.audio.capabilities);
    next.audio.host = null;
    if (next.audio.capabilities.applicationRouting === 'unavailable') {
      next.audio.applications = [];
      for (const bus of next.audio.buses) bus.appCount = 0;
    } else {
      const applicationCounts = new Map<string, number>();
      for (const application of next.audio.applications) {
        if (!application.active) continue;
        applicationCounts.set(application.destination, (applicationCounts.get(application.destination) ?? 0) + 1);
      }
      for (const bus of next.audio.buses) bus.appCount = applicationCounts.get(bus.id) ?? 0;
    }

    next.prototypeMode = true;
    next.engines = runtimeEngineKinds.map((kind) => ({
      kind,
      state: 'stopped',
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      updatedAt: new Date().toISOString(),
    }));
    next.capture.runtime = {
      ...defaults.capture.runtime,
      shortcutRegistered: false,
      state: 'stopped',
    };
    next.capture.autoCapture.runtime = structuredClone(defaults.capture.autoCapture.runtime);
    next.capture.autoCapture.providers = [];
    next.capture.storage.replayCacheBytes = 0;
    next.capture.sources = [];
    next.gameDetection.scanState = 'idle';
    next.gameDetection.error = undefined;
    next.performance = structuredClone(defaults.performance);
    return systemSnapshotSchema.parse(next);
  }

  private emit(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private persist(): Promise<void> {
    const payload = debugDiagnostics.measure('state.serialize', () => JSON.stringify({ ...this.snapshot, performance: { ...this.snapshot.performance, debug: undefined } }, null, 2));
    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        // Commit the previous validated generation before replacing the primary.
        if (this.persistedPayload !== null) {
          const previousPayload = this.persistedPayload;
          await debugDiagnostics.measureAsync('state.backup-write', () => writeDurableState(`${this.filePath}.bak`, previousPayload));
        }
        await debugDiagnostics.measureAsync('state.disk-write', () => writeDurableState(this.filePath, payload));
        this.persistedPayload = payload;
      })
      .catch((error) => {
        console.error('Failed to persist Switchboard state.', error);
      });

    return this.persistChain;
  }
}

function parsePersistedState(raw: string): SystemSnapshot {
  let value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
  value = migrateLegacyDeviceState(value);
  value = migrateAudioMixState(value);
  value = migrateLegacyCaptureState(value);
  value = migrateClipReviewState(value);
  value = migrateGameDetectionState(value);
  return systemSnapshotSchema.parse(migrateAppUpdateState(value));
}

async function writeDurableState(filePath: string, payload: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporaryPath, 'wx');
    try {
      await file.writeFile(payload, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function migrateLegacyDeviceState(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.devices)) return value;
  const defaults = createDefaultSnapshot();
  const byModule = new Map(defaults.devices.map((device) => [device.moduleId, device]));
  const migratedDevices = value.devices.map((candidate) => {
    if (!isRecord(candidate)) return candidate;
    const moduleId = typeof candidate.moduleId === 'string' ? candidate.moduleId : '';
    const fallback = byModule.get(moduleId);
    if (!fallback) return candidate;
    const capabilities = isRecord(candidate.capabilities)
      ? candidate.capabilities
      : structuredClone(fallback.capabilities);
    if (
      typeof candidate.batteryPercent === 'number'
      && isRecord(capabilities)
      && isRecord(capabilities.battery)
    ) {
      capabilities.battery.percentage = candidate.batteryPercent;
      capabilities.battery.updatedAt = Date.now();
    }
    return {
      ...structuredClone(fallback),
      ...candidate,
      id: typeof candidate.id === 'string' ? candidate.id : fallback.id,
      connected: typeof candidate.connected === 'boolean' ? candidate.connected : fallback.connected,
      identity: isRecord(candidate.identity) ? candidate.identity : structuredClone(fallback.identity),
      capabilities,
      settings: isRecord(candidate.settings)
        ? { ...structuredClone(fallback.settings), ...candidate.settings }
        : structuredClone(fallback.settings),
    };
  });

  return { ...value, devices: migratedDevices };
}

function migrateLegacyCaptureState(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const defaults = createDefaultSnapshot();
  const capture = isRecord(value.capture) ? value.capture : {};
  const config = isRecord(capture.config) ? capture.config : {};
  const runtime = isRecord(capture.runtime) ? capture.runtime : {};
  const legacySource = config.source;
  const source = legacySource === 'game'
    ? 'automatic-game'
    : legacySource === 'display' || legacySource === 'window' || legacySource === 'automatic-game'
      ? legacySource
      : defaults.capture.config.source;
  const clips = Array.isArray(value.clips)
    ? value.clips.filter((clip) => isRecord(clip) && typeof clip.durationMs === 'number' && typeof clip.fileSize === 'number')
    : [];

  return {
    ...value,
    clips,
    capture: {
      ...capture,
      config: {
        ...defaults.capture.config,
        ...config,
        source,
        sourceId: typeof config.sourceId === 'string' ? config.sourceId : null,
        includeSystemAudio: typeof config.includeSystemAudio === 'boolean' ? config.includeSystemAudio : true,
        includeChatAudio: typeof config.includeChatAudio === 'boolean' ? config.includeChatAudio : false,
        microphoneDeviceId: typeof config.microphoneDeviceId === 'string' ? config.microphoneDeviceId : null,
        systemAudioDeviceId: typeof config.systemAudioDeviceId === 'string' ? config.systemAudioDeviceId : null,
        chatAudioDeviceId: typeof config.chatAudioDeviceId === 'string' ? config.chatAudioDeviceId : null,
        clipsDirectory: typeof config.clipsDirectory === 'string' ? config.clipsDirectory : null,
        defaultTrackLevels: sanitizeDefaultTrackLevels(config.defaultTrackLevels, defaults.capture.config.defaultTrackLevels),
      },
      runtime: {
        ...defaults.capture.runtime,
        ...runtime,
        reactionClipping: isRecord(runtime.reactionClipping)
          ? { ...defaults.capture.runtime.reactionClipping, ...runtime.reactionClipping }
          : defaults.capture.runtime.reactionClipping,
      },
      storage: isRecord(capture.storage)
        ? { ...defaults.capture.storage, ...capture.storage }
        : defaults.capture.storage,
      capabilities: isRecord(capture.capabilities)
        ? { ...defaults.capture.capabilities, ...capture.capabilities }
        : defaults.capture.capabilities,
      sources: Array.isArray(capture.sources) ? capture.sources : [],
      autoCapture: isRecord(capture.autoCapture)
        ? {
            settings: isRecord(capture.autoCapture.settings)
              ? {
                  ...defaults.capture.autoCapture.settings,
                  ...capture.autoCapture.settings,
                  reactionClipping: isRecord(capture.autoCapture.settings.reactionClipping)
                    ? {
                        ...defaults.capture.autoCapture.settings.reactionClipping,
                        ...capture.autoCapture.settings.reactionClipping,
                      }
                    : defaults.capture.autoCapture.settings.reactionClipping,
                }
              : defaults.capture.autoCapture.settings,
            providers: [],
            runtime: defaults.capture.autoCapture.runtime,
          }
        : defaults.capture.autoCapture,
    },
  };
}

function migrateAudioMixState(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.audio)) return value;
  const defaults = createDefaultSnapshot();
  if (Array.isArray(value.audio.mixes)) {
    return { ...value, audio: { ...value.audio, host: null } };
  }

  const legacyBuses = Array.isArray(value.audio.buses) ? value.audio.buses : [];
  const legacyMaster = isRecord(value.audio.master) ? value.audio.master : {};
  const mixes = structuredClone(defaults.audio.mixes);
  const personal = mixes.find((mix) => mix.id === 'personal');
  if (personal) {
    if (typeof legacyMaster.gain === 'number') personal.master.gain = legacyMaster.gain;
    if (typeof legacyMaster.enabled === 'boolean') personal.master.enabled = legacyMaster.enabled;
    for (const candidate of legacyBuses) {
      if (!isRecord(candidate) || typeof candidate.id !== 'string') continue;
      const bus = personal.buses.find((entry) => entry.id === candidate.id);
      if (!bus) continue;
      if (typeof candidate.gain === 'number') bus.gain = candidate.gain;
      if (typeof candidate.enabled === 'boolean') bus.enabled = candidate.enabled;
      else if (typeof candidate.muted === 'boolean') bus.enabled = !candidate.muted;
    }
  }
  return { ...value, audio: { ...value.audio, mixes, host: null } };
}

function migrateGameDetectionState(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const defaults = createDefaultSnapshot();
  const settings = isRecord(value.settings) ? value.settings : {};
  const gameDetection = isRecord(value.gameDetection) ? value.gameDetection : {};
  return {
    ...value,
    settings: {
      ...defaults.settings,
      ...settings,
      visibleWorkspaces: migrateVisibleWorkspaces(settings.visibleWorkspaces, settings.workspaceProfile),
    },
    gameDetection: {
      ...defaults.gameDetection,
      ...gameDetection,
      games: Array.isArray(gameDetection.games) ? gameDetection.games : [],
      scanState: 'idle',
      error: undefined,
    },
  };
}

function migrateClipReviewState(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const clips = Array.isArray(value.clips)
    ? value.clips.filter((clip): clip is Record<string, unknown> => isRecord(clip))
    : [];
  const existing = isRecord(value.clipReview) ? value.clipReview.reviewedThrough : undefined;
  const reviewedThrough = typeof existing === 'number' && Number.isSafeInteger(existing) && existing >= 0
    ? existing
    : latestClipCreatedAt(clips
      .filter((clip) => typeof clip.createdAt === 'number' && Number.isSafeInteger(clip.createdAt) && clip.createdAt >= 0)
      .map((clip) => ({ createdAt: clip.createdAt as number })));
  return { ...value, clipReview: { reviewedThrough } };
}

function migrateAppUpdateState(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const defaults = createDefaultSnapshot();
  return {
    ...value,
    appUpdate: defaults.appUpdate,
  };
}

function sanitizeDefaultTrackLevels(
  value: unknown,
  fallback: { game: number; chat: number; microphone: number; media: number },
): { game: number; chat: number; microphone: number; media: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...fallback };
  const candidate = value as Record<string, unknown>;
  const sanitize = (entry: unknown, fallbackLevel: number): number => (
    typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry <= 100
      ? entry
      : fallbackLevel
  );
  return {
    game: sanitize(candidate.game, fallback.game),
    chat: sanitize(candidate.chat, fallback.chat),
    microphone: sanitize(candidate.microphone, fallback.microphone),
    media: sanitize(candidate.media, fallback.media),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
