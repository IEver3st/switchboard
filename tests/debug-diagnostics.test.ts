import { afterEach, expect, test } from 'bun:test';
import { DebugDiagnosticsCollector } from '../src/main/services/debug-diagnostics';
import { updateSettingsInputSchema, appSettingsSchema } from '../src/shared/contracts';
import { createDefaultSnapshot } from '../src/shared/defaults';

const collector = new DebugDiagnosticsCollector();
afterEach(() => collector.dispose());

test('off retains no observations; partial settings never enable or disable diagnostics implicitly', () => {
  collector.measure('ignored', () => 1);
  expect(collector.snapshot()).toBeUndefined();
  expect(updateSettingsInputSchema.parse({ performanceGuard: false })).toEqual({ performanceGuard: false });
  const settings: Record<string, unknown> = { ...createDefaultSnapshot().settings };
  delete settings.detailedDiagnostics;
  expect(appSettingsSchema.parse(settings).detailedDiagnostics).toBe(false);
});

test('counts completions, in-flight work, errors and leaves operation results unchanged', async () => {
  collector.setEnabled(true);
  expect(collector.measure('sync', () => 42)).toBe(42);
  expect(() => collector.measure('sync', () => { throw new Error('expected'); })).toThrow('expected');
  await expect(collector.measureAsync('async', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  const finish = collector.begin('pending');
  expect(collector.snapshot()!.operations.find(row => row.name === 'pending')!.inFlight).toBe(1);
  finish(); finish();
  const rows = collector.snapshot()!.operations;
  expect(rows.find(row => row.name === 'sync')).toMatchObject({ calls: 2, failures: 1, inFlight: 0 });
  expect(rows.find(row => row.name === 'async')).toMatchObject({ calls: 1, failures: 1 });
  expect(rows.find(row => row.name === 'pending')).toMatchObject({ calls: 1, inFlight: 0 });
});

test('bounds cardinality and drops old completions after disable/re-enable', () => {
  collector.setEnabled(true);
  const stale = collector.begin('stale');
  collector.setEnabled(false);
  expect(collector.snapshot()).toBeUndefined();
  collector.setEnabled(true);
  stale();
  expect(collector.snapshot()!.operations).toEqual([]);
  for (let i = 0; i < 200; i++) collector.measure(`operation:${i}`, () => i);
  expect(collector.snapshot()!.operations).toHaveLength(128);
  collector.dispose(); collector.dispose();
  expect(collector.snapshot()).toBeUndefined();
});
