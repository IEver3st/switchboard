import { describe, expect, test } from 'bun:test';
import { CaptureSourceRefresh, listCaptureSources, type CaptureSourceRefreshState } from '../src/main/services/capture-source-refresh';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('capture source refresh recovery', () => {
  test('coalesces callers and recovers a timeout without rejecting the UI request', async () => {
    const states: CaptureSourceRefreshState[] = [];
    const waits: number[] = [];
    const failures: unknown[] = [];
    let calls = 0;
    const refresh = new CaptureSourceRefresh({
      scan: async () => { if (++calls < 3) throw new Error('capture engine request timed out: listSources'); },
      state: value => states.push(value), failure: error => failures.push(error),
      wait: async ms => { waits.push(ms); },
    });
    const first = refresh.refresh();
    expect(refresh.refresh()).toBe(first);
    await first;
    expect(calls).toBe(3);
    expect(failures).toHaveLength(2);
    expect(waits).toEqual([1000, 2000]);
    expect(states).toEqual(['refreshing', 'retrying', 'retrying', 'ready']);
    await refresh.dispose();
  });

  test('exhausted retries retain previous results and a later request can recover', async () => {
    let unavailable = true;
    let sources = ['previous window'];
    const states: CaptureSourceRefreshState[] = [];
    let attempts = 0;
    const refresh = new CaptureSourceRefresh({
      scan: async () => { attempts++; if (unavailable) throw new Error('Source scan failed'); sources = ['new window']; },
      state: value => states.push(value), failure: () => {}, wait: async () => {},
    });
    await refresh.refresh();
    expect(attempts).toBe(3);
    expect(states.at(-1)).toBe('unavailable');
    expect(sources).toEqual(['previous window']);
    unavailable = false;
    await refresh.refresh();
    expect(attempts).toBe(4);
    expect(states.at(-1)).toBe('ready');
    expect(sources).toEqual(['new window']);
    await refresh.dispose();
  });

  test('shutdown aborts a pending scan and cannot restart discovery', async () => {
    let scans = 0;
    let aborted = false;
    const states: CaptureSourceRefreshState[] = [];
    const refresh = new CaptureSourceRefresh({
      scan: signal => new Promise((_, reject) => {
        scans++;
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true });
      }),
      state: value => states.push(value), failure: () => { throw new Error('Cancellation is not a failure'); },
    });
    const pending = refresh.refresh();
    await refresh.dispose();
    await pending;
    await refresh.refresh();
    expect(aborted).toBe(true);
    expect(scans).toBe(1);
    expect(states).toEqual(['refreshing']);
  });

  test('shutdown cancels the retry delay', async () => {
    let scans = 0;
    let retrying!: () => void;
    const retry = new Promise<void>(resolve => { retrying = resolve; });
    const refresh = new CaptureSourceRefresh({
      scan: async () => { scans++; throw new Error('timeout'); },
      state: value => { if (value === 'retrying') retrying(); }, failure: () => {},
    });
    void refresh.refresh();
    await retry;
    await refresh.dispose();
    expect(scans).toBe(1);
  });
});

const executable = resolve('engines/capture-host/bin/Debug/net10.0-windows/Capture.Host.exe');
test.skipIf(process.platform !== 'win32' || !existsSync(executable))('native source helper returns validated inventory and exits without starting an engine', async () => {
  const sources = await listCaptureSources(executable, new AbortController().signal);
  expect(sources.some(source => source.type === 'automatic-game')).toBe(true);
  expect(sources.some(source => source.type === 'display')).toBe(true);
}, 20_000);
