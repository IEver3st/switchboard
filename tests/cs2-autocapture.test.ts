import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CS2Provider, createIntegrationConfig } from '../src/main/autocapture/providers/cs2/cs2-provider';
import { CS2TelemetryParser } from '../src/main/autocapture/providers/cs2/parser';

const token = 'a'.repeat(64);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('CS2 Game State Integration provider', () => {
  test('derives local kill, headshot, assist, and death transitions without player identity metadata', () => {
    const parser = new CS2TelemetryParser();
    parser.parse(packet({ roundKills: 0, roundHeadshots: 0, kills: 2, assists: 1, deaths: 1 }), 100_000);
    const result = parser.parse(packet({ roundKills: 2, roundHeadshots: 1, kills: 4, assists: 2, deaths: 2 }), 101_000);
    expect(result.events.map((event) => event.type)).toEqual(['headshot', 'kill', 'assist', 'death']);
    expect(JSON.stringify(result.events)).not.toContain('steamid');
    expect(JSON.stringify(result.events)).not.toContain('player');
  });

  test('does not replay counters after a round reset or stale out-of-order packet', () => {
    const parser = new CS2TelemetryParser();
    parser.parse(packet({ providerTimestamp: 100, round: 4, roundKills: 2 }), 100_000);
    expect(parser.parse(packet({ providerTimestamp: 101, round: 5, roundKills: 0 }), 101_000).events).toHaveLength(0);
    expect(parser.parse(packet({ providerTimestamp: 100, round: 5, roundKills: 4 }), 101_500).events).toHaveLength(0);
    expect(parser.parse(packet({ providerTimestamp: 90, round: 5, roundKills: 4 }), 102_000).events).toHaveLength(0);
    expect(parser.parse(packet({ providerTimestamp: 102, round: 5, roundKills: 1 }), 103_000).events.map((event) => event.type)).toEqual(['kill']);
  });

  test('emits round and match outcomes from team-relative state transitions', () => {
    const parser = new CS2TelemetryParser();
    parser.parse(packet({ roundPhase: 'live', mapPhase: 'live', team: 'CT', scoreCT: 12, scoreT: 8 }), 100_000);
    const round = parser.parse(packet({ roundPhase: 'over', winTeam: 'CT', mapPhase: 'live', team: 'CT', scoreCT: 13, scoreT: 8 }), 101_000);
    expect(round.events.some((event) => event.type === 'round_win')).toBeTrue();
    const match = parser.parse(packet({ roundPhase: 'over', winTeam: 'CT', mapPhase: 'gameover', team: 'CT', scoreCT: 13, scoreT: 8 }), 102_000);
    expect(match.events.some((event) => event.type === 'match_win')).toBeTrue();
  });

  test('creates a loopback-only authenticated low-frequency GSI configuration', () => {
    const config = createIntegrationConfig(token);
    expect(config).toContain('http://127.0.0.1:32145/game-state');
    expect(config).toContain(`"token" "${token}"`);
    expect(config).toContain('"throttle" "0.1"');
    expect(config).not.toContain('allplayers');
  });

  test('authenticates before changing counters and releases the loopback listener on stop', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-cs2-provider-'));
    temporaryDirectories.push(directory);
    const tokenPath = join(directory, 'token');
    await writeFile(tokenPath, token);
    const provider = new CS2Provider(tokenPath, 0);
    const events: string[] = [];
    const unsubscribe = provider.subscribe((event) => events.push(event.type));
    await provider.start({
      gameId: provider.gameId,
      displayName: provider.displayName,
      source: { id: 'cs2', type: 'automatic-game', name: 'Counter-Strike 2', available: true },
      detectedGames: [],
      platform: 'win32',
      log: () => undefined,
    });

    try {
      const diagnostics = await provider.getDiagnostics();
      const endpoint = `http://127.0.0.1:${diagnostics.port}/game-state`;
      expect((await fetch(endpoint, { method: 'POST', body: JSON.stringify(packet({ roundKills: 0 })) })).status).toBe(204);
      expect((await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(packet({ authToken: 'b'.repeat(64), providerTimestamp: 101, roundKills: 9 })),
      })).status).toBe(400);
      expect((await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(packet({ providerTimestamp: 102, roundKills: 1 })),
      })).status).toBe(204);
      expect(events).toEqual(['kill']);
    } finally {
      unsubscribe();
      await provider.stop();
    }
    expect(provider.getStatus().state).toBe('stopped');
  });
});

function packet(overrides: Partial<{
  authToken: string;
  providerTimestamp: number;
  round: number;
  roundKills: number;
  roundHeadshots: number;
  kills: number;
  assists: number;
  deaths: number;
  roundPhase: string;
  winTeam: 'CT' | 'T';
  mapPhase: string;
  team: 'CT' | 'T';
  scoreCT: number;
  scoreT: number;
}> = {}) {
  return {
    auth: { token: overrides.authToken ?? token },
    provider: { appid: 730, timestamp: overrides.providerTimestamp ?? 100 },
    map: {
      name: 'de_dust2',
      phase: overrides.mapPhase ?? 'live',
      round: overrides.round ?? 4,
      team_ct: { score: overrides.scoreCT ?? 5 },
      team_t: { score: overrides.scoreT ?? 4 },
    },
    round: { phase: overrides.roundPhase ?? 'live', ...(overrides.winTeam ? { win_team: overrides.winTeam } : {}) },
    player: {
      team: overrides.team ?? 'CT',
      activity: 'playing',
      state: {
        health: 100,
        round_kills: overrides.roundKills ?? 0,
        round_killhs: overrides.roundHeadshots ?? 0,
      },
      match_stats: {
        kills: overrides.kills ?? 0,
        assists: overrides.assists ?? 0,
        deaths: overrides.deaths ?? 0,
      },
    },
  };
}
