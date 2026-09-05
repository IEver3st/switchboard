import type {
  AutoCaptureProvider,
  AutoCaptureSettings,
  CaptureSource,
  DetectedGame,
  GameEventType,
  ProviderAvailability,
} from '../../shared/contracts';
import { AutoCaptureEngine } from './auto-capture-engine';
import { AutoCaptureRegistry } from './registry';
import { TestEventProvider } from './providers/test-event-provider';

export type AutoCaptureCoordinatorOptions = {
  registry: AutoCaptureRegistry;
  engine: AutoCaptureEngine;
  testProvider: TestEventProvider;
  getSettings: () => AutoCaptureSettings;
  includeDevelopmentProviders: () => boolean;
  onProvidersChanged: (providers: AutoCaptureProvider[]) => void;
};

export class AutoCaptureCoordinator {
  private activeProviderId: string | null = null;
  private detectedGames: readonly DetectedGame[] = [];
  private captureEnabled = false;
  private activeSource: CaptureSource | null = null;
  private operation: Promise<void> = Promise.resolve();
  private reconcileSignature = '';
  private disposed = false;
  private readonly unsubscribeEvents: () => void;
  private readonly unsubscribeChanged: () => void;

  public constructor(private readonly options: AutoCaptureCoordinatorOptions) {
    this.unsubscribeEvents = options.registry.subscribe((event) => { options.engine.handleEvent(event); });
    this.unsubscribeChanged = options.registry.onChanged(() => this.publishProviders());
  }

  public async initialize(detectedGames: readonly DetectedGame[]): Promise<void> {
    this.detectedGames = detectedGames;
    await this.options.registry.refreshAvailability(this.discoveryContext());
    this.publishProviders();
  }

  public reconcile(
    activeSource: CaptureSource | null,
    captureEnabled: boolean,
    detectedGames: readonly DetectedGame[],
  ): Promise<void> {
    this.activeSource = activeSource;
    this.captureEnabled = captureEnabled;
    this.detectedGames = detectedGames;
    const settings = this.options.getSettings();
    const signature = JSON.stringify([
      activeSource?.id ?? null,
      activeSource?.name ?? null,
      captureEnabled,
      settings.enabled,
      settings.games,
    ]);
    if (signature === this.reconcileSignature) return this.operation;
    this.reconcileSignature = signature;
    return this.enqueue(() => this.reconcileNow());
  }

  public refreshAvailability(detectedGames: readonly DetectedGame[]): Promise<void> {
    this.detectedGames = detectedGames;
    this.reconcileSignature = '';
    return this.enqueue(async () => {
      await this.options.registry.refreshAvailability(this.discoveryContext());
      this.publishProviders();
      await this.reconcileNow();
    });
  }

  public setup(providerId: string): Promise<ProviderAvailability> {
    let result: ProviderAvailability | null = null;
    return this.enqueue(async () => {
      result = await this.options.registry.setup(providerId, this.discoveryContext());
      this.reconcileSignature = '';
      this.publishProviders();
      await this.reconcileNow();
    }).then(() => result ?? { state: 'unavailable', reason: 'Provider setup did not complete.' });
  }

  public emitTestEvent(type: GameEventType, timestamp = Date.now()): Promise<void> {
    return this.enqueue(async () => {
      const settings = this.options.getSettings();
      if (!settings.enabled) throw new Error('Enable Auto Capture before emitting a test event.');
      if (!this.captureEnabled) throw new Error('Enable Instant Replay before emitting a test event.');
      if (this.activeProviderId && this.activeProviderId !== this.options.testProvider.id) {
        await this.options.engine.flush('test-provider-activated');
        await this.options.registry.stop(this.activeProviderId);
      }
      const source: CaptureSource = {
        id: 'auto-capture-test',
        type: 'automatic-game',
        name: this.options.testProvider.displayName,
        available: true,
      };
      await this.options.registry.start(this.options.testProvider.id, {
        gameId: this.options.testProvider.gameId,
        displayName: this.options.testProvider.displayName,
        source,
        detectedGames: this.detectedGames,
        platform: process.platform,
      });
      this.activeProviderId = this.options.testProvider.id;
      this.options.engine.setActiveProvider(
        this.options.testProvider.gameId,
        this.options.testProvider.id,
        true,
      );
      this.options.testProvider.emit(type, timestamp);
      this.publishProviders();
    });
  }

