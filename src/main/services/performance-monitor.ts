import type { ProcessMetric } from 'electron';
import type { EngineStatus, PerformanceSnapshot } from '../../shared/contracts';

const sampleIntervalMs = 5_000;
const publishIntervalMs = 30_000;
const rollingWindowSamples = 12;
const consecutiveFailedWindows = 3;

export type PerformanceRuntimeContext = {
  rendererActive: boolean;
  guardEnabled: boolean;
  engines: EngineStatus[];
};

type PerformanceMonitorOptions = {
  getProcessMetrics: () => ProcessMetric[];
  getContext: () => PerformanceRuntimeContext;
  publish: (snapshot: PerformanceSnapshot) => void;
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
  private lastGuardState: PerformanceSnapshot['guardState'] | null = null;
  private disposed = false;

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
    if (this.disposed) return;
    try {
      const context = this.options.getContext();
      const measuredAt = this.now();
      const measured = measurePerformance(this.options.getProcessMetrics(), context, measuredAt);
      const guard = this.guard.evaluate(measured, context.guardEnabled);
      const snapshot = { ...measured, ...guard };
      const guardChanged = this.lastGuardState !== snapshot.guardState;
      if (forcePublish || guardChanged || measuredAt - this.lastPublishedAt >= publishIntervalMs) {
        this.lastPublishedAt = measuredAt;
        this.lastGuardState = snapshot.guardState;
        this.options.publish(snapshot);
      }
    } catch (error) {
      console.warn('Performance sampling failed.', error);
    }
  }
}

export function measurePerformance(
  metrics: ProcessMetric[],
  context: PerformanceRuntimeContext,
  measuredAt: number,
): Omit<PerformanceSnapshot, 'guardState' | 'warning'> {
  const rendererMetrics = metrics.filter((metric) => metric.type === 'Tab');
  const coreMetrics = metrics.filter((metric) => metric.type !== 'Tab');
  const activeEngines = context.engines.filter((engine) => engine.state === 'running' || engine.state === 'starting');
  const engineMemoryMb = sum(activeEngines.map((engine) => engine.memoryMb));
  const engineCpuPercent = sum(activeEngines.map((engine) => engine.cpuPercent));
  const rendererMemoryMb = kilobytesToMb(sum(rendererMetrics.map((metric) => metric.memory.privateBytes ?? 0)));
  const coreMemoryMb = kilobytesToMb(sum(coreMetrics.map((metric) => metric.memory.privateBytes ?? 0)));
  const residentMemoryMb = kilobytesToMb(sum(metrics.map((metric) => metric.memory.workingSetSize))) + engineMemoryMb;
  const audioActive = activeEngines.some((engine) => engine.kind === 'audio');
  const captureActive = activeEngines.some((engine) => engine.kind === 'capture');

  return {
    coreMemoryMb: round(coreMemoryMb),
    rendererMemoryMb: round(rendererMemoryMb),
    totalMemoryMb: round(coreMemoryMb + rendererMemoryMb + engineMemoryMb),
    residentMemoryMb: round(residentMemoryMb),
    totalCpuPercent: round(sum(metrics.map((metric) => metric.cpu.percentCPUUsage)) + engineCpuPercent),
    activeProcesses: metrics.length + activeEngines.length,
    budgetMemoryMb: (context.rendererActive ? 180 : 70) + (audioActive ? 40 : 0) + (captureActive ? 50 : 0),
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

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
