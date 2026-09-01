import { describe, expect, test } from 'bun:test';
import type { AutoCaptureSettings, GameEvent } from '../src/shared/contracts';
import { AutoCaptureEngine, eventEnabled, type AutoCapturePreserveRequest } from '../src/main/autocapture/auto-capture-engine';
import { EventDeduplicator } from '../src/main/autocapture/event-deduplicator';
import {
  markersForClip,
  mergeCaptureWindows,
  planCaptureWindow,
} from '../src/main/autocapture/capture-window-planner';
import { AutoCaptureRegistry } from '../src/main/autocapture/registry';
import { TestEventProvider } from '../src/main/autocapture/providers/test-event-provider';

const baseSettings: AutoCaptureSettings = {
  enabled: true,
  preRollSeconds: 20,
  postRollSeconds: 10,
  mergeNearbyEvents: true,
  mergeThresholdSeconds: 15,
  notifyWhenSaved: false,
  games: {},
  dismissedAvailability: {},
};

function gameEvent(timestamp: number, overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `event-${timestamp}`,
    gameId: 'test-game',
    providerId: 'test-provider',
    type: 'kill',
    timestamp,
    source: 'test',
    ...overrides,
  };
}

describe('Auto Capture event processing', () => {
  test('deduplicates equivalent provider events inside the 500 ms window', () => {
    const deduplicator = new EventDeduplicator();
    expect(deduplicator.isDuplicate(gameEvent(10_000))).toBeFalse();
    expect(deduplicator.isDuplicate(gameEvent(10_100, { id: 'repeated-packet' }))).toBeTrue();
    expect(deduplicator.isDuplicate(gameEvent(10_700, { id: 'later-kill' }))).toBeFalse();
  });

  test('plans pre-roll and post-roll around the event', () => {
    expect(planCaptureWindow(gameEvent(100_000), 20_000, 10_000)).toMatchObject({
      startedAt: 80_000,
      endsAt: 110_000,
    });
  });

  test('merges overlapping and nearby windows while retaining every event', () => {
    const first = planCaptureWindow(gameEvent(100_000), 20_000, 10_000);
    const second = planCaptureWindow(gameEvent(108_000, { id: 'second' }), 20_000, 10_000);
    const merged = mergeCaptureWindows(first, second, 15_000, 60_000);
    expect(merged).toMatchObject({ startedAt: 80_000, endsAt: 118_000 });
    expect(merged?.events).toHaveLength(2);
  });

  test('stores marker offsets relative to the actual saved clip start', () => {
    expect(markersForClip([gameEvent(100_000)], 80_000, 30_000)[0]?.timestampMs).toBe(20_000);
  });

  test('merges three events into one preserved clip with a derived multi-kill marker', async () => {
    let now = 100_000;
    const preserved: AutoCapturePreserveRequest[] = [];
    const engine = createEngine({ now: () => now, preserve: async (request) => { preserved.push(request); } });
    engine.setActiveProvider('test-game', 'test-provider', true);
    engine.handleEvent(gameEvent(100_000));
    now = 105_000;
    engine.handleEvent(gameEvent(105_000, { id: 'kill-2', metadata: { sequence: 2 } }));
    now = 112_000;
    engine.handleEvent(gameEvent(112_000, { id: 'kill-3', metadata: { sequence: 3 } }));
    await engine.flush('test');

    expect(preserved).toHaveLength(1);
    expect(preserved[0]?.events.filter((event) => event.type === 'kill')).toHaveLength(3);
    expect(preserved[0]?.events.find((event) => event.type === 'multi_kill')?.metadata?.count).toBe(3);
  });

  test('ignores disabled events and disabled games', () => {
    let settings: AutoCaptureSettings = {
      ...baseSettings,
      games: { 'test-game': { enabled: true, useGlobalTiming: true, events: { kill: false } } },
    };
    const engine = createEngine({ getSettings: () => settings });
    expect(engine.handleEvent(gameEvent(100_000))).toBeFalse();
    settings = {
      ...baseSettings,
      games: { 'test-game': { enabled: false, useGlobalTiming: true, events: {} } },
    };
    expect(engine.handleEvent(gameEvent(100_100, { id: 'game-disabled' }))).toBeFalse();
    expect(eventEnabled('death', undefined)).toBeFalse();
  });

  test('flushes a pending capture deterministically during shutdown', async () => {
    const preserved: AutoCapturePreserveRequest[] = [];
    const engine = createEngine({ preserve: async (request) => { preserved.push(request); } });
    engine.handleEvent(gameEvent(100_000));
    await engine.dispose();
    expect(preserved).toHaveLength(1);
    expect(preserved[0]!.endsAt).toBe(100_000);
  });
});

describe('Auto Capture provider lifecycle', () => {
  test('can start, stop, and restart without duplicating listeners', async () => {
    const registry = new AutoCaptureRegistry(() => undefined);
    const provider = new TestEventProvider();
    registry.register(provider);
    let received = 0;
    registry.subscribe(() => { received += 1; });
    const source = { id: 'test', type: 'automatic-game' as const, name: 'Test', available: true };
    const context = {
      gameId: provider.gameId,
      displayName: provider.displayName,
      source,
      detectedGames: [],
      platform: 'win32' as const,
    };
    await registry.start(provider.id, context);
    provider.emit('kill', 100_000);
    await registry.stop(provider.id);
    await registry.start(provider.id, context);
    provider.emit('kill', 101_000);
    expect(received).toBe(2);
    expect(provider.listenerCount).toBe(1);
    expect(provider.startCount).toBe(2);
    await registry.stopAll();
    expect(provider.listenerCount).toBe(0);
  });
});

function createEngine(overrides: Partial<{
  getSettings: () => AutoCaptureSettings;
  now: () => number;
  preserve: (request: AutoCapturePreserveRequest) => Promise<void>;
}> = {}): AutoCaptureEngine {
  const timers = new Set<object>();
  return new AutoCaptureEngine({
    getSettings: overrides.getSettings ?? (() => baseSettings),
    getMaximumWindowMs: () => 60_000,
    preserve: overrides.preserve ?? (async () => undefined),
    onRuntime: () => undefined,
    log: () => undefined,
    now: overrides.now ?? (() => 100_000),
    setTimer: () => {
      const timer = { unref: () => undefined };
      timers.add(timer);
      return timer as unknown as NodeJS.Timeout;
    },
    clearTimer: (timer) => { timers.delete(timer as unknown as object); },
  });
}
