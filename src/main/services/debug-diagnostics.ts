import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { DebugDiagnostics } from '../../shared/contracts';

type Operation = DebugDiagnostics['operations'][number];
const noop = (_failed?: boolean): void => {};

/** Bounded, opt-in main-process instrumentation. Labels must be code-owned, never payloads. */
export class DebugDiagnosticsCollector {
  private operations = new Map<string, Operation>();
  private histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private baseline = performance.eventLoopUtilization();
  private startedAt: string | null = null;
  private generation = 0;

  public setEnabled(enabled: boolean): void {
    if (enabled === Boolean(this.startedAt)) return;
    this.generation++;
    this.histogram?.disable();
    this.histogram = null;
    this.operations.clear();
    this.startedAt = enabled ? new Date().toISOString() : null;
    if (enabled) {
      this.baseline = performance.eventLoopUtilization();
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
    }
  }

  public begin(label: string): (failed?: boolean) => void {
    if (!this.startedAt) return noop;
    const key = label.slice(0, 96);
    if (!this.operations.has(key) && this.operations.size >= 128) return noop;
    let row = this.operations.get(key);
    if (!row) {
      row = { name: key, calls: 0, failures: 0, inFlight: 0, totalMs: 0, maxMs: 0 };
      this.operations.set(key, row);
    }
    row.inFlight++;
    const start = performance.now();
    const generation = this.generation;
    let finished = false;
    return (failed = false) => {
      if (finished || generation !== this.generation) return;
      finished = true;
      const duration = performance.now() - start;
      row.inFlight--;
      row.calls++;
      row.failures += Number(failed);
      row.totalMs += duration;
      row.maxMs = Math.max(row.maxMs, duration);
    };
  }

  public measure<T>(label: string, action: () => T): T {
    const finish = this.begin(label);
    try { const result = action(); finish(); return result; }
    catch (error) { finish(true); throw error; }
  }

  public async measureAsync<T>(label: string, action: () => Promise<T>): Promise<T> {
    const finish = this.begin(label);
    try { const result = await action(); finish(); return result; }
    catch (error) { finish(true); throw error; }
  }

  public snapshot(): DebugDiagnostics | undefined {
    if (!this.startedAt || !this.histogram) return undefined;
    const current = performance.eventLoopUtilization();
    const utilization = performance.eventLoopUtilization(current, this.baseline);
    this.baseline = current;
    const result: DebugDiagnostics = {
      startedAt: this.startedAt,
      sampledAt: new Date().toISOString(),
      eventLoopUtilizationPercent: utilization.active + utilization.idle > 0 ? round(utilization.utilization * 100) : null,
      eventLoopDelayP99Ms: this.histogram.count ? round(this.histogram.percentile(99) / 1e6) : null,
      eventLoopDelayMaxMs: this.histogram.count ? round(this.histogram.max / 1e6) : null,
      operations: [...this.operations.values()].map(row => ({ ...row, totalMs: round(row.totalMs), maxMs: round(row.maxMs) }))
        .sort((a, b) => b.totalMs - a.totalMs),
      processes: [],
    };
    this.histogram.reset();
    return result;
  }

  public dispose(): void { this.setEnabled(false); }
}

function round(value: number): number { return Math.round(value * 100) / 100; }

export const debugDiagnostics = new DebugDiagnosticsCollector();
