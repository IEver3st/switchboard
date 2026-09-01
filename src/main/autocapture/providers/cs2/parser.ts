import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GameEvent, GameEventType } from '../../../../shared/contracts';

const cs2StateSchema = z.object({
  auth: z.object({ token: z.string().min(16).max(256) }).passthrough(),
  provider: z.object({
    appid: z.number().int().optional(),
    timestamp: z.number().int().nonnegative().optional(),
  }).passthrough(),
  map: z.object({
    name: z.string().max(128).optional(),
    phase: z.string().max(32).optional(),
    round: z.number().int().nonnegative().optional(),
    team_ct: z.object({ score: z.number().int().nonnegative().optional() }).passthrough().optional(),
    team_t: z.object({ score: z.number().int().nonnegative().optional() }).passthrough().optional(),
  }).passthrough().optional(),
  round: z.object({
    phase: z.string().max(32).optional(),
    win_team: z.enum(['CT', 'T']).optional(),
  }).passthrough().optional(),
  player: z.object({
    team: z.enum(['CT', 'T']).optional(),
    activity: z.string().max(32).optional(),
    state: z.object({
      health: z.number().int().min(0).max(100).optional(),
      round_kills: z.number().int().nonnegative().optional(),
      round_killhs: z.number().int().nonnegative().optional(),
    }).passthrough().optional(),
    match_stats: z.object({
      kills: z.number().int().nonnegative().optional(),
      assists: z.number().int().nonnegative().optional(),
      deaths: z.number().int().nonnegative().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

export type CS2GameState = z.infer<typeof cs2StateSchema>;

type CS2Counters = {
  mapName: string | null;
  mapPhase: string | null;
  roundNumber: number | null;
  roundPhase: string | null;
  roundKills: number;
  roundHeadshots: number;
  matchKills: number;
  assists: number;
  deaths: number;
  health: number;
  team: 'CT' | 'T' | null;
  scoreCT: number;
  scoreT: number;
};

const reconnectResetMs = 15_000;

export class CS2TelemetryParser {
  private previous: CS2Counters | null = null;
  private lastProviderTimestamp = 0;
  private lastReceivedAt = 0;
  private sequence = 0;

  public parse(raw: unknown, receivedAt = Date.now()): { token: string; events: GameEvent[] } {
    const state = cs2StateSchema.parse(raw);
    if (state.provider.appid !== undefined && state.provider.appid !== 730) {
      throw new Error('Ignored telemetry for a non-CS2 application.');
    }
    const providerTimestamp = state.provider.timestamp ?? 0;
    if (providerTimestamp > 0 && providerTimestamp + 2 < this.lastProviderTimestamp) {
      return { token: state.auth.token, events: [] };
    }
    this.lastProviderTimestamp = Math.max(this.lastProviderTimestamp, providerTimestamp);

    const current = counters(state);
    const disconnected = this.lastReceivedAt > 0 && receivedAt - this.lastReceivedAt > reconnectResetMs;
    this.lastReceivedAt = receivedAt;
    if (!this.previous || disconnected || current.mapName !== this.previous.mapName) {
      this.previous = current;
      return { token: state.auth.token, events: [] };
    }

    const previous = this.previous;
    this.previous = current;
    const events: GameEvent[] = [];
    const sameRound = current.roundNumber === previous.roundNumber && current.roundKills >= previous.roundKills;
    if (sameRound) {
      const killDelta = current.roundKills - previous.roundKills;
      const headshotDelta = Math.min(killDelta, Math.max(0, current.roundHeadshots - previous.roundHeadshots));
      for (let index = 0; index < killDelta; index += 1) {
        const headshot = index < headshotDelta;
        events.push(this.event(headshot ? 'headshot' : 'kill', receivedAt, {
          label: headshot ? 'Headshot' : 'Kill',
          metadata: {
            headshot,
            ...(current.roundNumber !== null ? { roundNumber: current.roundNumber } : {}),
            sequence: this.nextSequence(),
          },
        }));
      }
    }

    const assistDelta = positiveDelta(previous.assists, current.assists);
    for (let index = 0; index < assistDelta; index += 1) {
      events.push(this.event('assist', receivedAt, {
        label: 'Assist',
        metadata: {
          ...(current.roundNumber !== null ? { roundNumber: current.roundNumber } : {}),
          sequence: this.nextSequence(),
        },
      }));
    }

    const deathDelta = positiveDelta(previous.deaths, current.deaths);
    for (let index = 0; index < deathDelta; index += 1) {
      events.push(this.event('death', receivedAt, {
        label: 'Death',
        metadata: {
          ...(current.roundNumber !== null ? { roundNumber: current.roundNumber } : {}),
          sequence: this.nextSequence(),
        },
      }));
    }

    const roundFinished = current.roundPhase === 'over' && previous.roundPhase !== 'over';
    const winningTeam = state.round?.win_team;
    if (roundFinished && winningTeam && current.team) {
      const won = winningTeam === current.team;
      events.push(this.event(won ? 'round_win' : 'round_loss', receivedAt, {
        label: won ? 'Round Win' : 'Round Loss',
        metadata: {
          ...(current.roundNumber !== null ? { roundNumber: current.roundNumber } : {}),
          team: current.team,
          sequence: this.nextSequence(),
        },
      }));
    }

    const matchFinished = current.mapPhase === 'gameover' && previous.mapPhase !== 'gameover';
    if (matchFinished && current.team) {
      const scoreFor = current.team === 'CT' ? current.scoreCT : current.scoreT;
      const scoreAgainst = current.team === 'CT' ? current.scoreT : current.scoreCT;
      if (scoreFor !== scoreAgainst) {
        const won = scoreFor > scoreAgainst;
        events.push(this.event(won ? 'match_win' : 'match_loss', receivedAt, {
          label: won ? 'Match Win' : 'Match Loss',
          metadata: { scoreFor, scoreAgainst, team: current.team, sequence: this.nextSequence() },
        }));
      }
    }

    return { token: state.auth.token, events };
  }

  public reset(): void {
    this.previous = null;
    this.lastProviderTimestamp = 0;
    this.lastReceivedAt = 0;
  }

  private event(
    type: GameEventType,
    timestamp: number,
    details: Pick<GameEvent, 'label' | 'metadata'>,
  ): GameEvent {
    const sequence = details.metadata?.sequence ?? this.nextSequence();
    return {
      id: `cs2-${type}-${timestamp}-${sequence}-${createHash('sha256').update(`${type}:${timestamp}:${sequence}`).digest('hex').slice(0, 8)}`,
      gameId: 'counter-strike-2',
      providerId: 'cs2-gsi',
      type,
      timestamp,
      confidence: 1,
      ...details,
      source: 'telemetry',
    };
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }
}

function counters(state: CS2GameState): CS2Counters {
  return {
    mapName: state.map?.name ?? null,
    mapPhase: state.map?.phase ?? null,
    roundNumber: state.map?.round ?? null,
    roundPhase: state.round?.phase ?? null,
    roundKills: state.player?.state?.round_kills ?? 0,
    roundHeadshots: state.player?.state?.round_killhs ?? 0,
    matchKills: state.player?.match_stats?.kills ?? 0,
    assists: state.player?.match_stats?.assists ?? 0,
    deaths: state.player?.match_stats?.deaths ?? 0,
    health: state.player?.state?.health ?? 0,
    team: state.player?.team ?? null,
    scoreCT: state.map?.team_ct?.score ?? 0,
    scoreT: state.map?.team_t?.score ?? 0,
  };
}

function positiveDelta(previous: number, current: number): number {
  return current >= previous ? Math.min(20, current - previous) : 0;
}
