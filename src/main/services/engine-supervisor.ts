import { debugDiagnostics } from './debug-diagnostics';
import { developerDiagnostics } from './developer-diagnostics';
import { EngineCommandWriter } from './engine-command-writer';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { app } from 'electron';
import { z } from 'zod';
import {
  engineKindSchema,
  engineStatusSchema,
  nativeDiagnosticsInputSchema,
  type EngineKind,
  type EngineStatus,
} from '../../shared/contracts';

type StatusListener = (status: EngineStatus) => void;
type EventListener = (kind: EngineKind, event: string, payload: unknown) => void;
type EngineProcess = ChildProcessWithoutNullStreams;

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
  z.object({
    type: z.literal('event'),
    event: z.string().min(1),
    payload: z.unknown().optional(),
  }),
]);

type WorkerMessage = z.infer<typeof workerMessageSchema>;

export class EngineSupervisor {
  private readonly processes = new Map<EngineKind, EngineProcess>();
  private readonly commandWriters = new Map<EngineProcess, EngineCommandWriter>();
  private readonly statuses = new Map<EngineKind, EngineStatus>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly starts = new Map<EngineKind, Promise<EngineStatus>>();
  private readonly expectedStops = new Set<EngineKind>();
  private readonly lastStderr = new Map<EngineKind, string>();

  public constructor(
    private readonly onStatus: StatusListener,
    private readonly onEvent: EventListener = () => undefined,
  ) {
    for (const kind of engineKindSchema.options) {
      this.statuses.set(kind, this.stoppedStatus(kind));
    }
  }

  public getStatus(kind: EngineKind): EngineStatus {
    return structuredClone(this.statuses.get(kind) ?? this.stoppedStatus(kind));
  }

  public hasLiveProcess(kind: EngineKind): boolean {
    const worker = this.processes.get(kind);
    return Boolean(worker?.pid && worker.exitCode === null && worker.signalCode === null);
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
      const exit = this.waitForExit(worker, 12_000);
      try {
        this.sendEnvelope(worker, { command: 'shutdown' });
      } catch {
        // A broken/full pipe cannot deliver graceful shutdown. Still release
        // the host and wait for its exit instead of abandoning a live process.
        worker.kill();
      }
      const exited = await exit;
      if (!exited) {
        worker.kill();
        const killed = await this.waitForExit(worker, 2_000);
        if (!killed) throw new Error(`${kind} engine did not exit after termination.`);
      }
    } catch (error) {
      this.expectedStops.delete(kind);
      throw error;
    } finally {
      this.commandWriters.get(worker)?.dispose();
      this.commandWriters.delete(worker);
      if (worker.exitCode !== null || worker.signalCode !== null) this.processes.delete(kind);
      this.failPending(kind, new Error(`${kind} engine stopped`));
    }

