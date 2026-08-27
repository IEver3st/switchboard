import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';

const hostMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), protocolVersion: z.literal(1) }),
  z.object({ type: z.literal('response'), requestId: z.string(), ok: z.literal(true), devices: z.array(z.object({
    token: z.string(), name: z.string(), connected: z.boolean(), authenticated: z.boolean(), remembered: z.boolean(),
  })).optional() }),
  z.object({ type: z.literal('error'), requestId: z.string().nullable().optional(), code: z.string() }),
  z.object({ type: z.literal('data'), token: z.string(), bytes: z.string() }),
  z.object({ type: z.literal('connected'), token: z.string() }),
  z.object({ type: z.literal('disconnected'), token: z.string(), reason: z.string() }),
]);

export interface SonyHostDevice { token: string; name: string; connected: boolean; authenticated: boolean; remembered: boolean }
type Pending = { resolve: (devices?: SonyHostDevice[]) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export class SonyHeadphonesHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private dataListeners = new Set<(token: string, bytes: Uint8Array) => void>();
  private disconnectListeners = new Set<(token: string, reason: string) => void>();

  public onData(listener: (token: string, bytes: Uint8Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }
  public onDisconnect(listener: (token: string, reason: string) => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  public async scan(): Promise<SonyHostDevice[]> {
    return (await this.request('scan')) ?? [];
  }
  public async connect(token: string): Promise<void> { await this.request('connect', { token }, 10_000); }
  public async send(token: string, bytes: Uint8Array): Promise<void> {
    await this.request('send', { token, bytes: Buffer.from(bytes).toString('base64') }, 3_000);
  }
  public async disconnect(token: string): Promise<void> { await this.request('disconnect', { token }); }

  public async dispose(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.ready = null;
    if (!child) return;
    try { await this.writeRequest(child, 'shutdown', {}, 1_000); } catch { /* process may already be gone */ }
    child.kill();
    this.rejectPending(new Error('Sony transport stopped.'));
  }

  private async request(type: string, payload: Record<string, unknown> = {}, timeoutMs = 5_000): Promise<SonyHostDevice[] | undefined> {
    await this.ensureStarted();
    if (!this.child) throw new Error('Sony transport is unavailable.');
    return this.writeRequest(this.child, type, payload, timeoutMs);
  }

  private writeRequest(child: ChildProcessWithoutNullStreams, type: string, payload: Record<string, unknown>, timeoutMs: number): Promise<SonyHostDevice[] | undefined> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Sony transport ${type} timed out.`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(requestId, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ type, requestId, ...payload })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  private ensureStarted(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const resolved = resolveHost();
      const child = spawn(resolved.command, resolved.arguments, { cwd: resolved.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let stdout = '';
      const startupTimer = setTimeout(() => reject(new Error('Sony transport did not start.')), 8_000);
      startupTimer.unref();
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        let newline = stdout.indexOf('\n');
        while (newline >= 0) {
          const line = stdout.slice(0, newline).trim();
          stdout = stdout.slice(newline + 1);
          if (line) {
            try {
              const parsed = hostMessageSchema.safeParse(JSON.parse(line));
              if (parsed.success) {
                if (parsed.data.type === 'ready') { clearTimeout(startupTimer); resolve(); }
                this.handleMessage(parsed.data);
              }
            } catch { console.warn('[Sony transport] Ignored malformed host output.'); }
          }
          newline = stdout.indexOf('\n');
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (message: string) => console.warn('[Sony transport]', message.trim()));
      child.once('error', (error) => { clearTimeout(startupTimer); reject(error); });
      child.once('exit', () => {
        clearTimeout(startupTimer);
        if (this.child === child) { this.child = null; this.ready = null; }
        this.rejectPending(new Error('Sony transport process exited.'));
      });
    });
    return this.ready;
  }

  private handleMessage(message: z.infer<typeof hostMessageSchema>): void {
    if (message.type === 'data') {
      const bytes = Uint8Array.from(Buffer.from(message.bytes, 'base64'));
      for (const listener of this.dataListeners) listener(message.token, bytes);
    } else if (message.type === 'disconnected') {
      for (const listener of this.disconnectListeners) listener(message.token, message.reason);
    } else if (message.type === 'response') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      pending.resolve(message.devices);
    } else if (message.type === 'error' && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      pending.reject(new Error(message.code));
    }
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }
}

function resolveHost(): { command: string; arguments: string[]; cwd: string } {
  if (app.isPackaged) {
    const cwd = join(process.resourcesPath, 'sony-headphones-host');
    return { command: join(cwd, 'Sony.Headphones.Host.exe'), arguments: [], cwd };
  }
  const root = app.getAppPath();
  const executable = join(root, 'engines', 'sony-headphones-host', 'bin', 'Debug', 'net10.0-windows', 'Sony.Headphones.Host.exe');
  if (existsSync(executable)) return { command: executable, arguments: [], cwd: root };
  return { command: 'dotnet', arguments: ['run', '--project', join(root, 'engines', 'sony-headphones-host', 'Sony.Headphones.Host.csproj'), '--no-launch-profile'], cwd: root };
}
