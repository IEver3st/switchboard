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
      const parsed = systemSnapshotSchema.safeParse(JSON.parse(raw));
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
    const visualDefaults = new Map(createDefaultSnapshot().devices.map((device) => [device.imageKey, device]));
    for (const device of next.devices) {
      const fallback = visualDefaults.get(device.imageKey);
      if (!fallback) continue;
      device.appearance ??= fallback.appearance ? structuredClone(fallback.appearance) : undefined;
      if (!Object.hasOwn(device.settings, 'lightingColor') && Object.hasOwn(fallback.settings, 'lightingColor')) {
        device.settings.lightingColor = fallback.settings.lightingColor;
      }
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
    next.capture.runtime.bufferedSeconds = 0;
    next.capture.runtime.segmentCount = 0;
    next.capture.runtime.estimatedDiskMb = 0;
    next.capture.runtime.droppedFrames = 0;
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
