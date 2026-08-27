import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { systemSnapshotSchema, type EngineKind, type SystemSnapshot } from '../../shared/contracts';
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
  private rendererActive = true;

  public constructor(private readonly filePath: string) {}

  public async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = systemSnapshotSchema.safeParse(
        migrateAppUpdateState(migrateGameDetectionState(migrateLegacyCaptureState(migrateAudioMixState(migrateLegacyDeviceState(JSON.parse(raw)))))),
      );
      if (parsed.success) {
        this.snapshot = this.resetRuntimeState(parsed.data);
        return;
      }

      console.warn('Switchboard state did not match the current schema. Defaults will be used.', parsed.error);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('Failed to load Switchboard state. Defaults will be used.', error);
      }
    }

    this.snapshot = createDefaultSnapshot();
    this.snapshot.performance = this.calculatePerformance(this.snapshot);
    await this.persist();
  }

  public get(): SystemSnapshot {
    return structuredClone(this.snapshot);
  }

  public update(mutator: (draft: SystemSnapshot) => void, options: UpdateOptions = {}): SystemSnapshot {
    const { persist = true, emit = true } = options;
    const next = structuredClone(this.snapshot);
    mutator(next);
    next.performance = this.calculatePerformance(next);
    this.snapshot = systemSnapshotSchema.parse(next);

    if (emit) this.emit();
    if (persist) void this.persist();
    return this.get();
  }

  public restore(snapshot: SystemSnapshot): SystemSnapshot {
    const parsed = systemSnapshotSchema.parse(structuredClone(snapshot));
    parsed.performance = this.calculatePerformance(parsed);
    this.snapshot = parsed;
    this.emit();
    void this.persist();
    return this.get();
  }

  public setRendererActive(active: boolean): SystemSnapshot {
    if (this.rendererActive === active) return this.get();
    this.rendererActive = active;
    return this.update(() => undefined, { persist: false });
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
    next.capture.storage.replayCacheBytes = 0;
    next.capture.sources = [];
    next.gameDetection.scanState = 'idle';
    next.gameDetection.error = undefined;
    next.performance = this.calculatePerformance(next);
    return systemSnapshotSchema.parse(next);
  }

  private emit(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private calculatePerformance(snapshot: SystemSnapshot): SystemSnapshot['performance'] {
    const engineMemory = snapshot.engines.reduce((sum, engine) => sum + engine.memoryMb, 0);
    const engineCpu = snapshot.engines.reduce((sum, engine) => sum + engine.cpuPercent, 0);
    const rendererMemory = this.rendererActive ? 92 : 0;
    const coreMemory = 44;
    const baseCpu = this.rendererActive ? 0.3 : 0.1;

    return {
      ...snapshot.performance,
      coreMemoryMb: coreMemory,
      rendererMemoryMb: rendererMemory,
      totalMemoryMb: Math.round((coreMemory + rendererMemory + engineMemory) * 10) / 10,
      totalCpuPercent: Math.round((baseCpu + engineCpu) * 10) / 10,
      activeProcesses:
        1 +
        (this.rendererActive ? 1 : 0) +
        snapshot.engines.filter((engine) => engine.state === 'running' || engine.state === 'starting').length,
    };
  }

  private persist(): Promise<void> {
    const payload = JSON.stringify(this.snapshot, null, 2);
    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.tmp`;
        await writeFile(temporaryPath, payload, 'utf8');
        await rename(temporaryPath, this.filePath);
      })
      .catch((error) => {
        console.error('Failed to persist Switchboard state.', error);
      });

    return this.persistChain;
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
        clipsDirectory: typeof config.clipsDirectory === 'string' ? config.clipsDirectory : null,
      },
      runtime: { ...defaults.capture.runtime, ...runtime },
      storage: isRecord(capture.storage)
        ? { ...defaults.capture.storage, ...capture.storage }
        : defaults.capture.storage,
      capabilities: isRecord(capture.capabilities)
        ? { ...defaults.capture.capabilities, ...capture.capabilities }
        : defaults.capture.capabilities,
      sources: Array.isArray(capture.sources) ? capture.sources : [],
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
    settings: { ...defaults.settings, ...settings },
    gameDetection: {
      ...defaults.gameDetection,
      ...gameDetection,
      games: Array.isArray(gameDetection.games) ? gameDetection.games : [],
      scanState: 'idle',
      error: undefined,
    },
  };
}

function migrateAppUpdateState(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const defaults = createDefaultSnapshot();
  return {
    ...value,
    appUpdate: defaults.appUpdate,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
