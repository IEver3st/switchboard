import { describe, expect, test } from 'bun:test';
import type { DetectedGame } from '../src/shared/contracts';
import { WarThunderTelemetryParser } from '../src/main/autocapture/providers/war-thunder/parser';
import { WarThunderProvider } from '../src/main/autocapture/providers/war-thunder/war-thunder-provider';

const detectedGame: DetectedGame = {
  id: 'steam:236390',
  name: 'War Thunder',
  source: 'steam',
  installDirectory: 'D:\\SteamLibrary\\steamapps\\common\\War Thunder',
  executablePath: 'D:\\SteamLibrary\\steamapps\\common\\War Thunder\\win64\\aces.exe',
  launchUri: 'steam://rungameid/236390',
  addedAt: '2026-09-01T00:00:00.000Z',
};

describe('War Thunder localhost Auto Capture provider', () => {
  test('baselines existing history and emits only configured-player events', () => {
    const parser = new WarThunderTelemetryParser();
    parser.baseline(hud([
      message(100, 'OtherPlayer (T-54) destroyed SomeoneElse (M48A2 C)'),
    ]));

    const events = parser.parse(hud([
      message(100, 'OtherPlayer (T-54) destroyed SomeoneElse (M48A2 C)'),
      message(101, 'AnotherPlayer (Leopard I) destroyed Target (M60)'),
      message(102, '=MEANS= Ever3st (XM246) shot down Opponent (F-84F)'),
      message(103, '=MEANS= Ever3st (B-52H) destroyed a base'),
      message(104, 'Opponent (T58) destroyed =MEANS= Ever3st (XM800T)'),
      message(105, '=MEANS= Ever3st (F/A-18C Early) has crashed.'),
    ]), 'Ever3st', 1_000_000);

    expect(events.map((event) => event.type)).toEqual(['kill', 'objective', 'death', 'death']);
    expect(events.map((event) => event.label)).toEqual([
      'Aircraft shot down',
      'Base destroyed',
      'Vehicle lost',
      'Vehicle lost',
    ]);
    expect(events.every((event) => event.timestamp === 1_000_000)).toBeTrue();
    expect(JSON.stringify(events)).not.toContain('Ever3st');
    expect(JSON.stringify(events)).not.toContain('Opponent');
  });

  test('matches the exact nickname instead of substrings and rejects malformed telemetry', () => {
    const parser = new WarThunderTelemetryParser();
    parser.baseline(hud([]));
    const events = parser.parse(hud([
      message(1, 'Forever3st (T-54) destroyed Target (M48A2 C)'),
      message(2, 'Ever3stBackup (T-54) destroyed Target (M48A2 C)'),
    ]), 'Ever3st', 1_000);
    expect(events).toEqual([]);
    expect(() => parser.parse({ events: [], damage: [{ id: '3', msg: 'invalid' }] }, 'Ever3st')).toThrow();
  });

  test('detects the Steam app and releases its low-frequency polling lifecycle', async () => {
    const responses = [
      hud([message(500, 'HistoricalPlayer (T-54) destroyed HistoricalTarget (M48A2 C)')]),
      hud([
        message(500, 'HistoricalPlayer (T-54) destroyed HistoricalTarget (M48A2 C)'),
        message(501, '=MEANS= Ever3st (Leopard 2 (OTCo)) destroyed Target (T-64A (1971))'),
      ]),
    ];
    let calls = 0;
    const provider = new WarThunderProvider({
      pollIntervalMs: 5,
      fetch: async () => new Response(JSON.stringify(responses[Math.min(calls++, responses.length - 1)]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });
    const events: string[] = [];
    const unsubscribe = provider.subscribe((event) => events.push(event.type));

    expect(await provider.detectAvailability({ detectedGames: [detectedGame], platform: 'win32' })).toEqual({ state: 'available' });
    expect(provider.findDetectedGame([detectedGame])).toEqual(detectedGame);
    expect(provider.matchesGame({ id: 'source', type: 'automatic-game', name: 'aces.exe', available: true }, [detectedGame])).toBeTrue();

    await provider.start({
      gameId: provider.gameId,
      displayName: provider.displayName,
      source: { id: 'source', type: 'automatic-game', name: 'War Thunder', available: true },
      detectedGames: [detectedGame],
      detectedGame,
      platform: 'win32',
      gameSettings: { enabled: true, useGlobalTiming: true, playerName: 'Ever3st', events: {} },
      log: () => undefined,
    });

    await waitFor(() => events.length === 1);
    expect(events).toEqual(['kill']);
    expect(provider.getStatus().state).toBe('listening');
    const beforeStop = calls;
    unsubscribe();
    await provider.stop();
    await delay(20);
    expect(calls).toBe(beforeStop);
    expect(provider.getStatus()).toEqual({ state: 'stopped' });
  });

  test('stays dormant without a detected install and explains missing identity while active', async () => {
    const provider = new WarThunderProvider({
      pollIntervalMs: 60_000,
      fetch: async () => new Response(JSON.stringify(hud([])), { status: 200 }),
    });
    expect(await provider.detectAvailability({ detectedGames: [], platform: 'win32' })).toEqual({
      state: 'unavailable',
      reason: 'War Thunder was not found in the detected game library.',
    });

    await provider.start({
      gameId: provider.gameId,
      displayName: provider.displayName,
      source: { id: 'source', type: 'automatic-game', name: 'War Thunder', available: true },
      detectedGames: [detectedGame],
      platform: 'win32',
      gameSettings: { enabled: true, useGlobalTiming: true, events: {} },
      log: () => undefined,
    });
    expect(provider.getStatus()).toEqual({
      state: 'degraded',
      message: 'Enter your War Thunder nickname to identify personal events.',
    });
    provider.configure({ enabled: true, useGlobalTiming: true, playerName: 'Ever3st', events: {} });
    expect(provider.getStatus()).toEqual({ state: 'listening' });
    await provider.stop();
  });

  test('does not misreport an API failure as recovered when settings are reapplied', async () => {
    const provider = new WarThunderProvider({
      pollIntervalMs: 5,
      fetch: async () => {
        throw new Error('connection refused');
      },
    });
    await provider.start({
      gameId: provider.gameId,
      displayName: provider.displayName,
      source: { id: 'source', type: 'automatic-game', name: 'War Thunder', available: true },
      detectedGames: [detectedGame],
      platform: 'win32',
      gameSettings: { enabled: true, useGlobalTiming: true, playerName: 'Ever3st', events: {} },
      log: () => undefined,
    });
    expect(provider.getStatus()).toEqual({ state: 'degraded', message: 'War Thunder local API: connection refused' });
    provider.configure({ enabled: true, useGlobalTiming: true, playerName: 'Ever3st', events: { death: true } });
    expect(provider.getStatus()).toEqual({ state: 'degraded', message: 'War Thunder local API: connection refused' });
    await provider.stop();
  });
});

function hud(damage: ReturnType<typeof message>[]) {
  return { events: [], damage };
}

function message(id: number, msg: string) {
  return { id, msg, sender: '', enemy: false, mode: '', time: id };
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for War Thunder provider event.');
    await delay(5);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
