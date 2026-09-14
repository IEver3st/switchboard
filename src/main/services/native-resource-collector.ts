import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { nativeResourceSampleSchema, type NativeResourceSample } from '../../shared/resource-monitor';

/** One media-free host, only while diagnostic recording owns it. Requests reuse the 5s sampler. */
export class NativeResourceCollector {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private pending: { resolve(value: NativeResourceSample): void; reject(error: Error): void; timer: NodeJS.Timeout } | null = null;
  private buffer = '';
  private starts = 0;
  public get restarts(): number { return Math.max(0, this.starts - 1); }
  constructor(private readonly executable: string) {}
  reset(): void { this.stop(); this.starts = 0; }

  collect(pids: number[]): Promise<NativeResourceSample> {
    if (this.pending) return Promise.reject(new Error('A resource sample is already pending.'));
    if (!this.worker) {
      const worker = spawn(this.executable, ['--resource-diagnostics'], { windowsHide: true, stdio: 'pipe' });
      this.worker = worker; this.starts++; this.buffer = '';
      worker.stdout.setEncoding('utf8');
      worker.stderr.resume();
      worker.stdout.on('data', (chunk: string) => {
        if (this.worker !== worker) return;
        this.buffer += chunk;
        if (this.buffer.length > 262144) { this.stop('Resource collector exceeded the response limit.'); return; }
        const newline = this.buffer.indexOf('\n');
        if (newline < 0) return;
        const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
        try {
          const value = nativeResourceSampleSchema.parse(JSON.parse(line));
          const pending = this.pending; this.pending = null;
          if (pending) { clearTimeout(pending.timer); pending.resolve(value); }
        } catch { this.stop('Resource collector sent an invalid sample.'); }
      });
      worker.stdin.on('error', () => { if (this.worker === worker) this.stop('Resource collector input closed.'); });
      worker.on('error', () => { if (this.worker === worker) this.stop('Windows resource collector could not start. Build or reinstall the bundled host.'); });
      worker.on('exit', () => { if (this.worker === worker) this.stop('Windows resource collector exited. The next sample will retry.'); });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop('Windows resource collection timed out.'), 2500); timer.unref();
      this.pending = { resolve, reject, timer };
      // Reserve one retained process slot for the collector's own overhead.
      this.worker!.stdin.write(`${JSON.stringify([...new Set(pids)].filter(pid => pid > 0).slice(0, 255))}\n`);
    });
  }
  stop(reason = 'Resource recording stopped.'): void {
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    const worker = this.worker; this.worker = null; this.buffer = '';
    if (worker) { worker.stdin.end(); worker.kill(); }
  }
}
