import { debugDiagnostics } from './debug-diagnostics';
import type { ProcessMetric } from 'electron';
import { freemem, totalmem } from 'node:os';
import { z } from 'zod';
import type { DebugDiagnostics, EngineStatus, PerformanceSnapshot } from '../../shared/contracts';
import type { ResourceTelemetrySample } from './resource-journal';

const sampleIntervalMs = 5_000;
const publishIntervalMs = 30_000;
const rollingWindowSamples = 12;
const consecutiveFailedWindows = 3;
const resourceRecordIntervalMs = 30_000;
const anomalyRecordIntervalMs = 15_000;

export const performanceMemoryBudgetsMb = {
  coreTray: 270,
  rendererOpen: 340,
  audioEngine: 65,
  captureEngine: 1_000,
} as const;

export type PerformanceRuntimeContext = {
  rendererActive: boolean;
  guardEnabled: boolean;
  detailedDiagnostics?: boolean;
  engines: EngineStatus[];
};

type PerformanceMonitorOptions = {
  getProcessMetrics: () => ProcessMetric[];
  getContext: () => PerformanceRuntimeContext;
  publish: (snapshot: PerformanceSnapshot) => void;
  getRendererRuntime?: () => Promise<unknown>;
  recordSample?: (sample: ResourceTelemetrySample) => void;
  now?: () => number;
};

type ResourceSample = Pick<PerformanceSnapshot, 'totalMemoryMb' | 'totalCpuPercent' | 'budgetMemoryMb' | 'budgetCpuPercent'>;

export class PerformanceBudgetGuard {
  private samples: ResourceSample[] = [];
  private failedWindows = 0;
  private budgetSignature = '';

  public evaluate(sample: ResourceSample, enabled: boolean): Pick<PerformanceSnapshot, 'guardState' | 'warning'> {
    if (!enabled) {
      this.reset();
      return { guardState: 'disabled', warning: null };
    }

    const signature = `${sample.budgetMemoryMb}:${sample.budgetCpuPercent}`;
    if (signature !== this.budgetSignature) {
      this.samples = [];
      this.failedWindows = 0;
      this.budgetSignature = signature;
    }

    this.samples.push(sample);
    if (this.samples.length > rollingWindowSamples) this.samples.shift();
    if (this.samples.length < rollingWindowSamples) return { guardState: 'collecting', warning: null };

    const medianMemory = median(this.samples.map((candidate) => candidate.totalMemoryMb));
    const medianCpu = median(this.samples.map((candidate) => candidate.totalCpuPercent));
    const memoryFailed = medianMemory >= sample.budgetMemoryMb;
    const cpuFailed = medianCpu >= sample.budgetCpuPercent;
    this.failedWindows = memoryFailed || cpuFailed ? this.failedWindows + 1 : 0;

    if (this.failedWindows < consecutiveFailedWindows) {
      return { guardState: memoryFailed || cpuFailed ? 'collecting' : 'within-budget', warning: null };
    }

    const failures = [
      memoryFailed ? `${round(medianMemory)} MB private memory (budget ${sample.budgetMemoryMb} MB)` : null,
      cpuFailed ? `${round(medianCpu)}% CPU (budget ${sample.budgetCpuPercent}%)` : null,
    ].filter(Boolean);
    return {
      guardState: 'over-budget',
      warning: `Sustained resource use is above budget: ${failures.join(' and ')}.`,
    };
  }

  private reset(): void {
    this.samples = [];
    this.failedWindows = 0;
    this.budgetSignature = '';
  }
}

export class PerformanceMonitor {
  private readonly guard = new PerformanceBudgetGuard();
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private lastPublishedAt = 0;
  private lastResourceRecordedAt = 0;
  private lastGuardState: PerformanceSnapshot['guardState'] | null = null;
  private previousTotalMemoryMb: number | null = null;
  private sequence = 0;
  private sampling = false;
  private disposed = false;
  private pendingRendererProbe: Promise<unknown> | null = null;
  private debugEpoch = 0;
  private debugHistory: ResourceTelemetrySample[] = [];

  public getDebugHistory(): ResourceTelemetrySample[] { return structuredClone(this.debugHistory); }

  public clearDebugHistory(): void { this.debugEpoch++; this.debugHistory = []; }

  public invalidateDebugSample(): void { this.debugEpoch++; }

  public constructor(private readonly options: PerformanceMonitorOptions) {
    this.now = options.now ?? Date.now;
  }

  public start(): void {
    if (this.timer || this.disposed) return;
    this.started = true;
    void this.sample(true);
    this.timer = setInterval(() => void this.sample(false), sampleIntervalMs);
    this.timer.unref();
  }

