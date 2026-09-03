import type { DetectedGame, GameEvent, ProviderAvailability, ProviderStatus } from '../../../../shared/contracts';
import type { GameEventProvider, ProviderContext, ProviderDiscoveryContext } from '../../provider';

// Steam app IDs for retail WARDOGS and the separate WARDOGS Playtest client.
const steamAppIds = ['1867240', '4809930'];
const unavailableKillFeedReason = 'WARDOGS does not expose a verified local kill feed yet. Manual replay and reaction clipping remain available.';

/**
 * WARDOGS kill/death capability placeholder.
 *
 * The Unreal Engine 5 client runs under Easy Anti-Cheat, publishes no documented
 * local telemetry, and writes no kill-bearing client log or localhost feed that
 * Switchboard could read safely. The provider therefore stays unavailable: it
 * matches the running game so Settings can explain the gap, but it never starts
 * a runtime, timer, listener, or handle. A future safe source (read-only client
 * log format validated against a retail build, or an official event API) can
 * implement `start` behind this same game identity without renderer changes.
 */
export class WardogsProvider implements GameEventProvider {
  public readonly id = 'wardogs-events';
  public readonly gameId = 'wardogs';
  public readonly displayName = 'WARDOGS';
  public readonly supportLevel = 'unavailable' as const;
  public readonly source = 'log' as const;
  public readonly capabilities = {
    events: ['kill', 'death'] as const,
    nativeMultiKill: false,
  };

  private readonly listeners = new Set<(event: GameEvent) => void>();
  private status: ProviderStatus = { state: 'stopped' };

  public matchesGame(source: { name: string }, detectedGames: readonly DetectedGame[]): boolean {
    const name = normalize(source.name);
    // The launcher shares the install path but is never a capture target.
    if (name.includes('launcher')) return false;
    if (name.includes('wardogs')) return true;
    return Boolean(this.findDetectedGame(detectedGames) && name.includes('wardog'));
  }

  public findDetectedGame(detectedGames: readonly DetectedGame[]): DetectedGame | undefined {
    return detectedGames.find((game) => (game.launchUri && steamAppIds.some((appId) =>
      game.launchUri?.toLocaleLowerCase() === `steam://rungameid/${appId}`))
      || normalize(game.name) === 'wardogs'
      || normalize(game.name) === 'wardogs playtest');
  }

  public async detectAvailability(context: ProviderDiscoveryContext): Promise<ProviderAvailability> {
    if (context.platform !== 'win32') {
      return { state: 'unavailable', reason: 'WARDOGS Auto Capture is supported on Windows.' };
    }
    if (!this.findDetectedGame(context.detectedGames)) {
      return { state: 'unavailable', reason: 'WARDOGS was not found in the detected game library.' };
    }
    return { state: 'unavailable', reason: unavailableKillFeedReason };
  }

  public async start(_context: ProviderContext): Promise<void> {
    this.status = { state: 'degraded', message: unavailableKillFeedReason };
  }

  public async stop(): Promise<void> {
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
      integration: 'unverified',
      killFeed: 'unavailable',
      listeners: this.listeners.size,
    };
  }
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
