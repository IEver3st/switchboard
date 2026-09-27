import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type RuntimeRole = 'installed' | 'development';
export type RuntimeHandoffState = 'waiting' | 'active' | 'standby' | 'blocked';
type Endpoint = { base: string; token: string };
const runFile = promisify(execFile);

export async function legacyInstalledSwitchboardRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const { stdout } = await runFile('tasklist.exe', ['/FI', 'IMAGENAME eq switchboard.exe', '/FO', 'CSV', '/NH'],
    { windowsHide: true, timeout: 3_000, maxBuffer: 1024 * 1024 });
  return stdout.split(/\r?\n/).some(line => /^"switchboard\.exe","\d+"/i.test(line));
}
const requestSchema = z.object({ version: z.literal(1), token: z.string().length(64), command: z.enum(['watch', 'yield']) }).strict();
const responseSchema = z.object({ version: z.literal(1), event: z.enum(['present', 'released', 'blocked']), message: z.string().max(512).optional() }).strict();

export async function runtimeHandoffEndpoint(appData: string): Promise<Endpoint> {
  const directory = join(appData, 'Switchboard Runtime');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'handoff-key');
  try { await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  // Another instance may still be completing the initial exclusive write.
  for (let attempt = 0; attempt < 10; attempt++) {
    const token = await readFile(path, 'utf8');
    if (/^[a-f0-9]{64}$/.test(token)) {
      const id = createHash('sha256').update(appData.toLowerCase()).digest('hex').slice(0, 24);
      return { base: `\\\\.\\pipe\\switchboard-${id}-runtime-v1`, token };
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Switchboard could not read its local handoff key.');
}

/** Per-user Windows pipes: presence outlives cleanup; a separate pipe fences runtime ownership. */
export class RuntimeHandoff {
  private presence: Server | null = null;
  private lease: Server | null = null;
  private peer: Socket | null = null;
  private readonly clients = new Set<Socket>();
  private readonly watchers = new Set<Socket>();
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  private active = false;
  private releasedCleanly = false;
  private disposeTask: Promise<void> | null = null;

  constructor(private readonly options: Endpoint & {
    role: RuntimeRole;
    acquire(): Promise<void>;
    release(): Promise<void>;
    state(state: RuntimeHandoffState, message?: string): void;
    legacyOwnerRunning?(): Promise<boolean>;
  }) {}

  async start(): Promise<void> {
    const server = createServer(socket => this.accept(socket));
    server.maxConnections = 8;
    await listen(server, this.path(this.options.role));
    this.presence = server;
    server.on('error', error => this.options.state('blocked', error.message));
    await this.reconcile();
  }

  private path(name: string): string { return `${this.options.base}-${name}`; }

  private reconcile(): Promise<void> {
    const operation = this.chain.then(async () => {
      if (this.closed) return;
      if (this.options.role === 'installed') {
        if (!this.peer) this.peer = await this.connect('development', 'watch');
        if (this.peer) {
          await this.release();
          this.options.state('standby');
          return;
        }
      } else {
        const installed = await this.connect('installed', 'yield');
        installed?.destroy();
        if (!installed && await this.options.legacyOwnerRunning?.()) {
          this.options.state('blocked', 'The running installed version does not support handoff. Quit it before opening Dev, or update both builds.');
          return;
        }
      }
      if (this.closed) return;
      if (this.active) { this.options.state('active'); return; }
      this.options.state('waiting');
      const lease = createServer(socket => socket.destroy());
      await listen(lease, this.path('owner'));
      this.lease = lease;
      // Mark before startup: partial initialization must also be released.
      this.active = true;
      await this.options.acquire();
      if (!this.closed) this.options.state('active');
    });
    this.chain = operation.catch(error => {
      if (!this.closed) this.options.state('blocked', error instanceof Error ? error.message : String(error));
    });
    return this.chain;
  }

  private async release(): Promise<void> {
    if (this.active) {
      this.options.state('waiting');
      await this.options.release();
      this.active = false;
    }
    const lease = this.lease;
    if (lease) { await close(lease); this.lease = null; }
  }

  private accept(socket: Socket): void {
    this.clients.add(socket);
    socket.once('close', () => { this.clients.delete(socket); this.watchers.delete(socket); });
    socket.on('error', () => {});
    socket.setTimeout(2_000, () => socket.destroy());
    let buffer = '';
    const receive = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 1024) { socket.destroy(); return; }
      if (!buffer.includes('\n')) return;
      socket.removeListener('data', receive);
      try {
        const request = requestSchema.parse(JSON.parse(buffer.trim()));
        if (request.token !== this.options.token || this.closed) { socket.destroy(); return; }
        socket.setTimeout(0);
        if (request.command === 'watch') {
          this.watchers.add(socket);
          send(socket, 'present');
        } else if (this.options.role === 'installed') {
          void this.reconcile().then(() => {
            if (!this.active && !this.lease && this.peer) send(socket, 'released');
            else send(socket, 'blocked', 'Installed Switchboard has not finished releasing its runtime.');
          });
        } else socket.destroy();
      } catch { socket.destroy(); }
    };
    socket.on('data', receive);
  }

  private connect(role: RuntimeRole, command: 'watch' | 'yield'): Promise<Socket | null> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.path(role));
      let settled = false;
      let buffer = '';
      const finish = (error?: Error, absent = false) => {
        if (settled) return;
        settled = true;
        socket.setTimeout(0);
        if (error || absent) socket.destroy();
        if (error) reject(error); else resolve(absent ? null : socket);
      };
      socket.setTimeout(command === 'yield' ? 60_000 : 2_000, () => finish(new Error('Switchboard runtime handoff timed out. No competing runtime was started.')));
      socket.once('connect', () => socket.write(`${JSON.stringify({ version: 1, token: this.options.token, command })}\n`));
      socket.on('error', (error: NodeJS.ErrnoException) => {
        if (!settled) {
          if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') finish(undefined, true);
          else finish(error);
        }
      });
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        if (buffer.length > 1024) { finish(new Error('Invalid handoff response.')); socket.destroy(); return; }
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try {
            const response = responseSchema.parse(JSON.parse(line));
            if (response.event === 'blocked') { finish(new Error(response.message ?? 'Runtime handoff was blocked.')); return; }
            if (!settled) {
              if (response.event !== (command === 'watch' ? 'present' : 'released')) throw new Error('Unexpected handoff response.');
              finish();
            } else if (command === 'watch' && response.event === 'released') this.releasedCleanly = true;
          } catch { finish(new Error('Invalid handoff response.')); socket.destroy(); }
        }
      });
      socket.once('close', () => {
        if (!settled) { finish(new Error('The other Switchboard closed before acknowledging handoff.')); return; }
        if (command !== 'watch' || this.closed || this.peer !== socket) return;
        this.peer = null;
        if (this.releasedCleanly) {
          this.releasedCleanly = false;
          void this.reconcile();
        } else {
          // Pipe disappearance alone does not prove orphaned realtime hosts exited.
          this.options.state('blocked', 'Dev closed unexpectedly. Reopen Dev and quit it normally before resuming Switchboard.');
        }
      });
    });
  }

  dispose(): Promise<void> {
    this.disposeTask ??= this.disposeOnce();
    return this.disposeTask;
  }

  private async disposeOnce(): Promise<void> {
    this.closed = true;
    await this.chain;
    // Keep presence and the ownership fence if cleanup fails. Never acknowledge
    // a release while a host or hardware handle may still be active.
    await this.release();
    for (const socket of this.watchers) socket.end(`${JSON.stringify({ version: 1, event: 'released' })}\n`);
    this.peer?.destroy(); this.peer = null;
    for (const socket of this.clients) if (!this.watchers.has(socket)) socket.destroy();
    if (this.presence) { await close(this.presence); this.presence = null; }
  }
}

function send(socket: Socket, event: 'present' | 'released' | 'blocked', message?: string): void {
  if (!socket.destroyed) socket.write(`${JSON.stringify({ version: 1, event, ...(message ? { message: message.slice(0, 512) } : {}) })}\n`);
}
function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ path, exclusive: true }, () => { server.removeListener('error', reject); resolve(); });
  });
}
function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
