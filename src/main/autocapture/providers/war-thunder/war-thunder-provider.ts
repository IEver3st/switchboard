import type { AutoCaptureGameSettings, DetectedGame, GameEvent, ProviderAvailability, ProviderStatus } from '../../../../shared/contracts';
import type { GameEventProvider, ProviderContext, ProviderDiscoveryContext } from '../../provider';
import { WarThunderTelemetryParser } from './parser';

const steamAppId = '236390';
const defaultPollIntervalMs = 750;
const requestTimeoutMs = 1_000;
const maximumPayloadBytes = 1_024 * 1_024;

type WarThunderProviderOptions = {
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  endpoint?: string;
};

export class WarThunderProvider implements GameEventProvider {
  public readonly id = 'war-thunder-8111';
  public readonly gameId = 'war-thunder';
  public readonly displayName = 'War Thunder';
  public readonly supportLevel = 'experimental' as const;
  public readonly source = 'api' as const;
  public readonly capabilities = {
    events: ['kill', 'death', 'objective'] as const,
    nativeMultiKill: false,
  };
  public readonly requiresPlayerName = true;

  private readonly parser = new WarThunderTelemetryParser();
  private readonly listeners = new Set<(event: GameEvent) => void>();
  private readonly fetchImplementation: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly endpoint: string;
  private status: ProviderStatus = { state: 'stopped' };
  private playerName: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private request: AbortController | null = null;
  private lifecycle = 0;
  private initialized = false;
  private degradedForMissingPlayerName = false;
  private pollsCompleted = 0;
  private failedPolls = 0;
  private eventsEmitted = 0;

  public constructor(options: WarThunderProviderOptions = {}) {
    this.fetchImplementation = options.fetch ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
    this.endpoint = options.endpoint ?? 'http://127.0.0.1:8111';
  }

  public matchesGame(source: { name: string }, detectedGames: readonly DetectedGame[]): boolean {
    const name = normalize(source.name);
    return name.includes('war thunder')
      || name === 'aces'
      || name === 'aces exe'
      || Boolean(this.findDetectedGame(detectedGames) && name.includes('war thunder'));
  }

  public findDetectedGame(detectedGames: readonly DetectedGame[]): DetectedGame | undefined {
    return detectedGames.find((game) => game.launchUri?.toLocaleLowerCase() === `steam://rungameid/${steamAppId}`
      || normalize(game.name) === 'war thunder');
  }

  public async detectAvailability(context: ProviderDiscoveryContext): Promise<ProviderAvailability> {
    if (context.platform !== 'win32') {
      return { state: 'unavailable', reason: 'War Thunder Auto Capture is supported on Windows.' };
    }
    if (!this.findDetectedGame(context.detectedGames)) {
      return { state: 'unavailable', reason: 'War Thunder was not found in the detected game library.' };
    }
    return { state: 'available' };
  }

  public configure(settings: AutoCaptureGameSettings): void {
    this.playerName = settings.playerName?.trim() || null;
    const wasMissingPlayerName = this.degradedForMissingPlayerName;
    this.degradedForMissingPlayerName = !this.playerName;
    if (!this.playerName && this.status.state !== 'stopped' && this.status.state !== 'starting') {
      this.status = { state: 'degraded', message: 'Enter your War Thunder nickname to identify personal events.' };
    } else if (this.playerName && wasMissingPlayerName && this.initialized && this.status.state === 'degraded') {
      this.status = { state: 'listening', ...(this.status.lastEventAt ? { lastEventAt: this.status.lastEventAt } : {}) };
    }
  }

  public async start(context: ProviderContext): Promise<void> {
    if (this.timer || this.request || this.status.state === 'listening' || this.status.state === 'degraded') return;
    this.configure(context.gameSettings ?? { enabled: true, useGlobalTiming: true, events: {} });
    const lifecycle = ++this.lifecycle;
    this.status = { state: 'starting' };
    this.parser.reset();
    this.initialized = false;
    this.degradedForMissingPlayerName = false;
    await this.poll(lifecycle, true);
    this.schedule(lifecycle);
  }

  public async stop(): Promise<void> {
    this.lifecycle += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request?.abort();
    this.request = null;
    this.parser.reset();
    this.initialized = false;
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
      endpoint: this.endpoint,
      pollIntervalMs: this.pollIntervalMs,
      pollsCompleted: this.pollsCompleted,
      failedPolls: this.failedPolls,
      eventsEmitted: this.eventsEmitted,
      initialized: this.initialized,
      playerNameConfigured: Boolean(this.playerName),
    };
  }

  private schedule(lifecycle: number): void {
    if (lifecycle !== this.lifecycle) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll(lifecycle, false).finally(() => this.schedule(lifecycle));
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  private async poll(lifecycle: number, baseline: boolean): Promise<void> {
    if (lifecycle !== this.lifecycle) return;
    try {
      const payload = await this.fetchHud(lifecycle, baseline);
      if (lifecycle !== this.lifecycle) return;
      this.pollsCompleted += 1;
      if (baseline || !this.initialized) {
        this.parser.baseline(payload);
        this.initialized = true;
      } else {
        for (const event of this.parser.parse(payload, this.playerName)) {
          this.eventsEmitted += 1;
          this.status = { state: 'listening', lastEventAt: event.timestamp };
          for (const listener of this.listeners) listener(event);
        }
      }
      if (!this.playerName) {
        this.degradedForMissingPlayerName = true;
        this.status = { state: 'degraded', message: 'Enter your War Thunder nickname to identify personal events.' };
      } else if (this.status.state !== 'listening' || !this.status.lastEventAt) {
        this.degradedForMissingPlayerName = false;
        this.status = { state: 'listening' };
      }
    } catch (error) {
      if (lifecycle !== this.lifecycle) return;
      this.failedPolls += 1;
      this.degradedForMissingPlayerName = false;
      this.status = {
        state: 'degraded',
        message: error instanceof Error && error.name !== 'AbortError'
          ? `War Thunder local API: ${error.message}`
          : 'Waiting for War Thunder’s local API.',
      };
    }
  }

  private async fetchHud(lifecycle: number, baseline: boolean): Promise<unknown> {
    const cursor = baseline ? { lastEventId: 0, lastDamageId: 0 } : this.parser.cursor();
    const request = new AbortController();
    this.request = request;
    const timeout = setTimeout(() => request.abort(), requestTimeoutMs);
    timeout.unref?.();
    try {
      const response = await this.fetchImplementation(
        `${this.endpoint}/hudmsg?lastEvt=${cursor.lastEventId}&lastDmg=${cursor.lastDamageId}`,
        { headers: { Accept: 'application/json' }, signal: request.signal },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > maximumPayloadBytes) throw new Error('telemetry exceeded the local payload limit');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maximumPayloadBytes) throw new Error('telemetry exceeded the local payload limit');
      return JSON.parse(new TextDecoder().decode(buffer));
    } finally {
      clearTimeout(timeout);
      if (lifecycle === this.lifecycle && this.request === request) this.request = null;
    }
  }
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
