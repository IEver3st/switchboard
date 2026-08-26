import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app, utilityProcess, type UtilityProcess } from 'electron';
import { z } from 'zod';
import {
  engineKindSchema,
  engineStatusSchema,
  type EngineKind,
  type EngineStatus,
} from '../../shared/contracts';

type StatusListener = (status: EngineStatus) => void;

type PendingRequest = {
  kind: EngineKind;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

const workerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    status: engineStatusSchema,
  }),
  z.object({
    type: z.literal('response'),
    requestId: z.string().min(1),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
]);

type WorkerMessage = z.infer<typeof workerMessageSchema>;

export class EngineSupervisor {
  private readonly processes = new Map<EngineKind, UtilityProcess>();
  private readonly statuses = new Map<EngineKind, EngineStatus>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly starts = new Map<EngineKind, Promise<EngineStatus>>();
  private readonly expectedStops = new Set<EngineKind>();

  public constructor(private readonly onStatus: StatusListener) {
    for (const kind of engineKindSchema.options) {
      this.statuses.set(kind, this.stoppedStatus(kind));
    }
  }

  public getStatus(kind: EngineKind): EngineStatus {
    return structuredClone(this.statuses.get(kind) ?? this.stoppedStatus(kind));
  }

  public start(kind: EngineKind): Promise<EngineStatus> {
    const existing = this.processes.get(kind);
    if (existing?.pid) return Promise.resolve(this.getStatus(kind));

    const inFlight = this.starts.get(kind);
    if (inFlight) return inFlight;

    const operation = this.startProcess(kind).finally(() => {
      this.starts.delete(kind);
    });
    this.starts.set(kind, operation);
    return operation;
  }

