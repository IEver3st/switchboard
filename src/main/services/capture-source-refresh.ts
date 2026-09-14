import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { captureSourceSchema, type CaptureSource, type SystemSnapshot } from '../../shared/contracts';

export type CaptureSourceRefreshState = SystemSnapshot['capture']['sourceRefreshState'];

/** One bounded scan burst per user request; never borrows the recording host. */
export class CaptureSourceRefresh {
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private disposed = false;

  constructor(private readonly options: {
    scan(signal: AbortSignal): Promise<void>;
    state(value: CaptureSourceRefreshState): void;
    failure(error: unknown, attempt: number): void;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  }) {}

  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    const abort = new AbortController();
    this.abort = abort;
    this.pending = this.run(abort.signal).finally(() => { this.pending = null; this.abort = null; });
    return this.pending;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.abort?.abort();
    await this.pending;
  }

  private async run(signal: AbortSignal): Promise<void> {
    for (let attempt = 1; attempt <= 3 && !signal.aborted; attempt++) {
      this.options.state(attempt === 1 ? 'refreshing' : 'retrying');
      try {
        if (attempt > 1) {
          const wait = this.options.wait ?? ((ms, abortSignal) => delay(ms, undefined, { signal: abortSignal }));
          await wait((attempt - 1) * 1000, signal);
        }
        if (signal.aborted) return;
        await this.options.scan(signal);
        if (!signal.aborted) this.options.state('ready');
        return;
      } catch (error) {
        if (signal.aborted) return;
        this.options.failure(error, attempt);
      }
    }
    if (!signal.aborted) this.options.state('unavailable');
  }
}

export function listCaptureSources(executable: string, signal: AbortSignal): Promise<CaptureSource[]> {
  return new Promise((resolve, reject) => {
    // execFile kills only this media-free helper on timeout, overflow or abort.
    execFile(executable, ['--list-sources'], {
      windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, encoding: 'utf8', signal,
    }, (error, stdout) => {
      if (error) { reject(error); return; }
      try { resolve(z.array(captureSourceSchema).max(4096).parse(JSON.parse(stdout))); }
      catch (parseError) { reject(parseError); }
    });
  });
}