    const stopped = this.stoppedStatus(kind);
    this.updateStatus(stopped);
    return stopped;
  }

  public send(kind: EngineKind, command: string, payload?: unknown): void {
    const worker = this.processes.get(kind);
    if (!worker?.pid) return;
    if (command !== 'setMeterDemand') developerDiagnostics.record(kind, 'debug', 'host.send', { command });
    debugDiagnostics.measure(`host.send:${kind}:${command}`, () => this.sendEnvelope(worker, { command, payload }));
  }

  public request<T>(kind: EngineKind, command: string, payload?: unknown, timeoutMs = 10_000): Promise<T> {
    if (!developerDiagnostics.enabled) {
      return debugDiagnostics.measureAsync(`host.request:${kind}:${command}`, () => this.requestUnmeasured<T>(kind, command, payload, timeoutMs));
    }
    return debugDiagnostics.measureAsync(`host.request:${kind}:${command}`, async () => {
      const started = performance.now();
      const recording = developerDiagnostics.recordingId;
      const request = randomUUID();
      developerDiagnostics.record(kind, 'debug', 'host.request', { command, request, timeoutMs });
      try {
        const result = await this.requestUnmeasured<T>(kind, command, payload, timeoutMs);
        if (recording === developerDiagnostics.recordingId) developerDiagnostics.record(kind, 'debug', 'host.response', { command, request, elapsedMs: performance.now() - started });
        return result;
      } catch (error) {
        if (recording === developerDiagnostics.recordingId) developerDiagnostics.record(kind, 'error', 'host.request-failed', {
          command, request, elapsedMs: performance.now() - started,
          error: String(error).slice(0, 4096),
        });
        throw error;
      }
    });
  }

  public async syncDeveloperDiagnostics(): Promise<void> {
    const worker = this.processes.get('capture');
    if (worker?.pid && worker.exitCode === null && worker.signalCode === null) {
      await this.request('capture', 'setDiagnostics', nativeDiagnosticsInputSchema.parse({ enabled: developerDiagnostics.enabled }));
    }
  }

  private requestUnmeasured<T>(kind: EngineKind, command: string, payload: unknown, timeoutMs: number): Promise<T> {
    const worker = this.processes.get(kind);
    if (!worker?.pid || worker.exitCode !== null || worker.signalCode !== null) {
      const detail = this.describeUnavailable(kind);
      return Promise.reject(new Error(`${kind} engine is not running${detail}`));
    }

    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      let cancelSend = () => {};
      const timeout = setTimeout(() => {
        cancelSend();
        this.pending.delete(requestId);
        reject(new Error(`${kind} engine request timed out: ${command}`));
      }, timeoutMs);

      this.pending.set(requestId, {
        kind,
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      try {
        cancelSend = this.sendEnvelope(worker, { requestId, command, payload });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(requestId);
        const detail = error instanceof Error ? `: ${error.message}` : '';
        reject(new Error(`${kind} engine could not accept ${command}${detail}`));
      }
    });
  }

  public async dispose(): Promise<void> {
    const results = await Promise.allSettled(engineKindSchema.options.map((kind) => this.stop(kind)));
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Engine supervisor disposed'));
    }
    this.pending.clear();
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length) throw new AggregateError(failures, 'Engine hosts did not finish shutting down.');
  }

  private async startProcess(kind: EngineKind): Promise<EngineStatus> {
    this.lastStderr.delete(kind);
    this.updateStatus({
      ...this.stoppedStatus(kind),
      state: 'starting',
      message: 'Starting isolated engine host…',
    });

    let worker: EngineProcess;
    try {
      worker = this.spawnCaptureHost();
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
      await this.waitForSpawn(worker, 8_000);
      return this.getStatus(kind);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.processes.delete(kind);
      this.failPending(kind, normalized);
      this.commandWriters.get(worker)?.dispose();
      this.commandWriters.delete(worker);
      worker.kill();
      this.updateStatus({
        ...this.stoppedStatus(kind),
        state: 'error',
        message: normalized.message,
      });
      throw normalized;
    }
  }

  private spawnCaptureHost(): ChildProcessWithoutNullStreams {
    const resolved = this.resolveCaptureHost();
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    environment.SWITCHBOARD_DEVELOPER_DIAGNOSTICS = developerDiagnostics.enabled ? '1' : '0';
    developerDiagnostics.record('capture', 'info', 'host.spawn', { packaged: app.isPackaged });
    return spawn(resolved.command, resolved.arguments, {
      cwd: app.isPackaged ? join(process.resourcesPath, 'capture-host') : app.getAppPath(),
      env: environment,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  private attachWorkerListeners(kind: EngineKind, worker: EngineProcess): void {
    this.commandWriters.set(worker, new EngineCommandWriter(worker.stdin, (error) => {
      if (this.expectedStops.has(kind)) this.failPending(kind, error);
      else this.handleProcessError(kind, error);
    }));
    const lines = createInterface({ input: worker.stdout });
    lines.on('line', (line) => {
      try { this.handleWorkerMessage(kind, JSON.parse(line)); }
      catch (error) {
        developerDiagnostics.record(kind, 'error', 'host.invalid-json', { error: String(error).slice(0, 4096) });
        console.warn(`[${kind}] ignored malformed host output`, error);
      }
    });
    worker.stderr.on('data', (chunk) => {
      const message = String(chunk).trim();
      if (message) {
        developerDiagnostics.record(kind, 'warning', 'host.stderr', { message: message.slice(-4096) });
        const previous = this.lastStderr.get(kind) ?? '';
        this.lastStderr.set(kind, `${previous}${previous ? '\n' : ''}${message}`.slice(-4096));
        console.warn(`[${kind}] ${message}`);
      }
    });
    worker.stdin.on('error', (streamError) => {
      developerDiagnostics.record(kind, 'error', 'host.stdin-error', { error: streamError.message.slice(0, 4096) });
      console.warn(`[${kind}] engine stdin error`, streamError);
    });
    worker.on('error', (processError) => this.handleProcessError(kind, processError));

    (worker as unknown as EventEmitter).on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.commandWriters.get(worker)?.dispose();
      this.commandWriters.delete(worker);
      if (this.processes.get(kind) === worker) this.processes.delete(kind);
      const expected = this.expectedStops.delete(kind);
      developerDiagnostics.record(kind, expected ? 'info' : 'error', 'host.exit', { code, signal, expected, pid: worker.pid ?? null });
      const stderrTail = (this.lastStderr.get(kind) ?? '').trim().split('\n').slice(-3).join(' ').slice(0, 240);
      const exitDetail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      const detail = stderrTail ? ` (${exitDetail}; ${stderrTail})` : ` (${exitDetail})`;
      this.failPending(kind, new Error(`${kind} engine exited${detail}`));
      this.updateStatus({
        ...this.stoppedStatus(kind),
        state: expected || code === 0 ? 'stopped' : 'error',
        message: expected || code === 0 ? undefined : `Engine exited with ${exitDetail}${stderrTail ? `: ${stderrTail}` : ''}`,
      });
      if (expected) this.lastStderr.delete(kind);
    });

  }

  private handleProcessError(kind: EngineKind, error: Error): void {
    developerDiagnostics.record(kind, 'error', 'host.process-error', { error: error.message.slice(0, 4096) });
    this.failPending(kind, error);
    this.updateStatus({ ...this.stoppedStatus(kind), state: 'error', message: error.message });
  }

  private handleWorkerMessage(kind: EngineKind, raw: unknown): void {
    const parsed = workerMessageSchema.safeParse(raw);
    if (!parsed.success) {
      developerDiagnostics.record(kind, 'error', 'host.invalid-message', { issues: parsed.error.issues.map(issue => `${issue.path.join('.')}:${issue.code}`).join(', ').slice(0, 4096) });
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

    if (message.type === 'event') {
      if (message.event === 'captureDiagnostic' && kind === 'capture') {
        developerDiagnostics.receive('capture', message.payload);
        return;
      }
      this.onEvent(kind, message.event, message.payload);
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

  private describeUnavailable(kind: EngineKind): string {
    const status = this.statuses.get(kind);
    if (status?.message) return `: ${status.message}`;
    const stderrTail = (this.lastStderr.get(kind) ?? '').trim().split('\n').slice(-1)[0]?.slice(0, 240);
    return stderrTail ? `: ${stderrTail}` : '';
  }

  private sendEnvelope(worker: EngineProcess, message: Record<string, unknown>): () => void {
    if (worker.exitCode !== null || worker.signalCode !== null) {
      throw new Error('engine process already exited');
    }
    const writer = this.commandWriters.get(worker);
    if (!writer) throw new Error('Engine command pipe is unavailable.');
    return writer.send(message);
  }

  private waitForSpawn(worker: EngineProcess, timeoutMs: number): Promise<void> {
    if (worker.pid) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Engine process did not spawn before the timeout.'));
      }, timeoutMs);

      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (...details: unknown[]) => {
        cleanup();
        reject(new Error(details.map(String).join(' ')));
      };
      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`Engine exited during startup with code ${code}`));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        const emitter = worker as unknown as EventEmitter;
        emitter.removeListener('spawn', onSpawn);
        emitter.removeListener('error', onError);
        emitter.removeListener('exit', onExit);
      };

      const emitter = worker as unknown as EventEmitter;
      emitter.once('spawn', onSpawn);
      emitter.once('error', onError);
      emitter.once('exit', onExit);
    });
  }

  private waitForExit(worker: EngineProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        (worker as unknown as EventEmitter).removeListener('exit', onExit);
        resolve(false);
      }, timeoutMs);
      const onExit = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      (worker as unknown as EventEmitter).once('exit', onExit);
    });
  }

  private resolveCaptureHost(): { command: string; arguments: string[] } {
    if (app.isPackaged) {
      const executable = join(process.resourcesPath, 'capture-host', 'Capture.Host.exe');
      if (!existsSync(executable)) throw new Error('The Capture.Host executable is missing from this installation.');
      return { command: executable, arguments: [] };
    }
    const configuredExecutable = process.env.SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST;
    if (configuredExecutable && existsSync(configuredExecutable)) {
      return { command: configuredExecutable, arguments: [] };
    }
    const executable = join(app.getAppPath(), 'engines', 'capture-host', 'bin', 'Debug', 'net10.0-windows', 'Capture.Host.exe');
    if (existsSync(executable)) return { command: executable, arguments: [] };
    const project = join(app.getAppPath(), 'engines', 'capture-host', 'Capture.Host.csproj');
    return { command: 'dotnet', arguments: ['run', '--project', project, '--no-launch-profile'] };
  }

  private updateStatus(status: EngineStatus): void {
    const normalized = engineStatusSchema.parse({ ...status, updatedAt: new Date().toISOString() });
    const previous = this.statuses.get(status.kind);
    if (previous?.state !== normalized.state || previous?.message !== normalized.message || previous?.pid !== normalized.pid) {
      developerDiagnostics.record(status.kind, normalized.state === 'error' ? 'error' : 'info', 'host.state', {
        state: normalized.state, previousState: previous?.state ?? null, pid: normalized.pid ?? null,
        message: normalized.message?.slice(0, 4096) ?? null,
      });
    }
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
