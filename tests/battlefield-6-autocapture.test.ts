import { describe, expect, it } from 'bun:test';
import type { DetectedGame } from '../src/shared/contracts';
import { Battlefield6Provider } from '../src/main/autocapture/providers/battlefield-6/battlefield-6-provider';
import { Battlefield6EventParser } from '../src/main/autocapture/providers/battlefield-6/parser';
import {
  OverwolfBattlefield6GepSession,
  type Battlefield6GepCallbacks,
  type Battlefield6GepSession,
  type OverwolfRuntimeHost,
} from '../src/main/autocapture/providers/battlefield-6/overwolf-gep-session';

const detectedGame: DetectedGame = {
  id: 'battlefield-6-steam',
  name: 'Battlefield™ 6',
  source: 'steam',
  installDirectory: 'D:\\SteamLibrary\\steamapps\\common\\Battlefield 6',
  executablePath: null,
  launchUri: 'steam://rungameid/2807960',
  addedAt: '2026-09-01T00:00:00.000Z',
};

describe('Battlefield 6 Overwolf Auto Capture provider', () => {
  it('normalizes documented eliminations, knockdowns, and round outcomes', () => {
    const parser = new Battlefield6EventParser(() => 'test-session');
    const events = parser.parse({
      events: [
        { name: 'match_start', data: '' },
        { name: 'elimination', data: 'elimination' },
        { name: 'knockdown', data: 'knockdown' },
        { name: 'round_outcome', data: 'victory' },
        { name: 'round_outcome', data: 'defeat' },
        { name: 'match_end', data: '' },
      ],
    }, 1_780_000_000_000);

    expect(events.map((event) => event.type)).toEqual(['kill', 'knockdown', 'round_win', 'round_loss']);
    expect(events.map((event) => event.label)).toEqual(['Elimination', 'Knocked Down', 'Victory', 'Defeat']);
    expect(events[0]?.id).toBe('battlefield-6-overwolf-gep:test-session:1');
    expect(events.every((event) => event.source === 'api' && event.confidence === 1)).toBeTrue();
    expect(() => parser.parse({ events: [{ name: 'elimination', data: { player: 'private' } }] })).toThrow();
  });

  it('recognizes the installed Steam game but requires the optional Overwolf runtime', async () => {
    const unavailable = new Battlefield6Provider({ runtime: {} });
    expect(unavailable.findDetectedGame([detectedGame])).toEqual(detectedGame);
    expect(unavailable.matchesGame({ name: 'bf6.exe' }, [detectedGame])).toBeTrue();
    expect(await unavailable.detectAvailability({ detectedGames: [detectedGame], platform: 'win32' })).toEqual({
      state: 'unavailable',
      reason: 'Battlefield 6 events require an Overwolf-enabled Switchboard build.',
    });

    const packages = new FakeEventSource();
    const awaitingEnablement = new Battlefield6Provider({
      runtime: { overwolf: { packages } } as unknown as OverwolfRuntimeHost,
    });
    expect(await awaitingEnablement.detectAvailability({ detectedGames: [detectedGame], platform: 'win32' })).toEqual({
      state: 'unavailable',
      reason: 'Overwolf has not enabled Battlefield 6 events for this Switchboard build.',
    });

    const provider = new Battlefield6Provider({
      runtime: { overwolf: { packages } } as unknown as OverwolfRuntimeHost,
      gameEventsEnabled: true,
      createSession: () => new FakeGepSession(),
    });
    expect(await provider.detectAvailability({ detectedGames: [detectedGame], platform: 'win32' })).toEqual({ state: 'available' });
    expect(await provider.detectAvailability({ detectedGames: [], platform: 'win32' })).toEqual({
      state: 'unavailable',
      reason: 'Battlefield 6 was not found in the detected game library.',
    });
  });

  it('emits through the canonical provider lifecycle and releases every listener', async () => {
    const session = new FakeGepSession();
    const provider = new Battlefield6Provider({
      runtime: { overwolf: { packages: new FakeEventSource() } } as unknown as OverwolfRuntimeHost,
      gameEventsEnabled: true,
      createSession: () => session,
      createParser: () => new Battlefield6EventParser(() => 'provider-session'),
    });
    const received: string[] = [];
    let statusChanges = 0;
    const unsubscribe = provider.subscribe((event) => received.push(event.type));
    const unsubscribeStatus = provider.subscribeStatus(() => { statusChanges += 1; });

    await provider.start({
      gameId: 'battlefield-6',
      displayName: 'Battlefield 6',
      source: { id: 'bf6', type: 'automatic-game', name: 'bf6.exe', available: true },
      detectedGames: [detectedGame],
      detectedGame,
      platform: 'win32',
      log: () => undefined,
    });
    expect(provider.getStatus().state).toBe('starting');
    session.callbacks?.onListening();
    session.callbacks?.onEvent({ events: [{ name: 'elimination', data: 'elimination' }] });
    expect(received).toEqual(['kill']);
    expect(provider.getStatus().lastEventAt).toBeNumber();
    expect(statusChanges).toBeGreaterThanOrEqual(2);

    await provider.stop();
    expect(session.stopped).toBeTrue();
    expect(provider.getStatus()).toEqual({ state: 'stopped' });
    unsubscribe();
    unsubscribeStatus();
  });

  it('enables only Battlefield 6 and removes its own GEP subscriptions on stop', async () => {
    const packages = new FakeEventSource();
    const gep = new FakeGepApi();
    packages.gep = gep;
    const session = new OverwolfBattlefield6GepSession({
      overwolf: { packages },
    } as unknown as OverwolfRuntimeHost);
    const received: unknown[] = [];
    let listening = 0;
    let enabled = 0;
    session.start({
      onListening: () => { listening += 1; },
      onWaiting: () => undefined,
      onEvent: (payload) => received.push(payload),
      onInfo: () => undefined,
      onError: (message) => { throw new Error(message); },
    });

    gep.emit('game-detected', { enable: () => { enabled += 1; } }, 22064, 'Battlefield 2042', {});
    gep.emit('game-detected', { enable: () => { enabled += 1; } }, 26462, 'Battlefield 6', {});
    await Promise.resolve();
    expect(enabled).toBe(1);
    expect(gep.featureRequests).toEqual([{ gameId: 26462, features: ['game_info', 'match_info'] }]);
    expect(listening).toBe(1);

    gep.emit('new-game-event', {}, 22064, { events: [{ name: 'elimination', data: 'elimination' }] });
    gep.emit('new-game-event', {}, 26462, { events: [{ name: 'elimination', data: 'elimination' }] });
    expect(received).toHaveLength(1);

    session.stop();
    expect(packages.listenerCount('ready')).toBe(0);
    expect(gep.totalListenerCount()).toBe(0);
  });
});

class FakeGepSession implements Battlefield6GepSession {
  public callbacks: Battlefield6GepCallbacks | null = null;
  public stopped = false;

  public start(callbacks: Battlefield6GepCallbacks): void {
    this.callbacks = callbacks;
  }

  public stop(): void {
    this.stopped = true;
    this.callbacks = null;
  }
}

class FakeEventSource {
  public gep?: FakeGepApi;
  private readonly listeners = new Map<string, Set<(...arguments_: unknown[]) => void>>();

  public on(event: string, listener: (...arguments_: unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  public removeListener(event: string, listener: (...arguments_: unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  public emit(event: string, ...arguments_: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...arguments_);
  }

  public listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  public totalListenerCount(): number {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

class FakeGepApi extends FakeEventSource {
  public readonly featureRequests: Array<{ gameId: number; features: readonly string[] | null }> = [];

  public async setRequiredFeatures(gameId: number, features: readonly string[] | null): Promise<void> {
    this.featureRequests.push({ gameId, features });
  }
}
