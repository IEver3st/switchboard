import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { openTrackStateSchema, type OpenTrackState } from '../../shared/contracts';

// Official, unmodified OpenTrack portable release. Updating requires reviewing the new release and hash.
// The audio host (ManagedOpenTrack.cs) launches this exact directory; keep the version in sync.
export const openTrackPackage = {
  version: 'opentrack-2026.1.0',
  url: 'https://github.com/opentrack/opentrack/releases/download/opentrack-2026.1.0/opentrack-2026.1.0-win32-portable.7z',
  sha256: '92ed738f863d5a46c0a4518bc81ceb71c778804cb66b2108eee34c9962d71813',
  bytes: 196_482_178,
} as const;
const maxDownloadBytes = 256 * 1024 * 1024;

/** Explicit user action only: no startup download or polling. A check is a single file probe. */
export class OpenTrackSetup {
  private state = openTrackStateSchema.parse({});
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private disposed = false;
  private readonly root: string;
  constructor(localAppData: string, private readonly publish: (state: OpenTrackState) => void) {
    this.root = join(localAppData, 'Switchboard', 'OpenTrack');
  }
  private get directory() { return join(this.root, openTrackPackage.version); }
  private update(patch: Partial<OpenTrackState>) {
    this.state = openTrackStateSchema.parse({ ...this.state, ...patch });
    if (!this.disposed) this.publish(this.state);
  }
  async installed(): Promise<boolean> {
    try {
      await access(join(this.directory, 'switchboard-ready.json'));
      await access(join(this.directory, 'install', 'opentrack.exe'));
      return true;
    } catch { return false; }
  }
  start(install: boolean): void {
    if (this.disposed) throw new Error('OpenTrack setup is shutting down.');
    if (this.pending) throw new Error('OpenTrack setup is already running.');
    if (install && (process.platform !== 'win32')) throw new Error('OpenTrack setup requires Windows.');
    this.abort = new AbortController();
    this.update({ phase: 'checking', progress: null, error: null });
    this.pending = this.run(install, this.abort.signal).catch(error => {
      this.update({ phase: 'error', progress: null, error: String(error instanceof Error ? error.message : error).slice(0, 1000) });
    }).finally(() => { this.pending = null; this.abort = null; });
  }
  async settled(): Promise<void> { await this.pending; }
  cancel(): void { this.abort?.abort(new Error('OpenTrack setup cancelled.')); }
  dispose(): void { this.disposed = true; this.abort?.abort(new Error('OpenTrack setup stopped because Switchboard closed.')); }

  private async run(install: boolean, signal: AbortSignal) {
    this.update({ lanAddress: lanAddress() });
    if (await this.installed()) { this.update({ phase: 'ready', installed: true, progress: null }); return; }
    if (!install) { this.update({ phase: 'idle', installed: false, progress: null }); return; }
    await mkdir(this.root, { recursive: true });
    const staging = join(this.root, `${openTrackPackage.version}.partial`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      const archive = join(staging, 'opentrack.7z');
      this.update({ phase: 'downloading', progress: 0 });
      await this.download(archive, signal);
      this.update({ phase: 'extracting', progress: null });
      // Windows' inbox bsdtar (libarchive) reads 7z; no bundled extractor is needed.
      await run(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', staging], 300_000, signal);
      await rm(archive, { force: true });
      await access(join(staging, 'install', 'opentrack.exe'));
      await access(join(staging, 'install', 'modules', 'opentrack-tracker-neuralnet.dll'));
      await writeFile(join(staging, 'install', 'portable.txt'), '');
      await writeFile(join(staging, 'switchboard-ready.json'), JSON.stringify({ version: openTrackPackage.version, sha256: openTrackPackage.sha256 }));
      signal.throwIfAborted();
      await rm(this.directory, { recursive: true, force: true });
      await rename(staging, this.directory);
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    this.update({ phase: 'ready', installed: true, progress: null });
  }

  private async download(path: string, signal: AbortSignal) {
    const response = await fetch(openTrackPackage.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)]) });
    if (!response.ok || !response.body) throw new Error('The official OpenTrack download is unavailable. Check your connection and try again.');
    const url = new URL(response.url);
    if (url.protocol !== 'https:' || !(url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com')))
      throw new Error('The OpenTrack download was redirected to an unexpected host. Nothing was installed.');
    const hash = createHash('sha256');
    const file = await open(path, 'w'); let size = 0; let last = -1;
    try {
      for await (const chunk of response.body) {
        signal.throwIfAborted(); size += chunk.length;
        if (size > maxDownloadBytes) throw new Error('The OpenTrack download exceeds the expected size. Nothing was installed.');
        hash.update(chunk); await file.write(chunk);
        const next = Math.min(99, Math.floor(size * 100 / openTrackPackage.bytes));
        if (next !== last) { this.update({ progress: next }); last = next; }
      }
    } finally { await file.close(); }
    if (hash.digest('hex') !== openTrackPackage.sha256) throw new Error('The OpenTrack download failed verification. Nothing was installed.');
    this.update({ progress: 100 });
  }
}

function lanAddress(): string | null {
  const addresses = Object.values(networkInterfaces()).flat()
    .filter(entry => entry && entry.family === 'IPv4' && !entry.internal).map(entry => entry!.address);
  return addresses.find(address => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) ?? addresses[0] ?? null;
}

function run(command: string, args: string[], timeout: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; let failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; child.kill(); };
    const abort = () => stop(new Error('OpenTrack setup cancelled.'));
    const timer = setTimeout(() => stop(new Error('Extracting OpenTrack timed out.')), timeout);
    signal.addEventListener('abort', abort, { once: true });
    child.stderr.on('data', data => { err = (err + String(data)).slice(-2000); });
    child.on('error', error => { failure ??= error; });
    child.on('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure ?? new Error(err.trim() || 'Extracting OpenTrack failed.'));
      else resolve();
    });
    if (signal.aborted) abort();
  });
}
