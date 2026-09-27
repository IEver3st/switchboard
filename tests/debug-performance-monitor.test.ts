import { afterEach, expect, test } from 'bun:test';
import { PerformanceMonitor } from '../src/main/services/performance-monitor';
import { debugDiagnostics } from '../src/main/services/debug-diagnostics';
import { createDefaultSnapshot } from '../src/shared/defaults';
import type { PerformanceSnapshot } from '../src/shared/contracts';

let monitor: PerformanceMonitor | undefined;
afterEach(() => { monitor?.dispose(); debugDiagnostics.dispose(); });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('dev feedback reuses sampling without enabling native probes or publishing dev timings', async () => {
  let nativeProbes = 0, rendererProbes = 0;
  const samples: any[] = [], published: PerformanceSnapshot[] = [];
  debugDiagnostics.setEnabled(true);
  debugDiagnostics.measure('dev.test', () => {});
  monitor = new PerformanceMonitor({
    getProcessMetrics: () => [],
    getContext: () => ({ rendererActive: false, guardEnabled: false, detailedDiagnostics: false, engines: [] }),
    publish: value => published.push(value), developmentSample: value => samples.push(value),
    getRendererRuntime: async () => { rendererProbes++; return null; },
    nativeCollector: { collect: async () => { nativeProbes++; throw new Error('Must not start'); }, stop() {}, restarts: 0 },
  });
  monitor.start();
  await monitor.refresh();
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.at(-1).debug.operations[0].name).toBe('dev.test');
  expect(nativeProbes).toBe(0);
  expect(rendererProbes).toBe(0);
  expect(published.every(value => value.debug === undefined)).toBeTrue();
  expect(monitor.getDebugHistory()).toHaveLength(0);
});

test('retains at most 120 samples and drops a renderer result after recording is invalidated', async () => {
  let now = Date.now();
  let enabled = true;
  let probe: (() => Promise<unknown>) | undefined;
  const published: PerformanceSnapshot[] = [];
  debugDiagnostics.setEnabled(true);
  monitor = new PerformanceMonitor({
    getProcessMetrics: () => [],
    getContext: () => ({ rendererActive: true, guardEnabled: false, detailedDiagnostics: enabled, engines: createDefaultSnapshot().engines }),
    getRendererRuntime: () => probe ? probe() : Promise.resolve(null),
    publish: value => published.push(value),
    recordSample: () => {},
    now: () => now,
  });
  monitor.start();
  await tick();
  for (let index = 0; index < 125; index++) { now += 5000; monitor.refresh(); await tick(); }
  expect(monitor.getDebugHistory()).toHaveLength(120);
  let finish!: (value: unknown) => void;
  probe = () => new Promise(resolve => { finish = resolve; });
  const count = published.length;
  monitor.refresh();
  enabled = false;
  monitor.invalidateDebugSample();
  debugDiagnostics.setEnabled(false);
  finish(null);
  await tick();
  expect(published).toHaveLength(count);
  expect(monitor.getDebugHistory()).toHaveLength(120);
  monitor.clearDebugHistory();
  expect(monitor.getDebugHistory()).toEqual([]);
});

test('a stalled renderer does not queue more probes or block process samples', async () => {
  let probes = 0;
  let now = Date.now();
  const published: PerformanceSnapshot[] = [];
  debugDiagnostics.setEnabled(true);
  monitor = new PerformanceMonitor({
    getProcessMetrics: () => [],
    getContext: () => ({ rendererActive: true, guardEnabled: false, detailedDiagnostics: true, engines: createDefaultSnapshot().engines }),
    getRendererRuntime: () => { probes++; return new Promise(() => {}); },
    publish: value => published.push(value), recordSample: () => {}, now: () => now,
  });
  monitor.start();
  await new Promise(resolve => setTimeout(resolve, 1600));
  expect(published).toHaveLength(1);
  now += 5000;
  monitor.refresh();
  await tick();
  expect(probes).toBe(1);
  expect(published).toHaveLength(2);
  expect(monitor.getDebugHistory().at(-1)!.rendererRuntime).toBeNull();
});

test('an awaited refresh completes a fresh diagnostic sample after an in-flight interval sample', async () => {
  let finish!: (value: unknown) => void;
  let probes = 0;
  debugDiagnostics.setEnabled(true);
  monitor = new PerformanceMonitor({
    getProcessMetrics: () => [],
    getContext: () => ({ rendererActive: true, guardEnabled: false, detailedDiagnostics: true, engines: [] }),
    getRendererRuntime: () => ++probes === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(null),
    publish: () => {}, recordSample: () => {},
  });
  monitor.start();
  const finalSample = monitor.refresh();
  expect(monitor.getDebugHistory()).toHaveLength(0);
  finish(null);
  await finalSample;
  expect(monitor.getDebugHistory()).toHaveLength(2);
  debugDiagnostics.setEnabled(false);
  expect(monitor.getDebugHistory().at(-1)?.debug).toBeDefined();
});
