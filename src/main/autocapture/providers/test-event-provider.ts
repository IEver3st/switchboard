import { randomUUID } from 'node:crypto';
import type { GameEvent, GameEventType, ProviderStatus } from '../../../shared/contracts';
import type {
  GameEventProvider,
  ProviderContext,
  ProviderDiscoveryContext,
} from '../provider';

const supportedTestEvents: readonly GameEventType[] = [
  'kill', 'headshot', 'multi_kill', 'death', 'round_win', 'match_win',
];

export class TestEventProvider implements GameEventProvider {
  public readonly id = 'switchboard-test-events';
  public readonly gameId = 'switchboard-test';
  public readonly displayName = 'Switchboard Test Game';
  public readonly supportLevel = 'supported' as const;
  public readonly source = 'test' as const;
  public readonly developmentOnly = true;
  public readonly capabilities = { events: supportedTestEvents, nativeMultiKill: true };
  private readonly listeners = new Set<(event: GameEvent) => void>();
  private status: ProviderStatus = { state: 'stopped' };
  private starts = 0;

  public matchesGame(): boolean {
    return false;
  }

  public async detectAvailability(_context: ProviderDiscoveryContext) {
    return { state: 'available' as const };
  }

  public async start(_context: ProviderContext): Promise<void> {
    if (this.status.state === 'listening') return;
    this.starts += 1;
    this.status = { state: 'listening' };
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

  public emit(type: GameEventType, timestamp = Date.now()): GameEvent {
    if (!supportedTestEvents.includes(type)) throw new Error(`The test provider cannot emit ${type}.`);
    if (this.status.state !== 'listening') throw new Error('Start the Test Event Provider before emitting events.');
    const event: GameEvent = {
      id: randomUUID(),
      gameId: this.gameId,
      providerId: this.id,
      type,
      timestamp,
      confidence: 1,
      label: testLabel(type),
      ...(type === 'multi_kill' ? { metadata: { count: 2 } } : {}),
      source: 'test',
    };
    this.status = { state: 'listening', lastEventAt: timestamp };
    for (const listener of this.listeners) listener(event);
    return event;
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public get startCount(): number {
    return this.starts;
  }
}

function testLabel(type: GameEventType): string {
  const labels: Partial<Record<GameEventType, string>> = {
    kill: 'Kill',
    headshot: 'Headshot',
    multi_kill: 'Double Kill',
    death: 'Death',
    round_win: 'Round Win',
    match_win: 'Match Win',
  };
  return labels[type] ?? 'Test Highlight';
}