  public refresh(): void {
    if (this.disposed || !this.started) return;
    void this.sample(true);
  }

  public dispose(): void {
    this.disposed = true;
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sample(forcePublish: boolean): Promise<void> {
    if (this.disposed || this.sampling) return;
    this.sampling = true;
    try {
      const context = this.options.getContext();
      const debugEpoch = this.debugEpoch;
      const debugGeneration = context.detailedDiagnostics === true;
      const measuredAt = this.now();
      const metrics = this.options.getProcessMetrics();
      const measured = measurePerformance(metrics, context, measuredAt);
      const guard = this.guard.evaluate(measured, context.guardEnabled);
      const snapshot: PerformanceSnapshot = { ...measured, ...guard };
      if (debugGeneration) snapshot.debug = debugDiagnostics.snapshot();
      const guardChanged = this.lastGuardState !== snapshot.guardState;
      const rapidGrowth = this.previousTotalMemoryMb !== null
        && measured.totalMemoryMb - this.previousTotalMemoryMb >= Math.max(32, measured.budgetMemoryMb * 0.1);
      const overBudget = measured.totalMemoryMb >= measured.budgetMemoryMb;
      this.previousTotalMemoryMb = measured.totalMemoryMb;
      const recordInterval = debugGeneration ? sampleIntervalMs : overBudget || rapidGrowth ? anomalyRecordIntervalMs : resourceRecordIntervalMs;
      const shouldRecord = Boolean(this.options.recordSample)
        && (forcePublish || guardChanged || measuredAt - this.lastResourceRecordedAt >= recordInterval);

      if (shouldRecord) {
        let rendererRuntime: unknown = null;
        const shouldProbeRenderer = shouldCollectRendererRuntime({
          rendererActive: context.rendererActive,
          hasProbe: Boolean(this.options.getRendererRuntime),
          overBudget,
          rapidGrowth,
          guardState: snapshot.guardState,
        });
        if ((shouldProbeRenderer || (debugGeneration && context.rendererActive)) && this.options.getRendererRuntime) {
          try {
            if (!this.pendingRendererProbe) {
              const probe = this.options.getRendererRuntime();
              this.pendingRendererProbe = probe;
              const clear = () => { if (this.pendingRendererProbe === probe) this.pendingRendererProbe = null; };
              void probe.then(clear, clear);
              rendererRuntime = await boundedRendererProbe(() => probe);
            }
          } catch {
            // Renderer teardown can race a sample. The Electron process metrics remain useful.
          }
        }
        this.lastResourceRecordedAt = measuredAt;
        this.sequence += 1;
        if (this.disposed || debugEpoch !== this.debugEpoch) return;
        // A disable while awaiting a renderer probe must not publish stale debug data.
        if (debugGeneration && !this.options.getContext().detailedDiagnostics) return;
        const resourceSample = buildResourceTelemetrySample({
          metrics,
          context,
          performance: snapshot,
          rendererRuntime,
          sequence: this.sequence,
          flags: [overBudget ? 'over-budget' : null, rapidGrowth ? 'rapid-growth' : null].filter(
            (flag): flag is ResourceTelemetrySample['flags'][number] => flag !== null,
          ),
        });
        if (snapshot.debug) {
          snapshot.debug.processes = [
            ...resourceSample.electronProcesses.map(p => ({ ...p, role: p.type })),
            ...resourceSample.engines.filter(e => e.state === 'running' || e.state === 'starting').flatMap<DebugDiagnostics['processes'][number]>(e => e.processes.length
              ? e.processes.map(p => ({ pid: p.pid, role: `${e.kind}:${p.role}`, privateMb: p.privateMemoryMb, workingSetMb: p.workingSetMb, cpuPercent: null }))
              : [{ pid: e.pid ?? 0, role: e.kind, privateMb: e.reportedMemoryMb, workingSetMb: e.reportedMemoryMb, cpuPercent: e.cpuPercent }]),
          ].sort((a, b) => b.privateMb - a.privateMb);
          resourceSample.debug = snapshot.debug;
          this.debugHistory.push(resourceSample);
          if (this.debugHistory.length > 120) this.debugHistory.shift();
        }
        this.options.recordSample?.(resourceSample);
      }
      if (forcePublish || guardChanged || measuredAt - this.lastPublishedAt >= publishIntervalMs) {
        this.lastPublishedAt = measuredAt;
        this.lastGuardState = snapshot.guardState;
        this.options.publish(snapshot);
      }
    } catch (error) {
      console.warn('Performance sampling failed.', error);
    } finally {
      this.sampling = false;
    }
  }
}

export function shouldCollectRendererRuntime(input: {
  rendererActive: boolean;
  hasProbe: boolean;
  overBudget: boolean;
  rapidGrowth: boolean;
  guardState: PerformanceSnapshot['guardState'];
}): boolean {
  return input.rendererActive
    && input.hasProbe
    && (input.overBudget || input.rapidGrowth || input.guardState === 'over-budget');
}

const rendererRuntimeProbeSchema = z.object({
  longTasks: z.object({ supported: z.boolean(), count: z.number().int().nonnegative(), totalMs: z.number().finite().nonnegative(), maxMs: z.number().finite().nonnegative() }).strict().nullable().optional(),
  route: z.string().trim().min(1).max(32),
  jsHeapUsedBytes: z.number().finite().nonnegative().nullable(),
  jsHeapTotalBytes: z.number().finite().nonnegative().nullable(),
  jsHeapLimitBytes: z.number().finite().nonnegative().nullable(),
  domNodes: z.number().int().nonnegative(),
  canvasCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
  videoCount: z.number().int().nonnegative(),
  playingVideoCount: z.number().int().nonnegative(),
  resourceEntryCount: z.number().int().nonnegative(),
}).strict();

export function buildResourceTelemetrySample(input: {
  metrics: ProcessMetric[];
  context: PerformanceRuntimeContext;
  performance: PerformanceSnapshot;
  rendererRuntime: unknown;
  sequence: number;
  flags: ResourceTelemetrySample['flags'];
}): ResourceTelemetrySample {
  const activeEngines = input.context.engines.filter((engine) => engine.state === 'running' || engine.state === 'starting');
  const electronPrivateMb = kilobytesToMb(sum(input.metrics.map((metric) => metric.memory.privateBytes ?? 0)));
  const electronWorkingSetMb = kilobytesToMb(sum(input.metrics.map((metric) => metric.memory.workingSetSize)));
  const engineReportedMemoryMb = sum(activeEngines.map((engine) => engine.memoryMb));
  const enginePrivateMb = sum(activeEngines.map(enginePrivateMemoryMb));
  const engineWorkingSetMb = sum(activeEngines.map(engineWorkingSetMemoryMb));
  const mainMemory = process.memoryUsage();
  const activeResources = typeof process.getActiveResourcesInfo === 'function'
    ? process.getActiveResourcesInfo()
    : [];
  const activeResourceCounts = activeResources.reduce<Record<string, number>>((counts, resource) => {
    counts[resource] = (counts[resource] ?? 0) + 1;
    return counts;
  }, {});
  const rendererProbe = rendererRuntimeProbeSchema.safeParse(input.rendererRuntime);
  const rendererRuntime = rendererProbe.success ? {
    route: rendererProbe.data.route,
    longTasks: rendererProbe.data.longTasks ?? null,
    jsHeapUsedMb: bytesToMbOrNull(rendererProbe.data.jsHeapUsedBytes),
    jsHeapTotalMb: bytesToMbOrNull(rendererProbe.data.jsHeapTotalBytes),
    jsHeapLimitMb: bytesToMbOrNull(rendererProbe.data.jsHeapLimitBytes),
    domNodes: rendererProbe.data.domNodes,
    canvasCount: rendererProbe.data.canvasCount,
    imageCount: rendererProbe.data.imageCount,
    videoCount: rendererProbe.data.videoCount,
    playingVideoCount: rendererProbe.data.playingVideoCount,
    resourceEntryCount: rendererProbe.data.resourceEntryCount,
  } : null;

  return {
    schemaVersion: 1,
    kind: 'resource-sample',
    sampledAt: input.performance.sampledAt ?? new Date().toISOString(),
    sequence: input.sequence,
    uptimeSeconds: round(process.uptime()),
    rendererActive: input.context.rendererActive,
    guardState: input.performance.guardState,
    flags: input.flags,
    budget: {
      memoryMb: input.performance.budgetMemoryMb,
      cpuPercent: input.performance.budgetCpuPercent,
    },
    totals: {
      electronPrivateMb: round(electronPrivateMb),
      electronWorkingSetMb: round(electronWorkingSetMb),
      engineReportedMemoryMb: round(engineReportedMemoryMb),
      enginePrivateMb: round(enginePrivateMb),
      engineWorkingSetMb: round(engineWorkingSetMb),
      attributedMemoryMb: round(electronPrivateMb + enginePrivateMb),
      cpuPercent: input.performance.totalCpuPercent,
      processCount: input.performance.activeProcesses,
    },
    electronProcesses: input.metrics.map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      privateMb: round(kilobytesToMb(metric.memory.privateBytes ?? 0)),
      workingSetMb: round(kilobytesToMb(metric.memory.workingSetSize)),
      peakWorkingSetMb: round(kilobytesToMb(metric.memory.peakWorkingSetSize ?? metric.memory.workingSetSize)),
      cpuPercent: round(metric.cpu.percentCPUUsage),
    })).sort((left, right) => right.privateMb - left.privateMb),
    engines: input.context.engines.map((engine) => ({
      kind: engine.kind,
      pid: engine.pid ?? null,
      state: engine.state,
      reportedMemoryMb: round(engine.memoryMb),
      cpuPercent: round(engine.cpuPercent),
      processes: (engine.processes ?? []).map((resource) => ({
        pid: resource.pid,
        role: resource.role,
        privateMemoryMb: round(resource.privateMemoryMb),
        workingSetMb: round(resource.workingSetMb),
      })),
    })),
    mainRuntime: {
      rssMb: bytesToMb(mainMemory.rss),
      heapUsedMb: bytesToMb(mainMemory.heapUsed),
      heapTotalMb: bytesToMb(mainMemory.heapTotal),
      externalMb: bytesToMb(mainMemory.external),
      arrayBuffersMb: bytesToMb(mainMemory.arrayBuffers),
      activeResources: activeResourceCounts,
    },
    rendererRuntime,
    system: {
      totalMemoryMb: bytesToMb(totalmem()),
      freeMemoryMb: bytesToMb(freemem()),
    },
  };
}

