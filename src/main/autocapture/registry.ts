import type { AutoCaptureProvider, CaptureSource, DetectedGame, GameEvent, ProviderAvailability } from '../../shared/contracts';
import {
  providerSnapshot,
  type ActiveGameContext,
  type AutoCaptureLog,
  type GameEventProvider,
  type ProviderDiscoveryContext,
} from './provider';

type RegisteredProvider = {
  provider: GameEventProvider;
  availability: ProviderAvailability;
  unsubscribe: (() => void) | null;
  start: Promise<void> | null;
};

export class AutoCaptureRegistry {
  private readonly providers = new Map<string, RegisteredProvider>();
  private readonly eventListeners = new Set<(event: GameEvent) => void>();
  private readonly changedListeners = new Set<() => void>();

  public constructor(private readonly log: AutoCaptureLog) {}

  public register(provider: GameEventProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`Auto Capture provider already registered: ${provider.id}`);
    this.providers.set(provider.id, {
      provider,
      availability: { state: 'unavailable', reason: 'Availability has not been checked yet.' },
      unsubscribe: null,
      start: null,
    });
  }

  public get(providerId: string): GameEventProvider | undefined {
    return this.providers.get(providerId)?.provider;
  }

  public getForSource(source: CaptureSource, detectedGames: readonly DetectedGame[]): GameEventProvider | undefined {
    return [...this.providers.values()]
      .map((entry) => entry.provider)
      .find((provider) => !provider.developmentOnly && provider.matchesGame(source, detectedGames));
  }

  public snapshots(includeDevelopment: boolean): AutoCaptureProvider[] {
    return [...this.providers.values()]
      .filter(({ provider }) => includeDevelopment || !provider.developmentOnly)
      .map(({ provider, availability }) => providerSnapshot(provider, availability));
  }

  public subscribe(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public onChanged(listener: () => void): () => void {
    this.changedListeners.add(listener);
    return () => this.changedListeners.delete(listener);
  }

  public async refreshAvailability(context: ProviderDiscoveryContext): Promise<void> {
    await Promise.all([...this.providers.values()].map(async (entry) => {
      try {
        entry.availability = await entry.provider.detectAvailability(context);
      } catch (error) {
        entry.availability = { state: 'unavailable', reason: normalizeError(error) };
      }
    }));
    this.emitChanged();
  }

  public async setup(providerId: string, context: ProviderDiscoveryContext): Promise<ProviderAvailability> {
    const entry = this.providers.get(providerId);
    if (!entry) throw new Error(`Unknown Auto Capture provider: ${providerId}`);
    if (!entry.provider.setup) throw new Error(`${entry.provider.displayName} does not require setup.`);
    entry.availability = await entry.provider.setup(context);
    this.emitChanged();
    return entry.availability;
  }

  public async start(providerId: string, context: ActiveGameContext): Promise<void> {
    const entry = this.providers.get(providerId);
    if (!entry) throw new Error(`Unknown Auto Capture provider: ${providerId}`);
    if (entry.provider.getStatus().state === 'listening') return;
    if (entry.start) return entry.start;

    entry.start = (async () => {
      entry.availability = await entry.provider.detectAvailability(context);
      if (entry.availability.state !== 'available') {
        throw new Error(entry.availability.reason ?? `${entry.provider.displayName} is unavailable.`);
      }
      entry.unsubscribe ??= entry.provider.subscribe((event) => {
        for (const listener of this.eventListeners) listener(event);
        this.emitChanged();
      });
      await entry.provider.start({ ...context, log: this.log });
      this.log('provider_started', { game: entry.provider.gameId, provider: entry.provider.id });
      this.emitChanged();
    })().catch((error) => {
      this.log('provider_start_failed', { provider: providerId, error: normalizeError(error) });
      this.emitChanged();
      throw error;
    }).finally(() => {
      entry.start = null;
    });
    return entry.start;
  }

  public async stop(providerId: string): Promise<void> {
    const entry = this.providers.get(providerId);
    if (!entry) return;
    await entry.start?.catch(() => undefined);
    await entry.provider.stop();
    entry.unsubscribe?.();
    entry.unsubscribe = null;
    this.log('provider_stopped', { game: entry.provider.gameId, provider: entry.provider.id });
    this.emitChanged();
  }

  public async stopAll(): Promise<void> {
    await Promise.allSettled([...this.providers.keys()].map((providerId) => this.stop(providerId)));
  }

  private emitChanged(): void {
    for (const listener of this.changedListeners) listener();
  }
}

export function matchDetectedGame(providerGameId: string, detectedGames: readonly DetectedGame[]): DetectedGame | undefined {
  if (providerGameId === 'counter-strike-2') {
    return detectedGames.find((game) => game.launchUri?.toLocaleLowerCase() === 'steam://rungameid/730'
      || normalizeName(game.name).includes('counter strike 2'));
  }
  return detectedGames.find((game) => normalizeName(game.name) === normalizeName(providerGameId));
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
