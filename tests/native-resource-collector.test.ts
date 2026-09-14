import { expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { NativeResourceCollector } from '../src/main/services/native-resource-collector';

const fixture = resolve('tests/fixtures/resource-collector.cjs');
function setup(modes: string[], startupDelay = 0, startupTimeoutMs = 2000) {
  const workers: ChildProcessWithoutNullStreams[] = [];
  const collector = new NativeResourceCollector('fixture', {
    startupTimeoutMs, sampleTimeoutMs: 100,
    spawnWorker: () => {
      const worker = spawn(process.execPath, [fixture, modes.shift() ?? 'good', String(startupDelay)], { windowsHide: true, stdio: 'pipe' });
      workers.push(worker); return worker;
    },
  });
  return { collector, workers };
}

test('cold startup longer than the sample deadline succeeds and reuses the ready helper', async () => {
  const { collector, workers } = setup(['good'], 300);
  try {
    const first = await collector.collect([process.pid]);
    const second = await collector.collect([process.pid]);
    expect(second.monitorPid).toBe(first.monitorPid);
    expect(workers).toHaveLength(1);
    expect(collector.restarts).toBe(0);
  } finally { collector.stop(); }
});

test('a stalled sample is killed and the next sample starts a fresh helper', async () => {
  const { collector, workers } = setup(['hang', 'good']);
  try {
    await expect(collector.collect([process.pid])).rejects.toThrow('collection timed out');
    expect(workers[0]!.killed).toBe(true);
    const recovered = await collector.collect([process.pid]);
    expect(recovered.monitorPid).toBe(workers[1]!.pid!);
    expect(collector.restarts).toBe(1);
  } finally { collector.stop(); }
});

test('startup has a bounded deadline and disposal interrupts startup immediately', async () => {
  const { collector, workers } = setup(['never-ready', 'never-ready'], 0, 200);
  try {
    await expect(collector.collect([])).rejects.toThrow('startup timed out');
    expect(workers[0]!.killed).toBe(true);
    const pending = collector.collect([]);
    collector.stop(); collector.stop();
    await expect(pending).rejects.toThrow('stopped');
    expect(workers[1]!.killed).toBe(true);
  } finally { collector.stop(); }
});

test('an invalid response is discarded and does not poison the next sample', async () => {
  const { collector } = setup(['malformed', 'good']);
  try {
    await expect(collector.collect([])).rejects.toThrow('invalid sample');
    expect((await collector.collect([])).durationMs).toBe(1);
  } finally { collector.stop(); }
});
