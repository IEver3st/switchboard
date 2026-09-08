import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SetupPreferences } from '../../shared/contracts';
import type { ExternalProcessResource } from './performance-monitor';

const desktopEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('quick'), open: z.boolean() }),
  z.object({ type: z.literal('applications'), executables: z.array(z.string().max(120)).max(32) }),
  z.object({ type: z.literal('error'), message: z.string().max(2048) }),
  z.object({ type: z.literal('metrics'), pid: z.number().int().positive(), privateMemoryMb: z.number().finite().nonnegative(), workingSetMb: z.number().finite().nonnegative(), cpuPercent: z.number().min(0).max(100) }),
]);
type DesktopConfig = Pick<SetupPreferences, 'quickControlsEnabled' | 'quickShortcut'> & { executables: string[] };

/** One optional host using the existing bundled Capture.Host executable in a media-free mode. */
export class DesktopControlsService {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private signature = '';
  private generation = 0;
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  private resources: ExternalProcessResource | null = null;
  private lastMetricRequestAt = 0;
  constructor(private readonly io: {
    quick(open: boolean): void;
    applications(executables: string[]): Promise<void>;
    status(state: 'disabled' | 'starting' | 'ready' | 'error', error: string | null): void;
  }) {}

  configure(config: DesktopConfig): void {
    const signature = JSON.stringify(config);
    if (this.closed || signature === this.signature) return;
    this.signature = signature;
    const generation = ++this.generation;
    this.chain = this.chain.catch(() => undefined).then(async () => {
      await this.stop();
      if (generation !== this.generation || this.closed) return;
      if (!config.quickControlsEnabled && !config.executables.length) { this.io.status('disabled', null); return; }
      // Fixture reviews must not register a global shortcut or watch real applications.
      if (process.env.SWITCHBOARD_NATIVE_FIXTURES === '1') { this.io.status('disabled', null); return; }
      this.io.status('starting', null);
      try { await this.start(config, generation); }
      catch (error) { if (generation === this.generation) this.io.status('error', error instanceof Error ? error.message : String(error)); }
    });
  }

  private start(config: DesktopConfig, generation: number): Promise<void> {
    const executable = app.isPackaged ? join(process.resourcesPath, 'capture-host', 'Capture.Host.exe')
      : process.env.SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST
        ?? join(app.getAppPath(), 'engines', 'capture-host', 'bin', 'Debug', 'net10.0-windows', 'Capture.Host.exe');
    if (process.platform !== 'win32' || !existsSync(executable)) throw new Error('Desktop controls need the bundled Windows host. Build Capture.Host and retry.');
    const worker = spawn(executable, ['--desktop-controls'], { windowsHide: true, stdio: 'pipe' });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      let ready = false, buffer = '', failure: string | null = null;
      const timeout = setTimeout(() => { failure = 'Desktop controls did not become ready.'; worker.kill(); reject(new Error(failure)); }, 8_000);
      worker.stdout.setEncoding('utf8');
      worker.stdout.on('data', (chunk: string) => {
        if (generation !== this.generation || this.closed) return;
        buffer += chunk;
        if (buffer.length > 65_536) { worker.kill(); return; }
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try {
            const event = desktopEventSchema.parse(JSON.parse(line));
            if (event.type === 'ready') { ready = true; clearTimeout(timeout); this.io.status('ready', null); resolve(); }
            else if (event.type === 'metrics') { if (event.pid === worker.pid) this.resources = { ...event, name: 'Desktop controls' }; }
            else if (event.type === 'quick') this.io.quick(event.open);
            else if (event.type === 'applications') void this.io.applications(event.executables).catch(error => this.io.status('error', String(error).slice(0, 2048)));
            else if (event.type === 'error') { failure = event.message; this.io.status('error', event.message); }
          } catch { failure = 'Desktop controls sent an invalid response.'; worker.kill(); }
        }
      });
      worker.stderr.resume();
      worker.stdin.on('error', () => undefined);
      worker.on('error', error => { clearTimeout(timeout); reject(error); });
      worker.on('exit', () => {
        clearTimeout(timeout);
        if (this.worker === worker) { this.worker = null; this.resources = null; }
        if (generation !== this.generation || this.closed) return;
        this.io.quick(false);
        const message = failure ?? 'Desktop controls stopped. Toggle Quick controls or an automatic scene to retry.';
        this.io.status('error', message);
        if (!ready) reject(new Error(message));
      });
      worker.stdin.write(`${JSON.stringify(config)}\n`);
    });
  }

  private async stop(): Promise<void> {
    this.io.quick(false);
    const worker = this.worker;
    this.worker = null;
    this.resources = null;
    if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { worker.kill(); }, 2_000);
      worker.once('exit', () => { clearTimeout(timeout); resolve(); });
      worker.stdin.end();
    });
  }

  async dispose(): Promise<void> { this.closed = true; this.generation++; await this.chain; await this.stop(); }
  getResources(): ExternalProcessResource[] {
    if (this.worker && Date.now() - this.lastMetricRequestAt >= 4_900) {
      this.lastMetricRequestAt = Date.now(); this.worker.stdin.write('metrics\n');
    }
    return this.worker && this.resources ? [{ ...this.resources }] : [];
  }
}