  public async flushBeforeCaptureStops(reason: string): Promise<void> {
    await this.enqueue(async () => {
      // A replay reconfiguration can resume the same source with unchanged policy.
      // Invalidate the memoized lifecycle so that its stopped provider starts again.
      this.reconcileSignature = '';
      await this.options.engine.flush(reason);
      if (this.activeProviderId) await this.options.registry.stop(this.activeProviderId);
      this.activeProviderId = null;
      this.options.engine.setActiveProvider(null, null, false);
    });
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.flushBeforeCaptureStops('app-shutdown');
    this.disposed = true;
    this.unsubscribeEvents();
    this.unsubscribeChanged();
    await this.options.registry.stopAll();
    await this.options.engine.dispose();
  }

  private async reconcileNow(): Promise<void> {
    if (this.disposed) return;
    const settings = this.options.getSettings();
    const detectedProvider = this.captureEnabled && this.activeSource
      ? this.options.registry.getForSource(this.activeSource, this.detectedGames)
      : undefined;
    const nextProvider = settings.enabled ? detectedProvider : undefined;
    const gameEnabled = nextProvider ? settings.games[nextProvider.gameId]?.enabled !== false : false;
    const nextProviderId = gameEnabled ? nextProvider?.id ?? null : null;

    if (this.activeProviderId && this.activeProviderId !== nextProviderId) {
      await this.options.engine.flush(this.activeSource ? 'game-changed' : 'game-exited');
      await this.options.registry.stop(this.activeProviderId);
      this.activeProviderId = null;
    }

    if (!nextProvider || !nextProviderId) {
      // Retain the supported game identity for the restrained first-run offer,
      // while keeping every provider dormant until the user explicitly opts in.
      this.options.engine.setActiveProvider(detectedProvider?.gameId ?? null, null, false);
      this.publishProviders();
      return;
    }
    if (this.activeProviderId === nextProviderId && nextProvider.getStatus().state === 'listening') {
      await nextProvider.configure?.(settings.games[nextProvider.gameId] ?? {
        enabled: true,
        useGlobalTiming: true,
        events: {},
      });
      this.publishProviders();
      return;
    }

    const detectedGame = this.options.registry.getDetectedGame(nextProvider.id, this.detectedGames);
    try {
      await this.options.registry.start(nextProviderId, {
        gameId: nextProvider.gameId,
        displayName: nextProvider.displayName,
        source: this.activeSource!,
        ...(detectedGame ? { detectedGame } : {}),
        detectedGames: this.detectedGames,
        platform: process.platform,
        gameSettings: settings.games[nextProvider.gameId] ?? {
          enabled: true,
          useGlobalTiming: true,
          events: {},
        },
      });
      this.activeProviderId = nextProviderId;
    } catch (error) {
      this.options.engine.setActiveProvider(nextProvider.gameId, nextProvider.id, false);
      this.options.engine.setDegraded(error instanceof Error ? error.message : String(error));
    }
    this.publishProviders();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.catch(() => undefined).then(operation);
    this.operation = next.catch(() => undefined);
    return next;
  }

  private discoveryContext() {
    return { detectedGames: this.detectedGames, platform: process.platform };
  }

  private publishProviders(): void {
    const provider = this.activeProviderId ? this.options.registry.get(this.activeProviderId) : undefined;
    if (provider) {
      const status = provider.getStatus();
      this.options.engine.setActiveProvider(provider.gameId, provider.id, status.state === 'listening');
      if (status.state === 'degraded' || status.state === 'error') {
        this.options.engine.setDegraded(status.message ?? `${provider.displayName} needs attention.`);
      }
    }
    this.options.onProvidersChanged(this.options.registry.snapshots(this.options.includeDevelopmentProviders()));
  }
}
