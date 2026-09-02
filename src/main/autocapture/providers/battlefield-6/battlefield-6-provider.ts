import { basename } from 'node:path';
import type {
  DetectedGame,
  GameEvent,
  ProviderAvailability,
  ProviderStatus,
} from '../../../../shared/contracts';
import type {
  GameEventProvider,
  ProviderContext,
  ProviderDiscoveryContext,
} from '../../provider';
import { Battlefield6EventParser } from './parser';
import {
  hasOverwolfGepRuntime,
  OverwolfBattlefield6GepSession,
  type Battlefield6GepSession,
  type OverwolfRuntimeHost,
} from './overwolf-gep-session';

const steamAppId = '2807960';

type Battlefield6ProviderOptions = {
  runtime: OverwolfRuntimeHost;
  gameEventsEnabled?: boolean;
  createSession?: () => Battlefield6GepSession;
  createParser?: () => Battlefield6EventParser;
};

export class Battlefield6Provider implements GameEventProvider {
  public readonly id = 'battlefield-6-overwolf-gep';
  public readonly gameId = 'battlefield-6';
  public readonly displayName = 'Battlefield 6';
  public readonly supportLevel = 'experimental' as const;
  public readonly source = 'api' as const;
  public readonly capabilities = {
    events: ['kill', 'knockdown', 'round_win', 'round_loss'] as const,
    nativeMultiKill: false,
  };

  private readonly listeners = new Set<(event: GameEvent) => void>();
  private readonly statusListeners = new Set<() => void>();
  private readonly parser: Battlefield6EventParser;
  private readonly createSession: () => Battlefield6GepSession;
  private session: Battlefield6GepSession | null = null;
  private status: ProviderStatus = { state: 'stopped' };
  private eventsReceived = 0;
  private eventsEmitted = 0;
  private invalidPayloads = 0;
  private scene: 'lobby' | 'ingame' | 'summary' | null = null;

  public constructor(private readonly options: Battlefield6ProviderOptions) {
    this.parser = options.createParser?.() ?? new Battlefield6EventParser();
    this.createSession = options.createSession
      ?? (() => new OverwolfBattlefield6GepSession(options.runtime));
  }

  public matchesGame(source: { name: string }, detectedGames: readonly DetectedGame[]): boolean {
    const name = normalize(source.name);
    return name === 'bf6'
      || name === 'bf6 exe'
      || name.includes('battlefield 6')
      || Boolean(this.findDetectedGame(detectedGames) && name.includes('battlefield'));
  }

  public findDetectedGame(detectedGames: readonly DetectedGame[]): DetectedGame | undefined {
    return detectedGames.find((game) => game.launchUri?.toLocaleLowerCase() === `steam://rungameid/${steamAppId}`
      || normalize(game.name) === 'battlefield 6'
      || normalize(game.executablePath ? basename(game.executablePath) : '') === 'bf6 exe');
  }

  public async detectAvailability(context: ProviderDiscoveryContext): Promise<ProviderAvailability> {
    if (context.platform !== 'win32') {
      return { state: 'unavailable', reason: 'Battlefield 6 Auto Capture is supported on Windows.' };
    }
    if (!this.findDetectedGame(context.detectedGames)) {
      return { state: 'unavailable', reason: 'Battlefield 6 was not found in the detected game library.' };
    }
    if (!hasOverwolfGepRuntime(this.options.runtime)) {
      return {
        state: 'unavailable',
        reason: 'Battlefield 6 events require an Overwolf-enabled Switchboard build.',
      };
    }
    if (!this.options.gameEventsEnabled) {
      return {
        state: 'unavailable',
        reason: 'Overwolf has not enabled Battlefield 6 events for this Switchboard build.',
      };
    }
    return { state: 'available' };
  }

  public async start(_context: ProviderContext): Promise<void> {
    if (this.session) return;
    this.parser.beginSession();
    this.setStatus({ state: 'starting', message: 'Waiting for Battlefield 6 telemetry.' });
    const session = this.createSession();
    this.session = session;
    session.start({
      onListening: () => this.setStatus({
        state: 'listening',
        ...(this.status.lastEventAt ? { lastEventAt: this.status.lastEventAt } : {}),
      }),
      onWaiting: (message) => this.setStatus({ state: 'starting', message }),
      onEvent: (payload) => this.handlePayload(payload),
      onInfo: (payload) => this.handleInfo(payload),
      onError: (message) => this.setStatus({ state: 'degraded', message }),
    });
  }

  public async stop(): Promise<void> {
    this.session?.stop();
    this.session = null;
    this.scene = null;
    this.setStatus({ state: 'stopped' });
  }

  public subscribe(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public getStatus(): ProviderStatus {
    return { ...this.status };
  }

  public async getDiagnostics() {
    return {
      integration: 'overwolf-gep',
      overwolfGameId: 26462,
      runtimeAvailable: hasOverwolfGepRuntime(this.options.runtime),
      gameEventsEnabled: this.options.gameEventsEnabled ?? false,
      sessionActive: Boolean(this.session),
      scene: this.scene,
      eventsReceived: this.eventsReceived,
      eventsEmitted: this.eventsEmitted,
      invalidPayloads: this.invalidPayloads,
    };
  }

  private handlePayload(payload: unknown): void {
    this.eventsReceived += 1;
    try {
      for (const event of this.parser.parse(payload)) {
        this.eventsEmitted += 1;
        this.setStatus({ state: 'listening', lastEventAt: event.timestamp });
        for (const listener of this.listeners) listener(event);
      }
    } catch {
      this.invalidPayloads += 1;
      this.setStatus({ state: 'degraded', message: 'Battlefield 6 returned an invalid telemetry payload.' });
    }
  }

  private handleInfo(payload: unknown): void {
    const scene = this.parser.readScene(payload);
    if (scene) this.scene = scene;
  }

  private setStatus(status: ProviderStatus): void {
    if (JSON.stringify(status) === JSON.stringify(this.status)) return;
    this.status = status;
    for (const listener of this.statusListeners) listener();
  }
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
