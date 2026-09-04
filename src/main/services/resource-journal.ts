import type { DebugDiagnostics } from '../../shared/contracts';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const defaultMaximumFileBytes = 8 * 1_024 * 1_024;
const pruneIntervalMs = 6 * 60 * 60 * 1_000;

export type ResourceTelemetrySample = {
  debug?: DebugDiagnostics;
  schemaVersion: 1;
  kind: 'resource-sample';
  sampledAt: string;
  sequence: number;
  uptimeSeconds: number;
  rendererActive: boolean;
  guardState: 'disabled' | 'collecting' | 'within-budget' | 'over-budget';
  flags: Array<'over-budget' | 'rapid-growth'>;
  budget: {
    memoryMb: number;
    cpuPercent: number;
  };
  totals: {
    electronPrivateMb: number;
    electronWorkingSetMb: number;
    engineReportedMemoryMb: number;
    enginePrivateMb: number;
    engineWorkingSetMb: number;
    attributedMemoryMb: number;
    cpuPercent: number;
    processCount: number;
  };
  electronProcesses: Array<{
    pid: number;
    type: string;
    privateMb: number;
    workingSetMb: number;
    peakWorkingSetMb: number;
    cpuPercent: number;
  }>;
  engines: Array<{
    kind: 'audio' | 'capture';
    pid: number | null;
    state: string;
    reportedMemoryMb: number;
    cpuPercent: number;
    processes: Array<{
      pid: number;
      role: string;
      privateMemoryMb: number;
      workingSetMb: number;
    }>;
  }>;
  mainRuntime: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
    activeResources: Record<string, number>;
  };
  rendererRuntime: {
    longTasks?: { supported: boolean; count: number; totalMs: number; maxMs: number } | null;
    route: string;
    jsHeapUsedMb: number | null;
    jsHeapTotalMb: number | null;
    jsHeapLimitMb: number | null;
    domNodes: number;
    canvasCount: number;
    imageCount: number;
    videoCount: number;
    playingVideoCount: number;
    resourceEntryCount: number;
  } | null;
  system: {
    totalMemoryMb: number;
    freeMemoryMb: number;
  };
};

type ResourceJournalOptions = {
  directory: string;
  getRetentionDays: () => number;
  maximumFileBytes?: number;
  now?: () => number;
};

export class ResourceJournal {
  private readonly sessionId = randomUUID();
  private readonly maximumFileBytes: number;
  private readonly now: () => number;
  private readonly startedAt: number;
  private writeChain: Promise<void> = Promise.resolve();
  private fileBytes = 0;
  private part = 0;
  private lastPrunedAt = 0;
  private disposed = false;
  private pendingWrites = 0;
  private droppedWrites = 0;

  public getDroppedWrites(): number { return this.droppedWrites; }

  public constructor(private readonly options: ResourceJournalOptions) {
    this.maximumFileBytes = options.maximumFileBytes ?? defaultMaximumFileBytes;
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
  }

  public record(sample: ResourceTelemetrySample): void {
    if (this.disposed) return;
    if (this.pendingWrites >= 4) { this.droppedWrites++; return; }
    const line = `${JSON.stringify(sample)}\n`;
    this.pendingWrites++;
    const lineBytes = Buffer.byteLength(line);
    this.writeChain = this.writeChain
      .then(async () => {
        await mkdir(this.options.directory, { recursive: true });
        await this.pruneIfDue();
        if (this.fileBytes > 0 && this.fileBytes + lineBytes > this.maximumFileBytes) {
          this.part += 1;
          this.fileBytes = 0;
        }
        await appendFile(this.currentFilePath(), line, 'utf8');
        this.fileBytes += lineBytes;
      })
      .catch((error) => {
        this.droppedWrites++;
        console.warn('Resource journal write failed.', error);
      }).finally(() => { this.pendingWrites--; });
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    await this.writeChain;
  }

  public getDirectory(): string {
    return this.options.directory;
  }

  private currentFilePath(): string {
    const started = new Date(this.startedAt).toISOString().replaceAll(':', '').replaceAll('.', '-');
    return join(this.options.directory, `resource-${started}-${this.sessionId}-${this.part}.jsonl`);
  }

  private async pruneIfDue(): Promise<void> {
    const now = this.now();
    if (this.lastPrunedAt && now - this.lastPrunedAt < pruneIntervalMs) return;
    this.lastPrunedAt = now;
    const retentionDays = Math.min(30, Math.max(1, Math.round(this.options.getRetentionDays())));
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1_000;
    const entries = await readdir(this.options.directory, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^resource-.*\.jsonl$/i.test(entry.name))
      .map(async (entry) => {
        const path = join(this.options.directory, entry.name);
        const details = await stat(path);
        if (details.mtimeMs < cutoff) await unlink(path);
      }));
  }
}