export function measurePerformance(
  metrics: ProcessMetric[],
  context: PerformanceRuntimeContext,
  measuredAt: number,
): Omit<PerformanceSnapshot, 'guardState' | 'warning'> {
  const rendererMetrics = metrics.filter((metric) => metric.type === 'Tab');
  const coreMetrics = metrics.filter((metric) => metric.type !== 'Tab');
  const activeEngines = context.engines.filter((engine) => engine.state === 'running' || engine.state === 'starting');
  const enginePrivateMb = sum(activeEngines.map(enginePrivateMemoryMb));
  const engineWorkingSetMb = sum(activeEngines.map(engineWorkingSetMemoryMb));
  const engineCpuPercent = sum(activeEngines.map((engine) => engine.cpuPercent));
  const rendererMemoryMb = kilobytesToMb(sum(rendererMetrics.map((metric) => metric.memory.privateBytes ?? 0)));
  const coreMemoryMb = kilobytesToMb(sum(coreMetrics.map((metric) => metric.memory.privateBytes ?? 0)));
  const residentMemoryMb = kilobytesToMb(sum(metrics.map((metric) => metric.memory.workingSetSize))) + engineWorkingSetMb;
  const audioActive = activeEngines.some((engine) => engine.kind === 'audio');
  const captureActive = activeEngines.some((engine) => engine.kind === 'capture');
  const activeEngineProcesses = sum(activeEngines.map((engine) => engine.processes?.length || 1));

  return {
    coreMemoryMb: round(coreMemoryMb),
    rendererMemoryMb: round(rendererMemoryMb),
    totalMemoryMb: round(coreMemoryMb + rendererMemoryMb + enginePrivateMb),
    residentMemoryMb: round(residentMemoryMb),
    totalCpuPercent: round(sum(metrics.map((metric) => metric.cpu.percentCPUUsage)) + engineCpuPercent),
    activeProcesses: metrics.length + activeEngineProcesses,
    budgetMemoryMb: (context.rendererActive ? performanceMemoryBudgetsMb.rendererOpen : performanceMemoryBudgetsMb.coreTray)
      + (audioActive ? performanceMemoryBudgetsMb.audioEngine : 0)
      + (captureActive ? performanceMemoryBudgetsMb.captureEngine : 0),
    budgetCpuPercent: (context.rendererActive ? 0.7 : 0.3) + (audioActive ? 1 : 0) + (captureActive ? 2 : 0),
    sampledAt: new Date(measuredAt).toISOString(),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
    : sorted[midpoint]!;
}

function kilobytesToMb(value: number): number {
  return value / 1_024;
}

function enginePrivateMemoryMb(engine: EngineStatus): number {
  return engine.processes?.length
    ? sum(engine.processes.map((resource) => resource.privateMemoryMb))
    : engine.memoryMb;
}

function engineWorkingSetMemoryMb(engine: EngineStatus): number {
  return engine.processes?.length
    ? sum(engine.processes.map((resource) => resource.workingSetMb))
    : engine.memoryMb;
}

function bytesToMb(value: number): number {
  return round(value / 1_024 / 1_024);
}

function bytesToMbOrNull(value: number | null): number | null {
  return value === null ? null : bytesToMb(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

async function boundedRendererProbe(probe: () => Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1500); timer.unref(); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
