import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { DetectedGame, GameEvent, ProviderAvailability, ProviderStatus } from '../../../../shared/contracts';
import { matchDetectedGame } from '../../registry';
import type {
  GameEventProvider,
  ProviderContext,
  ProviderDiscoveryContext,
} from '../../provider';
import { CS2TelemetryParser } from './parser';

const cs2Port = 32_145;
const maximumPayloadBytes = 256 * 1_024;
const integrationFileName = 'gamestate_integration_switchboard.cfg';

export class CS2Provider implements GameEventProvider {
  public readonly id = 'cs2-gsi';
  public readonly gameId = 'counter-strike-2';
  public readonly displayName = 'Counter-Strike 2';
  public readonly supportLevel = 'supported' as const;
  public readonly source = 'telemetry' as const;
  public readonly capabilities = {
    events: ['kill', 'headshot', 'assist', 'death', 'round_win', 'round_loss', 'match_win', 'match_loss'] as const,
    nativeMultiKill: false,
  };
  private readonly parser = new CS2TelemetryParser();
  private readonly listeners = new Set<(event: GameEvent) => void>();
  private server: Server | null = null;
  private status: ProviderStatus = { state: 'stopped' };
  private token: string | null = null;
  private payloadsReceived = 0;
  private invalidPayloads = 0;
  private eventsEmitted = 0;

  public constructor(private readonly tokenPath: string) {}

  public matchesGame(source: { name: string }, detectedGames: readonly DetectedGame[]): boolean {
    const name = normalize(source.name);
    return name.includes('counter strike 2')
      || name === 'cs2'
      || Boolean(matchDetectedGame(this.gameId, detectedGames) && name.includes('counter strike'));
  }

  public async detectAvailability(context: ProviderDiscoveryContext): Promise<ProviderAvailability> {
    if (context.platform !== 'win32') return { state: 'unavailable', reason: 'CS2 Game State Integration is supported on Windows.' };
    const game = matchDetectedGame(this.gameId, context.detectedGames);
    if (!game) return { state: 'unavailable', reason: 'Counter-Strike 2 was not found in the detected game library.' };
    const integrationPath = getIntegrationPath(game);
    try {
      const [token, config] = await Promise.all([readFile(this.tokenPath, 'utf8'), readFile(integrationPath, 'utf8')]);
      if (token.trim().length >= 32 && config.includes(token.trim())) return { state: 'available' };
    } catch { }
    return { state: 'setup-required', reason: 'Install Switchboard’s local CS2 Game State Integration file before launching the game.' };
  }

  public async setup(context: ProviderDiscoveryContext): Promise<ProviderAvailability> {
    const game = matchDetectedGame(this.gameId, context.detectedGames);
    if (!game) throw new Error('Counter-Strike 2 must be detected before its integration can be installed.');
    const integrationPath = getIntegrationPath(game);
    assertInside(game.installDirectory, integrationPath);
    const token = randomBytes(32).toString('hex');
    await mkdir(join(game.installDirectory, 'game', 'csgo', 'cfg'), { recursive: true });
    await mkdir(dirname(this.tokenPath), { recursive: true });
    await atomicWrite(this.tokenPath, `${token}\n`);
    await atomicWrite(integrationPath, createIntegrationConfig(token));
    this.token = token;
    return { state: 'available' };
  }

  public async start(_context: ProviderContext): Promise<void> {
    if (this.server) return;
    this.status = { state: 'starting' };
    this.token = (await readFile(this.tokenPath, 'utf8')).trim();
    if (this.token.length < 32) throw new Error('The CS2 integration token is missing or invalid.');
    this.parser.reset();

    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        this.invalidPayloads += 1;
        response.writeHead(400).end();
        this.status = { state: 'degraded', message: error instanceof Error ? error.message : String(error) };
      });
    });
    server.requestTimeout = 5_000;
    server.headersTimeout = 5_000;
    this.server = server;
    await new Promise<void>((resolvePromise, reject) => {
      const onError = (error: Error) => {
        cleanup();
        this.server = null;
        this.status = { state: 'error', message: error.message };
        reject(error);
      };
      const onListening = () => {
        cleanup();
        this.status = { state: 'listening' };
        resolvePromise();
      };
      const cleanup = () => {
        server.removeListener('error', onError);
        server.removeListener('listening', onListening);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(cs2Port, '127.0.0.1');
    });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.parser.reset();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
    this.status = { state: 'stopped' };
  }

  public subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getStatus(): ProviderStatus {
    return { ...this.status };
  }

  public async getDiagnostics() {
    return {
      port: cs2Port,
      payloadsReceived: this.payloadsReceived,
      invalidPayloads: this.invalidPayloads,
      eventsEmitted: this.eventsEmitted,
      listening: this.status.state === 'listening',
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/game-state' || !isLoopback(request.socket.remoteAddress)) {
      response.writeHead(404).end();
      return;
    }
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maximumPayloadBytes) throw new Error('CS2 telemetry exceeded the local payload limit.');
      chunks.push(buffer);
    }
    const parsed = this.parser.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!this.token || !tokensMatch(parsed.token, this.token)) throw new Error('CS2 telemetry authentication failed.');
    this.payloadsReceived += 1;
    for (const event of parsed.events) {
      this.eventsEmitted += 1;
      this.status = { state: 'listening', lastEventAt: event.timestamp };
      for (const listener of this.listeners) listener(event);
    }
    response.writeHead(204).end();
  }
}

export function createIntegrationConfig(token: string): string {
  return `"Switchboard Auto Capture"\n{\n  "uri" "http://127.0.0.1:${cs2Port}/game-state"\n  "timeout" "5.0"\n  "buffer" "0.1"\n  "throttle" "0.1"\n  "heartbeat" "30.0"\n  "auth"\n  {\n    "token" "${token}"\n  }\n  "data"\n  {\n    "provider" "1"\n    "map" "1"\n    "round" "1"\n    "player_id" "1"\n    "player_state" "1"\n    "player_match_stats" "1"\n  }\n}\n`;
}

function getIntegrationPath(game: DetectedGame): string {
  return join(game.installDirectory, 'game', 'csgo', 'cfg', integrationFileName);
}

function assertInside(root: string, target: string): void {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  const child = relative(normalizedRoot, normalizedTarget);
  if (!child || child.startsWith(`..${sep}`) || child === '..' || isAbsolute(child)) {
    throw new Error('Refused to write the CS2 integration outside the detected game directory.');
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.switchboard-writing`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, path);
  await access(path);
}

function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
