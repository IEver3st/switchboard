import { describe, expect, test } from 'bun:test';
import type { ProcessMetric } from 'electron';
import {
  buildResourceTelemetrySample,
  PerformanceBudgetGuard,
  measurePerformance,
  shouldCollectRendererRuntime,
} from '../src/main/services/performance-monitor';
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
    expect(measured.budgetMemoryMb).toBe(340);
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
    expect(measured.budgetMemoryMb).toBe(335);
    expect(measured.budgetCpuPercent).toBe(1.3);
  });

  test('uses host process attribution instead of mixing working set into private memory', () => {
    const engines = structuredClone(stoppedEngines);
    Object.assign(engines[1]!, {
      state: 'running',
      memoryMb: 500,
      processes: [
        { pid: 10, role: 'host', privateMemoryMb: 60, workingSetMb: 90 },
        { pid: 11, role: 'video', privateMemoryMb: 220, workingSetMb: 140 },
      ],
    });
    const measured = measurePerformance(
      [metric('Browser', 40 * 1_024, 55 * 1_024, 0.1)],
      { rendererActive: false, guardEnabled: true, engines },
      0,
    );

    expect(measured.totalMemoryMb).toBe(320);
    expect(measured.residentMemoryMb).toBe(285);
    expect(measured.activeProcesses).toBe(3);
    expect(measured.budgetMemoryMb).toBe(1_270);
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

  test('records process attribution and a bounded renderer runtime probe', () => {
    const metrics = [metric('Browser', 40 * 1_024, 55 * 1_024, 0.1), metric('Tab', 80 * 1_024, 100 * 1_024, 0.2)];
    const context = { rendererActive: true, guardEnabled: true, engines: stoppedEngines };
    const performance = {
      ...measurePerformance(metrics, context, Date.UTC(2026, 8, 2)),
      guardState: 'collecting' as const,
      warning: null,
    };
    const sample = buildResourceTelemetrySample({
      metrics,
      context,
      performance,
      rendererRuntime: {
        route: 'devices',
        jsHeapUsedBytes: 64 * 1_024 * 1_024,
        jsHeapTotalBytes: 96 * 1_024 * 1_024,
        jsHeapLimitBytes: 4_096 * 1_024 * 1_024,
        domNodes: 420,
        canvasCount: 1,
        imageCount: 0,
        videoCount: 0,
        playingVideoCount: 0,
        resourceEntryCount: 12,
      },
      sequence: 1,
      flags: ['over-budget'],
    });

    expect(sample.totals.electronPrivateMb).toBe(120);
    expect(sample.electronProcesses.map((process) => process.type)).toEqual(['Tab', 'Browser']);
    expect(sample.rendererRuntime?.jsHeapUsedMb).toBe(64);
    expect(sample.rendererRuntime?.route).toBe('devices');
    expect(sample.totals.enginePrivateMb).toBe(0);
    expect(sample.flags).toEqual(['over-budget']);
  });

  test('runs the renderer probe only while a visible renderer has a resource anomaly', () => {
    const healthy = {
      rendererActive: true,
      hasProbe: true,
      overBudget: false,
      rapidGrowth: false,
      guardState: 'within-budget' as const,
    };
    expect(shouldCollectRendererRuntime(healthy)).toBe(false);
    expect(shouldCollectRendererRuntime({ ...healthy, overBudget: true })).toBe(true);
    expect(shouldCollectRendererRuntime({ ...healthy, rapidGrowth: true })).toBe(true);
    expect(shouldCollectRendererRuntime({ ...healthy, guardState: 'over-budget' })).toBe(true);
    expect(shouldCollectRendererRuntime({ ...healthy, rendererActive: false, overBudget: true })).toBe(false);
    expect(shouldCollectRendererRuntime({ ...healthy, hasProbe: false, overBudget: true })).toBe(false);
  });
});
