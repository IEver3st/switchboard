import { describe, expect, test } from 'bun:test';
import type { ProcessMetric } from 'electron';
import { PerformanceBudgetGuard, measurePerformance } from '../src/main/services/performance-monitor';
import { stoppedEngines } from '../src/shared/defaults';

function metric(type: ProcessMetric['type'], privateKb: number, workingSetKb: number, cpuPercent: number): ProcessMetric {
  return {
    pid: type === 'Tab' ? 2 : 1,
    type,
    creationTime: 0,
    cpu: { percentCPUUsage: cpuPercent, idleWakeupsPerSecond: 0 },
    memory: { privateBytes: privateKb, workingSetSize: workingSetKb, peakWorkingSetSize: workingSetKb },
  };
}

describe('performance monitor', () => {
  test('uses measured Electron processes and dynamic open-idle budgets', () => {
    const measured = measurePerformance(
      [metric('Browser', 40 * 1_024, 55 * 1_024, 0.1), metric('Tab', 80 * 1_024, 100 * 1_024, 0.2)],
      { rendererActive: true, guardEnabled: true, engines: stoppedEngines },
      Date.UTC(2026, 7, 27),
    );

    expect(measured.coreMemoryMb).toBe(40);
    expect(measured.rendererMemoryMb).toBe(80);
    expect(measured.totalMemoryMb).toBe(120);
    expect(measured.residentMemoryMb).toBe(155);
    expect(measured.totalCpuPercent).toBeCloseTo(0.3);
    expect(measured.activeProcesses).toBe(2);
    expect(measured.budgetMemoryMb).toBe(180);
    expect(measured.budgetCpuPercent).toBe(0.7);
  });

  test('adds enabled host allowances without treating stopped hosts as processes', () => {
    const engines = structuredClone(stoppedEngines);
    Object.assign(engines[0]!, { state: 'running', memoryMb: 30, cpuPercent: 0.4 });
    const measured = measurePerformance(
      [metric('Browser', 40 * 1_024, 55 * 1_024, 0.1)],
      { rendererActive: false, guardEnabled: true, engines },
      0,
    );

    expect(measured.totalMemoryMb).toBe(70);
    expect(measured.residentMemoryMb).toBe(85);
    expect(measured.totalCpuPercent).toBe(0.5);
    expect(measured.activeProcesses).toBe(2);
    expect(measured.budgetMemoryMb).toBe(110);
    expect(measured.budgetCpuPercent).toBe(1.3);
  });

  test('warns only after three failed rolling windows and resets on a budget change', () => {
    const guard = new PerformanceBudgetGuard();
    const failed = { totalMemoryMb: 200, totalCpuPercent: 0.1, budgetMemoryMb: 180, budgetCpuPercent: 0.7 };
    for (let index = 0; index < 13; index += 1) expect(guard.evaluate(failed, true).warning).toBeNull();
    const warning = guard.evaluate(failed, true);
    expect(warning.guardState).toBe('over-budget');
    expect(warning.warning).toContain('200 MB private memory');

    const changedBudget = { ...failed, budgetMemoryMb: 220 };
    expect(guard.evaluate(changedBudget, true)).toEqual({ guardState: 'collecting', warning: null });
    expect(guard.evaluate(changedBudget, false)).toEqual({ guardState: 'disabled', warning: null });
  });
});