  public async stop(kind: EngineKind): Promise<EngineStatus> {
    const inFlight = this.starts.get(kind);
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        // A failed start already transitions the engine into an error state.
      }
    }

    const worker = this.processes.get(kind);
    if (!worker) {
      const stopped = this.stoppedStatus(kind);
      this.updateStatus(stopped);
      return stopped;
    }

    this.expectedStops.add(kind);
    try {
      worker.postMessage({ type: 'command', command: 'shutdown' });
      const exited = await this.waitForExit(worker, 900);
      if (!exited) {
        worker.kill();
        await this.waitForExit(worker, 500);
      }
    } finally {
      this.expectedStops.delete(kind);
      this.processes.delete(kind);
      this.failPending(kind, new Error(`${kind} engine stopped`));
    }

    const stopped = this.stoppedStatus(kind);
    this.updateStatus(stopped);
    return stopped;
  }

  public send(kind: EngineKind, command: string, payload?: unknown): void {
    const worker = this.processes.get(kind);
    if (!worker?.pid) return;
    worker.postMessage({ type: 'command', command, payload });
  }

  public request<T>(kind: EngineKind, command: string, payload?: unknown, timeoutMs = 5_000): Promise<T> {
    const worker = this.processes.get(kind);
    if (!worker?.pid) {
      return Promise.reject(new Error(`${kind} engine is not running`));
    }

    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${kind} engine request timed out: ${command}`));
      }, timeoutMs);

      this.pending.set(requestId, {
        kind,
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      worker.postMessage({ type: 'request', requestId, command, payload });
    });
  }

  public async dispose(): Promise<void> {
    await Promise.allSettled(engineKindSchema.options.map((kind) => this.stop(kind)));
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Engine supervisor disposed'));
    }
    this.pending.clear();
  }

  private async startProcess(kind: EngineKind): Promise<EngineStatus> {
    this.updateStatus({
      ...this.stoppedStatus(kind),
      state: 'starting',
      message: 'Starting isolated engine host…',
    });

    let worker: UtilityProcess;
    try {
      worker = utilityProcess.fork(this.resolveWorkerPath(kind), [], {
        serviceName: `Switchboard ${kind} engine`,
        stdio: 'pipe',
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.updateStatus({
        ...this.stoppedStatus(kind),
        state: 'error',
        message: normalized.message,
      });
      throw normalized;
    }

    this.processes.set(kind, worker);
    this.attachWorkerListeners(kind, worker);

    try {
      await this.waitForSpawn(worker, 3_000);
      this.updateStatus({
        kind,
        state: 'running',
        pid: worker.pid,
        cpuPercent: 0,
        memoryMb: 0,
        uptimeSeconds: 0,
        message: 'Prototype engine simulation active',
        updatedAt: new Date().toISOString(),
      });
      worker.postMessage({ type: 'command', command: 'start' });
      return this.getStatus(kind);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.processes.delete(kind);
      this.failPending(kind, normalized);
      worker.kill();
      this.updateStatus({
        ...this.stoppedStatus(kind),
        state: 'error',
        message: normalized.message,
      });
      throw normalized;
    }
  }

  private attachWorkerListeners(kind: EngineKind, worker: UtilityProcess): void {
    worker.on('message', (raw: unknown) => this.handleWorkerMessage(kind, raw));

    worker.on('exit', (code) => {
      if (this.processes.get(kind) === worker) this.processes.delete(kind);
      const expected = this.expectedStops.has(kind);
      this.failPending(kind, new Error(`${kind} engine exited`));
      this.updateStatus({
        ...this.stoppedStatus(kind),
        state: expected || code === 0 ? 'stopped' : 'error',
        message: expected || code === 0 ? undefined : `Engine exited with code ${code}`,
      });
    });

    worker.on('error', (error) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.failPending(kind, normalized);
      this.updateStatus({
        ...this.stoppedStatus(kind),
        state: 'error',
        message: normalized.message,
      });
    });

    worker.stdout?.on('data', (chunk) => console.debug(`[${kind}] ${String(chunk).trim()}`));
    worker.stderr?.on('data', (chunk) => console.warn(`[${kind}] ${String(chunk).trim()}`));
  }

  private handleWorkerMessage(kind: EngineKind, raw: unknown): void {
    const parsed = workerMessageSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[${kind}] ignored malformed worker message`, parsed.error);
      return;
    }

    const message: WorkerMessage = parsed.data;
    if (message.type === 'status') {
      if (message.status.kind !== kind) {
        console.warn(`[${kind}] ignored status for ${message.status.kind}`);
        return;
      }
      this.updateStatus(message.status);
      return;
    }

    const request = this.pending.get(message.requestId);
    if (!request || request.kind !== kind) return;
    clearTimeout(request.timeout);
    this.pending.delete(message.requestId);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  }

  private failPending(kind: EngineKind, error: Error): void {
    for (const [requestId, request] of this.pending.entries()) {
      if (request.kind !== kind) continue;
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(requestId);
    }
  }

  private waitForSpawn(worker: UtilityProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Engine process did not spawn before the timeout.'));
      }, timeoutMs);

      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onExit = (code: number) => {
        cleanup();
        reject(new Error(`Engine exited during startup with code ${code}`));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        worker.removeListener('spawn', onSpawn);
        worker.removeListener('error', onError);
        worker.removeListener('exit', onExit);
      };

      worker.once('spawn', onSpawn);
      worker.once('error', onError);
      worker.once('exit', onExit);
    });
  }

  private waitForExit(worker: UtilityProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        worker.removeListener('exit', onExit);
        resolve(false);
      }, timeoutMs);
      const onExit = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      worker.once('exit', onExit);
    });
  }

  private resolveWorkerPath(kind: EngineKind): string {
    const workerDirectory = app.isPackaged
      ? join(process.resourcesPath, 'engine-workers')
      : join(app.getAppPath(), 'resources', 'engine-workers');
    return join(workerDirectory, `${kind}-worker.cjs`);
  }

  private updateStatus(status: EngineStatus): void {
    const normalized = engineStatusSchema.parse({ ...status, updatedAt: new Date().toISOString() });
    this.statuses.set(status.kind, normalized);
    this.onStatus(structuredClone(normalized));
  }

  private stoppedStatus(kind: EngineKind): EngineStatus {
    return {
      kind,
      state: 'stopped',
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}
